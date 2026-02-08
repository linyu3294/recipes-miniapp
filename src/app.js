const db = new Dexie('RecipeDatabase');

db.version(1).stores({
  recipes: "id, title, *normalizedIngredients, *ingredients",
  staticSubstitutions: '++id, ingredient',
  pantry: '++id, ingredient',
  preferences: '++id, preference',
  contextHistory: '++id, date',
  recipeLibrary: 'id, title, status',
  ingredients: '++id, name, frequency'
});


class RecipesMiniApp {
  constructor() {
    this.ingredients = [];
    this.recipes = [];
    this.staticSubstitutions = [];
    this.preferences = [];
    this.contextHistory = [];
    this.pantryManager = new PantryManager();
  }

  async loadRecipesFromJSON(recipesArray) {
    console.log(`Loading ${recipesArray.length} recipes...`);
    await db.recipes.clear();
    await db.recipes.bulkAdd(recipesArray);

    const count = await db.recipes.count();
    console.log(`✓ Loaded ${count} recipes!`);
    return count;
  }

  async searchRecipesByTitle(searchTerm) {
    return await db.recipes
      .filter(recipe => recipe.title.toLowerCase().includes(searchTerm.toLowerCase()))
      .toArray();
  }

  async findRecipesByIngredients(searchTerm) {
    return await db.recipes
      .filter(recipe => recipe.ingredients.some(ingredient => ingredient.toLowerCase().includes(searchTerm.toLowerCase())))
      .toArray();
  }

  async saveToLibrary(recipeId, recipeTitle, status) {
    if (recipeId == null || recipeId === '') {
      throw new Error('Recipe ID is required to save to library');
    }
    const title =
      (recipeTitle != null && String(recipeTitle).trim() !== '')
        ? String(recipeTitle).trim()
        : 'Untitled';
    try {
      await db.recipeLibrary.put({
        id: recipeId,
        title,
        status: status
      });
      console.log(`✓ Saved ${status} for recipe: ${title}`);
    } catch (error) {
      console.error('Error saving to library:', error);
      throw error;
    }
  }

  async getLibraryStatus(recipeId) {
    try {
      const entry = await db.recipeLibrary.get(recipeId);
      return entry ? entry.status : null;
    } catch (error) {
      console.error('Error getting library status:', error);
      return null;
    }
  }

  async getDislikedRecipeIds() {
    try {
      const disliked = await db.recipeLibrary
        .where('status')
        .equals('dislike')
        .toArray();
      return new Set(disliked.map(entry => entry.id));
    } catch (error) {
      console.error('Error getting disliked recipes:', error);
      return new Set();
    }
  }

  async removeFromLibrary(recipeId) {
    try {
      await db.recipeLibrary.delete(recipeId);
      console.log(`✓ Removed recipe ${recipeId} from library`);
    } catch (error) {
      console.error('Error removing from library:', error);
      throw error;
    }
  }

  async getLibraryEntries() {
    try {
      return await db.recipeLibrary.toArray();
    } catch (error) {
      console.error('Error getting library entries:', error);
      return [];
    }
  }

  async saveForkedRecipe(recipe) {
    await db.recipes.add(recipe);
    return recipe.id;
  }

  async updateRecipe(recipe) {
    await db.recipes.put(recipe);
  }

  async autoLike(recipeId, title) {
    const safeTitle =
      (title != null && String(title).trim() !== '') ? String(title).trim() : 'Untitled';
    await db.recipeLibrary.put({ id: recipeId, title: safeTitle, status: 'like' });
  }

