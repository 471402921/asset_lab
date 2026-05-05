# tools/

asset-lab 的 pipeline 工具。当前主体是 pixellab → Tiled 资源转换器。

## pixellab_to_tiled.py

把 pixellab(Map Editor + 角色)导出转成 Tiled (.tmx + .tsx)。

### 用法

```bash
# 转换一份 pixellab Map Editor 导出为关卡
python3 tools/pixellab_to_tiled.py \
  --map-input "temporary_asset/Untitled Map-export-2/" \
  --name      pixellab_demo_001 \
  --walls     1

# 给 assets/sprites/ 下所有 pixellab 角色生成 Tiled .tsx
python3 tools/pixellab_to_tiled.py --sprites

# 一起做
python3 tools/pixellab_to_tiled.py \
  --map-input "temporary_asset/Untitled Map-export-2/" \
  --name      pixellab_demo_001 \
  --sprites
```

### 参数

- `--map-input PATH`: pixellab Map Editor 导出目录(含 `map.json`、`terrain-map.json`、`map-composite.png`)。可选,不给就跳过 map 转换。
- `--name STR`: 关卡输出名。`--map-input` 给了就必填。决定 `assets/maps/{name}.tmx` 和 `assets/tilesets/{name}/`。
- `--walls INT`: 哪个 terrainId 视为墙体(出现在 .tmx `walls` object layer)。默认 `1`(对应 pixellab 默认的 "black void" 地形)。
- `--sprites`: 扫 `assets/sprites/{*}/`,每个含 `metadata.json` 的目录里生成 `{name}.tsx`(8 方向 image collection)。

### 输出

**Map 模式**:
```
assets/maps/{name}.tmx                          # Tiled 关卡
assets/tilesets/{name}/composite.png            # 渲染整图 (image layer 引用)
assets/tilesets/{name}/tiles/{short}.png        # 重命名后的 wang tilesets
assets/tilesets/{name}/terrain-info.json        # 紧凑 terrain grid (cute_pet 可选)
```

**Sprite 模式**:
```
assets/sprites/{sprite_name}/{sprite_name}.tsx  # Tiled image collection (8 tile + direction property)
```

### 工作流

```
pixellab 导出 → temporary_asset/  (workflow buffer, 不进 git)
                    ↓
          python3 tools/pixellab_to_tiled.py ...
                    ↓
            assets/maps/ + assets/tilesets/  (进 git)
                    ↓
            git push → cute_pet pull → flame_tiled 自动加载
```

`temporary_asset/` 处理完后**可以删**(原始 pixellab 导出在你 pixellab 账号里,不必备份)。

### 设计师常用三步

1. 在 pixellab Map Editor 改完 → 导出整个目录 → 拖进 `temporary_asset/`
2. 跑上面那行命令(关卡名按 `room_dark_floors_v2` 这种语义命名)
3. `git add assets/ && git commit -m "..." && git push`

## 架构

converter 是分层的,**未来换 pixellab 或换 Tiled 不用大改**。详见 [converters/README.md](converters/README.md)。

## 依赖

- Python 3.9+(用 stdlib `xml.etree`、`json`、`pathlib`、`shutil`、`argparse`、`dataclasses`)
- 无 pip 包依赖 — 跟 asset-lab 主体的"零依赖"原则一致

## 验证产物

```bash
# 校验 .tmx XML 合法
xmllint --noout assets/maps/{name}.tmx

# 校验 .tsx XML 合法
xmllint --noout assets/sprites/{sprite_name}/{sprite_name}.tsx

# 在 Tiled 里打开 .tmx 看视觉效果
tiled assets/maps/{name}.tmx
```
