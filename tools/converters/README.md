# tools/converters/

分层的 pipeline 架构。**写新 source / target 之前先读本文**。

## 当前现状

只剩 sprite pipeline 一条:

```
pixellab character export  →  pixellab/parse_sprite.py  →  IR.Sprite  →  tiled/write_tsx.py  →  .tsx
```

之前还有的 pixellab Map Editor → .tmx pipeline 已删除(2026-05-05,设计师改用 Tiled 直接编辑地图)。删除时一并删了 `parse_map.py` / `write_tmx.py` / IR 的 `TileMap` / `ImageLayer` / `ObjectLayer` / `MapObject`。

虽然现在只有一条 pipeline,**分层架构不能因此塌方**。它的存在是为了"未来加新 source / target 时不用重构",今天少一条,明天可能多两条(pixellab v2 / 别的工具 / Phaser format 等)。

## 三段架构

```
[source export]  →  parsers/{source}/*  →  IR  →  writers/{target}/*  →  [target format]
```

| 角色 | 职责 | 当前实现 |
|---|---|---|
| **parser** | 读特定 source 的原始格式,产出 IR dataclass | `pixellab/parse_sprite.py` (角色导出 → `IR.Sprite`) |
| **IR** | tool-agnostic 中间表示 | `ir.py` 的 `Sprite` / `SpriteFrame` |
| **writer** | 读 IR,序列化为特定 target 格式 | `tiled/write_tsx.py` (IR.Sprite → .tsx) |

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
@dataclass class SpriteFrame:  image_path, width, height, direction
@dataclass class Sprite:       name, frames[], properties
```

加 IR 类型应有真实下游消费场景。**不预先抽象**。
