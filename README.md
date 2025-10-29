## Manually add and test data in the browser

1. Open your app by double clicking the html file to open in the browser
2. Open the browser console (F12)
3. Paste the code below to manually upload the recipes_parsed.json


```// Create a file input element
const input = document.createElement('input');
input.type = 'file';
input.accept = 'application/json';

input.onchange = async (e) => {
  const file = e.target.files[0];
  console.log('Reading file...');
  
  const text = await file.text();
  console.log('Parsing JSON...');
  
  const recipes = JSON.parse(text);
  console.log(`Parsed ${recipes.length} recipes`);
  
  console.log('Clearing old data...');
  await db.recipes.clear();
  
  console.log('Loading into IndexedDB...');
  await db.recipes.bulkAdd(recipes);
  
  const count = await db.recipes.count();
  console.log(`✓ Success! Loaded ${count} recipes into IndexedDB`);
};

// Trigger file picker
input.click();
```