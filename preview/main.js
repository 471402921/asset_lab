/* preview/main.js
 *
 * ⚠️ 临时拐杖 (TEMPORARY SCAFFOLD)
 * 见 preview/README.md。cute_pet 工程师把 lib/demo/level_preview.dart 写好后,
 * 整个 preview/ 目录拆掉。不要让本目录蔓延业务逻辑。
 *
 * 范围:
 *   - 加载 .tmj (Tiled JSON), 支持外部 .tsx 引用 (atlas 与 image-collection)
 *   - 渲染 tile layers + object-layer 里的 gid tile-objects
 *   - 玩家方向数跟随 sprite (4-dir: WASD, 8-dir: WASD + QEZC), Arcade Physics 矩形碰撞
 *   - tile / object 上的 per-tile property `solid: true` → 静态碰撞体
 *   - 兼容旧约定 `walls` object layer (空 rect 当墙)
 *   - 相机两档 zoom (远景 2× / 近景 4×, 按 X 切换), 跟随玩家
 *   - 玩家移动时播 walking 动画 (按 plan §13.1 fallback chain), 停止时播 idle 段
 *     (启发式按 state_key 名字找 walk/idle, 设计师 semantic 命名后命中)
 *   - **PC 远程控制台 (console.html) 通过 /api/control 短轮询驱动**:
 *       - DPad / 物理键盘 → POST keys 持续状态
 *       - 状态条 / 数字键 → POST stateReq, scene 接 forced state
 *       - Tab 清回自动模式 (heuristic walk/idle)
 *       - Space + [/] → POST animReq, scene 控制 Phaser anim 播放/暂停/单步
 *       - X / zoom button → POST zoomReq
 *   - 缺资源 → 友好空态, 不启动 Phaser
 *   - 手机端不再渲染浮动 DPad / info 文字 (录像专用, 控制全靠 PC 控制台)
 *
 * 不做:
 *   - 业务逻辑 / 状态机 / 任务 / 对话 / 背包 / NPC AI
 *   - 主动状态切换 UI (玩家不能在 level preview 里手动切 idle / sleep / lying;
 *     这些都在 sprite_preview 里逐个看, 留给 cute_pet 真接业务时再 wire)
 *   - 多关卡切换 UI (?map=xxx.tmj 是逃生口)
 *   - 音频 (Phaser audio 留给真用时再加)
 *   - pinch-to-zoom / swipe 手势 (破坏整数像素纯度 + 跟原生浏览器手势冲突)
 *   - 非 gid 类型的 object (rectangle / polygon 区域、trigger 等) — 当前只识别 gid 对象
 *   - 多控制台 / 多手机会话 (单全局 state, 一台机一个录像设计师)
 */

const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js';
const DEFAULT_MAP = 'assets/scenes/test2/untitled.tmj';
const DEFAULT_SPRITE_DIR = 'assets/sprites/yellow_Shiba';

// PC 远程控制台 (console.html) 通过 /api/control 中转, 手机端轮询读控件状态。
// 50ms = 20Hz; 加上网络一来一回 ~50ms, 端到端 ~100ms 内, 录像够用。
const CONSOLE_POLL_URL = '/api/control';
const CONSOLE_POLL_MS = 50;

// 同 sprite_preview 与 index.html 里 #level-touch 的 media query 对齐:
// 手机上 canvas 跟视口 1:1 (Phaser RESIZE), zoom 默认 1× 让玩家看到原图大小;
// 桌面 canvas 内部 640², FIT 撑到 #game div, zoom 默认 2× 比较舒适
const IS_MOBILE = window.matchMedia('(pointer: coarse), (max-width: 900px)').matches;

// 远景 (整张地图视野) / 近景 (玩家周围细节)
const ZOOM_LEVELS = IS_MOBILE ? [1, 2] : [2, 4];
const DEFAULT_ZOOM_INDEX = 0;

const PLAYER_SPEED = 120;   // px/s
const ANIMATION_FPS = 8;

