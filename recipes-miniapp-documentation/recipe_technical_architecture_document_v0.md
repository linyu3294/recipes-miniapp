# Recipe Recommendation Mini App - Technical Architecture Document

**Version:** 1.0  
**Created:** 2025-01-14  
**Owner:** Technical Architect Agent  
**Status:** Draft  

## System Overview

The Recipe Recommendation Mini App employs a hybrid architecture combining local-first functionality with cloud-enhanced intelligence. The system prioritizes offline operation through comprehensive local data storage and algorithms, while leveraging DeepSeek LLM for advanced substitution intelligence and creative recipe suggestions.

## Architecture Principles

- **Offline-First**: All core functionality available without network connectivity
- **Progressive Enhancement**: Online features enhance but don't replace offline capabilities
- **Local Intelligence**: JavaScript-based algorithms for fast recipe matching
- **Hybrid AI**: Local rules + remote LLM for optimal user experience
- **Storage Efficiency**: Intelligent data management within browser storage limits

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Recipe Mini App (PWA)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   Local Engine      │    │    Remote Enhancement       │ │
│  │                     │    │                             │ │
│  │ ┌─────────────────┐ │    │ ┌─────────────────────────┐ │ │
│  │ │recommendation.js│ │    │ │   DeepSeek API          │ │ │
│  │ │- Fuzzy matching │ │────│ │ - Creative substitutions│ │ │
│  │ │- Similarity calc│ │    │ │ - Wildcard recipes      │ │ │
│  │ │- Score ranking  │ │    │ │ - Preference learning   │ │ │
│  │ └─────────────────┘ │    │ └─────────────────────────┘ │ │
│  │                     │    │                             │ │
│  │ ┌─────────────────┐ │    │ ┌─────────────────────────┐ │ │
│  │ │   IndexedDB     │ │    │ │   Response Cache        │ │ │
│  │ │- 124k recipes   │ │    │ │ - LLM responses         │ │ │
│  │ │- Substitutions  │ │    │ │ - User sessions         │ │ │
│  │ │- User data      │ │    │ │ - Offline fallbacks     │ │ │
│  │ └─────────────────┘ │    │ └─────────────────────────┘ │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Layer (React + TypeScript)

```typescript
// Core Application Structure
src/
├── components/
│   ├── IngredientInput/
│   │   ├── IngredientInput.tsx       // Smart ingredient input with autocomplete
│   │   ├── PantryManager.tsx         // Manage user's ingredient inventory
│   │   └── IngredientSuggester.tsx   // Suggest ingredient completions
│   │
│   ├── RecipeDiscovery/
│   │   ├── RecipeSearch.tsx          // Main search interface
│   │   ├── RecipeCard.tsx            // Individual recipe display
│   │   ├── RecipeList.tsx            // Recipe results grid
│   │   └── RecipeDetail.tsx          // Full recipe view with instructions
│   │
│   ├── SubstitutionEngine/
│   │   ├── SubstitutionSuggester.tsx // Local + LLM substitution UI
│   │   ├── SubstitutionCard.tsx      // Individual substitution display
│   │   └── ConfidenceIndicator.tsx   // Visual confidence scoring
│   │
│   └── Preferences/
│       ├── PreferenceManager.tsx     // User taste preferences
│       ├── CookingHistory.tsx        // Track attempted recipes
│       └── FavoritesList.tsx         // Saved recipes
│
├── services/
│   ├── RecommendationEngine.ts       // Core matching algorithms
│   ├── SubstitutionService.ts        // Local + remote substitutions
│   ├── DeepSeekIntegration.ts        // LLM API wrapper
│   ├── StorageService.ts             // IndexedDB management
│   └── OfflineService.ts             // Service worker coordination
│
├── algorithms/
│   ├── similarity.ts                 // String similarity algorithms
│   ├── scoring.ts                    // Recipe scoring logic
│   ├── fuzzyMatch.ts                 // Fuzzy ingredient matching
│   └── substitutionRules.ts          // Static substitution mappings
│
└── types/
    ├── Recipe.ts                     // Recipe data models
    ├── Ingredient.ts                 // Ingredient and substitution types
    └── UserPreferences.ts            // User data models
```

