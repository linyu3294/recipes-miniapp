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
    const likeStatus = await window.app.getLibraryStatus(recipe.id);
    const isLiked = likeStatus === 'like';
    
    const card = document.createElement('div');
    card.className = 'recipe-card card mb-3';
    card.dataset.recipeId = recipe.id;
    card.dataset.index = index;

    const totalRecipeIngredients = (recipe.ingredients || []).length;
    const matchInfo = totalRecipeIngredients > 0 
      ? `${primaryMatches}/${totalRecipeIngredients} ingredients matched`
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
        const currentStatus = await window.app.getLibraryStatus(recipe.id);
        if (currentStatus === 'like') {
          await window.app.removeFromLibrary(recipe.id);
          likeBtn.classList.remove('active');
          console.log(`✓ Removed like for recipe: ${recipe.title}`);
        } else {
          await window.app.saveToLibrary(recipe.id, recipe?.title ?? 'Untitled', 'like');
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
        await window.app.saveToLibrary(recipe.id, recipe?.title ?? 'Untitled', 'dislike');
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

  async showRecipeDetail(recipe) {
    const container = document.getElementById('recipe-suggestions');
    if (!container) return;
    // Hide search bar and results when viewing detail
    const searchInput = document.getElementById('recipe-search');
    const searchResults = document.getElementById('recipe-search-results');
    if (searchInput) searchInput.style.display = 'none';
    if (searchResults) searchResults.style.display = 'none';
    const ingredients = recipe.ingredients || [];
    const instructions = recipe.instructions || 'No instructions available';
    const isConnected = navigator.onLine;
    // Check bookmark status
    const libraryStatus = await window.app.getLibraryStatus(recipe.id);
    const isBookmarked = libraryStatus === 'bookmarked';
    const bookmarkIcon = isBookmarked ? 'bi-bookmark-fill' : 'bi-bookmark';
    const bookmarkActiveClass = isBookmarked ? ' active' : '';
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
            <button type="button" class="bookmark-btn btn btn-link p-2${bookmarkActiveClass}" aria-label="Bookmark"><i class="bi ${bookmarkIcon} fs-5"></i></button>
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
    // Bookmark toggle handler
    container.querySelector('.bookmark-btn').addEventListener('click', async () => {
      const btn = container.querySelector('.bookmark-btn');
      try {
        const currentStatus = await window.app.getLibraryStatus(recipe.id);
        if (currentStatus === 'bookmarked') {
          await window.app.removeFromLibrary(recipe.id);
          btn.querySelector('i').className = 'bi bi-bookmark fs-5';
          btn.classList.remove('active');
        } else {
          await window.app.saveToLibrary(recipe.id, recipe?.title ?? 'Untitled', 'bookmarked');
          btn.querySelector('i').className = 'bi bi-bookmark-fill fs-5';
          btn.classList.add('active');
        }
      } catch (error) {
        console.error('Error toggling bookmark:', error);
      }
    });
  }

  async loadSuggestions() {
    // Clean up WiFi event listeners from detail view
    if (this._detailWifiCleanup) {
      this._detailWifiCleanup();
      this._detailWifiCleanup = null;
    }
    // Restore search bar visibility
    const searchInput = document.getElementById('recipe-search');
    const searchResults = document.getElementById('recipe-search-results');
    if (searchInput) { searchInput.style.display = ''; searchInput.value = ''; }
    if (searchResults) { searchResults.style.display = 'none'; searchResults.innerHTML = ''; }
    const container = document.getElementById('recipe-suggestions');
    if (container) container.style.display = '';
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

/**
 * Recipe Title Search
 * Splits query into terms, fuzzy-matches each term against recipe titles,
 * ranks results by how many terms match (all-match first), then by match quality.
 */
const RECIPE_SEARCH_DEBOUNCE = 200;
const RECIPE_SEARCH_MAX_RESULTS = 15;
const RECIPE_SEARCH_MAX_SCAN = 1000;

/**
 * Score how well a single search term matches a title string.
 * Returns 0 if no match, higher is better.
 */
function scoreTermMatch(term, titleLower) {
  if (titleLower === term) return 1.0;
  if (titleLower.startsWith(term)) return 0.9;
  if (titleLower.includes(term)) return 0.8;
  // Word-boundary match: any word in the title starts with the term
  const words = titleLower.split(/\s+/);
  for (const w of words) {
    if (w.startsWith(term)) return 0.7;
  }
  // Fuzzy: subsequence match
  let si = 0;
  for (let ti = 0; ti < titleLower.length && si < term.length; ti++) {
    if (term[si] === titleLower[ti]) si++;
  }
  const ratio = si / term.length;
  return ratio >= 0.6 ? ratio * 0.5 : 0;
}

/**
 * Score a recipe title against an array of search terms.
 * Returns { matchedCount, totalScore } where matchedCount is how many terms had a non-zero score.
 */
function scoreRecipeTitle(terms, titleLower) {
  let matchedCount = 0;
  let totalScore = 0;
  for (const term of terms) {
    const s = scoreTermMatch(term, titleLower);
    if (s > 0) {
      matchedCount++;
      totalScore += s;
    }
  }
  return { matchedCount, totalScore };
}

/**
 * Check if any search term appears in a text string (exact substring match).
 * Returns the list of terms that matched.
 */
function findMatchingTerms(terms, text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t));
}

