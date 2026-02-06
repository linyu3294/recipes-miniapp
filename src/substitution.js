const SUBSTITUTION_SYSTEM_PROMPT = `You are a recipe ingredient substitution assistant. Given a recipe (title and ingredients), one ingredient to substitute, and the user's preference prompt, suggest 3-5 alternative ingredients.

You must reply with exactly one JSON object and nothing else. No markdown, no code fences, no explanation outside the JSON.
Format: {"substitutions": ["ingredient1", "ingredient2", "ingredient3"], "explanation": "One short paragraph explaining why these fit the recipe and the user's prompt."}
- "substitutions": array of 3-5 strings, each a single ingredient name the user can pick.
- "explanation": one string, short paragraph.

Output only valid JSON so the UI can parse it.`;

function getMCPConfig() {
  return window.RECIPES_MCP_CONFIG || {};
}

function parseSubstitutionResponse(message) {
  const trimmed = (message || '').trim();
  if (!trimmed) return null;
  // Try each {...} from the end (reasoning models often put JSON last)
  let idx = trimmed.length;
  while (true) {
    const start = trimmed.lastIndexOf('{', idx - 1);
    if (start === -1) break;
    try {
      const parsed = JSON.parse(trimmed.slice(start));
      if (Array.isArray(parsed.substitutions) && parsed.substitutions.length > 0 && typeof parsed.explanation === 'string') {
        return parsed;
      }
    } catch (_) {}
    idx = start;
  }
  return null;
}

