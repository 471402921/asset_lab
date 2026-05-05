# cute_pet 集成说明 (asset-lab → cute_pet 契约)

> ⚠️ **状态: DRAFT — 暂不适合发给 cute_pet 工程师执行**
>
> asset-lab 的范围与设计师 Tiled 工作流约定都还在收敛,本文记录当前快照,**不要据此开始改 cute_pet 仓代码**。等下面 readiness gates 全绿后,asset-lab 这边会主动通知,届时本横幅删除,本文转为正式契约。
>
> ## Readiness gates(都过才发布)
>
> - [ ] 设计师在 Tiled 里完成 1-2 张真实关卡,layer 命名 / tile property / object 命名等约定稳定下来(本 doc §3 由此填实)
> - [ ] 第一只完整 sprite 跑通: pixellab → `assets/sprites/{name}/` → `python3 tools/pixellab_to_tiled.py --sprites` 出 `.tsx` → 设计师在 Tiled 里把 NPC 摆进 .tmj
> - [ ] **asset-lab `preview/` 临时拐杖跑通真实 .tmj**: 设计师能在浏览器里 "走起来", walls + 家具 collision 正常 (验证 Tiled 端约定 + .tmj 格式可用)
> - [ ] cute_pet 工程师在 cute_pet 仓写出 `lib/demo/level_preview.dart` minimal entry, 跑通同一份 .tmj — **此时 asset-lab `preview/` 拆除**, 本 doc 把 preview runtime 章节标 ARCHIVED
> - [ ] `assets/` 子目录最终布局由设计师敲定(本 doc §1 由此填实)
> - [ ] audio 文件命名 / 目录约定经过 1-2 个真音效验证(本 doc §1 audio 部分由此填实)
> - [ ] sprite STATE SLOT 实装(如果设计师真要做状态切换),本 doc 加 sprite state property 约定
>
> **当前 known-unstable 区**:
> - `assets/` 子目录布局(§1)— 等设计师按 Tiled 工程惯例定型
> - .tmj 内 layer 命名 / object 类型 / tile property 约定(§3)— 等设计师做完真关卡;asset-lab `preview/` 临时拐杖目前默认约定 `walls` object layer + tile property `collides:true`, cute_pet 接手时若改命名,本 doc 同步
> - flame_tiled 加载示例(§4)— 大方向稳定,但具体 layer name 要等 §3 约定填实
> - cute_pet 改动清单粒度(§6)
>
> **当前 known-stable 区**:
> - asset-lab 不产 .tmj(关卡) — 设计师在 Tiled 里直接画并导出 (Embed Tilesets)
> - asset-lab 产 sprite `.tsx`(image collection,8 方向 tile 带 `direction` property)
> - sprite 目录结构(`assets/sprites/{name}/{rotations,metadata.json}`)
> - cute_pet 用 `flame_tiled` 加载 .tmj(标准 Flame 生态用法,跟 .tmx 等价但更轻)
> - 资源更新流程的高层闭环(§5)
> - **关卡格式: .tmj** (不是 .tmx; Phaser 默认吃, flame_tiled 也支持, 统一一种格式)

---

## 0. TL;DR

asset-lab 是 cute_pet 的资源**git 仓**,内含:
- 设计师在 **Tiled** 里画的关卡 `.tmj` + 引用的 PNG (Embed Tilesets)
- pixellab 角色 sprite + asset-lab 自动生成的 sprite `.tsx`(供 Tiled 引用)
- 音频文件
- (临时) `preview/` Phaser 关卡运行时, 设计师浏览器里能"走一走", 等 cute_pet 工程师做出 demo entry 后拆除

cute_pet 用 `flame_tiled` 一行加载 .tmj,collision / sprite 摆位等都按 Tiled 标准方式自动跟随。**asset-lab 不替 cute_pet 写 Dart**,本文是 cute_pet 工程师的 spec 参考。

```
asset-lab 仓 (asset 源)               cute_pet 仓 (Flame 游戏)
─────────────────────────             ───────────────────────────
设计师在 Tiled 编辑 .tmj       ────►  flame_tiled.TiledComponent.load()
asset-lab 产 sprite .tsx       ────►  Tiled 关卡里摆 NPC 自动认识
asset-lab preview/ 浏览器跑 ── (临时, cute_pet 接手 demo entry 后拆除)
docs/cute_pet_integration.md   ◄────  本文,cute_pet 工程师按此实施
```