  /**
   * Get unique normalized ingredient names from a recipe (same dedupe logic as recalculateIngredientTable).
   * @param {{ ingredients?: string[], normalizedIngredients?: string[] }} recipe
   * @returns {string[]}
   */
  _uniqueNormalizedIngredients(recipe) {
    const seen = new Set();
    const list = recipe.normalizedIngredients || (recipe.ingredients || []).map(i => (i || '').toLowerCase().trim());
    const out = [];
    list.forEach(name => {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  }

  /**
   * Increment frequency for one ingredient by name (or create with frequency 1).
   * @param {string} normalizedName
   */
  async _incrementIngredientFrequency(normalizedName) {
    const existing = await db.ingredients.where('name').equals(normalizedName).first();
    if (existing) {
      await db.ingredients.update(existing.id, { frequency: (existing.frequency || 0) + 1 });
    } else {
      await db.ingredients.add({ name: normalizedName, frequency: 1 });
    }
  }

  /**
   * Decrement frequency for one ingredient by name; delete record if frequency becomes 0.
   * @param {string} normalizedName
   */
  async _decrementIngredientFrequency(normalizedName) {
    const existing = await db.ingredients.where('name').equals(normalizedName).first();
    if (!existing) return;
    const newFreq = (existing.frequency || 1) - 1;
    if (newFreq <= 0) {
      await db.ingredients.delete(existing.id);
    } else {
      await db.ingredients.update(existing.id, { frequency: newFreq });
    }
  }

  /**
   * Update ingredients table when a recipe is edited: -1 for removed/changed ingredients, +1 for added/new ingredients.
   * @param {{ ingredients?: string[], normalizedIngredients?: string[] }} oldRecipe
   * @param {{ ingredients?: string[], normalizedIngredients?: string[] }} newRecipe
   */
  async updateIngredientsTableOnEdit(oldRecipe, newRecipe) {
    const oldSet = new Set(this._uniqueNormalizedIngredients(oldRecipe));
    const newSet = new Set(this._uniqueNormalizedIngredients(newRecipe));
    for (const name of oldSet) {
      await this._decrementIngredientFrequency(name);
    }
    for (const name of newSet) {
      await this._incrementIngredientFrequency(name);
    }
  }

  /**
   * Update ingredients table when a recipe is forked and saved: +1 for each ingredient in the saved recipe.
   * @param {{ ingredients?: string[], normalizedIngredients?: string[] }} recipe
   */
  async updateIngredientsTableOnFork(recipe) {
    const names = this._uniqueNormalizedIngredients(recipe);
    for (const name of names) {
      await this._incrementIngredientFrequency(name);
    }
  }

  /**
   * Rebuild the ingredients table from all recipes (name + frequency).
   * Call after saving/updating/forking a recipe so ingredient search stays in sync.
   */
  async recalculateIngredientTable() {
    try {
      const recipes = await db.recipes.toArray();
      const freq = new Map();
      recipes.forEach(recipe => {
        const seen = new Set();
        const list = recipe.normalizedIngredients || (recipe.ingredients || []).map(i => (i || '').toLowerCase().trim());
        list.forEach(name => {
          if (!name) return;
          const key = name.toLowerCase().trim();
          if (seen.has(key)) return;
          seen.add(key);
          freq.set(key, (freq.get(key) || 0) + 1);
        });
      });
      await db.ingredients.clear();
      const entries = Array.from(freq.entries())
        .map(([name, frequency]) => ({ name, frequency }))
        .sort((a, b) => b.frequency - a.frequency || a.name.localeCompare(b.name));
      if (entries.length > 0) {
        await db.ingredients.bulkAdd(entries);
      }
    } catch (err) {
      console.error('Error recalculating ingredient table:', err);
    }
  }
}

const app = new RecipesMiniApp();

window.db = db;
window.app = app;

const setupNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.getElementById(targetTab)?.classList.add('active');
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('inactive');
      });
      button.classList.remove('inactive');
      button.classList.add('active');
      
      // Load recipe suggestions when switching to suggestions tab
      if (targetTab === 'suggestions-tab' && window.recipeEngine) {
        window.recipeEngine.loadSuggestions();
      }
      // Load library entries when switching to library tab
      if (targetTab === 'library-tab') {
        loadLibrary();
      }
    });
  });
};

