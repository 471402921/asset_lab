export class InputManager {
  constructor(promptElement) {
    this.promptElement = promptElement;
    this.handlers = new Map();
    this.actionDispatcher = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._listening = false;
  }

  start() {
    if (this._listening) return;
    window.addEventListener('keydown', this._onKeyDown);
    this._listening = true;
  }

  stop() {
    if (!this._listening) return;
    window.removeEventListener('keydown', this._onKeyDown);
    this._listening = false;
  }

  setKeymap(keymap, dispatcher) {
    this.handlers = new Map(Object.entries(keymap));
    this.actionDispatcher = dispatcher;
    this._renderPrompt(keymap);
  }

  _onKeyDown(e) {
    const binding = this.handlers.get(e.code);
    if (!binding) return;
    e.preventDefault();
    if (this.actionDispatcher) this.actionDispatcher(binding);
  }

  _renderPrompt(keymap) {
    if (!this.promptElement) return;
    const groups = {};
    for (const [code, { action, value }] of Object.entries(keymap)) {
      const label = code.replace(/^Key/, '').replace(/^Digit/, '');
      (groups[action] ??= []).push(`${label}=${value}`);
    }
    this.promptElement.innerHTML = Object.entries(groups)
      .map(
        ([action, items]) =>
          `<div class="kg"><b>${action}</b>: ${items.join(' · ')}</div>`
      )
      .join('');
  }
}
