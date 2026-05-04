import { Renderer } from '../core/renderer.js';
import { InputManager } from '../core/input.js';
import { loadSprite } from '../loaders/sprite_loader.js';
import { SPRITE_KEYMAP } from '../keymap.js';

const DEFAULT_SPRITE = 'assets/sprites/husky_chibi';

export class SpritePreviewMode {
  constructor({ canvas, promptElement, infoElement, emptyStateElement }) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(promptElement);
    this.infoElement = infoElement;
    this.emptyStateElement = emptyStateElement;
    this.sprite = null;
    this.facing = 'south';
  }

  async start() {
    this.input.start();
    this.input.setKeymap(SPRITE_KEYMAP, (b) => this._dispatch(b));
    try {
      this.sprite = await loadSprite(DEFAULT_SPRITE);
      this._hideEmpty();
      this._showInfo();
      this._render();
    } catch (e) {
      console.info('[sprite_preview] empty state:', e.message);
      this._showEmpty(e.message);
    }
  }

  stop() {
    this.input.stop();
    this._hideEmpty();
    if (this.infoElement) this.infoElement.innerHTML = '';
  }

  _dispatch({ action, value }) {
    if (!this.sprite) return;
    if (action === 'face') {
      if (this.sprite.rotations[value]) {
        this.facing = value;
        this._render();
        this._showInfo();
      }
    } else if (action === 'zoom') {
      if (value === '+1') this.renderer.zoomStep(+1);
      else if (value === '-1') this.renderer.zoomStep(-1);
      else if (value === 'reset') this.renderer.resetZoom();
      this._render();
      this._showInfo();
    }
    // animation: MVP 静帧, 暂未实装 (plan §13)
  }

  _render() {
    this.renderer.clear();
    const img = this.sprite.rotations[this.facing];
    this.renderer.drawCenteredEntity(img);
  }

  _showInfo() {
    const c = this.sprite.character;
    this.infoElement.innerHTML = `
      <div><b>${c.name}</b></div>
      <div>size: ${c.size.width}×${c.size.height} · view: ${c.view} · zoom: ${this.renderer.zoom}× · facing: ${this.facing}</div>
    `;
  }

  _showEmpty(msg) {
    this.emptyStateElement.innerHTML = `
      <h2>没有 sprite 可预览</h2>
      <p><b>原因:</b> ${msg}</p>
      <p>把 pixellab 导出的目录 (含 <code>metadata.json</code> 和 <code>rotations/</code>) 放到 <code>${DEFAULT_SPRITE}/</code> 后刷新页面。</p>
    `;
    this.emptyStateElement.style.display = 'block';
  }

  _hideEmpty() {
    if (this.emptyStateElement) this.emptyStateElement.style.display = 'none';
  }
}
