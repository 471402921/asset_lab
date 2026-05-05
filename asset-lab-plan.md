# asset-lab 开发计划

> 状态: **可执行**。本文是 asset-lab 仓库的完整开发参考,新 workspace / 新 Claude / 新工程师拿到本文 + pixellab 账号即可开工。
> 由 sprite-lab-proposal.md 演化而来,经多轮讨论收口。
> 落点: 暂存 cute_pet 根目录;asset-lab 立仓后随之搬过去,本文留 cute_pet 内做决策记录。

---

## 修订记录

- **2026-05-05 (later same day) pipeline 进一步收窄**: 设计师反馈 pixellab Map Editor / 关卡编辑都很难用,决定**只用 pixellab 出基础 PNG 元素 + 角色 sprite**,**地图和关卡完全在 Tiled 里画并导出 .tmx**。asset-lab 范围相应收窄到三件事:
  - **基于 GitHub 的资源文件管理** (`assets/` 目录,设计师拖拽资源 + git 版本)
  - **pixellab sprite → Tiled `.tsx` 转换** (CLI 仅剩 `--sprites` 一个模式)
  - **Web 端 sprite 预览** (含 8 方向 + 缩放;状态切换槽位预留待实装)
  - **删除**: `tools/converters/pixellab/parse_map.py`、`tools/converters/tiled/write_tmx.py`、IR 的 `TileMap / ImageLayer / ObjectLayer / MapObject`,以及 e2e 演示产物 `assets/maps/pixellab_demo_001.tmx`、`assets/tilesets/pixellab_demo_001/*`
  - **未删**: `tools/converters/` 分层架构(parser/IR/writer 三段),即便现在只剩 sprite 一条 pipeline,架构本身保留。未来加新 source/target 仍按本文 §14.3 的契约扩展
  - **新增**: `modes/sprite_preview.js` + `keymap.js` 加 STATE SLOT 注释槽位 — 设计师未来要在 web 端模拟宠物各种状态(健康/受伤/睡觉等),等 pixellab 状态导出 schema 定型后实装
  - 本次变更不涉及目录结构。`assets/` 子目录约定由设计师定(她在 Tiled 里习惯什么布局就用什么),asset-lab 跟随
- **2026-05-05 引入 Tiled, asset-lab 收缩定位**: 设计师从 pixellab Map Editor 导出第一份真实 tilemap 后,发现"自己造关卡编辑器"的方向是重造 Tiled 轮子。重决:
  - **关卡编辑器: Tiled (stock,不二开)**。设计师 `brew install --cask tiled`,在 Tiled 里拖拽编辑 .tmx
  - **关卡 schema: Tiled .tmx 标准** (放弃自定义 entity-unified JSON)
  - **asset-lab 新定位**: pixellab 资源 → Tiled 可消费格式的转换桥 (`tools/pixellab_to_tiled.py`) + sprite 八方向键盘交互预览。仅此两件事
  - **删除**: level_preview / level_loader / map_loader / item/ui/effect/audio loaders / level_001.json / 自定义 entity 类型表
  - **新增**: `tools/converters/` 分层架构 (parser → IR → writer);`docs/cute_pet_integration.md` 给 cute_pet 工程师的契约
  - **目录**: `temporary_asset/` 升到仓根 (workflow buffer,内容 .gitignore);`assets/tilesets/`、`assets/maps/(.tmx)` 取代之前的 `assets/{items,ui,maps(.png),tilemaps}/`
  - **家具 collision**: 由 Tiled per-tile collision shape 处理 (Tiled .tsx 自带能力),不再发明 sidecar metadata.json
  - 本文以下章节标 ⚠️ DEPRECATED 的部分已被实际实现替代;以新增的 §14 和 README / CLAUDE.md / docs/cute_pet_integration.md 为准
  - ⚠️ **同日 later 部分被进一步收窄**: pixellab Map Editor 转换路径删除,见上一条修订记录
- **2026-05-04 术语对齐**: "场景 / scene" 被拆分为两个不重叠概念以消除歧义。
  - **关卡 / level** = 多资源组合(顶层 JSON,目录 `levels/`)。曾用名 "场景 / scene"。
  - **地图 / map** = 全图背景资源类型(目录 `assets/maps/`,pixellab `create_map` 生成)。曾用名 "scene(背景)"。
  - level JSON 取消顶层 `background` 字段,**地图作为 `{"type":"map"}` entity** 与 sprite/item/ui 平级,数组顺序即 z-order。
  - 代码层 `scene_loader / scene_preview / scene_bg_loader / SCENE_KEYMAP` → `level_loader / level_preview / map_loader / LEVEL_KEYMAP`。
  - 本文以下章节已就地更新,历史措辞可在 git history 检索 "scene"。
  - ⚠️ **2026-05-05 后部分被推翻**: `levels/` 目录、entity-unified JSON schema 已废弃,关卡用 Tiled .tmx。但 "level" 一词作为 "关卡" 概念仍保留(对应 .tmx 文件本身)。