/**
 * Build a context snippet showing where keywords appear in the body text.
 * Format: "...context keyword context ... context keyword2 context..."
 * @param {string} text - The full body text (ingredients joined or instructions)
 * @param {string[]} matchedTerms - Terms that were found in the text
 * @param {number} contextChars - Characters of context around each keyword
 * @returns {string} The snippet string (plain text, not HTML)
 */
function buildContextSnippet(text, matchedTerms, contextChars) {
  if (!text || matchedTerms.length === 0) return '';
  const lower = text.toLowerCase();
  const snippets = [];
  const seen = new Set();
  for (const term of matchedTerms) {
    const pos = lower.indexOf(term);
    if (pos === -1 || seen.has(term)) continue;
    seen.add(term);
    const start = Math.max(0, pos - contextChars);
    const end = Math.min(text.length, pos + term.length + contextChars);
    let snippet = '';
    if (start > 0) snippet += '...';
    snippet += text.substring(start, end).trim();
    if (end < text.length) snippet += '...';
    snippets.push(snippet);
    if (snippets.length >= 3) break; // limit to 3 keyword contexts
  }
  return snippets.join('  ');
}

async function searchRecipes(query) {
  if (!query || !query.trim()) return [];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return [];

  try {
    const recipes = await window.db.recipes
      .limit(RECIPE_SEARCH_MAX_SCAN)
      .toArray();

    const scored = [];
    for (const recipe of recipes) {
      if (!recipe.title) continue;
      const titleLower = recipe.title.toLowerCase();
      const { matchedCount: titleMatched, totalScore: titleScore } = scoreRecipeTitle(terms, titleLower);

      // Also search in ingredients and instructions (body)
      const ingredientsText = (recipe.ingredients || []).join(', ');
      const instructionsText = recipe.instructions || '';
      const bodyText = ingredientsText + ' ' + instructionsText;
      const bodyMatchedTerms = findMatchingTerms(terms, bodyText);
      const bodyMatched = bodyMatchedTerms.length;

      const totalMatched = Math.max(titleMatched, bodyMatched);
      if (totalMatched === 0) continue;

      // Title hits get a bonus so they rank above body-only hits
      const totalScore = (titleScore * 2) + (bodyMatched * 0.3);
      const hitInTitle = titleMatched > 0;

      // Build context snippet for body hits
      let contextSnippet = '';
      if (!hitInTitle && bodyMatched > 0) {
        // Body-only hit: show context from whichever text had matches
        const ingTerms = findMatchingTerms(terms, ingredientsText);
        const insTerms = findMatchingTerms(terms, instructionsText);
        if (ingTerms.length > 0) {
          contextSnippet = buildContextSnippet(ingredientsText, ingTerms, 20);
        } else if (insTerms.length > 0) {
          contextSnippet = buildContextSnippet(instructionsText, insTerms, 25);
        }
      } else if (hitInTitle && bodyMatched > 0) {
        // Title hit that also has body matches: no context needed (title is enough)
        contextSnippet = '';
      }

      scored.push({
        recipe,
        matchedCount: totalMatched,
        totalScore,
        totalTerms: terms.length,
        hitInTitle,
        contextSnippet
      });
    }

    // Sort: title hits first, then most terms matched, then by score
    scored.sort((a, b) => {
      if (a.hitInTitle !== b.hitInTitle) return a.hitInTitle ? -1 : 1;
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return b.totalScore - a.totalScore;
    });

    return scored.slice(0, RECIPE_SEARCH_MAX_RESULTS);
  } catch (err) {
    console.error('Error searching recipes:', err);
    return [];
  }
}

