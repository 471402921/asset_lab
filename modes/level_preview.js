import { Renderer } from '../core/renderer.js';
import { InputManager } from '../core/input.js';
import { loadLevel } from '../core/level_loader.js';
import { loadSprite } from '../loaders/sprite_loader.js';
import { loadItem } from '../loaders/item_loader.js';
import { loadUI } from '../loaders/ui_loader.js';
import { loadMap } from '../loaders/map_loader.js';
import { LEVEL_KEYMAP } from '../keymap.js';

const DEFAULT_LEVEL = 'levels/level_001.json';

export class LevelPreviewMode {
  constructor({ canvas, promptElement, infoElement, emptyStateElement }) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(promptElement);
    this.infoElement = infoElement;
    this.emptyStateElement = emptyStateElement;
    this.level = null;
    this.entities = []; // [{entity, image}], 顺序即 z-order
  }

  async start() {
    this.input.start();
    this.input.setKeymap(LEVEL_KEYMAP, (b) => this._dispatch(b));
    const result = await loadLevel(DEFAULT_LEVEL);
    if (result.error) {
      console.info('[level_preview] empty state:', result.error);
      this._showEmpty(result.error);
      return;
    }
    this.level = result.level;
    try {
      await this._loadEntities();
      this._hideEmpty();
      this._showInfo();
      this._render();
    } catch (e) {
      console.info('[level_preview] empty state:', e.message);
      this._showEmpty(e.message);
    }
  }

  stop() {
    this.input.stop();
    this._hideEmpty();
    if (this.infoElement) this.infoElement.innerHTML = '';
  }

  async _loadEntities() {
    this.entities = [];
    for (const ent of this.level.entities) {
      const image = await this._loadEntity(ent);
      this.entities.push({ entity: ent, image });
    }
  }

  async _loadEntity(ent) {
    const path = `assets/${ent.asset}`;
    if (ent.type === 'map') return loadMap(path);
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
    for (const { entity, image } of this.entities) {
      // map 类型铺满整个 canvas (作为底层); 其它按 x/y 摆位
      if (entity.type === 'map') {
        this.renderer.drawBackground(image);
      } else {
        this.renderer.drawEntity(image, entity.x, entity.y);
      }
    }
  }

  _showInfo() {
    this.infoElement.innerHTML = `
      <div><b>level:</b> ${DEFAULT_LEVEL}</div>
      <div>${this.level.entities.length} entities · zoom: ${this.renderer.zoom}×</div>
    `;
  }

  _showEmpty(msg) {
    this.emptyStateElement.innerHTML = `
      <h2>无法加载关卡</h2>
      <p><b>原因:</b> ${msg}</p>
      <p>需要 <code>${DEFAULT_LEVEL}</code> 以及它引用的所有资源 (map / sprite / item / ui)。</p>
    `;
    this.emptyStateElement.style.display = 'block';
  }

  _hideEmpty() {
    if (this.emptyStateElement) this.emptyStateElement.style.display = 'none';
  }
}
