# preview/

⚠️ **临时拐杖 (TEMPORARY SCAFFOLD)**

本目录是 asset-lab 的**关卡运行时预览**模块,引入 [Phaser 3](https://phaser.io) (CDN lazy-load) 让设计师在浏览器里立刻 "走一走" 自己刚导出的 .tmj。

## 为什么是临时

asset-lab 的长期定位 (plan §14.1) 是 **三件事**:GitHub 资源管理、sprite → Tiled 转换、sprite 八方向预览。**关卡运行时不在三件事里**。

引入 preview/ 是因为:
- 设计师改完 .tmj 想立刻玩, cute_pet 当前业务太重 (登录 / 后端 / GetX 等), 不适合每次改资源都跑
- cute_pet 工程师**有意识等 schema 稳定**才把 Tiled 工作流集成进主项目
- asset-lab 是中转轻量架构, 临时承担"过渡期玩游戏"的角色是合理的

## 拆除条件

cute_pet 工程师在 `cute_pet/lib/demo/level_preview.dart` 写出 minimal demo entry (~200 行 Dart, 仅加载 .tmj + 玩家走 + 撞墙, 不连后端) 并跑通后, **本目录整体拆掉**, 不维护双份。

拆除时:
- `git rm -r preview/`
- `index.html` 移除 `level preview` 模式按钮 + 改回单一 sprite preview entry (回退到 commit `295918b` 风格)
- `docs/cute_pet_integration.md` 把 "asset-lab preview runtime" 相关章节标 ARCHIVED
- README / CLAUDE / plan §14.7 加 "已拆除" 注释, 保留作历史决策记录

## 范围(严格框死)

✅ 做:
- 加载 .tmj (Tiled JSON)
- 支持外部 .tsx 引用 (Embed Tilesets 可勾可不勾):自动 fetch + parse XML + 解析 atlas 与 image-collection
- 渲染 tile layers + object-layer 里的 gid tile-objects (家具、装饰、墙)
- **honor Tiled tile-object 旋转** (`obj.rotation` 度数, CW, 绕底-左 pivot) 和翻转 (`obj.flippedHorizontal/Vertical`); atlas 的 sub-tile 也能在 object layer 渲染 (lissy 加的 sub-tile 切片)
- 玩家 N 方向移动 (WASD / +QEZC, 跟 sprite 一致), Arcade Physics 矩形碰撞
- **碰撞两种来源都认**:
  - per-tile collision shape (Tiled "Collision Editor" 画的 rect/ellipse, shape 上加 `solid:true`) — 支持 flip + rotation 后的 AABB,**精准且推荐**
  - tile 级 property `solid:true` — 整 tile 当 body,fallback / 老约定
- tile layer collision 同样走 `solid:true`(整列墙壁纸标 solid 可挡人)
- 兼容旧约定 `walls` object layer (空 rect 当墙, 已有的 .tmj 不改也跑)
- 相机两档 zoom + 跟随玩家
  - 桌面:`[2, 4]`,默认 2× 远景
  - **手机:`[1, 2]`,默认 1× 原图大小** (检测同 sprite_preview 的 `(pointer: coarse), (max-width: 900px)` media query;手机走 `Phaser.Scale.RESIZE` 让 canvas 跟视口 1:1)
- 缺 .tmj / 缺 sprite → 友好空态, 不启动 Phaser

❌ 不做:
- 业务逻辑 / 状态机 / 任务 / 对话 / 背包 / NPC AI
- sprite 状态切换 UI (sprite_preview 那边逐个看, level preview 只自动播 walking/idle)
- 多关卡切换 UI (`?map=xxx.tmj` 是逃生口, 不做按钮)
- NPC sprite 渲染 (设计师在 Tiled 摆的 NPC tile 暂不识别, 等真有 sprite NPC 再加)
- 触发器 / 场景跳转
- 音频
- Matter Physics (任意 polygon collision) — Arcade 矩形 + 旋转后 AABB 够

## 文件

- `main.js` — single file, 包含 LevelPreviewMode (lifecycle, lazy load Phaser, 空态) + PreviewScene factory (Phaser scene 逻辑, 玩家, collision, camera)

刻意单文件,不切成 scene.js / player.js — preview 是临时拐杖,不该过度组织。

## 设计师工作流

1. 在 Tiled 编辑关卡 (.tmj + 引用的 .tsx tilesets, 内部图集或 image-collection 都可)
2. **导出 .tmj** (File > Save As, 选 .tmj 格式; 或 File > Export As > JSON map files (*.tmj))
3. .tsx 可外部引用 (preview 自动 fetch),也可勾 Embed Tilesets (Map > Map Properties),两种 preview 都支持
4. **碰撞**:首选 Tiled "Collision Editor" (右键 tile → Tile Collision Editor) 画形状(rect 或 ellipse), 形状的 properties 加 `solid: true` (bool)。同一 tile 可有多个形状,只标 solid 的那部分挡玩家(例如柜子的脚印挡,柜身不挡)。也可用老路径:在 tile properties 直接加 `solid:true` 让整 tile 都挡。
5. **旋转**:在 Tiled 里选中 tile-object 按 R(或 Object → Rotate)旋转 ±90°/180°,preview 会按 `obj.rotation` (绕底-左角) 渲染并把碰撞 AABB 也跟着转。**⚠️ Tiled 的 H/V 翻转跟旋转是两回事**:翻转是给 tile 本身镜像,旋转是把放下后的实例转方向。
6. 保存到 `assets/scenes/{name}/{name}.tmj` (现行默认走 `preview/main.js` 的 `DEFAULT_MAP` 常量,目前指 `assets/scenes/test2/untitled.tmj`),.tsx 放 .tmj 同目录,引用的 PNG 放 `assets/{tile,items,wall,...}/` 对应分类
7. 浏览器开 `index.html`, 切到 "level preview" tab → 立刻能玩。手机上同 URL 自动走 1:1 像素 + DPad

## 已知坑

- **走路动画**: 玩家移动时按 sprite `frames.animations` 启发式找 `walk` state 播帧,缺方向 fallback 到 south。停止时若 sprite 有 `idle`/`stand`/`breath` 段则播放,否则静帧。
- **NPC 不渲染**: Tiled 里摆的 sprite tile object 暂不认 (object 渲染只走 tile-image,sprite-as-tile 概念未支持)
- **Phaser 已经把 .tmj 高位 flip bit 脱掉**,放在 `obj.flippedHorizontal/Vertical/AntiDiagonal`。**不要**对 `obj.gid` 再做 `& 0x80000000` (永远 false)。详见用户记忆 `feedback_tiled_phaser_parsing_gotchas.md`

## 给后续维护者

加新功能前问自己: **这个能力 cute_pet 接手后会重做一遍吗?** 如果是,不在 preview 里做(浪费心智)。如果只是 preview 自己用,不传给 cute_pet 也无所谓 — 加的话保持轻量,避免拖累 "拆除" 的难度。
