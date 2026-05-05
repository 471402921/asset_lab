import { Renderer } from '../core/renderer.js';
import { InputManager } from '../core/input.js';
import { loadSprite } from '../loaders/sprite_loader.js';
import { SPRITE_KEYMAP } from '../keymap.js';

const DEFAULT_SPRITE = 'assets/sprites/husky_chibi';

/* ────────────────────────────────────────────────────────────────────────────
 * STATE SLOT (未实装, 等设计师 + pixellab 状态导出格式定型)
 *
 * 设计师未来希望在 web 端模拟 sprite 的所有状态(宠物状态多: 健康/受伤/睡觉
 * /开心 等等)。当前不实装是因为:
 *   1. pixellab character export 的状态字段尚未确定 (frames.animations
 *      为空, 状态字段在 metadata.json 里也不存在)
 *   2. 实装前需要看真实样本, 避免按猜测的 schema 写一遍又重写
 *
 * 接入点已预留:
 *   - this.state (constructor 里 null)
 *   - _dispatch 'state' action 分支 (现在 throw, 提示未实装)
 *   - keymap.js 里 STATE_KEYS 注释段, 等真要做时取消注释 + 改成具体绑定
 *   - this.sprite.states 字段 (sprite_loader 一旦读到 metadata.states
 *     或 frames.animations, 在这里挂出来即可)
 *
 * 实装步骤(等触发):
 *   1. 拿到 pixellab 真实状态导出样本, 更新 plan §13 / §14 schema 章节
 *   2. sprite_loader.js 加 states 解析
 *   3. keymap.js 真添加状态切换键
 *   4. 这里 _dispatch 实装 'state', _render 按 state 选 frame, _showInfo 显示
 * ──────────────────────────────────────────────────────────────────────────── */

export class SpritePreviewMode {
  constructor({ canvas, promptElement, infoElement, emptyStateElement }) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(promptElement);
    this.infoElement = infoElement;
    this.emptyStateElement = emptyStateElement;
    this.sprite = null;
    this.facing = 'south';
    this.state = null;  // STATE SLOT: future "idle" / "walking" / "hurt" / etc.
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
    } else if (action === 'state') {
      // STATE SLOT: 等 pixellab 状态导出 schema 定型后实装
      console.warn(
        '[sprite_preview] state switching not implemented yet. ' +
          'Awaiting pixellab state export schema. See top-of-file STATE SLOT block.'
      );
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
    const stateLabel = this.state ? ` · state: ${this.state}` : '';
    this.infoElement.innerHTML = `
      <div><b>${c.name}</b></div>
      <div>size: ${c.size.width}×${c.size.height} · view: ${c.view} · zoom: ${this.renderer.zoom}× · facing: ${this.facing}${stateLabel}</div>
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