// 动画 state_key 启发式 (设计师源头命名应是 semantic, 如 "walk" / "idle")。
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
    this.levelTouch = levelTouch ?? null;     // mobile-only DPad container; 不再 wire, 仅做 hide 用
    this.game = null;
    this.touchState = null;                    // shared with Phaser scene; 由 console 轮询写, scene 读
    this._pollHandle = null;
    this._lastSeqs = { state: -1, anim: -1, zoom: -1 };
    this._mobileHidden = [];                   // 记录被隐藏的元素, stop() 时还原
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

    // sprite 已知后, 提示面板按真实方向数显示 (4-dir vs 8-dir) — 桌面才看得到
    this._showPrompt(spriteMeta);

    // 2. lazy load Phaser
    try {
      await loadPhaser();
    } catch (e) {
      console.info('[level_preview] empty state:', e.message);
      return this._showEmpty('Phaser CDN', e.message, PHASER_CDN);
    }

    // 3. 启动 Phaser game + 隐藏手机端 UI (干净录像)
    this._hideEmpty();
    if (IS_MOBILE) this._hideMobileUI();
    this._startGame(spriteMeta);
    this._startPolling();
  }

  stop() {
    this._stopPolling();
    this._restoreMobileUI();
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
    this.gameElement.innerHTML = '';
    this._hideEmpty();
    if (this.infoElement) this.infoElement.innerHTML = '';
    if (this.promptElement) this.promptElement.innerHTML = '';
  }

  _hideMobileUI() {
    // 录像专用: 手机上 #info / #level-touch / #prompt 都进画面, 全部隐藏。
    // PC 控制台 (console.html) 才是控制入口, 手机仅显示干净游戏画面。
    for (const el of [this.infoElement, this.promptElement, this.levelTouch]) {
      if (el && el.style.display !== 'none') {
        this._mobileHidden.push({ el, prev: el.style.display });
        el.style.display = 'none';
      }
    }
  }

  _restoreMobileUI() {
    for (const { el, prev } of this._mobileHidden) {
      el.style.display = prev || '';
    }
    this._mobileHidden = [];
  }

  _startGame(spriteMeta) {
    // touchState: scene 跟 polling 之间的共享状态对象。
    //   - keys: 持续按下的方向 (console DPad 持续按住)
    //   - stateReq / animReq: 一次性事件 (scene 消费后置 null)
    //   - zoomTrigger: 一次性 (scene 消费后置 false)
    this.touchState = {
      north: false, east: false, south: false, west: false,
      'north-east': false, 'north-west': false, 'south-east': false, 'south-west': false,
      stateReq: null,           // { value: 'index:N' | 'clear' }
      animReq: null,            // { value: 'toggle_play' | 'next' | 'prev' }
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
      scale: IS_MOBILE
        ? {
            // 手机: canvas 跟 #game div 1:1 (无缩放) → 配合 zoom 1× 让玩家看到原图大小
            mode: window.Phaser.Scale.RESIZE,
            autoCenter: window.Phaser.Scale.CENTER_BOTH,
          }
        : {
            // 桌面: 640² 内部 canvas, FIT 撑到 #game (640×640 div), zoom 2× 起步
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
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Console polling: PC 上 console.html POST 给 /api/control, 这里轮询读。
   * 把持续按键写进 touchState, 单调计数器化的事件请求 (state/anim/zoom)
   * 只在 seq 增长时塞进 touchState 对应槽, scene update() 消费后清。
   * 这样事件不会重复触发, 也不会丢 (50ms 一轮足够覆盖手指节奏)。
   * ──────────────────────────────────────────────────────────────────────── */

  _startPolling() {
    if (this._pollHandle) return;
    let inflight = false;
    this._pollHandle = setInterval(async () => {
      if (inflight) return;          // 网络慢时不重叠请求
      inflight = true;
      try {
        const r = await fetch(CONSOLE_POLL_URL, { cache: 'no-store' });
        if (!r.ok) return;
        const ctrl = await r.json();
        const remoteKeys = ctrl.keys || {};
        for (const dir of [
          'north', 'east', 'south', 'west',
          'north-east', 'north-west', 'south-east', 'south-west',
        ]) {
          this.touchState[dir] = !!remoteKeys[dir];
        }
        const sr = ctrl.stateReq;
        if (sr && typeof sr.seq === 'number' && sr.seq > this._lastSeqs.state) {
          this._lastSeqs.state = sr.seq;
          this.touchState.stateReq = { value: sr.value };
        }
        const ar = ctrl.animReq;
        if (ar && typeof ar.seq === 'number' && ar.seq > this._lastSeqs.anim) {
          this._lastSeqs.anim = ar.seq;
          this.touchState.animReq = { value: ar.value };
        }
        const zr = ctrl.zoomReq;
        if (zr && typeof zr.seq === 'number' && zr.seq > this._lastSeqs.zoom) {
          this._lastSeqs.zoom = zr.seq;
          this.touchState.zoomTrigger = true;
        }
      } catch (e) {
        // 网络抖动 / endpoint 不存在 → 静默, 下次再 poll
      } finally {
        inflight = false;
      }
    }, CONSOLE_POLL_MS);
  }

  _stopPolling() {
    if (this._pollHandle) {
      clearInterval(this._pollHandle);
      this._pollHandle = null;
    }
  }

  _showPrompt(spriteMeta) {
    if (!this.promptElement) return;
    const dirCount = Object.keys(spriteMeta.frames.rotations).length;
    const moveLabel =
      dirCount >= 8 ? 'WASD + QEZC (8 方向)' : 'WASD (4 方向)';
    this.promptElement.innerHTML = `
      <div class="kg"><b>move</b>: ${moveLabel}</div>
      <div class="kg"><b>state</b>: Tab 清 · 1-9 选 · Space 播 · [/] 步</div>
      <div class="kg"><b>zoom</b>: X (远景 ↔ 近景)</div>
      <div class="kg"><b>remote</b>: PC 开 <code>/console.html</code> 远程驱动</div>
    `;
  }

  _showEmpty(what, why, expectedPath) {
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
  const touch = touchState ?? {};

  const mapDir = mapPath.substring(0, mapPath.lastIndexOf('/') + 1);

  return class PreviewScene extends window.Phaser.Scene {
    constructor() {
      super('PreviewScene');
      this.zoomIndex = DEFAULT_ZOOM_INDEX;
      // forced state (PC 控制台选状态后, 覆盖 walk/idle 启发式)
      // null = 自动模式 (按移动状态切 walk/idle)
      this.forcedStateKey = null;
      this.forcedPlaying = true;     // 选状态时默认开播; Space 切换; [/] 单步则 false
    }

    preload() {
      // 把 .tmj 当 raw JSON 拉, 我们要在 create 里给 source-only tileset 注入
      // embedded 数据后再喂回 Phaser, 否则它的 tilemap parser 见 source 直接 skip。
      this.load.json('level_raw', mapPath);
      // sprite rotations
      for (const [dir, relPath] of Object.entries(spriteMeta.frames.rotations)) {
        this.load.image(`player_${dir}`, `${spriteDir}/${relPath}`);
      }
      // sprite animation frames
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

    /* ──────────────────────────────────────────────────────────────────────
     * create(): 关键点 — Phaser 的 tilemap parser 见到外部 .tsx (source 字段)
     * 会 warn + skip 整条 tileset, 整张地图就废了。所以我们自己:
     *   1. 把 raw .tmj 从 cache 拿出来 (preload 时已用 load.json 装入)
     *   2. 对每个 source-only tileset, fetch .tsx + 解析 XML, 转成 Tiled JSON
     *      embedded 格式 (image / tiles / 尺寸都齐) 替换原 source 条目
     *   3. 排队所有 PNG (atlas + per-tile image) 进 load 队列
     *   4. 把改造好的 tmj inject 进 cache.tilemap (覆盖旧 entry)
     *   5. load.start() 触发 PNG 加载, complete 后 _buildLevel()
     * 副产品: tilesetData 仍记一份 (per-tile properties + imageKey 索引,
     * object-layer 渲染时按 gid 反查用)
     * ────────────────────────────────────────────────────────────────────── */
    async create() {
      const rawTmj = this.cache.json.get('level_raw');
      if (!rawTmj) {
        console.error('[preview] level_raw JSON missing from cache');
        return;
      }
      // tilesetData[]: { name, firstgid, imageKey?, tiles: { [localId]: {imageKey, properties} } }
      this.tilesetData = [];
      this._tilemapReady = false;

      const newTilesets = [];
      for (const ts of rawTmj.tilesets) {
        if (ts.image) {
          // 已 embedded (设计师勾了 Embed Tilesets), 直接用 + 排队 PNG
          const tsd = {
            name: ts.name,
            firstgid: ts.firstgid,
            tileWidth: ts.tilewidth,
            tileHeight: ts.tileheight,
            tiles: {},
            imageKey: `ts_atlas_${ts.name}`,
          };
          this.load.image(tsd.imageKey, _resolveUrl(mapDir, ts.image));
          // 提取 per-tile properties (embedded image-collection 也走这里)
          (ts.tiles || []).forEach((t) => {
            tsd.tiles[t.id] = {
              properties: _propsFromTiledArray(t.properties),
              imageKey: t.image ? `tile_${ts.name}_${t.id}` : undefined,
            };
            if (t.image) this.load.image(tsd.tiles[t.id].imageKey, _resolveUrl(mapDir, t.image));
          });
          this.tilesetData.push(tsd);
          newTilesets.push(ts);
          continue;
        }
        if (!ts.source) continue;

        // External .tsx — fetch + parse + 转成 embedded 格式
        const tsxUrl = _resolveUrl(mapDir, ts.source);
        let xml;
        try {
          const text = await fetch(tsxUrl).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status} ${tsxUrl}`);
            return r.text();
          });
          xml = new DOMParser().parseFromString(text, 'application/xml');
          const parseErr = xml.querySelector('parsererror');
          if (parseErr) throw new Error(`XML parse error in ${tsxUrl}: ${parseErr.textContent}`);
        } catch (e) {
          console.warn(`[preview] failed to load tileset ${ts.name}:`, e.message);
          continue;
        }
        const tsxDir = tsxUrl.substring(0, tsxUrl.lastIndexOf('/') + 1);
        const root = xml.querySelector('tileset');
        if (!root) {
          console.warn(`[preview] ${tsxUrl}: no <tileset> root`);
          continue;
        }

        const name = ts.name || root.getAttribute('name');
        const tileWidth = parseInt(root.getAttribute('tilewidth'), 10) || 0;
        const tileHeight = parseInt(root.getAttribute('tileheight'), 10) || 0;
        const tileCount = parseInt(root.getAttribute('tilecount'), 10) || 0;
        const columns = parseInt(root.getAttribute('columns'), 10) || 0;

        const tsd = { name, firstgid: ts.firstgid, tileWidth, tileHeight, tiles: {}, tileCount: 0, columns: 0, atlasWidth: 0 };

        // 转 Tiled JSON embedded 格式 (Phaser 能吃)
        const embedded = {
          firstgid: ts.firstgid,
          name,
          tilewidth: tileWidth,
          tileheight: tileHeight,
          tilecount: tileCount,
          columns,
          margin: 0,
          spacing: 0,
        };

        // Atlas style: <tileset> 直接子元素 <image>
        const directImage = Array.from(root.children).find((c) => c.tagName === 'image');
        if (directImage) {
          const src = directImage.getAttribute('source');
          const key = `ts_atlas_${name}`;
          this.load.image(key, _resolveUrl(tsxDir, src));
          tsd.imageKey = key;
          embedded.image = src;       // Phaser parser 用 (虽然我们不靠它装 image)
          embedded.imagewidth = parseInt(directImage.getAttribute('width'), 10) || 0;
          embedded.imageheight = parseInt(directImage.getAttribute('height'), 10) || 0;
          tsd.tileCount = tileCount;
          tsd.columns = columns;
          tsd.atlasWidth = embedded.imagewidth;
        }

        // Per-tile <tile id="N"> blocks (image-collection 或 atlas 上加属性都走这里)
        const embeddedTiles = [];
        root.querySelectorAll(':scope > tile').forEach((tileNode) => {
          const id = parseInt(tileNode.getAttribute('id'), 10);
          const tileData = { properties: {} };
          const propsArray = [];
          tileNode.querySelectorAll(':scope > properties > property').forEach((prop) => {
            const pname = prop.getAttribute('name');
            const ptype = prop.getAttribute('type') || 'string';
            const praw = prop.getAttribute('value');
            let pval = praw;
            if (ptype === 'bool') pval = praw === 'true';
            else if (ptype === 'int') pval = parseInt(praw, 10);
            else if (ptype === 'float') pval = parseFloat(praw);
            tileData.properties[pname] = pval;
            propsArray.push({ name: pname, type: ptype, value: pval });
          });
          const imgEl = tileNode.querySelector(':scope > image');
          const tileEntry = { id };
          if (imgEl) {
            const src = imgEl.getAttribute('source');
            const key = `tile_${name}_${id}`;
            this.load.image(key, _resolveUrl(tsxDir, src));
            tileData.imageKey = key;
            tileEntry.image = src;
            tileEntry.imagewidth = parseInt(imgEl.getAttribute('width'), 10) || 0;
            tileEntry.imageheight = parseInt(imgEl.getAttribute('height'), 10) || 0;
          }

          // Per-tile collision shapes (Tiled "Collision Editor"): tile 内部的 objectgroup
          // 里每个 <object> 是一块碰撞 rect。我们只关心 properties.solid === true 的那些。
          // 形状 x/y 是 tile-local top-left 坐标 (跟 tile 内部 0..tileWidth/Height 对齐)。
          const shapes = [];
          tileNode.querySelectorAll(':scope > objectgroup > object').forEach((shapeNode) => {
            let solid = false;
            shapeNode.querySelectorAll(':scope > properties > property').forEach((p) => {
              if (p.getAttribute('name') === 'solid' &&
                  p.getAttribute('value') === 'true') {
                solid = true;
              }
            });
            if (!solid) return;
            shapes.push({
              x: parseFloat(shapeNode.getAttribute('x')) || 0,
              y: parseFloat(shapeNode.getAttribute('y')) || 0,
              width: parseFloat(shapeNode.getAttribute('width')) || 0,
              height: parseFloat(shapeNode.getAttribute('height')) || 0,
            });
          });
          if (shapes.length) tileData.collisionShapes = shapes;

          if (propsArray.length) tileEntry.properties = propsArray;
          embeddedTiles.push(tileEntry);
          tsd.tiles[id] = tileData;
        });
        if (embeddedTiles.length) embedded.tiles = embeddedTiles;

        this.tilesetData.push(tsd);
        newTilesets.push(embedded);
      }

      // 替换 raw tmj 的 tilesets, 重写 cache entry, 让 Phaser 看到全 embedded 视图
      const patchedTmj = { ...rawTmj, tilesets: newTilesets };
      // 用 Phaser tilemap parser 期待的格式塞回 cache (覆盖旧 entry)
      this.cache.tilemap.remove('level');
      this.cache.tilemap.add('level', { format: window.Phaser.Tilemaps.Formats.TILED_JSON, data: patchedTmj });

      // 所有 PNG 排队后, 启动 load。complete 后构建 tilemap + 关卡。
      this.load.once('complete', () => {
        this.map = this.make.tilemap({ key: 'level' });
        // Generate per-tile sub-textures from atlas for object-layer rendering
        for (const tsd of this.tilesetData) {
          if (!tsd.imageKey || tsd.tileCount === 0) continue;
          const tex = this.textures.get(tsd.imageKey);
          if (!tex) continue;
          const src = tex.getSourceImage();
          if (!src) continue;
          const cols = tsd.columns || Math.floor(tsd.atlasWidth / tsd.tileWidth);
          for (let i = 0; i < tsd.tileCount; i++) {
            const key = `tile_${tsd.name}_${i}`;
            if (this.textures.exists(key)) continue;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const c = document.createElement('canvas');
            c.width = tsd.tileWidth;
            c.height = tsd.tileHeight;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src, col * tsd.tileWidth, row * tsd.tileHeight, tsd.tileWidth, tsd.tileHeight, 0, 0, tsd.tileWidth, tsd.tileHeight);
            this.textures.addCanvas(key, c);
          }
        }
        this._buildLevel();
      });
      this.load.start();
    }

    _findTilesetByGid(gid) {
      // 找到 firstgid 最大但仍 <= gid 的 tileset
      let best = null;
      for (const tsd of this.tilesetData) {
        if (tsd.firstgid <= gid && (!best || tsd.firstgid > best.firstgid)) {
          best = tsd;
        }
      }
      return best;
    }

    _buildLevel() {
      // 1. Phaser 注册有 atlas image 的 tileset (供 tile layers 用)
      // 外部 .tsx 时 Phaser 自己 tileWidth=0, 所以传 tsd.tileWidth/tileHeight 覆盖。
      const phaserTilesets = [];
      for (const tsd of this.tilesetData) {
        if (tsd.imageKey) {
          const ts = this.map.addTilesetImage(
            tsd.name,
            tsd.imageKey,
            tsd.tileWidth,
            tsd.tileHeight
          );
          if (ts) {
            phaserTilesets.push(ts);
          } else {
            console.warn(`[preview] addTilesetImage(${tsd.name}) returned null`);
          }
        }
      }

      // 2. tile layers (Phaser 已经把 tile/object 拆开,this.map.layers 全是 tile layer)
      const tileLayers = [];
      for (const layerData of this.map.layers) {
        const layer = this.map.createLayer(layerData.name, phaserTilesets);
        if (layer) {
          // 约定: 设计师在 .tsx 里给需要碰撞的 tile 标 `solid:true`
          layer.setCollisionByProperty({ solid: true });
          tileLayers.push(layer);
        } else {
          console.warn(`[preview] createLayer(${layerData.name}) returned null`);
        }
      }

      // 3. spawn 位置 (找 spawn object,否则地图中心)
      let startX = this.map.widthInPixels / 2;
      let startY = this.map.heightInPixels / 2;
      const objLayers = this.map.objects || [];
      for (const ol of objLayers) {
        for (const obj of ol.objects) {
          if (obj.name === 'spawn' || obj.type === 'spawn') {
            startX = obj.x;
            startY = obj.y;
          }
        }
      }

      // 4. Player
      this.player = this.physics.add.sprite(startX, startY, 'player_south');
      this.player.facing = 'south';
      this.player.setCollideWorldBounds(true);
      this.player.setDepth(10);     // 玩家始终在 tile / object 之上, 避免走进家具时被盖住
      // body 是 sprite 底部的"脚印", 不是整个 sprite。这是 top-down RPG 标准:
      //   - 视觉上 sprite 头/身体可以"压"进墙/家具一点 (头比脚高, 越过桌沿是合理的)
      //   - 真正阻挡移动的是脚
      // 比例 1/2 宽 × 1/4 高 (常规, 不收缩) — 设计师可以靠 Tiled Collision Editor
      // 在家具上画精准 footprint shape 做避让, body 不再代位补偿。永远 ≥ 8px。
      const bodyW = Math.max(8, Math.round(this.player.displayWidth / 2));
      const bodyH = Math.max(8, Math.round(this.player.displayHeight / 4));
      this.player.body.setSize(bodyW, bodyH);
      this.player.body.setOffset(
        Math.round((this.player.displayWidth - bodyW) / 2),
        this.player.displayHeight - bodyH      // 紧贴 sprite 底
      );

      // 5. Phaser anims (一段 frames.animations[state][dir] → 一个 anim key)
      this.animsByDir = {};
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
      this.stateKeys = stateKeys;          // 给 _handleStateReq 按 index 选用
      const findKey = (hints) =>
        stateKeys.find((k) => hints.some((h) => k.toLowerCase().includes(h))) ?? null;
      this.walkingKey = findKey(WALKING_NAME_HINTS);
      this.idleKey = findKey(IDLE_NAME_HINTS);
      this.currentAnimKey = null;

      // 6. Object-layer tile-objects 渲染 + solid 碰撞
      // Tiled tile-object: x/y 是底-左角(也是 rotation 的 pivot)。
      //   - 没旋转: origin 设 (0.5, 0.5), pos 设到 tile 中心 (经典)
      //   - 有旋转 (obj.rotation 单位是度, CW 正): origin 设 (0, 1) 让旋转绕底-左转
      //     这样 Tiled 里看到啥, 我们渲染就一致 (踢脚线、转角靠"旋转一根竖条"画的会对上)
      // 碰撞优先级:
      //   1. tile 的 collisionShapes (Tiled Collision Editor 画的, 每个 shape 上有 solid:true)
      //      → per-shape AABB body (精准: 桌脚 / 墙根)
      //   2. tile properties.solid: true (整 tile 都挡)
      //      → 整 tile 的 AABB body (粗放, 老约定)
      //   3. 都没有 → 无碰撞 (单纯装饰)
      this.solidsGroup = this.physics.add.staticGroup();
      for (const ol of objLayers) {
        // 'walls' object layer 是旧约定 (空 rect 当墙), 放到 7. 处理
        if (ol.name === 'walls') continue;
        for (const obj of ol.objects) {
          if (!obj.gid) continue;   // 非 gid object (rect / polygon / point) 暂不渲
          // Phaser tilemap parser 已经把 Tiled 的 flip 高位 (0x80000000=H, 0x40000000=V,
          // 0x20000000=AntiDiagonal) 脱出来放进 obj.flippedHorizontal/Vertical/AntiDiagonal,
          // 所以 obj.gid 这里是 base gid。**不要**再对它做位运算 (会永远 false)。
          const gid = obj.gid;
          const flipH = !!obj.flippedHorizontal;
          const flipV = !!obj.flippedVertical;
          // 注意: 旋转 90°/270° 在 Tiled 是 H+AD / V+AD; 我们同时支持 obj.rotation
          // 字段(度数, CW), 优先级更明确, 这里 anti-diagonal 暂不单独翻译。
          const tsd = this._findTilesetByGid(gid);
          if (!tsd) continue;
          const localId = gid - tsd.firstgid;
          const tileData = tsd.tiles[localId] ?? {};
          const subKey = `tile_${tsd.name}_${localId}`;
          const imageKey = tileData.imageKey ?? (this.textures.exists(subKey) ? subKey : tsd.imageKey);
          if (!imageKey) {
            console.warn(`[preview] gid ${obj.gid} (${tsd.name}#${localId}): no image key found. Skipping.`);
            continue;
          }
          const rotDeg = obj.rotation || 0;
          const useBottomLeftOrigin = rotDeg !== 0;
          const px = useBottomLeftOrigin ? obj.x : obj.x + obj.width / 2;
          const py = useBottomLeftOrigin ? obj.y : obj.y - obj.height / 2;

          // (a) 永远先渲染视觉
          const img = this.add.image(px, py, imageKey);
          if (useBottomLeftOrigin) img.setOrigin(0, 1);
          if (flipH) img.setFlipX(true);
          if (flipV) img.setFlipY(true);
          if (rotDeg) img.setRotation(rotDeg * Math.PI / 180);

          // (b) 然后按碰撞优先级加 static body (跟视觉分离, body 永远不可见)
          const shapes = tileData.collisionShapes;
          if (shapes && shapes.length) {
            for (const shape of shapes) {
              const bb = _shapeWorldAABB(shape, obj, tsd.tileWidth, tsd.tileHeight, flipH, flipV, rotDeg);
              const cell = this.solidsGroup.create(bb.x + bb.w / 2, bb.y + bb.h / 2, null);
              cell.setSize(bb.w, bb.h).setVisible(false);
              cell.refreshBody();
            }
          } else if (tileData.properties?.solid) {
            const bb = _aabbAfterRotate(obj, rotDeg);
            const cell = this.solidsGroup.create(bb.minX + bb.w / 2, bb.minY + bb.h / 2, null);
            cell.setSize(bb.w, bb.h).setVisible(false);
            cell.refreshBody();
          }
        }
      }
      this.physics.add.collider(this.player, this.solidsGroup);

      // 7. 旧约定 'walls' object layer (空 rect 当 static body)
      const wallsLayer = objLayers.find((ol) => ol.name === 'walls');
      if (wallsLayer) {
        const wallsGroup = this.physics.add.staticGroup();
        for (const obj of wallsLayer.objects) {
          if (obj.width <= 0 || obj.height <= 0 || obj.gid) continue;
          const rect = wallsGroup
            .create(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
            .setSize(obj.width, obj.height)
            .setVisible(false);
          rect.refreshBody();
        }
        this.physics.add.collider(this.player, wallsGroup);
      }

      // 8. tile-layer tile-property `solid:true` (家具也可这么标,虽然这个 scene 没用)
      for (const layer of tileLayers) {
        this.physics.add.collider(this.player, layer);
      }

      // 9. Camera
      this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
      this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
      this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
      this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

      // 10. Input
      this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,E,Z,C,X');

      // X 切 zoom
      this.input.keyboard.on('keydown-X', () => {
        this.zoomIndex = (this.zoomIndex + 1) % ZOOM_LEVELS.length;
        this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
        this._updateInfo();
      });

      this._tilemapReady = true;
      this._updateInfo();
    }

    update() {
      if (!this._tilemapReady || !this.player) return;

      // Touch zoom 单触发 (DOM 按钮 / console pollerWriter 设 true, scene 消费后清)
      if (touch.zoomTrigger) {
        this.zoomIndex = (this.zoomIndex + 1) % ZOOM_LEVELS.length;
        this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
        this._updateInfo();
        touch.zoomTrigger = false;
      }
      // Console state / animation 请求 (LevelPreviewMode 轮询 seq 单调写入)
      if (touch.stateReq) {
        this._handleStateReq(touch.stateReq.value);
        touch.stateReq = null;
      }
      if (touch.animReq) {
        this._handleAnimReq(touch.animReq.value);
        touch.animReq = null;
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
      // forced state 一旦移动就自动清掉, 回 walk 启发式 (录像时不用先 Tab 再走)
      const isMoving = vx !== 0 || vy !== 0;
      if (isMoving && this.forcedStateKey) {
        this.forcedStateKey = null;
        this.forcedPlaying = true;
        this._updateInfo();
      }
      const desiredAnimKey = this._pickAnimKey(isMoving);

      const animChanged = desiredAnimKey !== this.currentAnimKey;
      if (desiredAnimKey) {
        if (animChanged) {
          this.player.play(desiredAnimKey, true);
          this.currentAnimKey = desiredAnimKey;
        }
        // forced state 下尊重 forcedPlaying (Space 切了 pause), 自动模式永远播
        if (this.forcedStateKey) {
          if (this.forcedPlaying) {
            if (this.player.anims.isPaused) this.player.anims.resume();
          } else {
            if (this.player.anims.isPlaying) this.player.anims.pause();
          }
        } else {
          if (this.player.anims.isPaused) this.player.anims.resume();
        }
      } else {
        if (this.currentAnimKey) {
          this.player.stop();
          this.currentAnimKey = null;
        }
        this.player.setTexture(`player_${this.player.facing}`);
      }

      if (facingChanged || animChanged) {
        this._updateInfo();
      }
    }

    // 返回应播的 anim key, 或 null (静帧 fallback)。
    // 优先级: forced state (console 显式选) > 移动启发式 > idle 启发式
    _pickAnimKey(isMoving) {
      const dir = this.player.facing;
      const tryState = (stateKey) => {
        if (!stateKey) return null;
        const dirMap = this.animsByDir[stateKey];
        if (!dirMap) return null;
        return dirMap[dir] ?? dirMap.south ?? null;
      };
      if (this.forcedStateKey) return tryState(this.forcedStateKey);
      if (isMoving) return tryState(this.walkingKey);
      return tryState(this.idleKey);
    }

    /* ──────────────────────────────────────────────────────────────────────
     * Console-driven state / animation control.
     * 跟 sprite_preview 的 _handleState / _handleAnimation 同语义,
     * 区别只是用 Phaser anims API 而非 RAF 自驱。
     * ────────────────────────────────────────────────────────────────────── */

    _handleStateReq(value) {
      if (value === 'clear') {
        this.forcedStateKey = null;
        this.forcedPlaying = true;       // 回到自动模式, 启发式默认播
      } else if (value && value.startsWith('index:')) {
        const idx = parseInt(value.slice(6), 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= this.stateKeys.length) return;
        this.forcedStateKey = this.stateKeys[idx];
        this.forcedPlaying = true;       // 选状态自动开播 (跟 sprite_preview 一致)
      }
      this._updateInfo();
    }

    _handleAnimReq(value) {
      // 仅在 forced state 下生效 (自动模式没有"暂停"概念, 由移动驱动)
      if (!this.forcedStateKey) return;
      if (value === 'toggle_play') {
        this.forcedPlaying = !this.forcedPlaying;
      } else if (value === 'next' || value === 'prev') {
        this.forcedPlaying = false;
        if (this.player.anims.isPlaying) this.player.anims.pause();
        // Phaser 3.80: nextFrame() / previousFrame() 在 paused 状态下能用
        if (value === 'next') this.player.anims.nextFrame();
        else this.player.anims.previousFrame();
      }
      this._updateInfo();
    }

    _updateInfo() {
      if (!this.player || !onInfoUpdate) return;
      const z = ZOOM_LEVELS[this.zoomIndex];
      const zoomLabel = this.zoomIndex === 0 ? '远景' : '近景';
      let animLine;
      if (this.forcedStateKey) {
        const playMark = this.forcedPlaying ? '▶' : '⏸';
        animLine = `anim: <b>${this.forcedStateKey}</b> ${playMark} <span style="color:#f0c674">(forced)</span>`;
      } else if (this.currentAnimKey) {
        animLine = `anim: <b>${this.currentAnimKey.replace('play:', '')}</b> <span style="color:#888">(auto)</span>`;
      } else {
        animLine = 'anim: <i>(static)</i>';
      }
      onInfoUpdate(
        `<div><b>level:</b> ${mapPath}</div>` +
          `<div>player: ${spriteDir} · facing: ${this.player.facing} · zoom: ${z}× (${zoomLabel}, X 切换)</div>` +
          `<div>${animLine}</div>`
      );
    }
  };
}

// 把 baseDir + relPath 合成相对于 web root 的路径 (浏览器自己 normalize ../)
function _resolveUrl(baseDir, relPath) {
  return new URL(baseDir + relPath, window.location.href).pathname.slice(1);
}

// Tiled JSON properties 是 [{name,type,value}, ...] 数组, 转 {name: value} 对象
function _propsFromTiledArray(arr) {
  const obj = {};
  for (const p of arr || []) obj[p.name] = p.value;
  return obj;
}

// 给定 Tiled tile-object {x,y,width,height} 与旋转角度 (度数, CW 正,
// 绕 obj.x/y = 底-左角 转), 返回旋转后视觉占用的 AABB。
// Tiled 里 tile 未旋转时占 (x..x+w, y-h..y); 我们 rotate 这 4 个角再取 min/max。
function _aabbAfterRotate(obj, rotDeg) {
  if (!rotDeg) {
    return { minX: obj.x, minY: obj.y - obj.height, w: obj.width, h: obj.height };
  }
  const a = rotDeg * Math.PI / 180;
  const cs = Math.cos(a), sn = Math.sin(a);
  // 4 角相对 pivot (obj.x, obj.y) 的偏移
  const corners = [
    { dx: 0,          dy: -obj.height },   // top-left
    { dx: obj.width,  dy: -obj.height },   // top-right
    { dx: obj.width,  dy: 0 },             // bottom-right
    { dx: 0,          dy: 0 },             // bottom-left (pivot)
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const x = obj.x + c.dx * cs - c.dy * sn;
    const y = obj.y + c.dx * sn + c.dy * cs;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

// shape: tile-local TL 坐标系下的 rect (Tiled Collision Editor 输出)。
// 返回这个 rect 在世界里被 flip + rotation 变换后的 AABB。
// tileW/H 是 tile 像素大小; obj 是放在地图里的 tile-object (x,y = 底-左角)。
function _shapeWorldAABB(shape, obj, tileW, tileH, flipH, flipV, rotDeg) {
  // shape 4 角, tile-local TL 坐标
  let pts = [
    { x: shape.x,                y: shape.y },
    { x: shape.x + shape.width,  y: shape.y },
    { x: shape.x + shape.width,  y: shape.y + shape.height },
    { x: shape.x,                y: shape.y + shape.height },
  ];
  // flipH: 横向镜像 (绕 tile 中线 x = tileW/2)
  if (flipH) pts = pts.map((p) => ({ x: tileW - p.x, y: p.y }));
  // flipV: 纵向镜像 (绕 tile 中线 y = tileH/2)
  if (flipV) pts = pts.map((p) => ({ x: p.x, y: tileH - p.y }));
  // 转成相对 pivot (origin 在 tile-local 底-左 = (0, tileH))
  let rel = pts.map((p) => ({ x: p.x, y: p.y - tileH }));
  // 旋转
  if (rotDeg) {
    const a = rotDeg * Math.PI / 180;
    const cs = Math.cos(a), sn = Math.sin(a);
    rel = rel.map(({ x, y }) => ({ x: x * cs - y * sn, y: x * sn + y * cs }));
  }
  // 平移到世界 (pivot 世界坐标 = obj.x, obj.y)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of rel) {
    const wx = obj.x + x, wy = obj.y + y;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
