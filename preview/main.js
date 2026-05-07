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
 *   - 非 gid 类型的 object (rectangle / polygon 区域、trigger 等) — 当前只识别 gid 对象
 */

const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js';
const DEFAULT_MAP = 'assets/scenes/test2/untitled.tmj';
const DEFAULT_SPRITE_DIR = 'assets/sprites/yellow_Shiba';

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

    if (this.levelTouch) this._wireTouchUI(spriteMeta);
  }

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
      //   - 视觉上 sprite 头/身体可以"压"进墙/家具一点 (头比脚高一截, 越过桌沿是合理的)
      //   - 真正阻挡移动的是脚 — 走进 32px 间距的家具缝是 OK 的, 不会被 60×60 卡死
      // 比例选 1/3 宽 × 1/5 高 (chibi 比例: 头大身大脚小, 脚印很窄), 永远 ≥ 8px。
      const bodyW = Math.max(8, Math.round(this.player.displayWidth / 3));
      const bodyH = Math.max(8, Math.round(this.player.displayHeight / 5));
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

          if (tileData.properties?.solid) {
            // 静态 body 是 AABB, 旋转后用旋转后的 4 角 bbox
            const sprite = this.solidsGroup.create(px, py, imageKey);
            if (useBottomLeftOrigin) sprite.setOrigin(0, 1);
            if (flipH) sprite.setFlipX(true);
            if (flipV) sprite.setFlipY(true);
            if (rotDeg) sprite.setRotation(rotDeg * Math.PI / 180);
            const bb = _aabbAfterRotate(obj, rotDeg);
            sprite.body.setSize(bb.w, bb.h);
            // refreshBody 会读 sprite.getTopLeft + displaySize 算 body 位置
            // 旋转 sprite 的 getTopLeft 是旋转后视觉左上, 跟 AABB 不一致 → 手动 set
            sprite.refreshBody();
            sprite.body.position.set(bb.minX, bb.minY);
            sprite.body.updateCenter();
          } else {
            const img = this.add.image(px, py, imageKey);
            if (useBottomLeftOrigin) img.setOrigin(0, 1);
            if (flipH) img.setFlipX(true);
            if (flipV) img.setFlipY(true);
            if (rotDeg) img.setRotation(rotDeg * Math.PI / 180);
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

      const animChanged = desiredAnimKey !== this.currentAnimKey;
      if (desiredAnimKey) {
        if (animChanged) {
          this.player.play(desiredAnimKey, true);
          this.currentAnimKey = desiredAnimKey;
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
    _pickAnimKey(isMoving) {
      const dir = this.player.facing;
      const tryState = (stateKey) => {
        if (!stateKey) return null;
        const dirMap = this.animsByDir[stateKey];
        if (!dirMap) return null;
        return dirMap[dir] ?? dirMap.south ?? null;
      };
      if (isMoving) return tryState(this.walkingKey);
      return tryState(this.idleKey);
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