async function fetchSubstitutions(recipe, ingredient, userPrompt) {
  const config = getMCPConfig();
  if (!config.apiEndpoint || !config.apiKey) {
    throw new Error('MCP not configured. Set window.RECIPES_MCP_CONFIG = { apiEndpoint, apiKey }.');
  }
  const ingredientsPreview = (recipe.ingredients || []).slice(0, 15).join(', ');
  const message = ``
    + `Recipe: "${recipe.title || 'Untitled'}". `
    +`Ingredients: "${ingredientsPreview}". `
    +`Substitute this ingredient: "${ingredient}". `
    +`User preference: "${userPrompt}".`;
  const response = await window.PWAShell.mcp.callMCP(
    {
      message,
      system_prompt: SUBSTITUTION_SYSTEM_PROMPT,
      max_tokens: 800
    },
    config
  );
  const result = parseSubstitutionResponse(response.message);
  if (!result) throw new Error('Invalid substitution response from LLM');
  return result;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

class SubstitutionEditor {
  constructor() {
    this.container = null;
    this.recipe = null;
    this.isFork = false;
    this.ingredients = [];
    this.activeRowIndex = null;
    this.pendingSubstitutions = null;
    this.pendingExplanation = null;
    this.pendingSelectedIndex = 0;
  }

  open(recipe, isFork) {
    this.recipe = recipe;
    this.isFork = !!isFork;
    this.ingredients = [...(recipe.ingredients || [])];
    this.activeRowIndex = null;
    this.pendingSubstitutions = null;
    this.pendingExplanation = null;
    this.pendingSelectedIndex = 0;
    this.render();
  }

  render() {
    const parent = document.getElementById('recipe-suggestions');
    if (!parent) return;
    parent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'substitution-editor-view';
    wrap.innerHTML = `
      <div class="substitution-editor-header d-flex align-items-center justify-content-between gap-2">
        <button type="button" class="back-btn btn btn-link p-0" aria-label="Back"><i class="bi bi-arrow-left fs-4"></i></button>
        <h2 class="substitution-editor-title mb-0 flex-grow-1 text-center">${escapeHtml(this.recipe.title || 'Recipe')} — ${this.isFork ? 'Fork' : 'Edit'}</h2>
        <span style="width: 34px;" aria-hidden="true"></span>
      </div>
      <div class="substitution-ingredients-list"></div>
      <div class="substitution-prompt-area" style="display: none;">
        <label class="substitution-prompt-label">Enter your substitution prompt...</label>
        <div class="d-flex gap-2 mt-2">
          <input type="text" class="substitution-prompt-input form-control" placeholder="e.g. More fruity" />
          <button type="button" class="substitution-prompt-submit"><i class="bi bi-arrow-right"></i></button>
        </div>
      </div>
      <div class="substitution-result-area" style="display: none;">
        <p class="substitution-explanation"></p>
        <p class="substitution-choose-label mb-2">Choose one:</p>
        <div class="substitution-options-list d-flex flex-wrap gap-2 mb-3"></div>
        <div class="accept-reject-buttons d-flex gap-2">
          <button type="button" class="accept-substitution-btn">Accept</button>
          <button type="button" class="reject-substitution-btn">Reject</button>
        </div>
      </div>
      <div class="substitution-loading" style="display: none;">Loading suggestions...</div>
      <div class="substitution-save-area mt-4">
        <button type="button" class="save-recipe-btn w-100">Save Recipe</button>
      </div>
    `;
    this.container = wrap;
    parent.appendChild(wrap);

    const listEl = wrap.querySelector('.substitution-ingredients-list');
    this.ingredients.forEach((ing, i) => {
      const row = document.createElement('div');
      row.className = 'substitution-row';
      row.dataset.index = String(i);
      row.innerHTML = `
        <span class="substitution-row-ingredient">${escapeHtml(ing)}</span>
        <button type="button" class="substitution-row-prompt-btn" aria-label="Get substitutions"><i class="bi bi-pencil-square"></i></button>
      `;
      row.querySelector('.substitution-row-prompt-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeRowIndex = i;
        wrap.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        wrap.querySelector('.substitution-prompt-area').style.display = 'block';
        wrap.querySelector('.substitution-result-area').style.display = 'none';
        wrap.querySelector('.substitution-prompt-input').value = '';
        wrap.querySelector('.substitution-prompt-input').focus();
      });
      listEl.appendChild(row);
    });

    wrap.querySelector('.back-btn').addEventListener('click', () => this.close());
    wrap.querySelector('.substitution-prompt-submit').addEventListener('click', () => this.submitPrompt());
    wrap.querySelector('.substitution-prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitPrompt();
    });
    wrap.querySelector('.accept-substitution-btn').addEventListener('click', () => this.acceptSubstitution());
    wrap.querySelector('.reject-substitution-btn').addEventListener('click', () => this.rejectSubstitution());
    wrap.querySelector('.save-recipe-btn').addEventListener('click', () => this.saveRecipe());
  }

  close() {
    if (window.recipeEngine) {
      document.getElementById('recipe-suggestions').innerHTML = '';
      window.recipeEngine.loadSuggestions();
    }
  }

  async submitPrompt() {
    if (this.activeRowIndex == null) return;
    const input = this.container.querySelector('.substitution-prompt-input');
    const prompt = (input.value || '').trim();
    if (!prompt) return;
    const config = getMCPConfig();
    if (!config.apiEndpoint || !config.apiKey) {
      alert('MCP not configured. Set window.RECIPES_MCP_CONFIG = { apiEndpoint, apiKey }.');
      return;
    }
    this.container.querySelector('.substitution-prompt-area').style.display = 'none';
    this.container.querySelector('.substitution-result-area').style.display = 'none';
    this.container.querySelector('.substitution-loading').style.display = 'block';
    try {
      const result = await fetchSubstitutions(
        this.recipe,
        this.ingredients[this.activeRowIndex],
        prompt
      );
      this.pendingSubstitutions = result.substitutions;
      this.pendingExplanation = result.explanation;
      this.pendingSelectedIndex = 0;
      this.container.querySelector('.substitution-loading').style.display = 'none';
      this.container.querySelector('.substitution-explanation').textContent = result.explanation;
      const optionsList = this.container.querySelector('.substitution-options-list');
      optionsList.innerHTML = '';
      result.substitutions.forEach((ing, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'substitution-option-btn' + (i === 0 ? ' substitution-option-selected' : '');
        btn.textContent = ing;
        btn.dataset.index = String(i);
        btn.addEventListener('click', () => {
          this.pendingSelectedIndex = i;
          optionsList.querySelectorAll('.substitution-option-btn').forEach((b, j) => {
            b.classList.toggle('substitution-option-selected', j === i);
          });
        });
        optionsList.appendChild(btn);
      });
      this.container.querySelector('.substitution-result-area').style.display = 'block';
    } catch (err) {
      this.container.querySelector('.substitution-loading').style.display = 'none';
      this.container.querySelector('.substitution-prompt-area').style.display = 'block';
      alert(err.message || 'Failed to get substitutions');
    }
  }

  acceptSubstitution() {
    if (this.activeRowIndex == null || !this.pendingSubstitutions || this.pendingSubstitutions.length === 0) return;
    const idx = Math.min(this.pendingSelectedIndex, this.pendingSubstitutions.length - 1);
    const replacement = this.pendingSubstitutions[idx];
    this.ingredients[this.activeRowIndex] = replacement;
    this.pendingSubstitutions = null;
    this.pendingExplanation = null;
    this.pendingSelectedIndex = 0;
    this.container.querySelector('.substitution-result-area').style.display = 'none';
    const row = this.container.querySelector(`.substitution-row[data-index="${this.activeRowIndex}"]`);
    if (row) row.querySelector('.substitution-row-ingredient').textContent = replacement;
    this.activeRowIndex = null;
    this.container.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
    this.container.querySelector('.substitution-prompt-area').style.display = 'none';
  }

  rejectSubstitution() {
    this.pendingSubstitutions = null;
    this.pendingExplanation = null;
    this.pendingSelectedIndex = 0;
    this.activeRowIndex = null;
    this.container.querySelector('.substitution-result-area').style.display = 'none';
    this.container.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
    this.container.querySelector('.substitution-prompt-area').style.display = 'none';
  }

  async saveRecipe() {
    const title = this.recipe.title || 'Untitled';
    const instructions = this.recipe.instructions || '';
    const payload = {
      title,
      ingredients: [...this.ingredients],
      instructions,
      normalizedIngredients: this.ingredients.map(i => i.toLowerCase().trim())
    };
    try {
      if (!window.app) {
        throw new Error('App not loaded. Check that app.js is loaded before substitution.js.');
      }
      if (this.isFork) {
        payload.id = 'fork-' + Date.now();
        await window.app.saveForkedRecipe(payload);
        if (typeof window.app.updateIngredientsTableOnFork === 'function') {
          await window.app.updateIngredientsTableOnFork(payload);
        } else if (typeof window.app.recalculateIngredientTable === 'function') {
          await window.app.recalculateIngredientTable();
        }
      } else {
        payload.id = this.recipe.id;
        await window.app.updateRecipe(payload);
        if (typeof window.app.updateIngredientsTableOnEdit === 'function') {
          await window.app.updateIngredientsTableOnEdit(this.recipe, payload);
        } else if (typeof window.app.recalculateIngredientTable === 'function') {
          await window.app.recalculateIngredientTable();
        }
      }
      await window.app.autoLike(payload.id, title);
      this.close();
    } catch (err) {
      alert(err.message || 'Failed to save recipe');
    }
  }
}

const substitutionEditor = new SubstitutionEditor();
window.substitutionEditor = substitutionEditor;