### Local Recommendation Engine

```typescript
// recommendation.js - Core Algorithm
class RecommendationEngine {
  private recipes: Recipe[];
  private substitutionMap: Map<string, string[]>;
  
  async findRecipes(userIngredients: string[]): Promise<RecipeMatch[]> {
    const normalizedInput = this.normalizeIngredients(userIngredients);
    
    return this.recipes
      .map(recipe => this.scoreRecipe(normalizedInput, recipe))
      .filter(match => match.score > 0.3) // Minimum viability threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Return top 50 matches
  }
  
  private scoreRecipe(userIngredients: string[], recipe: Recipe): RecipeMatch {
    const completeness = this.calculateCompleteness(userIngredients, recipe);
    const similarity = this.calculateSimilarity(userIngredients, recipe);
    const preference = this.getUserPreferenceScore(recipe);
    
    // Weighted scoring algorithm
    const score = (completeness * 0.4) + (similarity * 0.4) + (preference * 0.2);
    
    return {
      recipe,
      score,
      completeness,
      similarity,
      missingIngredients: this.findMissingIngredients(userIngredients, recipe),
      possibleSubstitutions: this.findLocalSubstitutions(userIngredients, recipe)
    };
  }
  
  private calculateCompleteness(userIngredients: string[], recipe: Recipe): number {
    const recipeIngredients = recipe.normalized_ingredients;
    const matchCount = recipeIngredients.filter(ing => 
      this.hasIngredientMatch(ing, userIngredients)
    ).length;
    
    return matchCount / recipeIngredients.length;
  }
  
  private calculateSimilarity(userIngredients: string[], recipe: Recipe): number {
    const recipeIngredients = recipe.normalized_ingredients;
    let totalSimilarity = 0;
    
    for (const recipeIng of recipeIngredients) {
      const bestMatch = this.findBestMatch(recipeIng, userIngredients);
      totalSimilarity += bestMatch.similarity;
    }
    
    return totalSimilarity / recipeIngredients.length;
  }
  
  private findBestMatch(target: string, candidates: string[]): MatchResult {
    let bestSimilarity = 0;
    let bestMatch = '';
    
    for (const candidate of candidates) {
      const similarity = this.calculateStringSimilarity(target, candidate);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = candidate;
      }
    }
    
    return { ingredient: bestMatch, similarity: bestSimilarity };
  }
  
  private calculateStringSimilarity(a: string, b: string): number {
    // Combination of algorithms for robust matching
    const levenshtein = this.levenshteinSimilarity(a, b);
    const jaccard = this.jaccardSimilarity(a, b);
    const substring = this.substringMatch(a, b);
    
    return Math.max(levenshtein, jaccard, substring);
  }
}
```

### Data Storage Architecture

#### IndexedDB Schema Design

```typescript
// Storage schema for offline-first operation
interface RecipeAppDB {
  // Core recipe database (~2GB)
  recipes: {
    id: string;
    title: string;
    ingredients: string[];
    normalized_ingredients: string[];
    instructions: string;
    picture_link?: string;
    difficulty?: number;
    prep_time?: number;
    cook_time?: number;
    servings?: number;
  }[];
  
  // User pantry and preferences
  userPantry: {
    id: string;
    ingredient: string;
    normalized_name: string;
    quantity?: number;
    unit?: string;
    added_date: Date;
    expiry_date?: Date;
  }[];
  
  // Cooking history and preferences
  cookingHistory: {
    id: string;
    recipe_id: string;
    attempted_date: Date;
    rating: number; // 1-5 stars
    notes?: string;
    substitutions_used?: SubstitutionUsed[];
  }[];
  
  // Local substitution mappings
  substitutions: {
    ingredient: string;
    substitutes: string[];
    confidence: number;
    context?: string; // "baking", "cooking", "any"
  }[];
  
  // Cached LLM responses
  llmCache: {
    query_hash: string;
    response: any;
    timestamp: Date;
    expiry_date: Date;
  }[];
}
```

#### Storage Management Strategy

