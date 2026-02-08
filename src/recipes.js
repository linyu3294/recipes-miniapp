/**
 * Recipe Suggestion Algorithm
 * Finds recipes based on selected ingredients using inclusion-based queries
 */

class RecipeSuggestionEngine {
  constructor() {
    this.currentSuggestions = [];
    this.MAX_RESULTS = 10;
  }

  /**
   * Get selected ingredients from the pantry UI
   * @returns {string[]} Array of selected ingredient names
   */
  getSelectedIngredients() {
    const selectedElements = document.querySelectorAll('#selected-ingredients .ingredient.selected');
    const ingredients = [];
    
    selectedElements.forEach(element => {
      const nameElement = element.querySelector('h3');
      if (nameElement) {
        const ingredientName = nameElement.textContent.trim();
        if (ingredientName) {
          ingredients.push(ingredientName.toLowerCase());
        }
      }
    });
    
    return ingredients;
  }

  /**
   * Normalize ingredient name for matching
   * @param {string} ingredient - Ingredient name
   * @returns {string} Normalized ingredient name
   */
  normalizeIngredient(ingredient) {
    return ingredient.toLowerCase().trim();
  }

  /**
   * Check if a recipe's ingredient list contains the selected ingredients
   * Uses inclusion-based matching (not fuzzy)
   * @param {Object} recipe - Recipe object
   * @param {string[]} selectedIngredients - Array of selected ingredient names (normalized)
   * @returns {Object} Match result with count and matched ingredients
   */
  matchIngredientsInList(recipe, selectedIngredients) {
    if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) {
      return { count: 0, matched: [] };
    }

    // Check both ingredients and normalizedIngredients arrays
    // Use a Set to avoid duplicates
    const allIngredientsSet = new Set();
    (recipe.ingredients || []).forEach(ing => {
      allIngredientsSet.add(this.normalizeIngredient(ing));
    });
    (recipe.normalizedIngredients || []).forEach(ing => {
      allIngredientsSet.add(this.normalizeIngredient(ing));
    });
    const allIngredients = Array.from(allIngredientsSet);

    let matchCount = 0;
    const matched = [];

    selectedIngredients.forEach(selectedIng => {
      const normalizedSelected = this.normalizeIngredient(selectedIng);
      
      // Check for inclusion in any ingredient string
      // Inclusion: selected ingredient string is contained in recipe ingredient string
      const found = allIngredients.some(recipeIng => {
        // Check if selected ingredient is contained in recipe ingredient
        // This handles cases like "chicken" matching "chicken breast"
        if (recipeIng.includes(normalizedSelected)) {
          return true;
        }
        // Also check reverse for cases like "chicken breast" matching "chicken"
        // But only if the selected ingredient is longer (more specific)
        if (normalizedSelected.length > recipeIng.length && normalizedSelected.includes(recipeIng)) {
          return true;
        }
        return false;
      });

      if (found) {
        matchCount++;
        matched.push(selectedIng);
      }
    });

