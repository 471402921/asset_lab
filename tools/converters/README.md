# tools/converters/

分层的 pipeline 架构。**写新 source / target 之前先读本文**。

## 三段架构

```
[source export]  →  parsers/{source}/*  →  IR  →  writers/{target}/*  →  [target format]
```

| 角色 | 职责 | 当前实现 |
|---|---|---|
| **parser** | 读特定 source 的原始格式,产出 IR dataclass | `pixellab/parse_map.py` (Map Editor 导出 → `IR.TileMap`)<br>`pixellab/parse_sprite.py` (角色导出 → `IR.Sprite`) |
| **IR** | tool-agnostic 中间表示 | `ir.py` 中的 `TileMap` / `ImageLayer` / `ObjectLayer` / `MapObject` / `Sprite` / `SpriteFrame` |
| **writer** | 读 IR,序列化为特定 target 格式 | `tiled/write_tmx.py` (IR.TileMap → .tmx)<br>`tiled/write_tsx.py` (IR.Sprite → .tsx) |

## 解耦契约 (load-bearing rules)

1. **parsers MUST output IR dataclasses**,不直接拼 XML 或 target 格式
2. **writers MUST consume IR dataclasses**,不读 source 文件 / source-specific JSON
3. **IR 不带任何 source / target 特有字段**(没有 `pixellab_id`、没有 `tiled_gid`)
4. parsers 和 writers 互不 import — 用以下命令验证:
   ```bash
   grep -rn "tiled" tools/converters/pixellab/   # 应为空
   grep -rn "pixellab" tools/converters/tiled/   # 应为空 (docstring 引用不算)
   ```

## 加新 source(例如 pixellab v2 / 别的工具)

1. 在 `tools/converters/` 下加新目录,如 `pixellab_v2/`
2. 写 `parse_*.py` 解析新 source 的原始格式
3. **必须**输出现有 `ir.py` 的 dataclass 实例
4. 在 CLI (`tools/pixellab_to_tiled.py` 或新 CLI) 里 import 新 parser
5. **不动 IR,不动 writers** — 这是验证你解耦做对的标准

## 加新 target(例如 Phaser 格式 / 自定义引擎)

1. 在 `tools/converters/` 下加新目录,如 `phaser/`
2. 写 `write_*.py` 接 IR 实例,序列化成 target 格式文件
3. **不动 IR,不动 parsers** — 同上

## 加 IR 字段(谨慎)

IR 是契约的核心。加字段意味着:
- 所有现有 parsers 要决定怎么填(默认值或必填)
- 所有现有 writers 要决定怎么序列化(忽略 / 输出 / 报错)

加字段前先确认:
- 是真正 cross-tool 的概念,还是 source/target 特有?
- 能不能放 `properties: dict` 里(已经预留了通用槽)?

## 当前 IR 字段总览

```python
# ir.py
@dataclass class MapObject:    x, y, width, height, name, object_type, properties
@dataclass class ObjectLayer:  name, objects[]
@dataclass class ImageLayer:   name, image_path, image_width, image_height
@dataclass class TileMap:      name, width, height, tile_width, tile_height, layers[], properties
@dataclass class SpriteFrame:  image_path, width, height, direction
@dataclass class Sprite:       name, frames[], properties
```

不含的(目前来说不必要):
- 真正的 tile layer (per-cell tile data) — MVP 用 image layer 即可
- Wang tileset 配置 — 暂未实装(pixellab composite 已足够)
- 动画帧时间轴 — 等设计师产 sprite animation 样本再说
- Custom polygon collision — 用 ObjectLayer.objects 的 width/height 矩形即可

需要时再加,**别预先抽象**。