---

## 1. 资源路径约定

> ⚠️ 子目录最终布局**由设计师定**(她在 Tiled 工程里习惯什么布局,asset-lab 跟随)。下表是当前预期,gate 1/5 落地后会校正。

| asset-lab 路径 | 内容 | 来源 | cute_pet 用途 |
|---|---|---|---|
| `assets/maps/{name}.tmj` | Tiled 关卡 (Embed Tilesets) | 设计师在 Tiled 导出 | `TiledComponent.load('maps/{name}.tmj', ...)` |
| `assets/maps/` 下 / `assets/tilesets/` 下 PNG | .tmj 引用的 tile / 背景图 | 设计师 (pixellab 出基础 PNG 元素 → 设计师拼) | flame_tiled 自动加载 |
| `assets/tilesets/*.tsx` | Tiled tileset 定义(如不 embed) | 设计师在 Tiled 里建 | flame_tiled 自动 follow .tmj 引用 |
| `assets/sprites/{name}/metadata.json` | pixellab 角色元数据 | pixellab 导出 | cute_pet **不直接读**(asset-lab 自用) |
| `assets/sprites/{name}/rotations/{dir}.png` | 角色 8 方向 PNG | pixellab 导出 | (通过 .tsx 间接用) |
| `assets/sprites/{name}/{name}.tsx` | Tiled image collection,8 个 tile,带 `direction` property | **asset-lab converter 生成** | 在 Tiled 里把 NPC 摆进关卡时引用,cute_pet 加载 .tmj 时自动认识 |
| `assets/audio/music/*.mp3` | 背景音乐 | 设计师 / 第三方 | `FlameAudio.bgm.play(...)` |
| `assets/audio/sfx/*.mp3` | 音效 | 设计师 / 第三方 | `FlameAudio.play(...)` |

所有路径相对 cute_pet `assets/` 根(参见 §6 pubspec.yaml)。

---

## 2. asset-lab 与 cute_pet 的边界

| 谁负责 | 内容 |
|---|---|
| **pixellab** | 生成基础 PNG 元素(地形 tile / 家具 / UI 单图)+ 角色 sprite 8 方向 + (未来) 状态/动画帧 |
| **asset-lab** | git 资源管理 + sprite `.tsx` 转换 + sprite web 预览 |
| **设计师 + Tiled** | 拼地图 / 配 collision / 摆 NPC / 关卡编辑 / 导出 .tmj |
| **cute_pet** | 用 `flame_tiled` 加载 .tmj + 业务逻辑 + 状态机 + 音频播放 + 玩家输入 |

asset-lab **不**做的:
- 不产 .tmj(设计师产)
- 不写 Dart 代码(cute_pet 工程师按本文写)
- 不约束 .tmj 内的 layer 命名 / tile property(设计师 + cute_pet 协议,asset-lab 转述)

---

## 3. Tiled 约定(由设计师定,本节为占位待填)

> ⚠️ 等设计师做完 1-2 张真实关卡后,本节填实。当前是预期方向。

设计师在 Tiled 里编辑关卡时,需要跟 cute_pet 工程师约定:
- 哪个 object layer 是墙体 collision? (建议名: `walls`)
- 哪个 object layer 是家具 / 装饰? (建议名: `furniture` / `decorations`)
- tile property 命名? (例: `walkable`、`material`、`collision_shape`)
- sprite `.tsx` 摆进关卡时用什么 layer? (建议: object layer `npc_spawn`)
- 触发器 / 互动点用什么类型? (例: `<object type="trigger">` 带 properties)

asset-lab 这边在 sprite `.tsx` 上**已确定**的 property:
- `direction`: "south" / "north-east" / 等 8 方向之一(每 tile 一个)

其它由设计师 + cute_pet 工程师拍定后回填本节。

---

## 4. flame_tiled 加载示例(占位待填)