    return { count: matchCount, matched };
  }

  /**
   * Check if a recipe's instructions contain the selected ingredients
   * Secondary scoring method
   * @param {Object} recipe - Recipe object
   * @param {string[]} selectedIngredients - Array of selected ingredient names (normalized)
   * @returns {number} Number of ingredients found in instructions
   */
  matchIngredientsInInstructions(recipe, selectedIngredients) {
    if (!recipe.instructions || typeof recipe.instructions !== 'string') {
      return 0;
    }

    const instructionsLower = recipe.instructions.toLowerCase();
    let matchCount = 0;

    selectedIngredients.forEach(selectedIng => {
      const normalizedSelected = this.normalizeIngredient(selectedIng);
      if (instructionsLower.includes(normalizedSelected)) {
        matchCount++;
      }
    });

    return matchCount;
  }

  /**
   * Score a recipe based on ingredient matches
   * Primary: ingredients in ingredient list
   * Secondary: ingredients in instructions
   * @param {Object} recipe - Recipe object
   * @param {string[]} selectedIngredients - Array of selected ingredient names
   * @returns {Object} Scored recipe with match information
   */
  scoreRecipe(recipe, selectedIngredients) {
    if (selectedIngredients.length === 0) {
      return {
        recipe,
        score: 0,
        primaryMatches: 0,
        secondaryMatches: 0,
        totalSelected: 0
      };
    }

    // Primary scoring: ingredients in ingredient list
    const ingredientMatch = this.matchIngredientsInList(recipe, selectedIngredients);
    const primaryMatches = ingredientMatch.count;

    // Secondary scoring: ingredients in instructions
    const secondaryMatches = this.matchIngredientsInInstructions(recipe, selectedIngredients);

    // Calculate score: primary matches are worth more
    // Score = (primaryMatches * 1000) + (secondaryMatches * 100) + (primaryMatches / totalSelected * 100)
    // This ensures recipes with all ingredients score highest
    const completeness = selectedIngredients.length > 0 
      ? primaryMatches / selectedIngredients.length 
      : 0;
    
    const score = (primaryMatches * 1000) + 
                  (secondaryMatches * 100) + 
                  (completeness * 100);

    return {
      recipe,
      score,
      primaryMatches,
      secondaryMatches,
      totalSelected: selectedIngredients.length,
      matchedIngredients: ingredientMatch.matched
    };
  }

  /**
   * Find recipes matching selected ingredients using Dexie queries
   * Optimized for mobile performance: parallel queries, early limiting, efficient filtering
   * @param {string[]} selectedIngredients - Array of selected ingredient names
   * @returns {Promise<Array>} Array of scored recipes
   */
  async findMatchingRecipes(selectedIngredients) {
    if (!selectedIngredients || selectedIngredients.length === 0) {
      return [];
    }

    if (!window.db) {
      console.error('Database not available');
      return [];
    }

    try {
      const startTime = performance.now();
      
      // Normalize selected ingredients for querying
      const normalizedSelected = selectedIngredients.map(ing => this.normalizeIngredient(ing));

      // Get disliked recipe IDs first (small, fast query)
      const dislikedIds = await window.app.getDislikedRecipeIds();

      // OPTIMIZATION: Use a single efficient query instead of multiple sequential queries
      // For inclusion-based matching, we need to scan recipes, but we can optimize:
      // 1. Limit the total number of recipes we process
      // 2. Use parallel processing for multiple ingredients
      // 3. Early termination when we have enough good candidates
      
      // Performance tuning for mobile devices
      // Lower limits = faster queries
      const MAX_RECIPES_TO_SCAN = 800; // Optimized for mobile performance (was unlimited)
      const TARGET_CANDIDATES = 150; // Target candidates before scoring
      
      // KEY OPTIMIZATION: Limit total recipes scanned - this is the biggest performance gain
      // Instead of scanning all recipes, we only scan a limited subset
      // This makes queries 10-100x faster on mobile devices
      const recipesToScan = await window.db.recipes
        .limit(MAX_RECIPES_TO_SCAN)
        .toArray();
      
      // Filter recipes efficiently in chunks to keep UI responsive
      const candidateRecipesMap = new Map();
      const chunkSize = 50; // Smaller chunks for better mobile responsiveness
      
      // Process recipes in chunks with periodic yields to keep UI responsive
      for (let i = 0; i < recipesToScan.length; i += chunkSize) {
        const chunk = recipesToScan.slice(i, i + chunkSize);
        
        // Process chunk synchronously (fast for small chunks)
        chunk.forEach(recipe => {
          // Skip if disliked or already processed
          if (dislikedIds.has(recipe.id) || candidateRecipesMap.has(recipe.id)) {
            return;
          }
          
          // Quick match check: does this recipe match any selected ingredient?
          // Use for loop for early break (faster than .some())
          for (const ingredient of normalizedSelected) {
            if (this.checkIngredientMatch(recipe, ingredient)) {
              candidateRecipesMap.set(recipe.id, recipe);
              break; // Found a match, no need to check other ingredients
            }
          }
        });
        
        // Early termination if we have enough candidates
        if (candidateRecipesMap.size >= TARGET_CANDIDATES) {
          break;
        }
        
        // Yield to browser every few chunks to keep UI responsive
        if (i > 0 && i % (chunkSize * 3) === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Convert to array and score (limit to reasonable number for mobile)
      const MAX_SCORING_CANDIDATES = 500; // Reduced for mobile performance
      const candidates = Array.from(candidateRecipesMap.values())
        .slice(0, MAX_SCORING_CANDIDATES);
      
      // Score recipes efficiently
      const scoredRecipes = candidates.map(recipe => 
        this.scoreRecipe(recipe, normalizedSelected)
      );

      // Sort by score (descending)
      scoredRecipes.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.1) {
          return b.score - a.score;
        }
        if (b.primaryMatches !== a.primaryMatches) {
          return b.primaryMatches - a.primaryMatches;
        }
        return b.secondaryMatches - a.secondaryMatches;
      });
      
      // Filter and return top results
      const topMatches = scoredRecipes
        .filter(result => result.primaryMatches > 0 || result.secondaryMatches > 0)
        .slice(0, this.MAX_RESULTS);

      const endTime = performance.now();
      console.log(`Recipe query took ${(endTime - startTime).toFixed(2)}ms, found ${topMatches.length} results from ${candidateRecipesMap.size} candidates`);

      return topMatches;
    } catch (error) {
      console.error('Error finding matching recipes:', error);
      return [];
    }
  }

  /**
   * Check if a recipe matches an ingredient (helper for performance)
   * @param {Object} recipe - Recipe object
   * @param {string} ingredient - Normalized ingredient to match
   * @returns {boolean} True if recipe contains the ingredient
   */
  checkIngredientMatch(recipe, ingredient) {
    // Check normalizedIngredients first (indexed)
    if (recipe.normalizedIngredients && Array.isArray(recipe.normalizedIngredients)) {
      for (const normIng of recipe.normalizedIngredients) {
        const normalized = this.normalizeIngredient(normIng);
        if (normalized.includes(ingredient) || 
            (ingredient.length > normalized.length && ingredient.includes(normalized))) {
          return true;
        }
      }
    }
    // Fallback to ingredients array
    if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
      for (const ing of recipe.ingredients) {
        const normalized = this.normalizeIngredient(ing);
        if (normalized.includes(ingredient) || 
            (ingredient.length > normalized.length && ingredient.includes(normalized))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get recipe suggestions based on currently selected ingredients
   * @returns {Promise<Array>} Array of top 5 scored recipes
   */
  async getSuggestions() {
    const selectedIngredients = this.getSelectedIngredients();
    
    if (selectedIngredients.length === 0) {
      console.log('No ingredients selected');
      return [];
    }

    console.log(`Finding recipes for ${selectedIngredients.length} selected ingredients:`, selectedIngredients);
    
    const suggestions = await this.findMatchingRecipes(selectedIngredients);
    this.currentSuggestions = suggestions;
    
    console.log(`Found ${suggestions.length} recipe suggestions`);
    return suggestions;
  }

  /**
   * Format ingredients list for display
   * @param {Array} ingredients - Array of ingredient strings
   * @param {number} maxLength - Maximum length before truncation
   * @returns {string} Formatted ingredients string
   */
  formatIngredientsPreview(ingredients, maxLength = 150) {
    if (!ingredients || !Array.isArray(ingredients)) {
      return 'No ingredients listed';
    }

    const ingredientsStr = ingredients.join(', ');
    if (ingredientsStr.length <= maxLength) {
      return ingredientsStr;
    }

    return ingredientsStr.substring(0, maxLength) + '...';
  }

  /**
   * Create a recipe card element
   * @param {Object} scoredRecipe - Scored recipe object
   * @param {number} index - Index of the recipe
   * @returns {Promise<HTMLElement>} Recipe card DOM element
   */
  async createRecipeCard(scoredRecipe, index) {
    const { recipe, primaryMatches, secondaryMatches, totalSelected } = scoredRecipe;
    
    // Check if recipe is liked
    const likeStatus = await window.app.getLikeDislikeStatus(recipe.id);
    const isLiked = likeStatus === 'like';
    
    const card = document.createElement('div');
    card.className = 'recipe-card card mb-3';
    card.dataset.recipeId = recipe.id;
    card.dataset.index = index;

    const matchInfo = totalSelected > 0 
      ? `${primaryMatches}/${totalSelected} ingredients matched`
      : 'No match info';

    const likeBtnClass = isLiked ? 'action-btn like-btn btn btn-link p-2 active' : 'action-btn like-btn btn btn-link p-2';

    card.innerHTML = `
      <div class="card-body p-4">
        <div class="row g-3">
          <!-- Left Column: Recipe Content -->
          <div class="col-10">
            <h2 class="recipe-title mb-2">${this.escapeHtml(recipe.title || 'Untitled Recipe')}</h2>
            <p class="recipe-ingredients mb-1">
              ${this.escapeHtml(this.formatIngredientsPreview(recipe.ingredients || []))}
            </p>
            <small class="text-muted">${matchInfo}</small>
          </div>
          
          <!-- Right Column: Action Buttons -->
          <div class="col-2 d-flex flex-column align-items-center justify-content-start gap-2">
            <button class="${likeBtnClass}" aria-label="Like recipe">
              <i class="bi bi-hand-thumbs-up-fill fs-4"></i>
            </button>
            <button class="action-btn hide-btn btn btn-link p-2" aria-label="Hide recipe">
              <i class="bi bi-eye-slash fs-4"></i>
            </button>
            <button class="action-btn dislike-btn btn btn-link p-2" aria-label="Dislike recipe">
              <i class="bi bi-hand-thumbs-down-fill fs-4"></i>
            </button>
          </div>
        </div>
        
        <!-- Expanded Content (hidden by default) -->
        <div class="recipe-expanded-content" style="display: none;">
          <hr class="my-3">
          <div class="mb-3">
            <h4>Ingredients:</h4>
            <ul class="mb-0">
              ${(recipe.ingredients || []).map(ing => 
                `<li>${this.escapeHtml(ing)}</li>`
              ).join('')}
            </ul>
          </div>
          <div>
            <h4>Instructions:</h4>
            <p class="mb-0" style="white-space: pre-wrap;">${this.escapeHtml(recipe.instructions || 'No instructions available')}</p>
          </div>
        </div>
        
        <!-- Expand Button (centered at bottom) -->
        <div class="text-center mt-2">
          <button class="expand-btn btn btn-link p-2" aria-label="Expand recipe">
            <i class="bi bi-chevron-down fs-4"></i>
          </button>
        </div>
      </div>
    `;

    const expandBtn = card.querySelector('.expand-btn');
    const expandedContent = card.querySelector('.recipe-expanded-content');
    const chevronIcon = expandBtn.querySelector('i');

    expandBtn.addEventListener('click', () => {
      this.showRecipeDetail(recipe);
    });

    // Add like button click handler
    const likeBtn = card.querySelector('.like-btn');
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        const currentStatus = await window.app.getLikeDislikeStatus(recipe.id);
        if (currentStatus === 'like') {
          await window.db.likeDislike.delete(recipe.id);
          likeBtn.classList.remove('active');
          console.log(`✓ Removed like for recipe: ${recipe.title}`);
        } else {
          await window.app.saveLikeDislike(recipe.id, recipe?.title ?? 'Untitled', 'like');
          likeBtn.classList.add('active');
        }
      } catch (error) {
        console.error('Error saving like:', error);
        alert('Could not save like. Please try again.');
      }
    });

    // Add dislike button click handler
    const dislikeBtn = card.querySelector('.dislike-btn');
    dislikeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        await window.app.saveLikeDislike(recipe.id, recipe?.title ?? 'Untitled', 'dislike');
        // Only remove card after save succeeded
        card.style.transition = 'all 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        setTimeout(() => {
          card.remove();
        }, 300);
      } catch (error) {
        console.error('Failed to save dislike:', error);
        alert('Could not save dislike. Please try again.');
      }
    });

    return card;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render recipe suggestions to the UI
   * @param {Array} suggestions - Array of scored recipes
   */
  async renderSuggestions(suggestions) {
    const container = document.getElementById('recipe-suggestions');
    if (!container) {
      console.error('Recipe suggestions container not found');
      return;
    }

    // Clear existing content
    container.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = `
        <div class="card mb-3">
          <div class="card-body p-4 text-center">
            <p class="mb-0">No recipe suggestions found. Try selecting some ingredients in your pantry.</p>
          </div>
        </div>
      `;
      return;
    }

    // Create and append recipe cards (await async card creation)
    for (let index = 0; index < suggestions.length; index++) {
      const scoredRecipe = suggestions[index];
      const card = await this.createRecipeCard(scoredRecipe, index);
      container.appendChild(card);
    }
  }

  showRecipeDetail(recipe) {
    const container = document.getElementById('recipe-suggestions');
    if (!container) return;
    const ingredients = recipe.ingredients || [];
    const instructions = recipe.instructions || 'No instructions available';
    const isConnected = navigator.onLine;
    container.innerHTML = `
      <div class="recipe-detail-view">
        <div class="recipe-detail-header d-flex align-items-center justify-content-between gap-2">
          <button type="button" class="back-btn btn btn-link p-0" aria-label="Back"><i class="bi bi-arrow-left fs-4"></i></button>
          <div class="wifi-status-group">
            <i class="bi ${isConnected ? 'bi-wifi' : 'bi-wifi-off'} wifi-icon${isConnected ? '' : ' offline'}"></i>
            <button type="button" class="wifi-tooltip-btn btn btn-link p-0" style="display: ${isConnected ? 'none' : 'inline-flex'}" aria-label="Connection info">
              <i class="bi bi-info-circle"></i>
            </button>
          </div>
          <h2 class="recipe-detail-title flex-grow-1 mb-0 text-center">${this.escapeHtml(recipe.title || 'Untitled')}</h2>
          <div class="recipe-detail-actions d-flex gap-1">
            <button type="button" class="fork-btn btn btn-link p-2" aria-label="Fork recipe"><i class="bi bi-diagram-3 fs-5"></i></button>
            <button type="button" class="edit-btn btn btn-link p-2" aria-label="Edit recipe"><i class="bi bi-pencil fs-5"></i></button>
            <button type="button" class="bookmark-btn btn btn-link p-2" aria-label="Bookmark" disabled><i class="bi bi-bookmark fs-5"></i></button>
          </div>
        </div>
        <div class="recipe-detail-body mt-3">
          <h4 class="mb-2">Ingredients:</h4>
          <ul class="recipe-detail-ingredients mb-3">
            ${ingredients.map(ing => `<li>${this.escapeHtml(ing)}</li>`).join('')}
          </ul>
          <h4 class="mb-2">Instructions:</h4>
          <p class="recipe-detail-instructions" style="white-space: pre-wrap;">${this.escapeHtml(instructions)}</p>
        </div>
      </div>
    `;

    // Connectivity status: dynamic updates via online/offline events
    const updateConnectivity = () => {
      const on = navigator.onLine;
      const icon = container.querySelector('.wifi-icon');
      const tooltipBtn = container.querySelector('.wifi-tooltip-btn');
      if (icon) {
        icon.className = `bi ${on ? 'bi-wifi' : 'bi-wifi-off'} wifi-icon${on ? '' : ' offline'}`;
      }
      if (tooltipBtn) {
        tooltipBtn.style.display = on ? 'none' : 'inline-flex';
      }
    };
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    this._detailWifiCleanup = () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };

    // WiFi tooltip popover toggle
    const tooltipBtn = container.querySelector('.wifi-tooltip-btn');
    if (tooltipBtn) {
      tooltipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let popover = container.querySelector('.wifi-tooltip-popover');
        if (popover) {
          popover.remove();
          return;
        }
        popover = document.createElement('div');
        popover.className = 'wifi-tooltip-popover';
        popover.textContent = 'No internet connection. LLM-powered substitution is unavailable. You can still manually edit ingredients.';
        tooltipBtn.style.position = 'relative';
        tooltipBtn.appendChild(popover);
        // Auto-dismiss after 4 seconds
        setTimeout(() => { if (popover.parentNode) popover.remove(); }, 4000);
      });
    }

    container.querySelector('.back-btn').addEventListener('click', () => this.loadSuggestions());
    container.querySelector('.fork-btn').addEventListener('click', () => {
      if (window.substitutionEditor) window.substitutionEditor.open(recipe, true);
    });
    container.querySelector('.edit-btn').addEventListener('click', () => {
      if (window.substitutionEditor) window.substitutionEditor.open(recipe, false);
    });
  }

  async loadSuggestions() {
    // Clean up WiFi event listeners from detail view
    if (this._detailWifiCleanup) {
      this._detailWifiCleanup();
      this._detailWifiCleanup = null;
    }
    const container = document.getElementById('recipe-suggestions');
    if (container) {
      // Show loading state
      container.innerHTML = `
        <div class="card mb-3">
          <div class="card-body p-4 text-center">
            <p class="mb-0">Loading recipe suggestions...</p>
          </div>
        </div>
      `;
    }
    
    try {
      const suggestions = await this.getSuggestions();
      this.renderSuggestions(suggestions);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      if (container) {
        container.innerHTML = `
          <div class="card mb-3">
            <div class="card-body p-4 text-center">
              <p class="mb-0 text-danger">Error loading suggestions. Please try again.</p>
            </div>
          </div>
        `;
      }
    }
  }
}

// Initialize the recipe suggestion engine
const recipeEngine = new RecipeSuggestionEngine();
window.recipeEngine = recipeEngine;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecipeSuggestionEngine;
}
