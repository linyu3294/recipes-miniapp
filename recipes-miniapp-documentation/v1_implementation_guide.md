# Recipe Mini App v1.0 - Implementation Quick Start Guide

**Version:** 1.0  
**Date:** 2025-10-23  
**For:** Development Team  

## Overview

This guide provides a quick reference for implementing the Recipe Mini App v1.0 based on the simplified architecture. Use this alongside the full PRD and TAD documents.

## Tech Stack (Keep It Simple!)

```
✅ Vanilla JavaScript (ES6+)
✅ Dexie.js (IndexedDB wrapper)
✅ Service Worker (offline support)
✅ CSS3 (no preprocessors)
✅ HTML5

❌ NO React
❌ NO TypeScript
❌ NO Build tools
❌ NO Web Workers
❌ NO Complex frameworks
```

## File Structure

```
src/
├── index.html              # UI structure (all views in one file)
├── styles.css              # All styles (mobile-first)
├── app.js                  # All logic (5 classes, ~800 lines)
├── sw.js                   # Service worker (~50 lines)
└── manifest.json           # PWA manifest

data/ (served from CDN)
├── recipes_db_clean.json   # 124k recipes
└── static_substitutions.json # Future feature
```

## Core Classes in app.js

### 1. RecipesMiniApp (Main App)
**Purpose**: Orchestrates everything  
**Responsibilities**:
- Initialize database
- Create manager instances
- Handle view switching
- Coordinate data flow

**Key Methods**:
```javascript
async init()                    // Initialize app
async initDatabase()            // Setup Dexie
async loadInitialData()         // Load recipes & pantry
async loadRecipesProgressively() // Background loading
```

### 2. PantryManager
**Purpose**: Manage user's ingredient inventory  
**Responsibilities**:
- Add/remove ingredients
- Search ingredients (autocomplete)
- Normalize ingredient names
- Persist to IndexedDB

**Key Methods**:
```javascript
async loadPantry()              // Load from DB
async addIngredient(name)       // Add to pantry
async removeIngredient(id)      // Remove from pantry
async searchIngredients(query)  // Autocomplete search
normalizeIngredient(name)       // Normalize for matching
```

### 3. RecipeMatcher
**Purpose**: Find and score recipes  
**Responsibilities**:
- Match recipes to ingredients
- Calculate completeness score
- Calculate similarity score
- Apply user preferences

**Key Methods**:
```javascript
async findRecipes(ingredients, prefs) // Find matching recipes
scoreRecipe(userIngs, recipe, prefs)  // Score a recipe
ingredientsMatch(userIng, recipeIng)  // Check if match
calculateSimilarity(a, b)             // String similarity
```

### 4. PreferencesManager
**Purpose**: Track user likes/dislikes  
**Responsibilities**:
- Save recipe ratings
- Load preferences
- Apply to recipe ranking

**Key Methods**:
```javascript
async loadPreferences()         // Load from DB
async setPreference(id, rating) // Save rating
getPreference(id)               // Get rating
```

### 5. UIController
**Purpose**: Render and update UI  
**Responsibilities**:
- Render pantry view
- Render suggestions view
- Handle user interactions
- Update DOM efficiently

**Key Methods**:
```javascript
render()                        // Render current view
renderPantryView()              // Render pantry
renderSuggestionsView()         // Render suggestions
switchView(view)                // Switch between views
updateLoadingProgress(percent)  // Show loading
```

## IndexedDB Schema (Dexie.js)

```javascript
const db = new Dexie('RecipesDB');

db.version(1).stores({
  // Recipe database
  recipes: 'id, title, *ingredients, *normalized_ingredients',
  
  // User pantry
  userPantry: '++id, ingredient, normalized_name, added_date',
  
  // User preferences
  preferences: 'recipe_id, rating, timestamp'
});
```

## UI Views (Based on Wireframes)

### Pantry View (Sections 1-3)
```html
<div id="pantry-view">
  <!-- Header -->
  <div class="header-section">
    <h1>Pantry</h1>
    <button id="select-all-btn">Select All</button>
  </div>
  
  <!-- Search -->
  <div class="search-section">
    <select id="ingredients">
      <option>Search ingredients...</option>
    </select>
  </div>
  
  <!-- Autocomplete Suggestions -->
  <div class="suggestions-section">
    <div class="suggestion-item">
      <span>Rice</span>
      <button class="add-btn">+</button>
    </div>
  </div>
  
  <!-- Selected Ingredients -->
  <div id="selected-ingredients">
    <div class="ingredient" data-selected="false">
      <span class="remove-btn">×</span>
      <h3>Butter</h3>
    </div>
  </div>
  
  <!-- Navigation -->
  <div class="nav-buttons">
    <button class="nav-btn active">Pantry</button>
    <button class="nav-btn">Suggestions</button>
  </div>
</div>
```

