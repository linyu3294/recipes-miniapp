# Recipe Recommendation Mini App - Technical Architecture Document v1.0

**Version:** 1.0  
**Created:** 2025-10-23  
**Updated From:** v0.0 (2025-01-14)  
**Owner:** Technical Architect Agent  
**Status:** Active  

## System Overview

The Recipe Recommendation Mini App v1.0 employs a simplified offline-first architecture focused on core functionality. The system uses vanilla JavaScript with Dexie.js for IndexedDB management, eliminating complex frameworks and reducing bundle size while maintaining excellent user experience.

## Architecture Principles

- **Simplicity First**: Minimal dependencies, vanilla JavaScript where possible
- **Offline-First**: All core functionality available without network connectivity
- **Progressive Enhancement**: Optional online features (DeepSeek summarization) enhance but don't replace core features
- **Storage Efficiency**: Smart data management within browser storage limits
- **Performance**: Fast load times and responsive interactions

## Changes from v0.0

### Architectural Simplifications
1. **Removed React/TypeScript**: Using vanilla JavaScript for reduced complexity
2. **Removed Web Workers**: Simplified matching algorithm runs on main thread
3. **Removed Complex Service Architecture**: Single `app.js` file with modular classes
4. **Simplified DeepSeek Integration**: Optional context summarization only (no substitutions)
5. **Removed Multi-tier Substitution System**: Static substitutions only (future feature)
6. **Simplified Component Structure**: Two main views instead of complex component hierarchy

### Technology Stack Changes
- **Before**: React + TypeScript + Complex service layer
- **After**: Vanilla JavaScript + Dexie.js + Simple class-based architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client (Browser)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PWA Shell (index.html)                     │   │
│  │  - Service Worker (sw.js)                               │   │
│  │  - App Shell Caching                                    │   │
│  │  - Offline Fallback                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Application Layer (app.js)                    │   │
│  │                                                          │   │
│  │  ┌──────────────────┐    ┌──────────────────┐          │   │
│  │  │  RecipesMiniApp  │    │   UIController   │          │   │
│  │  │  - Main App      │───▶│   - Pantry View  │          │   │
│  │  │  - Coordination  │    │   - Suggestions  │          │   │
│  │  └──────────────────┘    └──────────────────┘          │   │
│  │           │                                              │   │
│  │  ┌────────┴─────────────────────────────────┐          │   │
│  │  │                                            │          │   │
│  │  ▼                  ▼                  ▼      ▼          │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐     │   │
│  │  │  Pantry    │  │   Recipe     │  │ Preferences │     │   │
│  │  │  Manager   │  │   Matcher    │  │  Manager    │     │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Data Layer (Dexie.js + IndexedDB)               │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   recipes    │  │  userPantry  │  │ preferences  │  │   │
│  │  │  (124k rows) │  │              │  │              │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │    Optional: DeepSeek Integration (Future)              │   │
│  │    - Context Summarization Only                         │   │
│  │    - Cached Responses                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### File Structure

```
src/
├── index.html              # App shell and UI structure
├── styles.css              # All application styles
├── app.js                  # Main application logic
├── sw.js                   # Service worker for offline support
└── manifest.json           # PWA manifest

data/ (loaded at runtime)
├── recipes_db_clean.json   # 124k recipes (~2GB)
└── static_substitutions.json # Common substitutions (future)
```

### Application Layer (app.js)