function initRecipeSearch() {
  const searchInput = document.getElementById('recipe-search');
  const resultsContainer = document.getElementById('recipe-search-results');
  const suggestionsContainer = document.getElementById('recipe-suggestions');
  if (!searchInput || !resultsContainer) return;

  let debounceTimer = null;

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const highlightTerms = (title, query) => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
    let html = escapeHtml(title);
    for (const term of terms) {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      html = html.replace(regex, '<mark>$1</mark>');
    }
    return html;
  };

  const renderSearchResults = (results, query) => {
    resultsContainer.innerHTML = '';
    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="recipe-search-no-results">No recipes found.</div>';
      resultsContainer.style.display = 'block';
      return;
    }
    for (const { recipe, hitInTitle, contextSnippet } of results) {
      const item = document.createElement('div');
      item.className = 'recipe-search-item';
      let contentHtml = `<div class="recipe-search-item-title">${highlightTerms(recipe.title || 'Untitled', query)}</div>`;
      if (!hitInTitle && contextSnippet) {
        contentHtml += `<div class="recipe-search-item-context">${highlightTerms(contextSnippet, query)}</div>`;
      }
      item.innerHTML = `
        <div class="recipe-search-item-content">${contentHtml}</div>
        <button class="recipe-search-bookmark-btn" aria-label="Bookmark recipe"><i class="bi bi-bookmark"></i></button>
      `;
      // Click content area to open detail
      item.querySelector('.recipe-search-item-content').addEventListener('click', () => {
        searchInput.value = '';
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        if (suggestionsContainer) suggestionsContainer.style.display = '';
        recipeEngine.showRecipeDetail(recipe);
      });
      // Click bookmark icon to save to library
      const bookmarkBtn = item.querySelector('.recipe-search-bookmark-btn');
      // Check current status and set initial icon
      (async () => {
        const status = await window.app.getLibraryStatus(recipe.id);
        if (status === 'bookmarked') {
          bookmarkBtn.querySelector('i').className = 'bi bi-bookmark-fill';
          bookmarkBtn.classList.add('active');
        }
      })();
      bookmarkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const status = await window.app.getLibraryStatus(recipe.id);
          if (status === 'bookmarked') {
            await window.app.removeFromLibrary(recipe.id);
            bookmarkBtn.querySelector('i').className = 'bi bi-bookmark';
            bookmarkBtn.classList.remove('active');
          } else {
            await window.app.saveToLibrary(recipe.id, recipe.title || 'Untitled', 'bookmarked');
            bookmarkBtn.querySelector('i').className = 'bi bi-bookmark-fill';
            bookmarkBtn.classList.add('active');
          }
        } catch (err) {
          console.error('Error toggling bookmark:', err);
        }
      });
      resultsContainer.appendChild(item);
    }
    resultsContainer.style.display = 'block';
  };

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);

    if (query.length === 0) {
      resultsContainer.style.display = 'none';
      resultsContainer.innerHTML = '';
      if (suggestionsContainer) suggestionsContainer.style.display = '';
      return;
    }

    // Hide ingredient-based suggestions while searching
    if (suggestionsContainer) suggestionsContainer.style.display = 'none';

    debounceTimer = setTimeout(async () => {
      const results = await searchRecipes(query);
      renderSearchResults(results, query);
    }, RECIPE_SEARCH_DEBOUNCE);
  });
}

// Initialize recipe search when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initRecipeSearch, 150));
} else {
  setTimeout(initRecipeSearch, 150);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecipeSuggestionEngine;
}