> ⚠️ 具体 layer 名要等 §3 约定填实后才能写实例。下面给出**通用骨架**,cute_pet 工程师按设计师实际产出的 .tmj 修改 layer 名。

```dart
import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flame_tiled/flame_tiled.dart';

class MyGame extends FlameGame with HasCollisionDetection {
  @override
  Future<void> onLoad() async {
    final tiledMap = await TiledComponent.load(
      'maps/{level_name}.tmj',
      Vector2.all(32),  // tile size, 跟 Tiled 工程一致
    );
    add(tiledMap);

    // 按设计师约定的 layer name 取 collision
    final wallsLayer = tiledMap.tileMap.getLayer<ObjectGroup>('walls');
    if (wallsLayer != null) {
      for (final obj in wallsLayer.objects) {
        add(WallComponent(
          position: Vector2(obj.x, obj.y),
          size: Vector2(obj.width, obj.height),
        ));
      }
    }

    // 按设计师约定 NPC 摆位 layer 取 sprite
    final npcLayer = tiledMap.tileMap.getLayer<ObjectGroup>('npc_spawn');
    if (npcLayer != null) {
      for (final obj in npcLayer.objects) {
        // obj.gid 引用 sprite .tsx 里的 tile, tile property 含 direction
        // 加载 sprite, 按 direction 渲染初始朝向, 业务逻辑接管移动
      }
    }
  }
}
```

详细 Flame collision API 见 [Flame collision detection docs](https://docs.flame-engine.org/latest/flame/collision_detection.html)。

---

## 5. 资源更新流程

```
设计师在 Tiled / pixellab 改东西
   ↓
设计师 git push asset-lab (改 .tmj / sprite / audio 直接 commit)
   ↓
cute_pet 工程师 git pull asset-lab (或 submodule update / rsync)
   ↓
cute_pet hot reload — flame_tiled 重读 .tmj, 无需改一行 Dart 代码
```

如果设计师加了**新 sprite**,设计师本地多跑一步:
```bash
python3 tools/pixellab_to_tiled.py --sprites
git add assets/sprites/{name}/{name}.tsx
```

---

## 6. cute_pet 端需要的改动清单

> 由 cute_pet 工程师执行,本文只列项,不替你写 Dart 代码。粒度等本 doc 出 stable 版本时收紧。

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
    - assets/tilesets/
    - assets/sprites/
    - assets/audio/music/
    - assets/audio/sfx/
```

### 6.3 旧 _template 资源清理
- 删 `assets/{sprites,items,effects}/_template/` (asset-lab plan §8.2 已标 DEPRECATED)
- 删 cute_pet 自己写的旧 sprite loader / 旧关卡 schema 解析(用 flame_tiled 替代)

### 6.4 集成 collision 系统
- `FlameGame with HasCollisionDetection`(或 `HasQuadTreeCollisionDetection` 大地图)
- 角色 / 家具 / 墙体都用 `RectangleHitbox` / `PolygonHitbox`
- 详见 §4 示例

### 6.5 关卡加载流程骨架
- `LevelLoader` 类: 按 level name 调 `TiledComponent.load(...)`
- 按设计师定的 layer 命名约定提取 collision / NPC spawn / 触发器
- 业务逻辑(角色移动 / 状态 / 音效触发)在 cute_pet 自决

---

## 7. 版本与兼容性

- **现状**: 没有正式 schema 版本号。**asset-lab 仓的 git commit hash = 资源 schema 的版本号**
- cute_pet 在自己仓 `pubspec.yaml` 注释或 README 标注当前对接的 asset-lab commit
- asset-lab 这边有破坏性变更(例如设计师 Tiled 约定 layer 名改了)时,会:
  1. 在本文加 "## 修订记录" 章节
  2. README / CLAUDE.md 顶部加显眼提示
  3. cute_pet 工程师按本文 diff 升级
- 未来增长到一定规模,会引入 `schema_version` 字段(写入 .tmj 的 map property 或 sidecar JSON)

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

请直接在 asset-lab 仓提 issue / 改 spec PR。schema 类反馈 asset-lab 这边校对后落实(可能需要找设计师调约定);cute_pet 端 Dart 实现细节,asset-lab 不介入。