```javascript
// Main Application Class
class RecipesMiniApp {
  constructor() {
    this.db = null;              // Dexie database instance
    this.pantryManager = null;   // Manages pantry ingredients
    this.recipeMatcher = null;   // Matches recipes to ingredients
    this.preferencesManager = null; // Manages user preferences
    this.uiController = null;    // Controls UI state and rendering
    
    this.currentView = 'pantry'; // 'pantry' or 'suggestions'
    this.selectedIngredients = []; // Currently selected ingredients
  }
  
  async init() {
    // Initialize database
    await this.initDatabase();
    
    // Initialize managers
    this.pantryManager = new PantryManager(this.db);
    this.recipeMatcher = new RecipeMatcher(this.db);
    this.preferencesManager = new PreferencesManager(this.db);
    this.uiController = new UIController(this);
    
    // Load initial data
    await this.loadInitialData();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Render initial view
    this.uiController.render();
  }
  
  async initDatabase() {
    // Initialize Dexie.js database
    this.db = new Dexie('RecipesDB');
    
    this.db.version(1).stores({
      recipes: 'id, title, *ingredients, *normalized_ingredients',
      userPantry: '++id, ingredient, normalized_name, added_date',
      preferences: 'recipe_id, rating, timestamp',
      ingredientIndex: 'ingredient, *recipe_ids' // For fast lookup
    });
    
    await this.db.open();
  }
  
  async loadInitialData() {
    // Check if recipes are already loaded
    const recipeCount = await this.db.recipes.count();
    
    if (recipeCount === 0) {
      // Load recipes progressively
      await this.loadRecipesProgressively();
    }
    
    // Load user pantry
    await this.pantryManager.loadPantry();
  }
  
  async loadRecipesProgressively() {
    // Fetch recipe data from CDN
    const response = await fetch('/data/recipes_db_clean.json');
    const recipes = await response.json();
    
    // Load in chunks to avoid blocking UI
    const chunkSize = 1000;
    for (let i = 0; i < recipes.length; i += chunkSize) {
      const chunk = recipes.slice(i, i + chunkSize);
      await this.db.recipes.bulkAdd(chunk);
      
      // Update progress indicator
      const progress = Math.round((i / recipes.length) * 100);
      this.uiController.updateLoadingProgress(progress);
    }
  }
}

// Pantry Management
class PantryManager {
  constructor(db) {
    this.db = db;
    this.pantry = []; // Current pantry ingredients
    this.allIngredients = []; // All available ingredients for autocomplete
  }
  
  async loadPantry() {
    // Load user's pantry from IndexedDB
    this.pantry = await this.db.userPantry.toArray();
  }
  
  async addIngredient(ingredient) {
    // Add ingredient to pantry
    const normalized = this.normalizeIngredient(ingredient);
    
    const id = await this.db.userPantry.add({
      ingredient: ingredient,
      normalized_name: normalized,
      added_date: new Date()
    });
    
    this.pantry.push({
      id,
      ingredient,
      normalized_name: normalized,
      added_date: new Date()
    });
    
    return id;
  }
  
  async removeIngredient(id) {
    // Remove ingredient from pantry
    await this.db.userPantry.delete(id);
    this.pantry = this.pantry.filter(item => item.id !== id);
  }
  
  async searchIngredients(query) {
    // Search for ingredients in recipe database
    // Returns autocomplete suggestions
    if (!query || query.length < 2) return [];
    
    const normalized = this.normalizeIngredient(query);
    
    // Get unique ingredients from recipe database
    const ingredients = await this.db.recipes
      .where('normalized_ingredients')
      .startsWithIgnoreCase(normalized)
      .limit(10)
      .toArray();
    
    // Extract unique ingredient names
    const uniqueIngredients = new Set();
    ingredients.forEach(recipe => {
      recipe.normalized_ingredients.forEach(ing => {
        if (ing.toLowerCase().includes(normalized.toLowerCase())) {
          uniqueIngredients.add(ing);
        }
      });
    });
    
    return Array.from(uniqueIngredients).slice(0, 10);
  }
  
  normalizeIngredient(ingredient) {
    // Normalize ingredient name for matching
    return ingredient
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }
}

// Recipe Matching Engine
class RecipeMatcher {
  constructor(db) {
    this.db = db;
  }
  
  async findRecipes(selectedIngredients, preferences = {}) {
    // Find recipes matching selected ingredients
    if (selectedIngredients.length === 0) return [];
    
    const normalizedInput = selectedIngredients.map(ing => 
      this.normalizeIngredient(ing)
    );
    
    // Get all recipes (or use ingredient index for optimization)
    const allRecipes = await this.db.recipes.toArray();
    
    // Score and filter recipes
    const scoredRecipes = allRecipes
      .map(recipe => this.scoreRecipe(normalizedInput, recipe, preferences))
      .filter(match => match.score > 0.2) // Minimum 20% match
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Return top 50 matches
    
    return scoredRecipes;
  }
  
  scoreRecipe(userIngredients, recipe, preferences) {
    // Calculate recipe match score
    const recipeIngredients = recipe.normalized_ingredients || [];
    
    // Calculate completeness (% of recipe ingredients user has)
    let matchCount = 0;
    const missingIngredients = [];
    
    recipeIngredients.forEach(recipeIng => {
      const hasIngredient = userIngredients.some(userIng => 
        this.ingredientsMatch(userIng, recipeIng)
      );
      
      if (hasIngredient) {
        matchCount++;
      } else {
        missingIngredients.push(recipeIng);
      }
    });
    
    const completeness = recipeIngredients.length > 0 
      ? matchCount / recipeIngredients.length 
      : 0;
    
    // Calculate similarity (how well ingredients match)
    let totalSimilarity = 0;
    recipeIngredients.forEach(recipeIng => {
      const bestMatch = this.findBestMatch(recipeIng, userIngredients);
      totalSimilarity += bestMatch;
    });
    
    const similarity = recipeIngredients.length > 0
      ? totalSimilarity / recipeIngredients.length
      : 0;
    
    // Get user preference score
    const preferenceScore = this.getPreferenceScore(recipe.id, preferences);
    
    // Weighted scoring
    const score = (completeness * 0.5) + (similarity * 0.3) + (preferenceScore * 0.2);
    
    return {
      recipe,
      score,
      completeness,
      similarity,
      matchCount,
      totalIngredients: recipeIngredients.length,
      missingIngredients
    };
  }
  
  ingredientsMatch(userIng, recipeIng) {
    // Check if ingredients match using fuzzy matching
    const user = userIng.toLowerCase();
    const recipe = recipeIng.toLowerCase();
    
    // Exact match
    if (user === recipe) return true;
    
    // Substring match
    if (user.includes(recipe) || recipe.includes(user)) return true;
    
    // Word overlap
    const userWords = user.split(' ');
    const recipeWords = recipe.split(' ');
    const overlap = userWords.filter(word => recipeWords.includes(word));
    
    return overlap.length > 0;
  }
  
  findBestMatch(target, candidates) {
    // Find best similarity score between target and candidates
    let bestScore = 0;
    
    candidates.forEach(candidate => {
      const score = this.calculateSimilarity(target, candidate);
      if (score > bestScore) {
        bestScore = score;
      }
    });
    
    return bestScore;
  }
  
  calculateSimilarity(a, b) {
    // Simple similarity calculation
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
  
  getPreferenceScore(recipeId, preferences) {
    // Get user preference score for recipe
    const pref = preferences[recipeId];
    if (!pref) return 0.5; // Neutral
    
    if (pref.rating === 'like') return 1.0;
    if (pref.rating === 'dislike') return 0.0;
    if (pref.rating === 'hide') return -1.0; // Filter out
    
    return 0.5;
  }
  
  normalizeIngredient(ingredient) {
    return ingredient
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }
}

// Preferences Management
class PreferencesManager {
  constructor(db) {
    this.db = db;
    this.preferences = {}; // recipe_id -> {rating, timestamp}
  }
  
  async loadPreferences() {
    // Load user preferences from IndexedDB
    const prefs = await this.db.preferences.toArray();
    
    prefs.forEach(pref => {
      this.preferences[pref.recipe_id] = {
        rating: pref.rating,
        timestamp: pref.timestamp
      };
    });
  }
  
  async setPreference(recipeId, rating) {
    // Set preference for recipe: 'like', 'dislike', 'hide'
    await this.db.preferences.put({
      recipe_id: recipeId,
      rating: rating,
      timestamp: new Date()
    });
    
    this.preferences[recipeId] = {
      rating,
      timestamp: new Date()
    };
  }
  
  getPreference(recipeId) {
    return this.preferences[recipeId] || null;
  }
}

// UI Controller
class UIController {
  constructor(app) {
    this.app = app;
    this.currentView = 'pantry';
    this.expandedRecipeId = null;
  }
  
  render() {
    // Render current view
    if (this.currentView === 'pantry') {
      this.renderPantryView();
    } else {
      this.renderSuggestionsView();
    }
  }
  
  renderPantryView() {
    // Render pantry management UI
    // - Ingredient search dropdown
    // - Autocomplete suggestions
    // - Selected ingredients grid
    // - Select All button
  }
  
  renderSuggestionsView() {
    // Render recipe suggestions UI
    // - Recipe cards with details
    // - Like/dislike/hide buttons
    // - Expand/collapse functionality
  }
  
  switchView(view) {
    this.currentView = view;
    this.render();
  }
  
  updateLoadingProgress(progress) {
    // Update loading indicator
    console.log(`Loading recipes: ${progress}%`);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new RecipesMiniApp();
  app.init();
});
```

