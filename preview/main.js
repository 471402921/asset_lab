/* preview/main.js
 *
 * ⚠️ 临时拐杖 (TEMPORARY SCAFFOLD)
 * 见 preview/README.md。cute_pet 工程师把 lib/demo/level_preview.dart 写好后,
 * 整个 preview/ 目录拆掉。不要让本目录蔓延业务逻辑。
 *
 * 范围:
 *   - 加载 .tmj (Tiled JSON)
 *   - 玩家方向数跟随 sprite (4-dir: WASD, 8-dir: WASD + QEZC), Arcade Physics 矩形碰撞
 *   - 撞 walls object layer + 撞家具 (per-tile collision via Tiled)
 *   - 相机两档 zoom (远景 2× / 近景 4×, 按 X 切换), 跟随玩家
 *   - 玩家移动时播 walking 动画 (按 plan §13.1 fallback chain), 停止时播 idle 段
 *     (启发式按 state_key 名字找 walk/idle, 设计师 semantic 命名后命中)
 *   - 缺资源 → 友好空态, 不启动 Phaser
 *   - **手机触屏支持**: DPad + zoom 浮在 Phaser 上方 (#level-touch DOM 容器),
 *     pointerdown/up 写共享 touchState 对象, scene.update() 跟键盘并联读
 *
 * 不做:
 *   - 业务逻辑 / 状态机 / 任务 / 对话 / 背包 / NPC AI
 *   - 主动状态切换 UI (玩家不能在 level preview 里手动切 idle / sleep / lying;
 *     这些都在 sprite_preview 里逐个看, 留给 cute_pet 真接业务时再 wire)
 *   - 多关卡切换 UI (?map=xxx.tmj 是逃生口)
 *   - 音频 (Phaser audio 留给真用时再加)
 *   - pinch-to-zoom / swipe 手势 (破坏整数像素纯度 + 跟原生浏览器手势冲突)
 */

const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js';
const DEFAULT_MAP = 'assets/maps/level_001.tmj';
const DEFAULT_SPRITE_DIR = 'assets/sprites/yellow_Shiba';

// 远景 (整张地图视野) / 近景 (玩家周围细节)
const ZOOM_LEVELS = [2, 4];
const DEFAULT_ZOOM_INDEX = 0;

const PLAYER_SPEED = 120;   // px/s
const ANIMATION_FPS = 8;

// 动画 state_key 启发式 (设计师源头命名应是 semantic, 如 "walking" / "idle")。
// 如果 yellow_Shiba 第一只样本的长 prompt-derived key 还在, 仍能命中 (含 'walk')。
const WALKING_NAME_HINTS = ['walk'];
const IDLE_NAME_HINTS = ['idle', 'stand', 'breath', 'rest'];

// 全部方向 → [vx, vy] 单位向量 (斜向归一化)
// 实际生效的子集在 makePreviewScene 里按 sprite 方向数过滤
const D = Math.SQRT1_2;
const MOVE_KEYS = {
  KeyW: { dir: 'north',      vx:  0, vy: -1 },
  KeyD: { dir: 'east',       vx:  1, vy:  0 },
  KeyS: { dir: 'south',      vx:  0, vy:  1 },
  KeyA: { dir: 'west',       vx: -1, vy:  0 },
  KeyQ: { dir: 'north-west', vx: -D, vy: -D },
  KeyE: { dir: 'north-east', vx:  D, vy: -D },
  KeyZ: { dir: 'south-west', vx: -D, vy:  D },
  KeyC: { dir: 'south-east', vx:  D, vy:  D },
};

let _phaserPromise = null;

function loadPhaser() {
  if (window.Phaser) return Promise.resolve();
  if (_phaserPromise) return _phaserPromise;
  _phaserPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PHASER_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`无法加载 Phaser CDN: ${PHASER_CDN}`));
    document.head.appendChild(s);
  });
  return _phaserPromise;
}

