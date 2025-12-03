// Initialize Dexie database
// ===========================================
const db = new Dexie('RecipeDatabase');

// Define schema - increment version number when schema changes
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

}

// ===========================================
// Tab switching functionality
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  const navButtons = document.querySelectorAll('.nav-btn');

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Get the target tab from data attribute
      const targetTab = button.getAttribute('data-tab');

      // Hide all tabs
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });

      // Show target tab
      document.getElementById(targetTab).classList.add('active');

      // Update button states
      navButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('inactive');
      });
      button.classList.remove('inactive');
      button.classList.add('active');
    });
  });
});

// Create app instance
const app = new RecipesMiniApp();
app.pantryManager.loadIngredients();

// Expose db and app to global scope for console testing
window.db = db;
window.app = app;