---

## 0. TL;DR(决议摘要)

| 项 | 决议 |
|---|---|
| 工具定位 | 独立轻量 Web 工具,**两条主线: sprite 键盘交互预览 + 关卡编排** |
| 与 pixellab 关系 | pixellab 生成"零件"(Tier 3 团队订阅 + MCP),asset-lab 负责"预览交互 + 关卡编排",分工不重复 |
| 资源覆盖 | 7 类(sprite / item / ui / map / effect / tilemap / audio),除字体外全要 |
| 技术栈 | 纯 HTML + Vanilla JS + Canvas 2D,零构建零依赖 |
| 仓库位置 | 独立 repo `asset-lab`,不混入 cute_pet |
| 运行方式 | **必须本地 server**(`python3 -m http.server` / `npx serve` / VS Code Live Server)。**双击 index.html 不行**(file:// 协议下 fetch metadata.json 会被 CORS 拒绝) |
| 浏览器要求 | 推荐 Chrome / Edge 122+(File System Access API 需要);Safari/Firefox 降级到下载按钮 |
| 数据契约 | sprite 类跟随 pixellab `metadata.json`(完整样本见 §13);关卡另用自定义 `levels/level_xxx.json` |
| 设计师 | 1 人;后续多人时各自 fork,不做团队 git workflow |
| pixellab 订阅 | **Tier 3 Pixel Architect $50/mo**(含 team collaboration + 20 并发任务 + MCP 完整额度) |
| game_meta.json | asset-lab 不实装;**槽位预留在 cute_pet**;未来按需 vibe-code 长出编辑 UI |
| cute_pet 通用 loader | defer 到第一个 sprite 真要进 cute_pet 时再做 |
| 编辑能力增长策略 | MVP 只读;按设计师真实痛点 vibe-code 长(CC 改 ~30~80 行/能力) |

---

## 1. 背景

设计师正在用 [pixellab.ai](https://www.pixellab.ai/) 产 sprite/items/maps/tilesets。pixellab 强项: AI 生成 + 单 sprite 内置预览。短板:

- 不做关卡编排(把多个资源摆成一张关卡)
- 不做 sprite **交互**预览(键盘控制方向/动画切换/状态对比)
- 不做项目级资源管理(已有什么、版本、组织)

cute_pet(asset-lab 的下游消费者)是生产框架(Flutter+GetX+Flame),链路太长,不适合调试。需要一个中间层工具填这三个空。

→ asset-lab 填这三个空。pixellab 负责"零件",asset-lab 负责"预览 + 编排",git 负责"管理"。

---

## 2. 职责分工

```
设计师产能链路:
  [pixellab MCP/Web]  →  [asset-lab]  →  [git repo]  →  [cute_pet]
   生成 + 单图预览       多图交互预览     版本管理      运行时消费
                       关卡编排
```

**pixellab 做的(asset-lab 不复刻)**:
- AI 生成各类资源
- 单 sprite 8 方向 + 动画 preview(Characters 模块自带)
- 资源导出 metadata.json + pngs

**asset-lab 做的(pixellab 不做)**:
- 键盘控制 sprite 状态(切方向、播/停动画、对比 idle/walk 切换手感)
- 多资源同屏预览(sprite 站背景上 + 道具围绕 + UI 叠层)
- 关卡编辑(声明式 JSON,设计师 + CC 维护)

**git 做的**:
- 资源版本管理(asset-lab 仓本身 = 资源 + 关卡 + 工具一起)

---

## 3. 资源类型矩阵

> ⚠️ **2026-05-05 后已被 §14 取代**。Tiled 接管 tilemap、furniture、items、ui 的 schema。本节保留作历史决策上下文。

| 类型 | MVP? | 数据来源 | loader 复杂度 | 备注 |
|---|---|---|---|---|
| sprite(角色) | ✅ | pixellab metadata.json + pngs | 低 | 已有 husky chibi 样本 |
| item(道具) | ✅ | pixellab,大概率单 PNG | 极低 | |
| ui(按钮/图标/边框) | ✅ | pixellab 或手画,单 PNG / 9-slice | 低~中 | 9-slice 渲染稍复杂 |
| map(全图地图) | ✅ | pixellab `create_map` 生成完整图 | 极低 | 单 PNG 直接显示, 在关卡 JSON 中以 `{"type":"map"}` entity 出现 |
| effect(特效) | ✅ | pixellab,帧序列 PNG | 中 | 跟 sprite 动画机制共用 |
| tilemap(地图) | ⚠️ TBD | **待问设计师工具**(Tiled / pixellab tileset 自切 / 手切) | 100~500 行(差距 5×) | 工具确定后做,不阻塞 |
| audio(音效/音乐) | ✅ | DAW,.mp3/.wav | 低 | `<audio>` + 键盘绑定播放 |
| font(字体) | ❌ | - | - | 跳过 |

**tilemap 的开发节奏**: 不阻塞 MVP,设计师确认工具后单独加。loader 是插件式,加新类型不动 core。

### 3.1 metadata.json 实例参考

pixellab 导出的 metadata.json 真实样本(完整 schema 见 §13 附录):

```json
{
  "character": {
    "id": "3d7a1c84-...",
    "name": "husky, chibi 3-head-body ratio...",
    "size": { "width": 60, "height": 60 },
    "directions": 8,
    "view": "low top-down"
  },
  "frames": {
    "rotations": {
      "south": "rotations/south.png",
      "south-east": "rotations/south-east.png",
      "east": "rotations/east.png",
      "north-east": "rotations/north-east.png",
      "north": "rotations/north.png",
      "north-west": "rotations/north-west.png",
      "west": "rotations/west.png",
      "south-west": "rotations/south-west.png"
    },
    "animations": {}
  },
  "export_version": "2.0"
}
```

**关键约定**:
- 8 方向命名固定: `south / south-east / east / north-east / north / north-west / west / south-west`(asset-lab 键盘映射照搬,**不翻译成 N/E/S/W**)
- 每个方向 = 一张独立 PNG,**不是 sprite sheet**
- `animations` 现为空。等设计师产动画后,推测格式是 `animations/{name}/{frame_index}.png` 或 `animations/{name}.png` —— **首次看到真动画样本时确认并落进 §13**
- `export_version` 启动时检查,不认识就报错(不硬猜兼容)

---

## 4. 技术栈

### 4.1 核心选择

**纯 HTML + Vanilla JS + Canvas 2D**(已决议)。

- 零构建、零依赖
- CC 改纯 JS 比改 Flutter/p5/Phaser 直觉,vibe-code 体验最优
- 拒绝引入: 任何 npm 包、任何 framework、任何构建步骤

**浏览器文件写入**(关卡 JSON 维护、未来 game_meta 编辑器需要):
- 首选 [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)(Chromium 系)→ 直接写回设计师选定的文件
- 降级: 下载按钮(浏览器存到 Downloads,设计师手动拖回)

### 4.2 像素纯度配置(P0,缺一就糊)

pixel art 默认会被浏览器双线性滤波糊掉。**两条都必须有**:

```javascript
// JS 侧
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
```

```css
/* CSS 侧 */
canvas {
  image-rendering: pixelated;          /* Chrome/Edge/Safari */
  image-rendering: -moz-crisp-edges;   /* Firefox */
  image-rendering: crisp-edges;        /* spec */
}
```

**默认缩放 4×**: 60×60 sprite 在 240×240 viewport 显示,细节看清楚。可在 keymap 里 `+/-` 调缩放,但**只允许整数倍**(2× / 3× / 4× / 6× / 8×),非整数倍会破坏像素纯度。

### 4.3 浏览器支持

| 能力 | Chrome/Edge 122+ | Safari 17+ | Firefox 124+ |
|---|---|---|---|
| Canvas 2D + 像素纯度 | ✅ | ✅ | ✅ |
| 键盘 / 拖拽 | ✅ | ✅ | ✅ |
| File System Access API(直接写文件) | ✅ | ❌ | ❌ |
| 降级方案(下载按钮) | ✅ | ✅ | ✅ |

→ **推荐设计师用 Chrome 或 Edge**(写关卡 JSON 体验最好)。其它浏览器降级到"导出 → 下载 → 手动放回"。

### 4.4 如何启动(file:// CORS 陷阱)

**不能直接双击 index.html** —— 浏览器对 `file://` 协议下的 `fetch('metadata.json')` 会拒绝(CORS)。设计师会看到一片空白和 console error,以为工具坏了。

**必须用本地 HTTP server,3 选 1**:

```bash
# 选项 A: Python(macOS 自带)
cd asset-lab && python3 -m http.server 8000
# 浏览器访问 http://localhost:8000

# 选项 B: Node(如果已装)
cd asset-lab && npx serve

# 选项 C: VS Code 插件(对设计师最友好)
# 装 "Live Server" 扩展 → 右键 index.html → "Open with Live Server"
```

→ 推荐选项 C,设计师用 VS Code + Claude Code 时一键搞定,无 terminal 摩擦。

---

## 5. 仓库结构

> ⚠️ **2026-05-05 后已被 §14.2 取代**。本节描述的 `levels/`、`assets/{items,ui,tilemaps}/`、`core/level_loader.js`、`modes/level_preview.js` 等已删除。

```
asset-lab/
├── index.html              # 入口,模式选择 + canvas + 提示框
├── core/                   # 通用基础设施
│   ├── renderer.js         # Canvas 渲染:多 entity (含 map) 顺序叠加 (关像素平滑)
│   ├── input.js            # 键盘事件 + 提示框生成
│   ├── level_loader.js     # 读 levels/level_xxx.json
│   ├── version_guard.js    # 检查 metadata.json export_version
│   └── file_writer.js      # File System Access API + 下载按钮降级 (MVP 不实装)
├── loaders/                # 每类资源一个加载器(扩展槽)
│   ├── sprite_loader.js    # MVP: pixellab metadata.json
│   ├── item_loader.js      # MVP: 单 PNG
│   ├── ui_loader.js        # MVP: 单 PNG / 9-slice
│   ├── map_loader.js       # MVP: 单 PNG (全图地图, pixellab create_map)
│   ├── effect_loader.js    # MVP: 帧序列
│   ├── audio_loader.js     # MVP: <audio>
│   └── tilemap_loader.js   # 占位 + README "等格式定再实装"
├── modes/                  # 两条主线
│   ├── sprite_preview.js   # 单 sprite 键盘交互预览
│   └── level_preview.js    # 多资源关卡预览 (entity 统一模型)
├── assets/                 # 设计师投放区(同构 cute_pet/assets/)
│   ├── sprites/
│   │   └── husky_chibi/    # 种子样本(从设计师 pixellab 导出搬入)
│   │       ├── metadata.json
│   │       └── rotations/{south,south-east,...}.png
│   ├── items/
│   ├── ui/
│   ├── maps/               # 全图地图 PNG
│   ├── effects/
│   ├── tilemaps/           # 瓦片地图, loader 暂未实装
│   └── audio/
├── levels/                 # 关卡编排 JSON (entity 统一模型)
│   └── level_001.json      # 示例关卡
├── keymap.js               # 键盘绑定 + 默认资源选择
├── .mcp.json               # pixellab MCP 配置(见 §12)
├── CLAUDE.md               # 给 CC 的护栏 + vibe-code 指引
├── README.md               # 给设计师的入门(怎么启动、怎么放资源)
└── .gitignore              # node_modules/ .DS_Store /tmp/ 等
```

---

## 6. MVP 范围

> ⚠️ **2026-05-05 后部分被推翻**: §6.2 "Level 预览模式" 整段废弃(Tiled 接管)。§6.1 "Sprite 预览模式" 仍有效,且就是当前 `modes/sprite_preview.js` 的实装。

**两条主线 day-1 都要能跑**。

### 6.1 Sprite 预览模式

- 加载 `assets/sprites/{name}/metadata.json`(pixellab 格式)
- §3.1 提到的 8 方向 + animations 都加载
- 默认 4× 缩放(60×60 sprite 看清细节)
- 显示当前 sprite 的 character.name / size / view 在屏幕一角

**默认 keymap(写在 `keymap.js`)**:

```javascript
export const SPRITE_KEYMAP = {
  // 8 方向(用 pixellab 原始字符串,零翻译)
  'KeyW': { action: 'face', value: 'north' },
  'KeyD': { action: 'face', value: 'east' },
  'KeyS': { action: 'face', value: 'south' },
  'KeyA': { action: 'face', value: 'west' },
  'KeyQ': { action: 'face', value: 'north-west' },
  'KeyE': { action: 'face', value: 'north-east' },
  'KeyZ': { action: 'face', value: 'south-west' },
  'KeyC': { action: 'face', value: 'south-east' },

  // 动画控制
  'Space':       { action: 'animation', value: 'toggle_play' },
  'BracketLeft': { action: 'animation', value: 'prev' },
  'BracketRight':{ action: 'animation', value: 'next' },
  // 1~9 在加载后动态绑到 frames.animations 的 key

  // 缩放(整数倍)
  'Equal':  { action: 'zoom', value: '+1' },
  'Minus':  { action: 'zoom', value: '-1' },
  'Digit0': { action: 'zoom', value: 'reset' },  // 回到 4×

  // 切 sprite(若 assets/sprites/ 下有多个)
  'Tab':       { action: 'sprite', value: 'next' },
  'ShiftLeft': { action: 'sprite', value: 'prev' },
};

export const ANIMATION_DEFAULT_FPS = 8;  // 真 fps 是 game_meta 范畴,defer
```

- 提示框自动从 keymap 读出 "按 X = Y" 列表(`core/input.js` 负责)

### 6.2 Level 预览模式

- 加载 `levels/level_xxx.json`,按 entities 数组顺序渲染(包括 map)
- 切换关卡: keymap 数字键(F1~F9 或 Cmd+1~9)
- 设计师改 JSON → 浏览器刷新即生效

**level.json schema(MVP, entity 统一模型)**:

```json
{
  "entities": [
    { "type": "map",    "asset": "maps/forest_clearing.png" },
    { "type": "sprite", "asset": "sprites/husky_chibi", "x": 120, "y": 200, "facing": "south", "animation": "idle" },
    { "type": "item",   "asset": "items/bone.png",      "x": 180, "y": 220 },
    { "type": "ui",     "asset": "ui/dialogue_frame.png", "x": 0, "y": 400 }
  ]
}
```

- 顶层只有 `entities[]`,**没有特例化的 background 字段** —— 地图是一种 entity,与 sprite/item/ui 平级
- z-order = entities 数组顺序(后写的盖前面)。约定 map 放第一项作为底层
- `x/y` = 左上角坐标(浏览器 Canvas 习惯);`map` 类型铺满整个 canvas,忽略 x/y
- `facing/animation` 仅 sprite 类型用
- 资源路径相对 `assets/`

### 6.3 不做(MVP 边界)

- ❌ 任何编辑 UI(MVP 只读;编辑能力按设计师痛点 vibe-code 长)
- ❌ 物理 / 碰撞 / 动画状态机
- ❌ 多关卡互相跳转 / 触发器
- ❌ 自己的 sprite/asset 生成(那是 pixellab 的事)
- ❌ 团队协作工具(单设计师,git CLI 即可)
- ❌ 自己的 manifest schema(pixellab 是上游)

---

## 7. 设计师工作流

```
1. clone asset-lab repo                                  # 一次,5 分钟
2. VS Code 装 "Live Server" 扩展(可选,推荐)             # 一次
3. 在 pixellab 生成资源(Web 或通过 CC + MCP,见 §12)
4. 把 pixellab 导出目录拷进 assets/{type}/{name}/
5. 在 VS Code 里右键 index.html → Open with Live Server  # 浏览器自动打开
6. 选 sprite 预览 / level 预览模式
7. 键盘交互看效果(8 方向 / 动画 / 切关卡)
8. 想改关卡: 跟 CC 说 "把 husky 往左挪 50" → CC 改 levels/*.json → 浏览器自动刷新
9. 想加新能力: 跟 CC 说 "加个动画速度滑块" → CC 写 ~50 行 → 刷新
10. 满意 → git commit && git push
11. 资源进 cute_pet → 由 cute_pet 工程师拷 assets/{type}/{name}/ 进对应仓
```

---

## 8. 与 cute_pet 的对接(asset-lab 不依赖,只是契约)

asset-lab **不依赖** cute_pet 任何代码,可独立开发。但两边有数据契约要对齐:

- **sprite 资源约定** → 严格跟随 pixellab metadata.json(asset-lab 和 cute_pet 都读同一份)
- **game_meta.json sidecar**(未来) → asset-lab 不实装,槽位预留在 cute_pet 那边;字段细节等首个 sprite 真要进 cute_pet 时再敲
- **关卡 JSON schema** → asset-lab 维护;cute_pet 未来读同一份(届时 asset-lab 是 source of truth)

### 8.1 Entity 类型的责任边界

level JSON 里七种 entity 类型不全是 asset-lab 的"核心",只有一部分是。其它的属于 **设计意图参考**(给 cute_pet 工程师看尺寸 / 位置参照用,不是 source of truth)。

| Entity type | source of truth | asset-lab 角色 | cute_pet 角色 |
|---|---|---|---|
| `map`    | asset-lab (level JSON) | 渲染、设计师在此摆位 | 按 asset-lab 的位置加载 |
| `sprite` | asset-lab (level JSON) | 渲染、键盘交互预览 | 按 asset-lab 的位置加载 |
| `item`   | **cute_pet 运行时**(背包 / 掉落 / 合成业务) | 仅做视觉参考(让 cute_pet 工程师知道大概尺寸 / 摆放感) | 真实位置由游戏逻辑(GetX state)决定,不读 level JSON 里的 x/y |
| `ui`     | **cute_pet 运行时**(对话框 / 按钮叠层) | 同上 | 同上 |
| `effect` | **cute_pet 运行时**(技能 / 拾取等触发) | 同上 | 同上 |
| `audio`  | **cute_pet 运行时** | 不在 level 渲染(loader 仅供未来扩展) | 由游戏逻辑触发播放 |

含义:
- 设计师在 `levels/level_001.json` 写 `{"type":"item", "x":180, "y":220}` —— 是在告诉 cute_pet 工程师"这个 item 大概该长这样、放在这个位置",**不是关卡运行时的真实摆放契约**
- cute_pet 工程师可以参考这个示意,但实现时按业务逻辑(玩家位置、背包状态等)动态决定真实位置
- asset-lab 渲染这些 entity 仍按 JSON 写的 x/y 摆位,所见即所得 —— 但要记住这只是"设计意图视图"

### 8.2 cute_pet 端的具体策略(asset-lab 不需要关心,留给 cute_pet 维护者):
- cute_pet 不预建 sprite loader,等首个 sprite 真接入时再实装(YAGNI)
- cute_pet 现 `assets/{sprites,items,effects}/_template/` 是 pixellab 决议**之前**的旧 schema,已在 cute_pet 内部标 DEPRECATED;真重做与首个 pixellab 资源进入 cute_pet 是同一原子动作

---

## 9. CC 护栏(asset-lab/CLAUDE.md 大纲)

设计师跟 CC chat 时,CC 要遵守:

- **零构建**: 不引 npm 包,不加 webpack/vite,不引 React/Vue/任何 framework
- **不动上游 schema**: pixellab metadata.json 是上游契约,不能改字段语义
- **level JSON 简单优先**: 加字段前问设计师,避免 schema 漂移
- **vibe-code 增长**: 设计师说"加个 X" → 优先选 ~50 行能搞定的方案,不大刀阔斧
- **不引擎化**: 不要把 asset-lab 长成 Phaser/p5(那是 cute_pet 的事)
- **像素纯度铁律**: 任何 Canvas 渲染代码都必须保证 `imageSmoothingEnabled = false` + CSS `image-rendering: pixelated`,缩放只允许整数倍
- **未来 game_meta 编辑器**: 字段定下时先跟设计师确认,再加 UI

---

## 10. 执行清单(asset-lab 仓建好后照着做)

> ⚠️ **2026-05-05 后已不准**:实际执行经历了多轮 schema 调整(scene→level/map→Tiled adoption),本清单记录原始意图,不反映现状。当前实装见 §14。

- [ ] **1. 立独立仓库** `asset-lab`(GitHub,公开/私有按需);加 .gitignore(`node_modules/ .DS_Store .vscode/ tmp/`)
- [ ] **2. 把本文从 cute_pet 搬过来**作为 asset-lab/PLAN.md(或合并进 README.md)
- [ ] **3. 配 pixellab MCP**(见 §12),设计师 Claude Code 验证 `create_character` 能跑
- [ ] **4. 首版骨架**: `index.html` + `core/{renderer,input,level_loader,version_guard,file_writer}.js` + `loaders/sprite_loader.js` + `modes/sprite_preview.js` + `keymap.js`
- [ ] **5. 设计师把 husky chibi 从 pixellab 导出,放进 `assets/sprites/husky_chibi/`**(seed 资源)
- [ ] **6. 跑通 sprite 预览**: husky chibi 加载 + 8 方向键盘切换 + 动画播放(若动画为空,先跑通方向)
- [ ] **7. 验证像素纯度**: 4× 缩放下 sprite 边缘锐利无锯齿模糊;改 zoom 只能整数倍
- [ ] **8. 加 level_loader + level_preview + 一个示例关卡** `levels/level_001.json`(map + 一只 husky + 一个道具)
- [ ] **9. 填其余 loader**: item / ui / map / effect / audio
- [ ] **10. 写 CLAUDE.md(§9 大纲展开)+ README.md(§7 工作流 + §4.4 启动方式)**
- [ ] **11. 设计师试用 + 反馈 + vibe-code 迭代**
- [ ] **12. (异步)追问设计师 tilemap 工具,加 tilemap_loader**
- [ ] **13. (cute_pet 侧,非 asset-lab 仓事)首个 sprite 真要进 cute_pet 时,触发"原子重做"动作链:删 _template 旧内容 → 按 pixellab 重建 → 重写 pixel-foundation.md → 删 deprecation 警告 → 实装 sprite loader**

---

## 11. 不做的事(范围漂移防线)

- ❌ 在 cute_pet 加任何 asset-lab 相关代码
- ❌ 让 asset-lab 依赖 Dart/Flutter
- ❌ asset-lab 写 CI/lint(它是调试工具,不是产品)
- ❌ 复刻 pixellab 的生成能力
- ❌ 字体预览
- ❌ 多设计师 git workflow
- ❌ asset-lab 进化成游戏引擎(状态机/物理/触发器都不要)
- ❌ 非整数倍 zoom(破坏像素纯度)
- ❌ 自己设计 sprite/items 的 schema(pixellab 是 source of truth)

---

## 12. pixellab MCP 配置

让设计师在 Claude Code 里直接说"做一只 husky"就能调 pixellab 生成。

### 12.1 准备

1. 注册 [pixellab.ai](https://www.pixellab.ai/signup),订阅 **Tier 3 Pixel Architect**($50/mo,含 team collaboration + 20 并发 + MCP 完整额度)
2. 在 pixellab 用户中心拿到 **API Token**(Bearer token 形式)
3. 设计师装 Claude Code(macOS / Windows / Linux 均可)

### 12.2 配置 Claude Code

pixellab 提供 [官方交互式配置](https://www.pixellab.ai/vibe-coding) —— **优先用这个**,会自动生成正确的 `.mcp.json`。

如要手动配,在 asset-lab 仓根目录建 `.mcp.json`(参考格式,以 pixellab 官方文档为准):

```json
{
  "mcpServers": {
    "pixellab": {
      "url": "https://api.pixellab.ai/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PIXELLAB_API_TOKEN"
      }
    }
  }
}
```

⚠️ **安全**: API Token 不能进 git。`.mcp.json` 应进 `.gitignore`,提供 `.mcp.json.example` 作为模板。

### 12.3 验证

在 asset-lab 目录开 Claude Code,试一句:

```
@pixellab create_character husky chibi 3-head-body ratio big eyes 60x60 8 directions
```

CC 应该调 pixellab MCP,返回 character_id;再用 `get_character {id}` 拿到生成结果。

### 12.4 暴露的工具(供设计师参考)

pixellab MCP 主要工具(完整列表见 [pixellab MCP docs](https://api.pixellab.ai/mcp/docs)):

- `create_character` — 生成 4/8 方向角色
- `animate_character` — 给已有角色加动画(walk/run/idle 等)
- `create_tileset` — Wang tileset
- `create_isometric_tile` — 等距瓦片
- `create_image_pixflux` / `create_image_bitforge` — 通用图像生成

**注意**: pixellab MCP 只暴露**生成**类工具,不能"列出我已经做过的 sprite"。**已生成资源的管理靠 git**(本仓自己)。

---

## 13. 附录: 完整 metadata.json 样本(pixellab 真实导出)

来自设计师手上的 husky chibi 角色(`export_version: 2.0`):

```json
{
  "character": {
    "id": "3d7a1c84-484e-4257-85ad-0ef93069cf50",
    "name": "husky, chibi 3-head-body ratio, chubby baby proportions, big...",
    "prompt": "husky, chibi 3-head-body ratio, chubby baby proportions, b...",
    "size": {
      "width": 60,
      "height": 60
    },
    "template_id": "mannequin",
    "directions": 8,
    "view": "low top-down",
    "created_at": "2026-05-03T05:15:03.192982+00:00"
  },
  "frames": {
    "rotations": {
      "south": "rotations/south.png",
      "south-east": "rotations/south-east.png",
      "east": "rotations/east.png",
      "north-east": "rotations/north-east.png",
      "north": "rotations/north.png",
      "north-west": "rotations/north-west.png",
      "west": "rotations/west.png",
      "south-west": "rotations/south-west.png"
    },
    "animations": {}
  },
  "export_version": "2.0",
  "export_date": "2026-05-04T00:58:21.135030"
}
```

**对应文件结构**:

```
assets/sprites/husky_chibi/
├── metadata.json
└── rotations/
    ├── south.png       # 60×60 px 单帧
    ├── south-east.png
    ├── east.png
    ├── north-east.png
    ├── north.png
    ├── north-west.png
    ├── west.png
    └── south-west.png
```

**字段使用提示**:
- `character.size` → Canvas 渲染尺寸(原始 60×60,4× 缩放后绘 240×240)
- `character.directions` → 验证用(应等于 frames.rotations 的 key 数)
- `character.view` → 暂未使用,但建议在 UI 角落显示(`low top-down` 提示设计师该角色透视类型)
- `frames.rotations[key]` → 相对 metadata.json 的路径,直接 `<img src>` 加载
- `frames.animations` → 当前为空。**首次拿到非空样本时**(设计师做了走路动画后),立即更新 §3.1 和本附录,标注真实结构(目前推测 `animations/{name}/{frame_idx}.png` 或 `animations/{name}.png`)
- `export_version` → 启动时检查;`"2.0"` 通过,其它报错 `Unknown pixellab export_version: X. asset-lab 仅支持 2.0,请升级 loader`

---

## 14. 当前实装(2026-05-05 起,Tiled 引入 + 范围进一步收窄后)

⚠️ 以下内容**取代** §3 的 entity-unified 模型、§5 的旧目录结构、§6 的 level preview 部分。§13 sprite 部分仍有效。

### 14.1 实际运行的三件事

1. **基于 GitHub 的资源文件管理** — `assets/` 目录由设计师拖拽资源 + git 版本管理,asset-lab 不做特殊处理
2. **pixellab sprite → Tiled `.tsx` 转换** — Python CLI,只剩 `--sprites` 一个模式
3. **浏览器 sprite preview** — 纯 vanilla JS,8 方向 + 缩放;状态切换槽位预留待实装

地图和关卡编辑由设计师在 **Tiled** 里直接做并导出 `.tmx`,asset-lab 不参与转换。pixellab 在工作流里只产基础 PNG 元素 + 角色 sprite。cute_pet 用 `flame_tiled` 加载 `.tmx`。

### 14.2 当前目录结构

```
asset_lab/
├── assets/                   # 设计师投放区, 子目录约定由设计师定 (跟随 Tiled 工程惯例)
│   ├── maps/                 # 设计师从 Tiled 导出的 .tmx + 引用的 PNG
│   ├── tilesets/             # 设计师在 Tiled 里建的 .tsx + tile PNG (基础 PNG 来自 pixellab)
│   ├── sprites/{name}/       # pixellab character: metadata.json + rotations/ + .tsx
│   └── audio/{music,sfx}/
├── temporary_asset/          # workflow buffer, 内容 .gitignore
├── tools/
│   ├── pixellab_to_tiled.py  # CLI, 只剩 --sprites
│   └── converters/{ir.py, pixellab/parse_sprite.py, tiled/write_tsx.py}
├── docs/cute_pet_integration.md  # 给 cute_pet 工程师的契约 (DRAFT)
├── modes/sprite_preview.js   # 含 STATE SLOT 注释槽位
├── core/{renderer,input,version_guard}.js
├── loaders/{sprite_loader,_image}.js
├── keymap.js                 # 只剩 SPRITE_KEYMAP, 含 STATE SLOT 注释
└── index.html                # 只挂 sprite preview
```

### 14.3 Converter 分层架构(为换源/换目标解耦)

```
[pixellab character export] → parsers/pixellab/parse_sprite.py → IR.Sprite → writers/tiled/write_tsx.py → .tsx
```

- IR (`tools/converters/ir.py`) 是工具无关 dataclass:**目前只有** `Sprite` / `SpriteFrame`(原 `TileMap` 等已删,因 pixellab Map Editor 不在 pipeline 内)
- parsers MUST 输出 IR,**不**直接拼 XML
- writers MUST 消费 IR,**不**读 pixellab 原始格式
- parsers 和 writers 互不 import

虽然现在只有一条 sprite pipeline,**分层契约不能塌方**。它是给"未来加新 source / target 时不重构"准备的(例如 pixellab v2、别的工具、Phaser format 等)。详细见 `tools/converters/README.md`。

### 14.4 Tiled 约定

| 约定 | 含义 | 谁产 |
|---|---|---|
| sprite `.tsx` 里 tile property `direction` | "south" / "north-east" / 等 8 方向 | asset-lab converter |
| `<objectgroup>`、`<imagelayer>`、tile collision、custom properties 等 | 关卡视觉、碰撞、家具摆放、地形语义 | 设计师在 Tiled 里直接画 |

asset-lab 不再约束 .tmx 的 layer 命名(原"walls / furniture"约定的 source of truth 转移到设计师那边)。cute_pet 端约定见 `docs/cute_pet_integration.md`(DRAFT,等设计师约定稳定后同步)。

### 14.5 STATE SLOT(未实装)

设计师未来希望在 web 端模拟 sprite 的所有状态(宠物状态多: 健康/受伤/睡觉/开心 等)。等 pixellab 状态导出 schema 定型后再实装。代码槽位已预留在:

- `modes/sprite_preview.js` 顶部 STATE SLOT 注释块 + `this.state` 字段 + `_dispatch` 'state' 分支(目前 warn)
- `keymap.js` STATE SLOT 注释段(取消注释 + 加具体绑定)
- `loaders/sprite_loader.js`(等 metadata 出 states 字段时挂出来)

实装步骤(等触发):
1. 拿到 pixellab 真实状态导出样本,更新本节 + §13 schema 章节
2. sprite_loader.js 加 states 解析
3. keymap.js 真添加状态切换键(Digit1..Digit9 之类)
4. sprite_preview.js `_dispatch` 实装 'state',`_render` 按 state 选 frame,`_showInfo` 显示 state

### 14.6 不做的事(2026-05-05 后新增)

- ❌ 重造 Tiled (关卡编辑全部交给 Tiled)
- ❌ 自定义 level JSON schema(.tmx 即 schema)
- ❌ pixellab Map Editor → .tmx 转换(已删除,设计师直接在 Tiled 画)
- ❌ Tiled 二开 / fork
- ❌ 浏览器内的关卡预览(Tiled 自带)
- ❌ 替 cute_pet 写 Flutter / Dart 代码(只出 spec)
- ❌ effect / audio 类型转换(等真有资源 + 格式确认)
- ❌ 预先抽象 IR 类型(只有真实下游消费场景才加)
- ❌ 强制 `assets/` 子目录布局(设计师定)

---

> **本文已 ready,可直接搬进新 asset-lab 仓做开发参考**。
> 落地后建议在 asset-lab/PLAN.md 顶部加一行:"Originated from cute_pet/asset-lab-plan.md commit <hash>",方便回溯决策上下文。
> cute_pet仓库地址：https://github.com/471402921/cute_pixel/tree/main