### Suggestions View (Sections 4-6)
```html
<div id="suggestions-view" style="display: none;">
  <!-- Recipe Cards -->
  <div class="recipe-list">
    <div class="recipe-card" data-expanded="false">
      <div class="recipe-header">
        <h2>Fried Chicken</h2>
        <div class="recipe-actions">
          <button class="action-btn like">👍</button>
          <button class="action-btn hide">👁️‍🗨️</button>
          <button class="action-btn dislike">👎</button>
        </div>
      </div>
      
      <div class="recipe-preview">
        <p>Chicken pieces, buttermilk, salt...</p>
        <button class="expand-btn">▼</button>
      </div>
      
      <div class="recipe-details" style="display: none;">
        <h3>Ingredients:</h3>
        <ul class="ingredient-list">
          <li class="has">Chicken pieces</li>
          <li class="missing">Buttermilk</li>
        </ul>
        <h3>Instructions:</h3>
        <p>1. Marinate chicken...</p>
      </div>
    </div>
  </div>
  
  <!-- Navigation -->
  <div class="nav-buttons">
    <button class="nav-btn">Pantry</button>
    <button class="nav-btn active">Suggestions</button>
  </div>
</div>
```

## Key CSS Classes

```css
/* Layout */
.header-section          /* Header with title + button */
.search-section          /* Search dropdown container */
.suggestions-section     /* Autocomplete suggestions */
#selected-ingredients    /* Ingredient grid (3 cols) */
.nav-buttons             /* Bottom navigation tabs */

/* Components */
.ingredient              /* Ingredient card */
.ingredient.selected     /* Selected state (teal) */
.suggestion-item         /* Autocomplete item */
.recipe-card             /* Recipe card */
.recipe-card[data-expanded="true"] /* Expanded state */

/* Buttons */
.add-btn                 /* + button for suggestions */
.remove-btn              /* × button on cards */
.select-all-btn          /* Select All button */
.nav-btn                 /* Navigation tab */
.nav-btn.active          /* Active tab */
.action-btn              /* Like/dislike/hide */
.expand-btn              /* Expand/collapse chevron */

/* States */
.has                     /* Ingredient user has */
.missing                 /* Ingredient user doesn't have */
```

## Event Handlers to Implement

### Pantry View
```javascript
// Search dropdown - trigger autocomplete
document.getElementById('ingredients').addEventListener('change', (e) => {
  // Show autocomplete suggestions
});

// Add ingredient button
document.querySelectorAll('.add-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Add ingredient to pantry
  });
});

// Remove ingredient button
document.querySelectorAll('.remove-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Remove ingredient from pantry
  });
});

// Select ingredient card
document.querySelectorAll('.ingredient').forEach(card => {
  card.addEventListener('click', (e) => {
    // Toggle selection state
  });
});

// Select All button
document.getElementById('select-all-btn').addEventListener('click', (e) => {
  // Select/deselect all ingredients
});
```

### Suggestions View
```javascript
// Expand/collapse recipe
document.querySelectorAll('.expand-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Toggle recipe details
  });
});

// Like/dislike/hide buttons
document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Save preference
  });
});
```

### Navigation
```javascript
// Switch views
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Switch between Pantry and Suggestions
  });
});
```

## Recipe Matching Algorithm (Simplified)

```javascript
scoreRecipe(userIngredients, recipe) {
  // 1. Calculate completeness (% of recipe ingredients user has)
  const matchCount = recipe.normalized_ingredients.filter(recipeIng => 
    userIngredients.some(userIng => 
      this.ingredientsMatch(userIng, recipeIng)
    )
  ).length;
  
  const completeness = matchCount / recipe.normalized_ingredients.length;
  
  // 2. Calculate similarity (how well ingredients match)
  let totalSimilarity = 0;
  recipe.normalized_ingredients.forEach(recipeIng => {
    const bestMatch = Math.max(...userIngredients.map(userIng => 
      this.calculateSimilarity(userIng, recipeIng)
    ));
    totalSimilarity += bestMatch;
  });
  
  const similarity = totalSimilarity / recipe.normalized_ingredients.length;
  
  // 3. Get preference score
  const preferenceScore = this.getPreferenceScore(recipe.id);
  
  // 4. Weighted scoring
  const score = (completeness * 0.5) + (similarity * 0.3) + (preferenceScore * 0.2);
  
  return { recipe, score, completeness, similarity };
}
```

## String Similarity (Simple Version)

```javascript
calculateSimilarity(a, b) {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  
  // Exact match
  if (aLower === bLower) return 1.0;
  
  // Substring match
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;
  
  // Word overlap
  const aWords = aLower.split(' ');
  const bWords = bLower.split(' ');
  const overlap = aWords.filter(word => bWords.includes(word));
  
  if (overlap.length > 0) {
    return 0.6 * (overlap.length / Math.max(aWords.length, bWords.length));
  }
  
  return 0;
}
```

## Progressive Loading Pattern