async function fetchMetadata(spriteDir) {
  const url = `${spriteDir}/metadata.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`未找到 sprite metadata: ${url} (HTTP ${r.status})`);
  const meta = await r.json();
  if (meta.export_version !== '2.0') {
    throw new Error(`Unknown pixellab export_version: ${meta.export_version}`);
  }
  return meta;
}

async function checkMap(mapPath) {
  const r = await fetch(mapPath, { method: 'HEAD' });
  if (!r.ok) throw new Error(`未找到关卡 .tmj: ${mapPath} (HTTP ${r.status})`);
}

export class LevelPreviewMode {
  constructor({ gameElement, infoElement, promptElement, emptyStateElement, levelTouch }) {
    this.gameElement = gameElement;
    this.infoElement = infoElement;
    this.promptElement = promptElement;
    this.emptyStateElement = emptyStateElement;
    this.levelTouch = levelTouch ?? null;     // mobile-only DOM (DPad + zoom button)
    this.game = null;
    this.touchState = null;                    // shared with Phaser scene; mutated by DOM
    this._touchCleanup = [];
  }

  async start() {
    // 1. 资源存在性检查 — 缺则空态, 不启动 Phaser
    let spriteMeta;
    try {
      spriteMeta = await fetchMetadata(DEFAULT_SPRITE_DIR);
    } catch (e) {
      console.info('[level_preview] empty state:', e.message);
      return this._showEmpty('player sprite', e.message, DEFAULT_SPRITE_DIR);
    }
    try {
      await checkMap(DEFAULT_MAP);
    } catch (e) {
      console.info('[level_preview] empty state:', e.message);
      return this._showEmpty('关卡 .tmj', e.message, DEFAULT_MAP);
    }

    // sprite 已知后, 提示面板按真实方向数显示 (4-dir vs 8-dir)
    this._showPrompt(spriteMeta);

    // 2. lazy load Phaser
    try {
      await loadPhaser();
    } catch (e) {
      console.info('[level_preview] empty state:', e.message);
      return this._showEmpty('Phaser CDN', e.message, PHASER_CDN);
    }

    // 3. 启动 Phaser game
    this._hideEmpty();
    this._startGame(spriteMeta);
  }

  stop() {
    this._unwireTouchUI();
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
    this.gameElement.innerHTML = '';
    this._hideEmpty();
    if (this.infoElement) this.infoElement.innerHTML = '';
    if (this.promptElement) this.promptElement.innerHTML = '';
  }

  _startGame(spriteMeta) {
    // touchState 是 LevelPreviewMode 跟 Phaser scene 之间的共享状态对象。
    // DOM 按钮 (mobile DPad / zoom) 写它, scene.update() 读它。
    this.touchState = {
      north: false, east: false, south: false, west: false,
      'north-east': false, 'north-west': false, 'south-east': false, 'south-west': false,
      zoomTrigger: false,
    };

    const SceneClass = makePreviewScene({
      spriteMeta,
      mapPath: DEFAULT_MAP,
      spriteDir: DEFAULT_SPRITE_DIR,
      onInfoUpdate: (txt) => {
        if (this.infoElement) this.infoElement.innerHTML = txt;
      },
      touchState: this.touchState,
    });

    this.game = new window.Phaser.Game({
      type: window.Phaser.AUTO,
      parent: this.gameElement,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#000',
      scale: {
        // FIT 让 Phaser canvas 在 #game 父容器里按比例缩放,
        // 桌面 #game 是 640×640 固定, mobile 是 100vw × calc(100vh - 50px)
        mode: window.Phaser.Scale.FIT,
        autoCenter: window.Phaser.Scale.CENTER_BOTH,
        width: 640,
        height: 640,
      },
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scene: SceneClass,
    });

    if (this.levelTouch) this._wireTouchUI(spriteMeta);
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Touch UI wiring (mobile only via @media; listeners 安全挂在桌面也无害)
   * DPad 按钮按 sprite 真实方向数过滤 (4-dir sprite 隐藏 4 个对角线按钮)。
   * pointerdown/up 写 touchState[dir] 布尔, scene.update() 跟键盘并联读。
   * zoom 按钮单触发: 写 touchState.zoomTrigger = true, scene 消费后清。
   * ──────────────────────────────────────────────────────────────────────── */

  _wireTouchUI(spriteMeta) {
    const availableDirs = new Set(Object.keys(spriteMeta.frames.rotations));
    const dpad = this.levelTouch.querySelector('#level-dpad');
    if (dpad) {
      dpad.querySelectorAll('button[data-dir]').forEach((btn) => {
        const dir = btn.dataset.dir;
        if (availableDirs.has(dir)) {
          btn.hidden = false;
          const setOn = (e) => {
            e.preventDefault();
            this.touchState[dir] = true;
            btn.classList.add('pressed');
          };
          const setOff = (e) => {
            if (e?.preventDefault) e.preventDefault();
            this.touchState[dir] = false;
            btn.classList.remove('pressed');
          };
          btn.addEventListener('pointerdown', setOn);
          btn.addEventListener('pointerup', setOff);
          btn.addEventListener('pointercancel', setOff);
          btn.addEventListener('pointerleave', setOff);
          this._touchCleanup.push(() => {
            btn.removeEventListener('pointerdown', setOn);
            btn.removeEventListener('pointerup', setOff);
            btn.removeEventListener('pointercancel', setOff);
            btn.removeEventListener('pointerleave', setOff);
          });
        } else {
          btn.hidden = true;
        }
      });
    }
    const zoomBtn = this.levelTouch.querySelector('#level-zoom');
    if (zoomBtn) {
      const onZoom = (e) => {
        e.preventDefault();
        this.touchState.zoomTrigger = true;
      };
      zoomBtn.addEventListener('pointerdown', onZoom);
      this._touchCleanup.push(() => zoomBtn.removeEventListener('pointerdown', onZoom));
    }
  }

  _unwireTouchUI() {
    this._touchCleanup.forEach((fn) => fn());
    this._touchCleanup = [];
  }

  _showPrompt(spriteMeta) {
    if (!this.promptElement) return;
    const dirCount = Object.keys(spriteMeta.frames.rotations).length;
    const moveLabel =
      dirCount >= 8 ? 'WASD + QEZC (8 方向)' : 'WASD (4 方向)';
    this.promptElement.innerHTML = `
      <div class="kg"><b>move</b>: ${moveLabel}</div>
      <div class="kg"><b>zoom</b>: X (远景 ↔ 近景)</div>
    `;
  }

  _showEmpty(what, why, expectedPath) {
    // 空态时隐藏触屏 UI (game 没起来, DPad 也无意义)
    if (this.levelTouch) this.levelTouch.classList.remove('active');
    this.emptyStateElement.innerHTML = `
      <h2>关卡预览启动失败</h2>
      <p><b>缺:</b> ${what}</p>
      <p><b>原因:</b> ${why}</p>
      <p>预期路径: <code>${expectedPath}</code></p>
      <p>修复后刷新页面。</p>
    `;
    this.emptyStateElement.style.display = 'block';
  }

  _hideEmpty() {
    if (this.emptyStateElement) this.emptyStateElement.style.display = 'none';
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Phaser Scene (factory, 因 Phaser 是 lazy load 不能在模块顶部 extends)
 * ──────────────────────────────────────────────────────────────────────────── */

function makePreviewScene({ spriteMeta, mapPath, spriteDir, onInfoUpdate, touchState }) {
  // sprite 真实有几个方向, 玩家移动键就只生效那几个
  // (4-dir sprite: WASD; 8-dir sprite: WASD+QEZC)
  const availableDirs = new Set(Object.keys(spriteMeta.frames.rotations));
  const moveKeys = Object.fromEntries(
    Object.entries(MOVE_KEYS).filter(([, m]) => availableDirs.has(m.dir))
  );
  // touchState 兜底: 桌面端 LevelPreviewMode 没传 (没 levelTouch) 时给个空对象
  const touch = touchState ?? {};

  return class PreviewScene extends window.Phaser.Scene {
    constructor() {
      super('PreviewScene');
      this.zoomIndex = DEFAULT_ZOOM_INDEX;
    }

    preload() {
      this.load.tilemapTiledJSON('level', mapPath);
      // sprite: 8 方向各一 PNG (pixellab metadata.frames.rotations)
      for (const [dir, relPath] of Object.entries(spriteMeta.frames.rotations)) {
        this.load.image(`player_${dir}`, `${spriteDir}/${relPath}`);
      }
      // animations: 每个 state_key × 每个 direction × 每帧, 全 preload
      // (实测 yellow_Shiba 5 anim 总计 ~70 张 60×60 PNG, 不大)
      const anims = spriteMeta.frames?.animations ?? {};
      for (const [stateKey, dirMap] of Object.entries(anims)) {
        for (const [dir, framePaths] of Object.entries(dirMap)) {
          framePaths.forEach((p, i) => {
            this.load.image(this._animFrameKey(stateKey, dir, i), `${spriteDir}/${p}`);
          });
        }
      }
    }

    _animFrameKey(stateKey, dir, frameIdx) {
      return `anim:${stateKey}:${dir}:${frameIdx}`;
    }

    _animKey(stateKey, dir) {
      return `play:${stateKey}:${dir}`;
    }

    create() {
      this.map = this.make.tilemap({ key: 'level' });

      // 加载 tileset images. 约定: 设计师在 Tiled 导出 .tmj 时勾选
      // "Embed tilesets" (或单个 tileset 的 "Embed in map"), 这样 .tmj
      // 自包含 tileset 数据, Phaser 直接吃。外部 .tsx 引用未来再支持。
      const tilesetImageKeys = [];
      for (const ts of this.map.tilesets) {
        // ts.image 是 Tiled 里 tileset 引用的 PNG (相对 .tmj 路径)
        const imgRel = ts.image || (ts.source ? null : null);
        if (!imgRel) {
          console.warn(
            `[preview] tileset "${ts.name}" 是外部 .tsx 引用 (Phaser 当前不支持). ` +
              `请在 Tiled 里改为 Embed Tilesets, 或等 preview 升级。`
          );
          continue;
        }
        const key = `ts_${ts.name}`;
        // Phaser 要求 image 已 preload; 这里 lazy load 不太行 —
        // 改在 preload 阶段做。重构: 把 tileset image 加载移到 preload。
        // 但 preload 时还没 tilemap 信息……所以两阶段: preload tilemap →
        // create 里再启第二个 scene 或用 dynamic load。
        // 简化: 用 this.load 在 create 里再开一次 (Phaser 支持中途 load)
        this.load.image(key, this._resolveTilesetImage(mapPath, imgRel));
        tilesetImageKeys.push({ ts, key });
      }

      // 第二次 load 完成后再继续
      this.load.once('complete', () => this._buildLevel(tilesetImageKeys));
      this.load.start();
    }

    _resolveTilesetImage(mapAbsPath, imgRelToTmj) {
      // mapPath e.g. "assets/maps/level_001.tmj"
      // imgRel e.g. "../tilesets/foo/tile.png" (相对 .tmj 文件)
      const dir = mapAbsPath.substring(0, mapAbsPath.lastIndexOf('/') + 1);
      // 简化: 直接拼, 浏览器会规范 ../
      return new URL(dir + imgRelToTmj, window.location.href).pathname.slice(1);
    }

    _buildLevel(tilesetImageKeys) {
      // 注册所有 tileset
      const tilesets = tilesetImageKeys.map(({ ts, key }) =>
        this.map.addTilesetImage(ts.name, key)
      );

      // 创建所有 tile layer
      for (const layerData of this.map.layers) {
        const layer = this.map.createLayer(layerData.name, tilesets);
        if (layer) layer.setCollisionByProperty({ collides: true });
      }

      // 玩家初始位置: 'spawn' object (如有), 否则地图中心
      const spawnX = this.map.widthInPixels / 2;
      const spawnY = this.map.heightInPixels / 2;
      let startX = spawnX;
      let startY = spawnY;
      const objLayers = this.map.objects || [];
      for (const ol of objLayers) {
        for (const obj of ol.objects) {
          if (obj.name === 'spawn' || obj.type === 'spawn') {
            startX = obj.x;
            startY = obj.y;
          }
        }
      }

      // Player
      this.player = this.physics.add.sprite(startX, startY, 'player_south');
      this.player.facing = 'south';
      this.player.setCollideWorldBounds(true);
      // body 缩小一点, 给 sprite 视觉留余地 (玩家像素 60×60, body 用 32×32 中心)
      const bodyW = Math.min(this.player.width, 32);
      const bodyH = Math.min(this.player.height, 32);
      this.player.body.setSize(bodyW, bodyH);
      this.player.body.setOffset(
        (this.player.width - bodyW) / 2,
        (this.player.height - bodyH) / 2
      );

      // 注册 Phaser anims (一段 frames.animations[state][dir] → 一个 anim key)
      // + 启发式找 walking / idle 的 state_key
      this.animsByDir = {};   // { stateKey: { direction: animKey } }
      const anims = spriteMeta.frames?.animations ?? {};
      for (const [stateKey, dirMap] of Object.entries(anims)) {
        this.animsByDir[stateKey] = {};
        for (const [dir, framePaths] of Object.entries(dirMap)) {
          const animKey = this._animKey(stateKey, dir);
          this.anims.create({
            key: animKey,
            frames: framePaths.map((_, i) => ({ key: this._animFrameKey(stateKey, dir, i) })),
            frameRate: ANIMATION_FPS,
            repeat: -1,
          });
          this.animsByDir[stateKey][dir] = animKey;
        }
      }
      const stateKeys = Object.keys(anims);
      const findKey = (hints) =>
        stateKeys.find((k) => hints.some((h) => k.toLowerCase().includes(h))) ?? null;
      this.walkingKey = findKey(WALKING_NAME_HINTS);
      this.idleKey = findKey(IDLE_NAME_HINTS);
      this.currentAnimKey = null;

      // Walls / collision: 尝试找 'walls' object layer 并加 static body
      const wallsLayer = objLayers.find((ol) => ol.name === 'walls');
      if (wallsLayer) {
        const wallsGroup = this.physics.add.staticGroup();
        for (const obj of wallsLayer.objects) {
          if (obj.width <= 0 || obj.height <= 0) continue;
          const rect = wallsGroup
            .create(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
            .setSize(obj.width, obj.height)
            .setVisible(false);
          rect.refreshBody();
        }
        this.physics.add.collider(this.player, wallsGroup);
      }

      // Tile-based collision (家具 etc., 通过 tile property collides:true)
      for (const layerData of this.map.layers) {
        const layer = this.map.getLayer(layerData.name)?.tilemapLayer;
        if (layer) this.physics.add.collider(this.player, layer);
      }

      // Camera
      this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
      this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
      this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
      this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

      // Input
      this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,E,Z,C,X');

      // X 切 zoom
      this.input.keyboard.on('keydown-X', () => {
        this.zoomIndex = (this.zoomIndex + 1) % ZOOM_LEVELS.length;
        this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
        this._updateInfo();
      });

      this._updateInfo();
    }

    update() {
      if (!this.player) return;

      // Touch zoom 单触发 (DOM 按钮 pointerdown 写 true, scene 消费后清)
      if (touch.zoomTrigger) {
        this.zoomIndex = (this.zoomIndex + 1) % ZOOM_LEVELS.length;
        this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
        this._updateInfo();
        touch.zoomTrigger = false;
      }

      let vx = 0;
      let vy = 0;
      let pressedDir = null;
      for (const [code, m] of Object.entries(moveKeys)) {
        const keyName = code.replace('Key', '');
        const keyDown = this.keys[keyName]?.isDown;
        const touchDown = !!touch[m.dir];
        if (keyDown || touchDown) {
          vx += m.vx;
          vy += m.vy;
          pressedDir = m.dir;
        }
      }
      // 多键归一化: 多个键叠加可能 >1, 归一回 1
      const mag = Math.hypot(vx, vy);
      if (mag > 1) {
        vx /= mag;
        vy /= mag;
      }
      this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

      const facingChanged = pressedDir && pressedDir !== this.player.facing;
      if (facingChanged) {
        this.player.facing = pressedDir;
      }

      // 决策播啥动画 (fallback chain: 见 plan §13.1)
      const isMoving = vx !== 0 || vy !== 0;
      const desiredAnimKey = this._pickAnimKey(isMoving);

      if (desiredAnimKey) {
        if (this.currentAnimKey !== desiredAnimKey) {
          this.player.play(desiredAnimKey, true);
          this.currentAnimKey = desiredAnimKey;
        }
      } else {
        // 没动画可播 → 静帧 (按 facing 选 rotation)
        if (this.currentAnimKey) {
          this.player.stop();
          this.currentAnimKey = null;
        }
        this.player.setTexture(`player_${this.player.facing}`);
      }

      if (facingChanged || (isMoving && !desiredAnimKey)) {
        this._updateInfo();
      }
    }

    // 返回应播的 anim key, 或 null (静帧 fallback)。
    _pickAnimKey(isMoving) {
      const dir = this.player.facing;
      const tryState = (stateKey) => {
        if (!stateKey) return null;
        const dirMap = this.animsByDir[stateKey];
        if (!dirMap) return null;
        return dirMap[dir] ?? dirMap.south ?? null;
      };
      if (isMoving) return tryState(this.walkingKey);   // 走 → 走路 anim, 缺方向回 south
      return tryState(this.idleKey);                     // 停 → idle anim (若有, 通常只 south)
    }

    _updateInfo() {
      if (!this.player || !onInfoUpdate) return;
      const z = ZOOM_LEVELS[this.zoomIndex];
      const zoomLabel = this.zoomIndex === 0 ? '远景' : '近景';
      const animLine = this.currentAnimKey
        ? `anim: <b>${this.currentAnimKey.replace('play:', '')}</b>`
        : 'anim: <i>(static)</i>';
      onInfoUpdate(
        `<div><b>level:</b> ${mapPath}</div>` +
          `<div>player: ${spriteDir} · facing: ${this.player.facing} · zoom: ${z}× (${zoomLabel}, X 切换)</div>` +
          `<div>${animLine}</div>`
      );
    }
  };
}
