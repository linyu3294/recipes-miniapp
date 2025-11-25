# Recipe App

[Version 0.0.1](https://www.notion.so/Version-0-0-1-250aefa53eb7808a8e55fe1a8c78bd64?pvs=21)

## WireFrames

- [x]  **US1:** As a user, I can add ingredients to my pantry.
- [x]  **US2:** As a user, I can select a ingredients select one or many ingredients from my pantry list.
- [x]  **US3:** As a user, after I have selected a group of ingredients, I can view recipe suggestions based the ingredients I have added to the current panty.
- [x]  **US4:** As a user, I can like or dislike recipes to teach the app my taste preferences.
- [ ]  **US5:** As a user, I can view substitutions for ingredients that I don’t have.
- [ ]  **US6:** As a user, I can apply substitutions for ingredients that I don’t have.
- [ ]  **US7:** As a user, I can create new recipes using substitutions.
- [ ]  **US8:** As a user, I can view all recipes that I have created.
- [x]  **US9:** As a user, I can bookmark recipes.
- [x]  **US10:** As a user, I can view bookmarked recipes.
- [x]  US11: As a user, I can search for recipes by title or ingredient
- [x]  US12: As a user, I can add recipe to the bookmarked page from the search result
- [ ]  **US13:** As a user, I can view step-by-step cooking instructions for a recipe.
- [x]  **US14:** As a user, I can operate the app fully offline.

## User Stories - Implementation

- [ ]  **US1:** As a user, I can add ingredients to my pantry.
- [ ]  **US2:** As a user, I can select a ingredients select one or many ingredients from my pantry list.
- [ ]  **US3:** As a user, after I have selected a group of ingredients, I can view recipe suggestions based the ingredients I have added to the current panty.
- [ ]  **US4:** As a user, I can like or dislike recipes to teach the app my taste preferences.
- [ ]  **US5:** As a user, I can view substitutions for ingredients that I don’t have.
- [ ]  **US6:** As a user, I can apply substitutions for ingredients that I don’t have.
- [ ]  **US7:** As a user, I can create new recipes using substitutions.
- [ ]  **US8:** As a user, I can view all recipes that I have created.
- [ ]  **US9:** As a user, I can bookmark recipes.
- [ ]  **US10:** As a user, I can view bookmarked recipes.
- [ ]  US11: As a user, I can search for recipes by title or ingredient
- [ ]  US12: As a user, I can add recipe to the bookmarked page from the search result
- [ ]  **US13:** As a user, I can view step-by-step cooking instructions for a recipe.
- [ ]  **US14:** As a user, I can operate the app fully offline.

## Architecture

The recipes mini-app is built on and distributed by the [www.miniprograms.app](http://www.miniprograms.app) platform.  

See documentation here: [miniprograms.app](https://www.notion.so/miniprograms-app-216aefa53eb780ae88c8e7e97f7536ba?pvs=21) 

About dexie.js

[https://cleverzone.medium.com/simplify-indexeddb-using-dexie-js-dexie-js-implementation-in-reactjs-48429c66f8ef](https://cleverzone.medium.com/simplify-indexeddb-using-dexie-js-dexie-js-implementation-in-reactjs-48429c66f8ef)

![PWA recipes-miniapp architecture.jpeg](Recipe%20App/PWA_recipes-miniapp_architecture.jpeg)

## Design

[https://www.figma.com/design/09X7oeC3SxqCnbE0HxpeNp/recipes-miniapp?node-id=1-2&p=f&t=tStEAo39iUq2JWwX-0](https://www.figma.com/design/09X7oeC3SxqCnbE0HxpeNp/recipes-miniapp?node-id=1-2&p=f&t=tStEAo39iUq2JWwX-0)

## **App Logic**

The `app logic is implemented using HTML, JavaScript, and CSS`. The JavaScript serves as the core business logic, primarily interacting with the local IndexedDB to fetch and manipulate data. This local-first architecture covers approximately 90% of use cases, ensuring robust offline functionality. While this Recipes app, does not have a `onnx.js model`, it is supported to provide offline narrow AI usecases.

Crucially, the `PWA Shell Container` handles the **initialization and population of this database**. Before the mini-app launches, the Shell reads the app's `manifest.json`, creates the required database schema, and seeds it with initial data assets. This allows the app logic to focus purely on runtime operations like querying and user state management, without the overhead of heavy data setup.

For scenarios requiring enhanced intelligence (e.g., when online), the app delegates requests to the PWA Shell. The Shell acts as a middleware layer, responsible for:

1. **Proxying traffic** between the app and remote servers.
2. **Managing the lifecycle** of app assets and the local database (setup and teardown).
3. **Orchestrating communication** between the app and LLMs, managing user context and prompt history.

For specific information about the PWA shell Architecture, please reference page here

[PWA Shell Container](https://www.notion.so/PWA-Shell-Container-2a8aefa53eb780129f29c151eaae15e7?pvs=21)

## Data

Using Dexie.js (a wrapper around the browser’s built-in IndexDB), the `PWA shell container` will preload the following database schemas into the indexDB  

```jsx
recipes: "id, title, *normalizedIngredients, *ingredients",
staticSubstitutions: '++id, ingredient',
pantry: '++id, ingredient',
preferences: '++id, preference',
contextHistory: '++id, date',
likeDislike: 'id, title'
```