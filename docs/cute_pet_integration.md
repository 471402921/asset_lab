# cute_pet 集成说明 (asset-lab → cute_pet 契约)

> ⚠️ **状态: DRAFT — 暂不适合发给 cute_pet 工程师执行**
>
> asset-lab 的 schema 仍在迭代,本文记录当前快照,但**不要据此开始改 cute_pet 仓代码**。等下面 readiness gates 全绿后,asset-lab 这边会主动通知,届时本横幅删除,本文转为正式契约。
>
> ## Readiness gates(都过才发布)
>
> - [ ] Wang tileset `.tsx` 生成跑通(Tiled 里能切到 tile 模式编辑,而非只 image layer overlay)
> - [ ] 至少一次 furniture 完整流程验证: 设计师在 Tiled 里摆家具 + per-tile collision → cute_pet 端能识别
> - [ ] 至少 2-3 张真实 pixellab 地图过 converter,确认 schema 没漏字段
> - [ ] sprite NPC 在 Tiled 关卡里摆位流程跑通(`--sprites` 生成的 .tsx 真用一次)
> - [ ] `terrain-info.json` 字段够用 — 或确认了"哪些字段是 reference-only,哪些是 cute_pet 真要消费的"
> - [ ] Tiled object layer 命名(`walls` / `furniture`)经过真使用,不再变
> - [ ] audio / effects 章节(§1, §3.x)由真资源验证过格式,不是脑补
>
> **当前 known-unstable 区**:
> - 资源路径表里的 furniture / items / ui / audio 部分(§1)
> - flame_tiled Dart 示例的 furniture 处理(§3.1)
> - terrain-info.json 的字段集合(§4)
> - cute_pet 改动清单(§6)的具体顺序和粒度
>
> 当前 known-stable 区:
> - asset-lab → Tiled 的转换架构(parsers / IR / writers 分层)
> - .tmx 里 image layer + `walls` object layer 的基本结构
> - sprite 目录结构(`assets/sprites/{name}/{rotations,metadata.json}`)
> - 资源更新流程的高层闭环(§5)

---

## 0. TL;DR

asset-lab 现在产出的关卡格式是 **标准 Tiled .tmx**,cute_pet 用 **`flame_tiled` 包** 一行加载。地图视觉是 image layer,墙体碰撞是 object layer (`name="walls"`),家具碰撞由 Tiled 的 per-tile collision 描述、走 `name="furniture"` object layer 引用。地形语义信息 (哪格是地板/哪格是 void) 在 sidecar `terrain-info.json` 里,可选读取(只为脚步声 / 材质特效之类用)。

```
asset-lab 仓 (asset 源)              cute_pet 仓 (Flame 游戏)
─────────────────────────            ───────────────────────────
assets/maps/*.tmx           ───►    flame_tiled.TiledComponent.load()
assets/tilesets/*.tsx + PNG  ───►    (.tmx 自动 follow .tsx 引用)
assets/sprites/*.tsx + PNG   ───►    image collection, NPC 摆位用
assets/audio/{music,sfx}/    ───►    Flame 的 AudioPool / FlameAudio
docs/cute_pet_integration.md ←───   本文,cute_pet 工程师按此实施
```

---

## 1. 资源路径约定

asset-lab 仓约定的发布路径(cute_pet 端 pubspec.yaml 直接声明这些目录即可):

| asset-lab 路径 | 内容 | cute_pet 用途 |
|---|---|---|
| `assets/maps/{name}.tmx` | Tiled 关卡文件 | `TiledComponent.load('maps/{name}.tmx', ...)` |
| `assets/tilesets/{name}/{name}.tsx` | (未来) wang tilemap 的 Tiled tileset 定义 | .tmx 自动引用 |
| `assets/tilesets/{name}/composite.png` | pixellab 渲染好的关卡整图 | image layer 引用 (.tmx 里 `<imagelayer>`) |
| `assets/tilesets/{name}/tiles/*.png` | 原始 wang tileset 图块 | 现 MVP 不直接用,留着供未来切到 tile-based 编辑 |
| `assets/tilesets/{name}/terrain-info.json` | **每格是什么地形** (哪格是 void / 地板) | 可选: 脚步声、材质特效查询 |
| `assets/tilesets/furniture/furniture.tsx` + PNG | 家具 image collection + per-tile collision | .tmx 引用,放进 `furniture` object layer |
| `assets/tilesets/items/items.tsx` + PNG | 道具 image collection | (未来) 业务摆放,不进 .tmx |
| `assets/tilesets/ui/ui.tsx` + PNG | UI 图块 | 不进 .tmx,GetX 直接管 |
| `assets/sprites/{name}/metadata.json` | pixellab 角色元数据 | cute_pet 不读这个 (asset-lab 自用) |
| `assets/sprites/{name}/rotations/{dir}.png` | 角色 8 方向 PNG | cute_pet 直接读 (或通过 `{name}.tsx`) |
| `assets/sprites/{name}/{name}.tsx` | Tiled image collection,8 个 tile,带 `direction` property | 在 Tiled 里把 NPC 摆进关卡时用 |
| `assets/audio/music/*.mp3` | 背景音乐 | `FlameAudio.bgm.play(...)` |
| `assets/audio/sfx/*.mp3` | 音效 | `FlameAudio.play(...)` |

