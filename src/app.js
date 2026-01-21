const db = new Dexie('RecipeDatabase');

db.version(2).stores({
  recipes: "id, title, *normalizedIngredients, *ingredients",
  staticSubstitutions: '++id, ingredient',
  pantry: '++id, ingredient',
  preferences: '++id, preference',
  contextHistory: '++id, date',
  likeDislike: 'id, title',
  ingredients: '++id, name, frequency'
});


class RecipesMiniApp {
  constructor() {
    this.ingredients = [];
    this.recipes = [];
    this.staticSubstitutions = [];
    this.preferences = [];
    this.contextHistory = [];
    this.likeDislike = [];
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
    });
  });
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
  const container = document.getElementById('app-container');
  if (!container || !container.querySelector('.nav-btn')) {
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

onReady(initApp);
