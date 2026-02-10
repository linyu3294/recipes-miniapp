const SUBSTITUTION_SYSTEM_PROMPT = `You are a recipe ingredient substitution assistant. Given a recipe (title and ingredients), one ingredient to substitute, and the user's preference prompt, suggest 3-5 alternative ingredients.

You must reply with exactly one JSON object and nothing else. No markdown, no code fences, no explanation outside the JSON.

Format:
{"substitutions": [{"raw": "1 cup almond milk", "normalized": "almond milk"}, {"raw": "2 tbsp coconut cream", "normalized": "coconut cream"}], "explanation": "One short paragraph explaining why these fit."}

Rules:
- "substitutions": array of 3-5 objects. Each object MUST have exactly two string fields:
  - "raw": the full ingredient with quantity as it would appear in a recipe (e.g. "2 tbsp olive oil", "1 cup skim milk"). Match the quantity/unit style of the original ingredient being replaced.
  - "normalized": just the ingredient name without any quantity or unit (e.g. "olive oil", "skim milk").
- "explanation": one string, a short paragraph.

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
        // Validate and normalize: each substitution must be {raw, normalized}
        const normalized = parsed.substitutions.map(s => {
          if (typeof s === 'object' && s !== null && typeof s.raw === 'string' && typeof s.normalized === 'string') {
            return { raw: s.raw, normalized: s.normalized };
          }
          // Fallback: if LLM returned a plain string, use it for both fields
          if (typeof s === 'string') {
            return { raw: s, normalized: s.toLowerCase().trim() };
          }
          return null;
        }).filter(Boolean);
        if (normalized.length > 0) {
          return { substitutions: normalized, explanation: parsed.explanation };
        }
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
    this._wifiCleanup = null;
  }

  open(recipe, isFork) {
    this.recipe = recipe;
    this.isFork = !!isFork;
    this.title = recipe.title || 'Untitled';
    this.ingredients = [...(recipe.ingredients || [])];
    this.normalizedIngredients = [...(recipe.normalizedIngredients || (recipe.ingredients || []).map(i => (i || '').toLowerCase().trim()))];
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
    const isConnected = navigator.onLine;
    wrap.innerHTML = `
      <div class="substitution-editor-header d-flex align-items-center justify-content-between gap-2">
        <button type="button" class="back-btn btn btn-link p-0" aria-label="Back"><i class="bi bi-arrow-left fs-4"></i></button>
        <div class="substitution-title-area flex-grow-1 text-center">
          <span class="substitution-editor-title-text" role="button">${escapeHtml(this.title)}</span>
          <button type="button" class="title-edit-btn btn btn-link p-0" aria-label="Edit title"><i class="bi bi-pencil fs-6"></i></button>
          <span class="substitution-editor-title-suffix"> — ${this.isFork ? 'Fork' : 'Edit'}</span>
        </div>
        <div class="wifi-status-group">
          <i class="bi ${isConnected ? 'bi-wifi' : 'bi-wifi-off'} wifi-icon${isConnected ? '' : ' offline'}"></i>
          <button type="button" class="wifi-tooltip-btn btn btn-link p-0" style="display: ${isConnected ? 'none' : 'inline-flex'}" aria-label="Connection info">
            <i class="bi bi-info-circle"></i>
          </button>
        </div>
      </div>
      <div class="substitution-ingredients-list"></div>
      <div class="substitution-save-area mt-4">
        <button type="button" class="save-recipe-btn w-100">Save Recipe</button>
      </div>
    `;
    this.container = wrap;
    parent.appendChild(wrap);

    // Create the movable inline panels (prompt, result, loading)
    // These get inserted after the active row dynamically
    this._promptEl = document.createElement('div');
    this._promptEl.className = 'substitution-prompt-area';
    this._promptEl.style.display = 'none';
    this._promptEl.innerHTML = `
      <label class="substitution-prompt-label">Enter your substitution prompt...</label>
      <div class="d-flex gap-2 mt-2">
        <input type="text" class="substitution-prompt-input form-control" placeholder="e.g. More fruity" />
        <button type="button" class="substitution-prompt-submit"><i class="bi bi-arrow-right"></i></button>
      </div>
    `;

    this._resultEl = document.createElement('div');
    this._resultEl.className = 'substitution-result-area';
    this._resultEl.style.display = 'none';
    this._resultEl.innerHTML = `
      <p class="substitution-explanation"></p>
      <p class="substitution-choose-label mb-2">Choose one:</p>
      <div class="substitution-options-list d-flex flex-wrap gap-2 mb-3"></div>
      <div class="accept-reject-buttons d-flex gap-2">
        <button type="button" class="accept-substitution-btn">Accept</button>
        <button type="button" class="reject-substitution-btn">Reject</button>
      </div>
    `;

    this._loadingEl = document.createElement('div');
    this._loadingEl.className = 'substitution-loading';
    this._loadingEl.style.display = 'none';
    this._loadingEl.textContent = 'Loading suggestions...';

    // Wire up event listeners on the movable panels
    this._promptEl.querySelector('.substitution-prompt-submit').addEventListener('click', () => this.submitPrompt());
    this._promptEl.querySelector('.substitution-prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitPrompt();
    });
    this._resultEl.querySelector('.accept-substitution-btn').addEventListener('click', () => this.acceptSubstitution());
    this._resultEl.querySelector('.reject-substitution-btn').addEventListener('click', () => this.rejectSubstitution());

    // Connectivity status: dynamic updates via online/offline events
    const updateConnectivity = () => {
      const on = navigator.onLine;
      const icon = wrap.querySelector('.wifi-icon');
      const tooltipBtn = wrap.querySelector('.wifi-tooltip-btn');
      if (icon) {
        icon.className = `bi ${on ? 'bi-wifi' : 'bi-wifi-off'} wifi-icon${on ? '' : ' offline'}`;
      }
      if (tooltipBtn) {
        tooltipBtn.style.display = on ? 'none' : 'inline-flex';
      }
    };
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    this._wifiCleanup = () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };

    // WiFi tooltip popover toggle
    const tooltipBtn = wrap.querySelector('.wifi-tooltip-btn');
    if (tooltipBtn) {
      tooltipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let popover = wrap.querySelector('.wifi-tooltip-popover');
        if (popover) {
          popover.remove();
          return;
        }
        popover = document.createElement('div');
        popover.className = 'wifi-tooltip-popover';
        popover.textContent = 'No internet connection. LLM-powered substitution is unavailable. You can still manually edit ingredients using the pencil icon.';
        tooltipBtn.style.position = 'relative';
        tooltipBtn.appendChild(popover);
        setTimeout(() => { if (popover.parentNode) popover.remove(); }, 4000);
      });
    }

    // Title edit handler
    const titleText = wrap.querySelector('.substitution-editor-title-text');
    const titleEditBtn = wrap.querySelector('.title-edit-btn');
    const startTitleEdit = () => {
      const titleArea = wrap.querySelector('.substitution-title-area');
      if (!titleArea || titleArea.querySelector('.title-edit-input')) return;
      const currentTitle = this.title;
      const suffix = titleArea.querySelector('.substitution-editor-title-suffix');
      const editBtn = titleArea.querySelector('.title-edit-btn');
      titleText.style.display = 'none';
      if (editBtn) editBtn.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'title-edit-input form-control form-control-sm';
      input.value = currentTitle;
      titleArea.insertBefore(input, suffix);
      input.focus();
      input.select();
      const finishEdit = () => {
        const newTitle = input.value.trim();
        if (newTitle) this.title = newTitle;
        titleText.textContent = this.title;
        titleText.style.display = '';
        if (editBtn) editBtn.style.display = '';
        input.remove();
      };
      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    };
    if (titleText) titleText.addEventListener('click', startTitleEdit);
    if (titleEditBtn) titleEditBtn.addEventListener('click', startTitleEdit);

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
        const connected = navigator.onLine;
        if (connected) {
          // Online: open LLM substitution prompt inline below this row
          this.activeRowIndex = i;
          this._setSaveDisabled(true);
          wrap.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          // Move panels inline after this row
          this._hideInlinePanels();
          row.after(this._promptEl);
          this._promptEl.style.display = 'block';
          this._promptEl.querySelector('.substitution-prompt-input').value = '';
          this._promptEl.querySelector('.substitution-prompt-input').focus();
        } else {
          // Offline: open inline manual edit
          this.openManualEdit(i);
        }
      });
      listEl.appendChild(row);
    });

    wrap.querySelector('.back-btn').addEventListener('click', () => this.close());
    wrap.querySelector('.save-recipe-btn').addEventListener('click', () => this.saveRecipe());
  }

  /** Hide and detach all inline panels from the DOM */
  _hideInlinePanels() {
    if (this._promptEl) { this._promptEl.style.display = 'none'; this._promptEl.remove(); }
    if (this._resultEl) { this._resultEl.style.display = 'none'; this._resultEl.remove(); }
    if (this._loadingEl) { this._loadingEl.style.display = 'none'; this._loadingEl.remove(); }
  }

  /** Enable or disable the Save Recipe button */
  _setSaveDisabled(disabled) {
    const btn = this.container && this.container.querySelector('.save-recipe-btn');
    if (btn) {
      btn.disabled = disabled;
      btn.classList.toggle('disabled', disabled);
    }
  }

  /** Smoothly scroll an element into view */
  _scrollIntoView(el) {
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }

  close() {
    // Clean up WiFi event listeners
    if (this._wifiCleanup) {
      this._wifiCleanup();
      this._wifiCleanup = null;
    }
    if (window.recipeEngine) {
      document.getElementById('recipe-suggestions').innerHTML = '';
      window.recipeEngine.loadSuggestions();
    }
  }

  /**
   * Open inline manual edit for an ingredient row (used when WiFi is off).
   * Replaces the ingredient text with an input field and the pencil button with a checkmark.
   * @param {number} index - Index of the ingredient to edit
   */
  openManualEdit(index) {
    this.activeRowIndex = index;
    this._setSaveDisabled(true);
    // Highlight the selected row, deselect others
    this.container.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
    const row = this.container.querySelector(`.substitution-row[data-index="${index}"]`);
    if (!row) return;
    row.classList.add('selected');
    // Hide any inline LLM panels
    this._hideInlinePanels();
    // Replace ingredient text with an editable input
    const span = row.querySelector('.substitution-row-ingredient');
    const currentText = this.ingredients[index];
    span.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'manual-edit-input form-control form-control-sm';
    input.value = currentText;
    span.appendChild(input);
    input.focus();
    input.select();
    // Change pencil button to a checkmark for confirmation
    const btn = row.querySelector('.substitution-row-prompt-btn');
    btn.innerHTML = '<i class="bi bi-check-lg"></i>';
    btn.classList.add('confirm-edit');
    const confirmEdit = (e) => {
      e.stopPropagation();
      const newVal = input.value.trim();
      if (newVal) {
        this.ingredients[index] = newVal;
        this.normalizedIngredients[index] = newVal.toLowerCase().trim();
      }
      // Restore the row to display mode
      span.textContent = this.ingredients[index];
      btn.innerHTML = '<i class="bi bi-pencil-square"></i>';
      btn.classList.remove('confirm-edit');
      row.classList.remove('selected');
      this.activeRowIndex = null;
      this._setSaveDisabled(false);
      // Scroll to save button after manual confirm
      this._scrollIntoView(this.container.querySelector('.save-recipe-btn'));
      // Remove the one-time confirm handler so the original click handler works again
      btn.removeEventListener('click', confirmEdit);
    };
    // Use capture to intercept before the original handler
    btn.addEventListener('click', confirmEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmEdit(e);
      }
    });
  }

  async submitPrompt() {
    if (this.activeRowIndex == null) return;
    // Guard: prevent LLM calls when there is no internet connectivity
    const connected = navigator.onLine;
    if (!connected) {
      alert('No internet connection. LLM-powered substitution is unavailable. Use the pencil icon to manually edit ingredients.');
      return;
    }
    const input = this._promptEl.querySelector('.substitution-prompt-input');
    const prompt = (input.value || '').trim();
    if (!prompt) return;
    const config = getMCPConfig();
    if (!config.apiEndpoint || !config.apiKey) {
      alert('MCP not configured. Set window.RECIPES_MCP_CONFIG = { apiEndpoint, apiKey }.');
      return;
    }
    const activeRow = this.container.querySelector(`.substitution-row[data-index="${this.activeRowIndex}"]`);
    // Hide prompt, show loading inline below the row
    this._promptEl.style.display = 'none';
    this._resultEl.style.display = 'none';
    this._loadingEl.style.display = 'block';
    if (activeRow) activeRow.after(this._loadingEl);
    try {
      const result = await fetchSubstitutions(
        this.recipe,
        this.ingredients[this.activeRowIndex],
        prompt
      );
      this.pendingSubstitutions = result.substitutions;
      this.pendingExplanation = result.explanation;
      this.pendingSelectedIndex = 0;
      this._loadingEl.style.display = 'none';
      this._resultEl.querySelector('.substitution-explanation').textContent = result.explanation;
      const optionsList = this._resultEl.querySelector('.substitution-options-list');
      optionsList.innerHTML = '';
      result.substitutions.forEach((sub, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'substitution-option-btn' + (i === 0 ? ' substitution-option-selected' : '');
        btn.textContent = sub.normalized;
        btn.dataset.index = String(i);
        btn.addEventListener('click', () => {
          this.pendingSelectedIndex = i;
          optionsList.querySelectorAll('.substitution-option-btn').forEach((b, j) => {
            b.classList.toggle('substitution-option-selected', j === i);
          });
        });
        optionsList.appendChild(btn);
      });
      // Show result inline below the row
      this._resultEl.style.display = 'block';
      if (activeRow) activeRow.after(this._resultEl);
      // Scroll to the result options
      this._scrollIntoView(this._resultEl);
    } catch (err) {
      this._loadingEl.style.display = 'none';
      this._promptEl.style.display = 'block';
      if (activeRow) activeRow.after(this._promptEl);
      alert(err.message || 'Failed to get substitutions');
    }
  }

  acceptSubstitution() {
    if (this.activeRowIndex == null || !this.pendingSubstitutions || this.pendingSubstitutions.length === 0) return;
    const idx = Math.min(this.pendingSelectedIndex, this.pendingSubstitutions.length - 1);
    const replacement = this.pendingSubstitutions[idx];
    this.ingredients[this.activeRowIndex] = replacement.raw;
    this.normalizedIngredients[this.activeRowIndex] = replacement.normalized;
    this.pendingSubstitutions = null;
    this.pendingExplanation = null;
    this.pendingSelectedIndex = 0;
    this._hideInlinePanels();
    const row = this.container.querySelector(`.substitution-row[data-index="${this.activeRowIndex}"]`);
    if (row) row.querySelector('.substitution-row-ingredient').textContent = replacement.raw;
    this.activeRowIndex = null;
    this.container.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
    this._setSaveDisabled(false);
    // Scroll to save button after accepting substitution
    this._scrollIntoView(this.container.querySelector('.save-recipe-btn'));
  }

  rejectSubstitution() {
    this.pendingSubstitutions = null;
    this.pendingExplanation = null;
    this.pendingSelectedIndex = 0;
    this.activeRowIndex = null;
    this._hideInlinePanels();
    this.container.querySelectorAll('.substitution-row').forEach(r => r.classList.remove('selected'));
    this._setSaveDisabled(false);
  }

  async saveRecipe() {
    const title = this.title || 'Untitled';
    const instructions = this.recipe.instructions || '';
    const payload = {
      title,
      ingredients: [...this.ingredients],
      instructions,
      normalizedIngredients: [...this.normalizedIngredients]
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
