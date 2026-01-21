const DEBOUNCE_DELAY = 150;
const MIN_SCORE_THRESHOLD = 0.1;
const MAX_RESULTS = 10;

const SIMILARITY_SCORES = {
  EXACT: 1.0,
  STARTS_WITH: 0.9,
  CONTAINS: 0.7,
  WORD_BOUNDARY: 0.6,
  FUZZY_SCALE: 0.5
};

const calculateSimilarity = (searchTerm, ingredientName) => {
  const search = searchTerm.toLowerCase().trim();
  const ingredient = ingredientName.toLowerCase().trim();

  if (ingredient === search) return SIMILARITY_SCORES.EXACT;
  if (ingredient.startsWith(search)) return SIMILARITY_SCORES.STARTS_WITH;
  if (ingredient.includes(search)) return SIMILARITY_SCORES.CONTAINS;

  const words = ingredient.split(/\s+/);
  if (words.some(word => word.startsWith(search))) {
    return SIMILARITY_SCORES.WORD_BOUNDARY;
  }

  return fuzzyMatch(search, ingredient) * SIMILARITY_SCORES.FUZZY_SCALE;
};

const fuzzyMatch = (search, text) => {
  let searchIndex = 0;
  let textIndex = 0;
  const searchLen = search.length;

  while (searchIndex < searchLen && textIndex < text.length) {
    if (search[searchIndex] === text[textIndex]) {
      searchIndex++;
    }
    textIndex++;
  }

  return searchIndex / searchLen;
};

const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const highlightMatch = (text, searchTerm) => {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

const sortByRelevance = (a, b) => {
  if (Math.abs(a.score - b.score) > 0.01) {
    return b.score - a.score;
  }
  
  const freqA = a.frequency || 0;
  const freqB = b.frequency || 0;
  if (freqB !== freqA) {
    return freqB - freqA;
  }
  
  return a.name.localeCompare(b.name);
};

class IngredientSearch {
  constructor() {
    this.searchInput = null;
    this.suggestionsContainer = null;
    this.currentResults = [];
    this.debounceTimer = null;
  }

  init() {
    this.createSearchInput();
    this.suggestionsContainer = document.querySelector('.suggestions-section');
    this.attachEventListeners();
  }

  createSearchInput() {
    const searchSection = document.querySelector('.search-section');
    if (!searchSection) {
      console.error('Search section not found');
      return;
    }

    const oldSelect = document.getElementById('ingredients');
    if (oldSelect) oldSelect.remove();

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.id = 'ingredient-search';
    this.searchInput.placeholder = 'Search for ingredients...';
    this.searchInput.autocomplete = 'off';
    this.searchInput.setAttribute('aria-label', 'Search ingredients');

    searchSection.appendChild(this.searchInput);
  }

  async searchIngredients(searchTerm) {
    if (!searchTerm?.trim()) return [];

    try {
      if (!window.db) {
        console.error('Database not available');
        return [];
      }

      const allIngredients = await window.db.ingredients.toArray();
      if (!allIngredients?.length) {
        console.warn('No ingredients found in database');
        return [];
      }

      const scored = allIngredients.map(ingredient => ({
        ...ingredient,
        score: calculateSimilarity(searchTerm, ingredient.name || ''),
        name: ingredient.name || ''
      }));

      return scored
        .filter(item => item.score > MIN_SCORE_THRESHOLD)
        .sort(sortByRelevance)
        .slice(0, MAX_RESULTS);
    } catch (error) {
      console.error('Error searching ingredients:', error);
      return [];
    }
  }

  renderResults(results) {
    this.currentResults = results;
    this.updateSuggestionsSection(results);
  }

  updateSuggestionsSection(results) {
    if (!this.suggestionsContainer) return;

    this.suggestionsContainer.innerHTML = '';
    
    if (results.length === 0) {
      this.suggestionsContainer.style.display = 'none';
      return;
    }

    this.suggestionsContainer.style.display = 'block';
    results.forEach((result, index) => {
      const item = this.createSuggestionItem(result, index);
      this.suggestionsContainer.appendChild(item);
    });
  }

  createSuggestionItem(result, index) {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.dataset.index = index;
    
    const searchTerm = this.searchInput.value.trim();
    item.innerHTML = `
      <span class="ingredient-name">${highlightMatch(result.name, searchTerm)}</span>
      ${result.frequency ? `<span class="ingredient-frequency">(${result.frequency})</span>` : ''}
      <button class="add-btn">+</button>
    `;

    const addBtn = item.querySelector('.add-btn');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addToPantry(result.name);
    });

    item.addEventListener('click', () => this.addToPantry(result.name));

    return item;
  }

  addToPantry(ingredientName) {
    if (window.app?.pantryManager) {
      window.app.pantryManager.addIngredient(ingredientName);
      this.clearSearch();
    }
  }

  clearSearch() {
    if (this.searchInput) this.searchInput.value = '';
    this.currentResults = [];
    if (this.suggestionsContainer) {
      this.suggestionsContainer.innerHTML = '';
      this.suggestionsContainer.style.display = 'none';
    }
  }

  handleInput() {
    const searchTerm = this.searchInput.value.trim();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (searchTerm.length === 0) {
      this.clearSearch();
      return;
    }

    this.debounceTimer = setTimeout(async () => {
      const results = await this.searchIngredients(searchTerm);
      this.renderResults(results);
    }, DEBOUNCE_DELAY);
  }

  attachEventListeners() {
    if (!this.searchInput) return;

    this.searchInput.addEventListener('input', () => this.handleInput());
  }
}

const initIngredientSearch = () => {
  if (typeof Dexie === 'undefined' || !window.db) {
    setTimeout(initIngredientSearch, 50);
    return;
  }

  const searchSection = document.querySelector('.search-section');
  if (!searchSection) {
    setTimeout(initIngredientSearch, 50);
    return;
  }

  const ingredientSearch = new IngredientSearch();
  ingredientSearch.init();
  window.ingredientSearch = ingredientSearch;
  console.log('✓ Ingredient search initialized');
};

const startInit = () => {
  const init = () => setTimeout(initIngredientSearch, 100);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
};

startInit();
