class PantryManager {
    constructor() {
        this.pantry = [];
        this.selectedIngredientUIContainer = document.getElementById('selected-ingredients');
    }

    renderIngredient(item) {
        const ingredientDiv = document.createElement('div');
        ingredientDiv.className = 'ingredient';
        ingredientDiv.dataset.id = item.id; // Store database ID
        
        // Determine if ingredient name is long (should span 2 columns)
        const isLong = item.ingredient.length > 12;
        if (isLong) {
            ingredientDiv.classList.add('wide');
        }
        
        // Create remove button
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-btn';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering ingredient click
            this.deleteIngredient(item.id, ingredientDiv);
        });
    
        // Create ingredient name
        const nameElement = document.createElement('h3');
        nameElement.textContent = item.ingredient;
    
        // Assemble
        ingredientDiv.appendChild(removeBtn);
        ingredientDiv.appendChild(nameElement);
    
        // Add to container
        this.selectedIngredientUIContainer.appendChild(ingredientDiv);
    }

    // READ: Load all ingredients from database
    async loadIngredients() {
        try {
        const pantryItems = await db.pantry.toArray();
        
        // Clear existing DOM
        this.selectedIngredientUIContainer.innerHTML = '';
        
        // Render each ingredient
        pantryItems.forEach(item => {
            this.renderIngredient(item);
        });
        
            console.log(`✓ Loaded ${pantryItems.length} ingredients`);
        } catch (error) {
            console.error('Error loading ingredients:', error);
        }
    }


    // CREATE: Add ingredient to pantry
    async addIngredient(ingredientName) {
        try {
        // Add to database
        const id = await db.pantry.add({ ingredient: ingredientName });
        
        // Add to DOM
        this.renderIngredient({ id, ingredient: ingredientName });
        
        console.log(`✓ Added: ${ingredientName}`);
        return id;
        } catch (error) {
        console.error('Error adding ingredient:', error);
        }
    }

    // DELETE: Remove ingredient from pantry
    async deleteIngredient(id, element) {
        try {
            // Delete from database
            await db.pantry.delete(id);
        
            // Remove from DOM with animation
            element.style.transition = 'all 0.3s';
            element.style.opacity = '0';
            element.style.transform = 'scale(0.8)';
        
            setTimeout(() => {
                element.remove();
            }, 300);
        
            console.log(`✓ Deleted ingredient ID: ${id}`);
        } catch (error) {
            console.error('Error deleting ingredient:', error);
        }
    }
}