**所有路径都是相对 cute_pet `assets/` 根的**(参见 §6 pubspec.yaml 配置)。

---

## 2. Tiled 约定

### 2.1 Object layers (.tmx 内)

| Layer name | 内容 | cute_pet 处理 |
|---|---|---|
| `walls` | 静态墙体 collision rects (asset-lab converter 自动从 pixellab void 格子生成) | 遍历 → 加 `RectangleHitbox` PositionComponent |
| `furniture` | 设计师在 Tiled 里摆放的家具 tile object (含 gid + 位置) | 遍历 → 加载 tile 对应 sprite + per-tile collision |
| (其它 layer) | 未来扩展 (interactive, npc_spawn 等) | 按 layer name 派发处理 |

### 2.2 Tile properties

| Property name | 出现位置 | 含义 | cute_pet 处理 |
|---|---|---|---|
| `direction` | sprite tilesets (`{name}.tsx` 里每 tile) | "south" / "north-east" / 等 8 方向之一 | 选 NPC 朝向时按需 query |
| `terrain` (未来) | tilemap tilesets (wang) | terrain ID 对应字符串名 | 配合 terrain-info.json 用 |
| `walkable` (未来) | tilemap / furniture tiles | "true" / "false" | pathfinding / 走路判定 |

### 2.3 Image layer

| Layer name | 内容 | cute_pet 处理 |
|---|---|---|
| `background` | pixellab 渲染好的关卡整图 (composite.png) | flame_tiled 自动渲染,无需手动处理 |

---

## 3. flame_tiled 加载示例

### 3.1 最小可跑

```dart
import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flame_tiled/flame_tiled.dart';

class MyGame extends FlameGame with HasCollisionDetection {
  @override
  Future<void> onLoad() async {
    final tiledMap = await TiledComponent.load(
      'maps/pixellab_demo_001.tmx',
      Vector2.all(32),  // tile size
    );
    add(tiledMap);

    // walls collision
    final wallsLayer = tiledMap.tileMap.getLayer<ObjectGroup>('walls');
    if (wallsLayer != null) {
      for (final obj in wallsLayer.objects) {
        add(WallComponent(
          position: Vector2(obj.x, obj.y),
          size: Vector2(obj.width, obj.height),
        ));
      }
    }

    // furniture collision (designer 在 Tiled 里加进去后)
    final furnitureLayer = tiledMap.tileMap.getLayer<ObjectGroup>('furniture');
    if (furnitureLayer != null) {
      for (final obj in furnitureLayer.objects) {
        // obj.gid 引用 tileset 里的 tile, 含 per-tile collision
        // 具体怎么取 collision 见 flame_tiled docs
        add(FurnitureComponent(/* ... */));
      }
    }
  }
}

class WallComponent extends PositionComponent with CollisionCallbacks {
  WallComponent({required super.position, required super.size});

  @override
  Future<void> onLoad() async {
    add(RectangleHitbox()..collisionType = CollisionType.passive);
  }
}
```

### 3.2 Player + collision

```dart
class Player extends PositionComponent with CollisionCallbacks {
  Player() : super(size: Vector2.all(32), position: Vector2(100, 100));

  @override
  Future<void> onLoad() async {
    add(RectangleHitbox()..collisionType = CollisionType.active);
  }

  @override
  void onCollision(Set<Vector2> intersectionPoints, PositionComponent other) {
    if (other is WallComponent) {
      // 撞墙: 回退、阻止移动等
    }
  }
}
```

---

## 4. terrain-info.json schema

每个关卡对应一份 `assets/tilesets/{name}/terrain-info.json`,**可选读取**。用途:cute_pet 想查"角色当前脚下是什么地形"时用,例如:

- 木地板上播木质脚步声
- void 上掉血或掉落
- 草地特效(踩草动画)

```json
{
  "tileSize": 32,
  "width": 19,
  "height": 19,
  "terrains": {
    "1": "black void, empty dark background",
    "2": "beige diamond tile floor, ...",
    "3": "cream tile floor, beige ceramic",
    "4": "grey oak hardwood floor, ..."
  },
  "wallsTerrainId": 1,
  "grid": [
    [2, 2, 2, 2, 1, 1, 1, 1, 2, ...],
    ...
  ]
}
```