```typescript
class StorageService {
  private db: IDBDatabase;
  
  async initializeStorage(): Promise<void> {
    // Progressive loading strategy
    await this.loadEssentialRecipes(); // ~500 popular recipes first
    this.scheduleFullDatabaseLoad();   // Load remaining recipes in background
  }
  
  async loadEssentialRecipes(): Promise<void> {
    // Load curated subset for immediate functionality
    const essentialRecipes = await this.fetchEssentialRecipeSet();
    await this.storeRecipes(essentialRecipes);
  }
  
  async scheduleFullDatabaseLoad(): Promise<void> {
    // Background loading of full 124k recipe dataset
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.loadFullDatabase());
    } else {
      setTimeout(() => this.loadFullDatabase(), 5000);
    }
  }
  
  async monitorStorageUsage(): Promise<StorageInfo> {
    const estimate = await navigator.storage.estimate();
    return {
      usedBytes: estimate.usage || 0,
      availableBytes: estimate.quota || 0,
      usagePercentage: ((estimate.usage || 0) / (estimate.quota || 1)) * 100
    };
  }
}
```

### DeepSeek LLM Integration

```typescript
class DeepSeekIntegration {
  private apiEndpoint: string;
  private cache: Map<string, CachedResponse>;
  
  async getCreativeSubstitutions(
    missingIngredients: string[],
    recipeContext: string
  ): Promise<SubstitutionSuggestion[]> {
    const query = this.buildSubstitutionQuery(missingIngredients, recipeContext);
    const cachedResponse = this.getCachedResponse(query);
    
    if (cachedResponse && !this.isExpired(cachedResponse)) {
      return cachedResponse.suggestions;
    }
    
    try {
      const response = await this.callDeepSeekAPI({
        message: query,
        max_tokens: 500,
        temperature: 0.3,
        system_prompt: "You are a culinary expert. Provide practical ingredient substitutions with confidence levels."
      });
      
      const suggestions = this.parseSubstitutionResponse(response);
      await this.cacheResponse(query, suggestions);
      
      return suggestions;
    } catch (error) {
      return this.getFallbackSubstitutions(missingIngredients);
    }
  }
  
  async generateWildcardRecipes(
    availableIngredients: string[],
    preferences: UserPreferences
  ): Promise<Recipe[]> {
    const prompt = this.buildWildcardPrompt(availableIngredients, preferences);
    
    const response = await this.callDeepSeekAPI({
      message: prompt,
      max_tokens: 1000,
      temperature: 0.7,
      system_prompt: "You are a creative chef. Generate unique recipes using available ingredients."
    });
    
    return this.parseRecipeResponse(response);
  }
  
  private buildSubstitutionQuery(ingredients: string[], context: string): string {
    return `Given the recipe context: "${context}", what are good substitutions for these missing ingredients: ${ingredients.join(', ')}? Provide alternatives with confidence levels (high/medium/low) and brief explanations.`;
  }
}
```

### Performance Architecture

#### Optimization Strategies

```typescript
// Performance monitoring and optimization
class PerformanceManager {
  async optimizeRecipeSearch(): Promise<void> {
    // Pre-compute ingredient indexes for faster lookup
    await this.buildIngredientIndex();
    
    // Implement lazy loading for recipe details
    this.setupLazyLoading();
    
    // Use Web Workers for heavy computations
    this.setupWebWorkerPool();
  }
  
  private async buildIngredientIndex(): Promise<void> {
    // Create inverted index: ingredient -> [recipe_ids]
    const index = new Map<string, string[]>();
    
    const recipes = await this.storageService.getAllRecipes();
    recipes.forEach(recipe => {
      recipe.normalized_ingredients.forEach(ingredient => {
        if (!index.has(ingredient)) {
          index.set(ingredient, []);
        }
        index.get(ingredient)!.push(recipe.id);
      });
    });
    
    await this.storageService.storeIngredientIndex(index);
  }
  
  private setupWebWorkerPool(): void {
    // Offload heavy similarity calculations to Web Workers
    this.workerPool = new WorkerPool({
      script: '/workers/similarity-worker.js',
      poolSize: navigator.hardwareConcurrency || 2
    });
  }
}
```

