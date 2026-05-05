# tools/

asset-lab 的 pipeline 工具。当前主体是 pixellab → Tiled sprite 转换器。

## 当前范围

只做一件事: **把 pixellab character export 转成 Tiled `.tsx`**(image collection,8 方向各一 tile,带 `direction` property)。

之前的 pixellab Map Editor → .tmx 转换在 2026-05-05 删除 —— 设计师反馈 pixellab 的 Map Editor 不如 Tiled 好用,直接在 Tiled 里编辑地图导出 .tmx。pixellab 这边只产基础 PNG 元素 + 角色 sprite。

## pixellab_to_tiled.py

### 用法

```bash
# 给 assets/sprites/ 下所有含 metadata.json 的目录生成 {name}.tsx
python3 tools/pixellab_to_tiled.py --sprites
```

可重跑,覆盖既有 `.tsx`。某个 sprite 目录缺 `metadata.json` 或 `export_version` 不匹配时,该 sprite 跳过(打 SKIP 提示),其它 sprite 继续转。

### 输出

```
assets/sprites/{sprite_name}/{sprite_name}.tsx
```

`.tsx` 内容是 Tiled 的 image collection tileset:每方向一 tile,引用对应 `rotations/{direction}.png`,带 `direction: south` 等 property。设计师在 Tiled 里把 NPC 摆进关卡时直接用。

### 工作流

```
pixellab character 导出 → 拷进 assets/sprites/{name}/  (含 metadata.json + rotations/)
                            ↓
                  python3 tools/pixellab_to_tiled.py --sprites
                            ↓
                  assets/sprites/{name}/{name}.tsx  (Tiled 用)
                            ↓
                  设计师在 Tiled 里把 NPC 摆进 .tmx
                            ↓
                  cute_pet 用 flame_tiled 加载, 自动认识 sprite
```

## 架构

converter 是分层的(parsers / IR / writers),**未来换 pixellab 或换 Tiled 不用大改**。详见 [converters/README.md](converters/README.md)。

## 依赖

Python 3.9+,只用 stdlib(`xml.etree`、`json`、`pathlib`、`shutil`、`argparse`、`dataclasses`)。无 pip 依赖,跟 asset-lab 主体的"零依赖"原则一致。

## 验证产物

```bash
# 校验 .tsx XML 合法
xmllint --noout assets/sprites/{name}/{name}.tsx

# 在 Tiled 里打开 .tsx 看 8 方向 tile 是否都加载
tiled assets/sprites/{name}/{name}.tsx
```