- `grid[row][col]` = terrain ID at that cell
- 字符串名是 pixellab 原 prompt,不稳定;**不要用字符串匹配**,**用 ID 查询**
- `wallsTerrainId` 跟 .tmx 里 walls object layer 的来源一致

Dart 加载示例:
```dart
final terrainInfo = jsonDecode(await rootBundle.loadString(
  'assets/tilesets/pixellab_demo_001/terrain-info.json'
)) as Map<String, dynamic>;
final grid = terrainInfo['grid'] as List;
int terrainAt(int worldX, int worldY) {
  final col = worldX ~/ (terrainInfo['tileSize'] as int);
  final row = worldY ~/ (terrainInfo['tileSize'] as int);
  return grid[row][col] as int;
}
```

---

## 5. 资源更新流程

```
设计师在 pixellab 改地图 / sprite
   ↓
导出到 asset-lab 仓 temporary_asset/  (workflow buffer)
   ↓
设计师跑 python3 tools/pixellab_to_tiled.py --map-input ... --name ...
   ↓
asset-lab converter 输出 assets/maps/*.tmx + assets/tilesets/{name}/* + sprite .tsx
   ↓
设计师 git commit + push asset-lab
   ↓
cute_pet 工程师 git pull asset-lab (或 submodule update / rsync)
   ↓
cute_pet hot reload — flame_tiled 重新加载 .tmx,无需改一行 Dart 代码
```

**关键**: asset-lab schema 变化(资源类型新增 / 路径调整 / property 命名规范) **由本文档变更通知**,cute_pet 工程师订阅本文 git 历史。

---

## 6. cute_pet 端需要的改动清单

> 由 cute_pet 工程师执行,本文只列项,不替你写 Dart 代码。

### 6.1 依赖
```yaml
# cute_pet/pubspec.yaml
dependencies:
  flame: ^1.22.0
  flame_tiled: ^1.20.0   # 版本以 pub.dev 最新为准
```

### 6.2 资源声明(假设 asset-lab 同仓 / submodule / rsync 到 cute_pet/assets/)
```yaml
flutter:
  assets:
    - assets/maps/
    - assets/tilesets/      # 包含递归 (Flutter 默认)
    - assets/sprites/
    - assets/audio/music/
    - assets/audio/sfx/
```

### 6.3 旧 _template 资源清理
- 删 `assets/{sprites,items,effects}/_template/` (asset-lab plan §8.2 已标 DEPRECATED)
- 删 cute_pet 自己写的旧 sprite loader / 旧关卡 schema 解析 (用 flame_tiled 替代)

### 6.4 集成 collision 系统
- `FlameGame with HasCollisionDetection` (或 `HasQuadTreeCollisionDetection` 大地图)
- 角色 / 家具 / 墙体都用 `RectangleHitbox` / `PolygonHitbox`
- 详见 §3 示例

### 6.5 关卡加载流程骨架
- `LevelLoader` 类: 按 level name 调 `TiledComponent.load(...)`
- 提取 `walls` / `furniture` object layer 生成对应 components
- 可选: 同步加载 `terrain-info.json`

---

## 7. 版本与兼容性

- **现状**: 没有正式 schema 版本号。**asset-lab 仓的 git commit hash = 资源 schema 的版本号**
- cute_pet 在自己仓 `pubspec.yaml` 注释或 README 标注当前对接的 asset-lab commit
- asset-lab 这边有破坏性 schema 变更时,会:
  1. 在本文加 "## 修订记录" 章节
  2. README / CLAUDE.md 顶部加显眼提示
  3. cute_pet 工程师按本文 diff 升级
- 未来增长到一定规模,会引入 `schema_version` 字段 (写入 .tmx 的 map property 或 sidecar JSON)

---

## 8. 范围边界(asset-lab 不替 cute_pet 做的事)

- ❌ Flutter / Dart 代码 — 全部由 cute_pet 工程师写
- ❌ pubspec.yaml — 让 cute_pet 工程师按 §6.2 自行声明
- ❌ Flame component 设计 (PlayerComponent / FurnitureComponent 等具体类) — cute_pet 自决
- ❌ 业务逻辑 (背包 / 任务 / NPC AI / 游戏存档) — cute_pet 范畴
- ❌ 性能优化 (大地图 quad tree、collision 分组等) — cute_pet 范畴

---

## 9. 反馈渠道

cute_pet 工程师如果发现:
- 本文档跟实际产物对不上
- 某个 Tiled 约定不够用 (希望加新 property / object type)
- 加载流程踩坑

请直接在 asset-lab 仓提 issue / 改 spec PR,asset-lab 这边校对后落实(可能需要改 converter)。
