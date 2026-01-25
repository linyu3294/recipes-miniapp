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
   * Uses inclusion-based queries optimized for performance
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
      // Normalize selected ingredients for querying
      const normalizedSelected = selectedIngredients.map(ing => this.normalizeIngredient(ing));

      // Use Dexie's multiEntry index to find recipes containing any of the selected ingredients
      // Optimize by using Set to track unique recipes
      const candidateRecipesMap = new Map(); // Use Map to preserve recipe objects
      
      // Query for each ingredient using the normalizedIngredients index
      // This leverages Dexie's multiEntry index for fast lookups
      for (const ingredient of normalizedSelected) {
        try {
          // Use Dexie filter with inclusion check
          // The multiEntry index on normalizedIngredients allows fast filtering
          const recipes = await window.db.recipes
            .filter(recipe => {
              // Check normalizedIngredients array first (indexed)
              if (recipe.normalizedIngredients && Array.isArray(recipe.normalizedIngredients)) {
              return recipe.normalizedIngredients.some(normIng => {
                const normalized = this.normalizeIngredient(normIng);
                // Inclusion check: ingredient string contains selected ingredient
                if (normalized.includes(ingredient)) {
                  return true;
                }
                // Reverse check for more specific ingredients
                if (ingredient.length > normalized.length && ingredient.includes(normalized)) {
                  return true;
                }
                return false;
              });
            }
            // Fallback to ingredients array if normalizedIngredients not available
            if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
              return recipe.ingredients.some(ing => {
                const normalized = this.normalizeIngredient(ing);
                if (normalized.includes(ingredient)) {
                  return true;
                }
                if (ingredient.length > normalized.length && ingredient.includes(normalized)) {
                  return true;
                }
                return false;
              });
            }
            return false;
          })
          .toArray();
        
          // Store recipes in Map (automatically handles duplicates by id)
          recipes.forEach(recipe => {
            if (!candidateRecipesMap.has(recipe.id)) {
              candidateRecipesMap.set(recipe.id, recipe);
            }
          });
        } catch (queryError) {
          console.warn(`Error querying for ingredient "${ingredient}":`, queryError);
          // Continue with other ingredients
        }
      }

      // Convert Map values to Array and score each recipe
      const candidates = Array.from(candidateRecipesMap.values());
      const scoredRecipes = candidates.map(recipe => 
        this.scoreRecipe(recipe, normalizedSelected)
      );

      // Sort by score (descending) and return top 5
      scoredRecipes.sort((a, b) => {
        // Primary sort: by score
        if (Math.abs(b.score - a.score) > 0.1) {
          return b.score - a.score;
        }
        // Secondary sort: by primary matches
        if (b.primaryMatches !== a.primaryMatches) {
          return b.primaryMatches - a.primaryMatches;
        }
        // Tertiary sort: by secondary matches
        return b.secondaryMatches - a.secondaryMatches;
      });
      
      // Get disliked recipe IDs to filter them out
      const dislikedIds = await window.app.getDislikedRecipeIds();

      // Filter to only include recipes with at least one match, exclude disliked recipes, and return top 5
      const topMatches = scoredRecipes
        .filter(result => {
          // Must have at least one match
          if (result.primaryMatches === 0 && result.secondaryMatches === 0) {
            return false;
          }
          // Must not be disliked
          if (dislikedIds.has(result.recipe.id)) {
            return false;
          }
          return true;
        })
        .slice(0, MAX_RESULTS);

      return topMatches;
    } catch (error) {
      console.error('Error finding matching recipes:', error);
      return [];
    }
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

    // Add expand/collapse functionality
    const expandBtn = card.querySelector('.expand-btn');
    const expandedContent = card.querySelector('.recipe-expanded-content');
    const chevronIcon = expandBtn.querySelector('i');

    expandBtn.addEventListener('click', () => {
      const isExpanded = card.classList.contains('expanded');
      
      if (isExpanded) {
        card.classList.remove('expanded');
        expandedContent.style.display = 'none';
        chevronIcon.className = 'bi bi-chevron-down fs-4';
        expandBtn.setAttribute('aria-label', 'Expand recipe');
      } else {
        card.classList.add('expanded');
        expandedContent.style.display = 'block';
        chevronIcon.className = 'bi bi-chevron-up fs-4';
        expandBtn.setAttribute('aria-label', 'Collapse recipe');
      }
    });

    // Add like button click handler
    const likeBtn = card.querySelector('.like-btn');
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentStatus = await window.app.getLikeDislikeStatus(recipe.id);
      
      if (currentStatus === 'like') {
        // Already liked, remove like (toggle off) by deleting the entry
        try {
          await window.db.likeDislike.delete(recipe.id);
          likeBtn.classList.remove('active');
          console.log(`✓ Removed like for recipe: ${recipe.title}`);
        } catch (error) {
          console.error('Error removing like:', error);
        }
      } else {
        // Not liked, add like
        await window.app.saveLikeDislike(recipe.id, recipe.title, 'like');
        likeBtn.classList.add('active');
      }
    });

    // Add dislike button click handler
    const dislikeBtn = card.querySelector('.dislike-btn');
    dislikeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      // Save dislike to database
      await window.app.saveLikeDislike(recipe.id, recipe.title, 'dislike');
      
      // Remove card from UI with animation
      card.style.transition = 'all 0.3s';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.8)';
      
      setTimeout(() => {
        card.remove();
      }, 300);
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

  /**
   * Load and display recipe suggestions
   * Called when user switches to suggestions tab
   */
  async loadSuggestions() {
    const suggestions = await this.getSuggestions();
    this.renderSuggestions(suggestions);
  }
}

// Initialize the recipe suggestion engine
const recipeEngine = new RecipeSuggestionEngine();
window.recipeEngine = recipeEngine;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecipeSuggestionEngine;
}