## Security Architecture

### Data Privacy & Security

```typescript
// Security measures for user data and API integration
class SecurityManager {
  async encryptSensitiveData(data: any): Promise<string> {
    // Encrypt user preferences and history
    const key = await this.generateUserKey();
    return await this.encrypt(JSON.stringify(data), key);
  }
  
  async secureAPICall(payload: any): Promise<any> {
    // Secure DeepSeek API integration
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getAPIKey()}`,
      'X-Request-ID': this.generateRequestId()
    };
    
    return await fetch(this.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  
  validateUserInput(ingredients: string[]): string[] {
    // Sanitize and validate user input
    return ingredients
      .map(ing => this.sanitizeString(ing))
      .filter(ing => this.isValidIngredient(ing))
      .slice(0, 50); // Limit input size
  }
}
```

## Deployment Architecture

### PWA Bundle Structure

```
recipe-app-v1.0.0/
├── manifest.json              # PWA configuration
├── index.html                # App shell
├── app.js                    # React application bundle
├── service-worker.js         # Offline functionality
├── workers/
│   └── summarization-worker.js  # Web Worker for summarization
└── assets/
    ├── icons/               # PWA icons
    └── styles/             # CSS assets
```

### Progressive Loading Strategy

```typescript
// Service Worker implementation for progressive data loading
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('recipe-app-v1.0.0').then(cache => {
      return cache.addAll([
        '/',
        '/app.js',
        '/data/essential-recipes.json',
        '/data/substitutions.json'
      ]);
    })
  );
});

// Background fetch for full recipe database
self.addEventListener('message', (event) => {
  if (event.data.action === 'LOAD_FULL_DATABASE') {
    event.waitUntil(loadFullRecipeDatabase());
  }
});

async function loadFullRecipeDatabase() {
  const response = await fetch('/data/full-recipes.json');
  const recipes = await response.json();
  
  // Store in IndexedDB in chunks to avoid blocking
  await storeRecipesInChunks(recipes, 1000);
}
```

## Monitoring & Analytics

### Performance Monitoring

```typescript
// Performance tracking and optimization
class AnalyticsService {
  trackSearchPerformance(searchTime: number, resultCount: number): void {
    // Monitor search algorithm performance
    this.logMetric('search_performance', {
      duration: searchTime,
      results: resultCount,
      timestamp: Date.now()
    });
  }
  
  trackLLMUsage(queryType: string, responseTime: number): void {
    // Monitor DeepSeek API usage and performance
    this.logMetric('llm_usage', {
      type: queryType,
      duration: responseTime,
      timestamp: Date.now()
    });
  }
  
  trackStorageUsage(): void {
    // Monitor IndexedDB storage consumption
    navigator.storage.estimate().then(estimate => {
      this.logMetric('storage_usage', {
        used: estimate.usage,
        quota: estimate.quota,
        percentage: (estimate.usage || 0) / (estimate.quota || 1) * 100
      });
    });
  }
}
```

## Risk Mitigation & Scalability

### Technical Risk Mitigation

1. **Storage Overflow**: Progressive loading with user choice and cleanup policies
2. **API Rate Limits**: Intelligent caching and local-first fallbacks  
3. **Performance Degradation**: Web Workers and lazy loading strategies
4. **Data Consistency**: Validation layers and error recovery mechanisms

### Scalability Considerations

1. **Recipe Database Growth**: Modular loading and efficient indexing
2. **User Base Expansion**: Optimized algorithms and caching strategies
3. **Feature Enhancement**: Plugin architecture for future capabilities
4. **Platform Evolution**: Abstracted interfaces for technology upgrades

## Conclusion

This hybrid architecture balances offline reliability with online intelligence, providing users with consistent functionality while enabling advanced AI-powered features. The design prioritizes user experience through fast local operations enhanced by thoughtful remote service integration.

**Next Steps:**
1. Prototype core recommendation engine
2. Implement IndexedDB storage layer
3. Integrate DeepSeek API with fallback strategies
4. Performance testing and optimization
5. User testing and feedback integration
