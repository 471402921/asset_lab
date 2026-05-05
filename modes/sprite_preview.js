import { Renderer } from '../core/renderer.js';
import { InputManager } from '../core/input.js';
import { loadSprite } from '../loaders/sprite_loader.js';
import { SPRITE_KEYMAP, ANIMATION_DEFAULT_FPS } from '../keymap.js';

const DEFAULT_SPRITE = 'assets/sprites/yellow_Shiba';

const FRAME_INTERVAL_MS = 1000 / ANIMATION_DEFAULT_FPS;

// state_key 是设计师源头命名 (semantic, 例如 "idle"/"walking");
// 旧 prompt-derived 长串 fallback 截 25 字 + "..."
function shortStateLabel(key) {
  if (!key) return '(static)';
  return key.length > 25 ? `${key.slice(0, 25)}…` : key;
}

export class SpritePreviewMode {
  constructor({ canvas, promptElement, infoElement, emptyStateElement }) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(promptElement);
    this.infoElement = infoElement;
    this.emptyStateElement = emptyStateElement;
    this.sprite = null;
    this.facing = 'south';

    // animation playback state
    this.stateKey = null;        // null = static rotations
    this.stateKeys = [];         // ordered list of available state keys
    this.frameIndex = 0;
    this.playing = false;
    this._raf = null;
    this._lastTickTime = 0;
  }

  async start() {
    this.input.start();
    try {
      this.sprite = await loadSprite(DEFAULT_SPRITE);
      this.stateKeys = Object.keys(this.sprite.animations);
      // Filter face keys to only those the sprite actually has rotations for.
      // (4-dir sprite drops Q/E/Z/C from prompt panel; 8-dir keeps them.)
      const keymap = Object.fromEntries(
        Object.entries(SPRITE_KEYMAP).filter(
          ([, b]) => b.action !== 'face' || this.sprite.rotations[b.value]
        )
      );
      this.input.setKeymap(keymap, (b) => this._dispatch(b));
      this._hideEmpty();
      this._showInfo();
      this._render();
    } catch (e) {
      console.info('[sprite_preview] empty state:', e.message);
      this._showEmpty(e.message);
    }
  }

  stop() {
    this._stopRAF();
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
      this._handleState(value);
    } else if (action === 'animation') {
      this._handleAnimation(value);
    }
  }

  _handleState(value) {
    if (value === 'clear') {
      this.stateKey = null;
      this.frameIndex = 0;
      this._stopRAF();
      this.playing = false;
    } else if (value.startsWith('index:')) {
      const idx = parseInt(value.slice(6), 10);
      if (idx < 0 || idx >= this.stateKeys.length) return;  // 没那么多 state, 忽略
      this.stateKey = this.stateKeys[idx];
      this.frameIndex = 0;
      // 选状态自动开播 (一步到位的体验)
      this.playing = true;
      this._startRAF();
    }
    this._render();
    this._showInfo();
  }

  _handleAnimation(value) {
    if (value === 'toggle_play') {
      if (!this.stateKey) return;
      this.playing = !this.playing;
      if (this.playing) this._startRAF();
      else this._stopRAF();
      this._showInfo();
    } else if (value === 'next' || value === 'prev') {
      if (!this.stateKey) return;
      // 单步默认暂停, 让设计师看清每一帧
      if (this.playing) {
        this.playing = false;
        this._stopRAF();
      }
      this._stepFrame(value === 'next' ? +1 : -1);
      this._showInfo();
    }
  }

  _stepFrame(delta) {
    const cur = this._currentFrames();
    if (!cur || cur.frames.length === 0) return;
    this.frameIndex = (this.frameIndex + delta + cur.frames.length) % cur.frames.length;
    this._render();
  }

  // Fallback chain (plan §13.1):
  //   exact (state, facing) → (state, 'south') → null (静帧 fallback 在 _render)
  // 返回 { frames, fallback } 或 null
  _currentFrames() {
    if (!this.stateKey) return null;
    const dirMap = this.sprite.animations[this.stateKey];
    if (!dirMap) return null;
    if (dirMap[this.facing]) return { frames: dirMap[this.facing], fallback: null };
    if (dirMap.south) return { frames: dirMap.south, fallback: 'south' };
    return null;
  }

  _render() {
    this.renderer.clear();
    const cur = this._currentFrames();
    let img;
    if (cur && cur.frames[this.frameIndex]) {
      img = cur.frames[this.frameIndex];
    } else {
      img = this.sprite.rotations[this.facing];
    }
    this.renderer.drawCenteredEntity(img);
  }

  _startRAF() {
    if (this._raf) return;
    this._lastTickTime = performance.now();
    const tick = (t) => {
      if (!this.playing) {
        this._raf = null;
        return;
      }
      if (t - this._lastTickTime >= FRAME_INTERVAL_MS) {
        this._stepFrame(+1);
        this._showInfo();
        this._lastTickTime = t;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopRAF() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _showInfo() {
    const c = this.sprite.character;
    const cur = this._currentFrames();
    let stateLine;
    if (!this.stateKey) {
      stateLine = `state: <i>(static)</i> · 5 anims, Tab→静帧, Digit1-${Math.min(9, this.stateKeys.length)}→选`;
    } else {
      const total = cur ? cur.frames.length : 0;
      const playMark = this.playing ? '▶' : '⏸';
      const fallbackMark = cur?.fallback ? ` · <span style="color:#f0c674">↳ ${cur.fallback} fallback</span>` : '';
      const noFramesMark = !cur ? ' · <span style="color:#e07070">no frames (静帧)</span>' : '';
      stateLine = `state: <b>${shortStateLabel(this.stateKey)}</b> · ${playMark} frame ${this.frameIndex + 1}/${total}${fallbackMark}${noFramesMark}`;
    }
    this.infoElement.innerHTML = `
      <div><b>${c.name}</b></div>
      <div>size: ${c.size.width}×${c.size.height} · view: ${c.view} · zoom: ${this.renderer.zoom}× · facing: ${this.facing}</div>
      <div>${stateLine}</div>
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