## Data Storage Architecture

### IndexedDB Schema (Dexie.js)

```javascript
// Database Schema
const db = new Dexie('RecipesDB');

db.version(1).stores({
  // Recipe database (~124k recipes)
  recipes: 'id, title, *ingredients, *normalized_ingredients',
  
  // User pantry
  userPantry: '++id, ingredient, normalized_name, added_date',
  
  // User preferences
  preferences: 'recipe_id, rating, timestamp',
  
  // Ingredient index for fast lookup (optional optimization)
  ingredientIndex: 'ingredient, *recipe_ids'
});
```

### Data Models

```typescript
// Recipe Model
interface Recipe {
  id: string;
  title: string;
  ingredients: string[];           // Original ingredient strings
  normalized_ingredients: string[]; // Normalized for matching
  instructions: string;
  picture_link?: string;
  prep_time?: number;
  cook_time?: number;
  servings?: number;
}

// Pantry Item Model
interface PantryItem {
  id: number;                // Auto-increment
  ingredient: string;        // Display name
  normalized_name: string;   // Normalized for matching
  added_date: Date;
}

// Preference Model
interface Preference {
  recipe_id: string;
  rating: 'like' | 'dislike' | 'hide';
  timestamp: Date;
}

// Recipe Match Result
interface RecipeMatch {
  recipe: Recipe;
  score: number;              // Overall match score (0-1)
  completeness: number;       // % of recipe ingredients user has
  similarity: number;         // How well ingredients match
  matchCount: number;         // Number of matching ingredients
  totalIngredients: number;   // Total ingredients in recipe
  missingIngredients: string[];
}
```