```javascript
async loadRecipesProgressively() {
  const response = await fetch('/data/recipes_db_clean.json');
  const recipes = await response.json();
  
  const chunkSize = 1000;
  for (let i = 0; i < recipes.length; i += chunkSize) {
    const chunk = recipes.slice(i, i + chunkSize);
    await this.db.recipes.bulkAdd(chunk);
    
    // Update progress
    const progress = Math.round((i / recipes.length) * 100);
    this.uiController.updateLoadingProgress(progress);
    
    // Don't block UI
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

## Service Worker (Basic Offline Support)

```javascript
const CACHE_NAME = 'recipes-miniapp-v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js'];

// Install - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(response => 
      response || fetch(event.request)
    )
  );
});
```

## Performance Optimizations

### 1. Debounce Search
```javascript
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Use it
const debouncedSearch = debounce(searchIngredients, 300);
```

### 2. Lazy Rendering
```javascript
// Only render visible recipe cards
function renderVisibleRecipes() {
  const container = document.getElementById('recipe-list');
  const scrollTop = container.scrollTop;
  const containerHeight = container.clientHeight;
  
  // Calculate visible range
  const startIndex = Math.floor(scrollTop / CARD_HEIGHT);
  const endIndex = Math.ceil((scrollTop + containerHeight) / CARD_HEIGHT);
  
  // Render only visible cards
  for (let i = startIndex; i < endIndex; i++) {
    renderRecipeCard(recipes[i]);
  }
}
```

### 3. Efficient DOM Updates
```javascript
// Use DocumentFragment for batch updates
function renderIngredients(ingredients) {
  const fragment = document.createDocumentFragment();
  
  ingredients.forEach(ing => {
    const card = createIngredientCard(ing);
    fragment.appendChild(card);
  });
  
  container.innerHTML = '';
  container.appendChild(fragment);
}
```

## Testing Checklist

### Pantry View
- [ ] Search dropdown shows autocomplete
- [ ] Click "+" adds ingredient to pantry
- [ ] Click "×" removes ingredient
- [ ] Click card toggles selection (gray ↔ teal)
- [ ] "Select All" selects/deselects all
- [ ] Ingredients persist after reload

### Suggestions View
- [ ] Recipes load based on selected ingredients
- [ ] Recipes sorted by match score
- [ ] Click chevron expands/collapses recipe
- [ ] Click like/dislike updates preference
- [ ] Click hide removes recipe from list
- [ ] Preferences persist after reload

### Offline Support
- [ ] App loads without network
- [ ] Pantry works offline
- [ ] Recipe matching works offline
- [ ] Preferences save offline
- [ ] Service worker caches assets

### Performance
- [ ] Initial load <2s
- [ ] Recipe search <1s
- [ ] Autocomplete <200ms
- [ ] Smooth animations
- [ ] No UI blocking during data load

## Common Pitfalls to Avoid

1. ❌ **Don't use React** - Keep it vanilla JS
2. ❌ **Don't over-engineer** - Simple is better
3. ❌ **Don't block UI** - Use async/await properly
4. ❌ **Don't forget mobile** - Mobile-first design
5. ❌ **Don't skip offline** - Test without network
6. ❌ **Don't ignore performance** - Monitor load times
7. ❌ **Don't forget accessibility** - Use semantic HTML
8. ❌ **Don't hardcode data** - Load from IndexedDB

## Quick Reference: What Goes Where

| Feature | File | Class | Method |
|---------|------|-------|--------|
| Add ingredient | app.js | PantryManager | addIngredient() |
| Remove ingredient | app.js | PantryManager | removeIngredient() |
| Search ingredients | app.js | PantryManager | searchIngredients() |
| Match recipes | app.js | RecipeMatcher | findRecipes() |
| Score recipe | app.js | RecipeMatcher | scoreRecipe() |
| Like/dislike | app.js | PreferencesManager | setPreference() |
| Render pantry | app.js | UIController | renderPantryView() |
| Render suggestions | app.js | UIController | renderSuggestionsView() |
| Switch views | app.js | UIController | switchView() |
| Offline caching | sw.js | ServiceWorker | fetch event |

## Next Steps

1. **Read full documents**:
   - recipe_product_requirements_document_v1.md
   - recipe_technical_architecture_document_v1.md

2. **Study wireframes**:
   - design-wireframes/section-1-pantry-search.png
   - design-wireframes/section-4-suggestions.png

3. **Start implementation**:
   - Begin with index.html structure
   - Add styles.css for layout
   - Implement app.js classes one by one
   - Add service worker last

4. **Test thoroughly**:
   - Test each feature as you build
   - Test offline functionality
   - Test on mobile devices
   - Test performance

## Questions?

Refer to:
- **PRD v1.0** for feature requirements
- **TAD v1.0** for technical details
- **NOTES.md** for decision rationale
- **v0_to_v1_migration_summary.md** for changes from v0.0

**Remember**: Keep it simple, keep it fast, keep it working offline! 🚀

