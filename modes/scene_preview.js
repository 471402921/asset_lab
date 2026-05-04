import { Renderer } from '../core/renderer.js';
import { InputManager } from '../core/input.js';
import { loadScene } from '../core/scene_loader.js';
import { loadSprite } from '../loaders/sprite_loader.js';
import { loadItem } from '../loaders/item_loader.js';
import { loadUI } from '../loaders/ui_loader.js';
import { loadSceneBg } from '../loaders/scene_bg_loader.js';
import { SCENE_KEYMAP } from '../keymap.js';

const DEFAULT_SCENE = 'scenes/level_001.json';

export class ScenePreviewMode {
  constructor({ canvas, promptElement, infoElement, emptyStateElement }) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(promptElement);
    this.infoElement = infoElement;
    this.emptyStateElement = emptyStateElement;
    this.scene = null;
    this.bg = null;
    this.entities = [];
  }

  async start() {
    this.input.start();
    this.input.setKeymap(SCENE_KEYMAP, (b) => this._dispatch(b));
    const result = await loadScene(DEFAULT_SCENE);
    if (result.error) {
      console.info('[scene_preview] empty state:', result.error);
      this._showEmpty(result.error);
      return;
    }
    this.scene = result.scene;
    try {
      await this._loadAll();
      this._hideEmpty();
      this._showInfo();
      this._render();
    } catch (e) {
      console.info('[scene_preview] empty state:', e.message);
      this._showEmpty(e.message);
    }
  }

  stop() {
    this.input.stop();
    this._hideEmpty();
    if (this.infoElement) this.infoElement.innerHTML = '';
  }

  async _loadAll() {
    this.bg = await loadSceneBg(`assets/${this.scene.background}`);
    this.entities = [];
    for (const ent of this.scene.entities) {
      const image = await this._loadEntity(ent);
      this.entities.push({ entity: ent, image });
    }
  }

  async _loadEntity(ent) {
    const path = `assets/${ent.asset}`;
    if (ent.type === 'sprite') {
      const sp = await loadSprite(path);
      return sp.rotations[ent.facing ?? 'south'];
    }
    if (ent.type === 'item') return loadItem(path);
    if (ent.type === 'ui') return loadUI(path);
    throw new Error(`未知 entity type: ${ent.type}`);
  }

  _dispatch({ action, value }) {
    if (action === 'zoom') {
      if (value === '+1') this.renderer.zoomStep(+1);
      else if (value === '-1') this.renderer.zoomStep(-1);
      else if (value === 'reset') this.renderer.resetZoom();
      this._render();
      this._showInfo();
    }
  }

  _render() {
    this.renderer.clear();
    this.renderer.drawBackground(this.bg);
    for (const { entity, image } of this.entities) {
      this.renderer.drawEntity(image, entity.x, entity.y);
    }
  }

  _showInfo() {
    this.infoElement.innerHTML = `
      <div><b>scene:</b> ${DEFAULT_SCENE}</div>
      <div>${this.scene.entities.length} entities · zoom: ${this.renderer.zoom}×</div>
    `;
  }

  _showEmpty(msg) {
    this.emptyStateElement.innerHTML = `
      <h2>无法加载场景</h2>
      <p><b>原因:</b> ${msg}</p>
      <p>需要 <code>${DEFAULT_SCENE}</code> 以及它引用的所有资源 (背景 / sprite / item / ui)。</p>
    `;
    this.emptyStateElement.style.display = 'block';
  }

  _hideEmpty() {
    if (this.emptyStateElement) this.emptyStateElement.style.display = 'none';
  }
}
