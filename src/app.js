// Initialize Dexie database
const db = new Dexie('RecipeDatabase');

// Define schema - increment version number when schema changes
db.version(2).stores({
  recipes: "id, title, *normalizedIngredients, *ingredients",
  staticSubstitutions: '++id, ingredient',
  pantry: '++id, ingredient',
  preferences: '++id, preference',
  contextHistory: '++id, date',
  likeDislike: 'id, title'
});


class RecipesMiniApp {
  constructor() {
    this.ingredients = [];
    this.recipes = [];
    this.staticSubstitutions = [];
    this.pantry = [];
    this.preferences = [];
    this.contextHistory = [];
    this.likeDislike = [];
  }
  
  // Load recipes into IndexedDB (one-time operation)
  async loadRecipesFromJSON(recipesArray) {
    console.log(`Loading ${recipesArray.length} recipes...`);
    
    // Clear existing recipes
    await db.recipes.clear();
    
    // Bulk add recipes (Dexie handles batching automatically)
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


  async getRecipeById(id) {
    return await db.recipes.get(id);
  }
  
  async getRecipeCount() {
    return await db.recipes.count();
  }
}

// Create app instance
const app = new RecipesMiniApp();