const loadLibrary = async () => {
  const container = document.getElementById('library-entries');
  if (!container) return;
  container.innerHTML = '<p class="text-center py-3">Loading library...</p>';
  try {
    const entries = await app.getLibraryEntries();
    container.innerHTML = '';
    if (entries.length === 0) {
      container.innerHTML = `
        <div class="card mb-3">
          <div class="card-body p-4 text-center">
            <p class="mb-0">Your library is empty. Like, dislike, or bookmark recipes to see them here.</p>
          </div>
        </div>
      `;
      return;
    }
    for (const entry of entries) {
      // Look up full recipe for ingredients preview
      let ingredientsPreview = '';
      try {
        const fullRecipe = await db.recipes.get(entry.id);
        if (fullRecipe && fullRecipe.ingredients) {
          const str = fullRecipe.ingredients.join(', ');
          ingredientsPreview = str.length > 150 ? str.substring(0, 150) + '...' : str;
        }
      } catch (_) {}
      // Determine status icon
      let statusIcon = '';
      if (entry.status === 'like') {
        statusIcon = '<i class="bi bi-hand-thumbs-up-fill library-status-icon status-like"></i>';
      } else if (entry.status === 'dislike') {
        statusIcon = '<i class="bi bi-hand-thumbs-down-fill library-status-icon status-dislike"></i>';
      } else if (entry.status === 'bookmarked') {
        statusIcon = '<i class="bi bi-bookmark-fill library-status-icon status-bookmarked"></i>';
      }
      const card = document.createElement('div');
      card.className = 'library-card card mb-3';
      card.dataset.recipeId = entry.id;
      const safeTitle = document.createElement('span');
      safeTitle.textContent = entry.title || 'Untitled';
      const safeIngredients = document.createElement('span');
      safeIngredients.textContent = ingredientsPreview || 'No ingredients listed';
      card.innerHTML = `
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1" style="min-width:0;">
              <h2 class="recipe-title mb-2">${safeTitle.innerHTML}</h2>
              <p class="recipe-ingredients mb-0">${safeIngredients.innerHTML}</p>
            </div>
            <button class="library-remove-btn ms-2 flex-shrink-0" aria-label="Remove from library">
              ${statusIcon}
            </button>
          </div>
          <div class="text-center mt-2">
            <button class="expand-btn btn btn-link p-2" aria-label="View recipe">
              <i class="bi bi-chevron-down fs-4"></i>
            </button>
          </div>
        </div>
      `;
      // Click status icon to remove entry from library
      card.querySelector('.library-remove-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await app.removeFromLibrary(entry.id);
          card.style.transition = 'all 0.3s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => {
            card.remove();
            // Show empty message if no entries left
            const remaining = container.querySelectorAll('.library-card');
            if (remaining.length === 0) {
              container.innerHTML = `
                <div class="card mb-3">
                  <div class="card-body p-4 text-center">
                    <p class="mb-0">Your library is empty. Like, dislike, or bookmark recipes to see them here.</p>
                  </div>
                </div>
              `;
            }
          }, 300);
        } catch (err) {
          console.error('Error removing from library:', err);
        }
      });
      // Click expand to navigate to recipe detail
      card.querySelector('.expand-btn').addEventListener('click', async () => {
        try {
          const fullRecipe = await db.recipes.get(entry.id);
          if (fullRecipe && window.recipeEngine) {
            // Switch to suggestions tab to show detail there
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.getElementById('suggestions-tab')?.classList.add('active');
            document.querySelectorAll('.nav-btn').forEach(btn => {
              btn.classList.remove('active');
              btn.classList.add('inactive');
            });
            const sugBtn = document.querySelector('.nav-btn[data-tab="suggestions-tab"]');
            if (sugBtn) {
              sugBtn.classList.remove('inactive');
              sugBtn.classList.add('active');
            }
            window.recipeEngine.showRecipeDetail(fullRecipe);
          }
        } catch (err) {
          console.error('Error loading recipe detail:', err);
        }
      });
      container.appendChild(card);
    }
  } catch (error) {
    console.error('Error loading library:', error);
    container.innerHTML = `
      <div class="card mb-3">
        <div class="card-body p-4 text-center">
          <p class="mb-0 text-danger">Error loading library. Please try again.</p>
        </div>
      </div>
    `;
  }
};

const setupSelectAll = () => {
  const btn = document.getElementById('select-all-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const ingredients = document.querySelectorAll('#selected-ingredients .ingredient');
    const allSelected = Array.from(ingredients).every(ing => ing.classList.contains('selected'));
    ingredients.forEach(ing => {
      allSelected ? ing.classList.remove('selected') : ing.classList.add('selected');
    });
    btn.textContent = allSelected ? 'Select All' : 'Deselect All';
  });
};

// Ingredient dropdown is now handled by ingredients.js
// This function is kept for backward compatibility but does nothing
const setupIngredientDropdown = () => {
  // Ingredient search is now handled by ingredients.js
  // This function is intentionally empty
};

const setupAddButtons = () => {
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      const name = item?.querySelector('span')?.textContent?.trim();
      if (name) {
        app.pantryManager.addIngredient(name);
      }
    });
  });
};

const setupRemoveButtons = () => {
  document.querySelectorAll('#selected-ingredients .remove-btn').forEach(btn => {
    if (btn.hasAttribute('data-listener-attached')) return;
    btn.setAttribute('data-listener-attached', 'true');
    btn.addEventListener('click', (e) => {
      const div = e.target.closest('.ingredient');
      if (!div) return;
      const id = div.dataset.id;
      if (id) {
        app.pantryManager.deleteIngredient(parseInt(id), div);
      } else {
        div.style.transition = 'all 0.3s';
        div.style.opacity = '0';
        div.style.transform = 'scale(0.8)';
        setTimeout(() => div.remove(), 300);
      }
    });
  });
};

const initApp = () => {
  // Look for nav buttons in #app-container first, then fall back to document body
  const container = document.getElementById('app-container') || document.body;
  if (!container.querySelector('.nav-btn')) {
    setTimeout(initApp, 50);
    return;
  }
  setupNavigation();
  setupSelectAll();
  setupIngredientDropdown();
  setupAddButtons();
  setupRemoveButtons();
  setTimeout(() => {
    app.pantryManager.loadIngredients();
    setupRemoveButtons();
  }, 100);
};

// Simple onReady function for DOM initialization
const onReady = (callback) => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
};

onReady(initApp);