## Service Worker Architecture

### Offline Strategy (sw.js)

```javascript
const CACHE_NAME = 'recipes-miniapp-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});
```

## Performance Optimization

### Loading Strategy

1. **Initial Load**:
   - Load app shell (HTML, CSS, JS) from cache
   - Display UI immediately
   - Load recipe database in background

2. **Progressive Recipe Loading**:
   - Load recipes in chunks of 1000
   - Update progress indicator
   - Don't block UI during loading

3. **Lazy Rendering**:
   - Render only visible recipe cards
   - Use virtual scrolling for long lists
   - Expand/collapse on demand

### Optimization Techniques

```javascript
// Debounced search for autocomplete
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttled scroll for virtual scrolling
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
```

## Deployment Architecture

### PWA Bundle Structure

```
recipes-miniapp-v1.0/
├── index.html              # App shell
├── styles.css              # All styles
├── app.js                  # Application logic (~15KB minified)
├── sw.js                   # Service worker (~2KB)
├── manifest.json           # PWA manifest
├── icons/                  # PWA icons
│   ├── icon-192.png
│   └── icon-512.png
└── data/
    └── recipes_db_clean.json  # Loaded at runtime (~2GB)
```

### CDN Distribution

- **App Assets**: Served from CDN (miniprograms.app)
- **Recipe Data**: Served from CDN, cached in IndexedDB
- **Service Worker**: Handles offline caching

## Future Enhancements (Optional)

### DeepSeek Integration (v1.2)

```javascript
// Optional: Context summarization for long prompts
class DeepSeekService {
  constructor() {
    this.apiEndpoint = 'https://api.deepseek.com/v1';
    this.cache = new Map();
  }
  
  async summarizeRecipeContext(recipe) {
    // Summarize long recipe instructions for display
    const cacheKey = `summary_${recipe.id}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          message: `Summarize this recipe in 2-3 sentences: ${recipe.instructions}`,
          max_tokens: 100
        })
      });
      
      const summary = await response.json();
      this.cache.set(cacheKey, summary);
      
      return summary;
    } catch (error) {
      console.error('DeepSeek API error:', error);
      return recipe.instructions.substring(0, 200) + '...';
    }
  }
}
```

## Security & Privacy

### Data Privacy
- All user data stored locally in IndexedDB
- No personal data sent to external services
- Optional DeepSeek integration only sends recipe text (no user data)

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self'; 
               style-src 'self' 'unsafe-inline'; 
               img-src 'self' data: https:; 
               connect-src 'self' https://api.deepseek.com;">
```

## Monitoring & Analytics

### Performance Metrics

```javascript
// Track key performance indicators
class AnalyticsService {
  trackSearchPerformance(duration, resultCount) {
    console.log(`Search completed in ${duration}ms, ${resultCount} results`);
  }
  
  trackUserAction(action, metadata) {
    console.log(`User action: ${action}`, metadata);
  }
  
  trackStorageUsage() {
    navigator.storage.estimate().then(estimate => {
      console.log(`Storage: ${estimate.usage} / ${estimate.quota} bytes`);
    });
  }
}
```

## Conclusion

This simplified v1.0 architecture focuses on delivering core functionality with minimal complexity. By using vanilla JavaScript and Dexie.js, we reduce bundle size and improve maintainability while still providing an excellent offline-first user experience.

**Key Benefits:**
- **Simple**: Single JavaScript file, easy to understand and maintain
- **Fast**: Minimal dependencies, optimized loading
- **Reliable**: Offline-first with service worker caching
- **Scalable**: Can handle 124k recipes efficiently

**Next Steps:**
1. Implement core classes in app.js
2. Build UI components in index.html
3. Style components in styles.css
4. Implement service worker
5. Test offline functionality
6. Performance optimization
7. User testing and feedback

