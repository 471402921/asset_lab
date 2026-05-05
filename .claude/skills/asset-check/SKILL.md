---
name: asset-check
description: >
  asset-lab 资源校验 Skill。设计师从 Tiled 导出 .tmj、从 pixellab 重命名 sprite 目录、
  发现 preview 加载不出东西时,**第一时间用它**。
  跑一次就能查:文件名空格 / typo、.tmj 与 .tsx 路径解析、iCloud 绝对路径泄露、
  sprite metadata 与磁盘是否一致、items/{类目}/ 文件名前缀、preview 默认值是否还有效。
  触发场景:用户说 /asset-check、"刚改完资源"、"导出了新场景"、"preview 黑屏"、
  "sprite 加载不出来"、"检查一下资源"、"看下文件有没有问题"、"这个跑不起来"等。
  本 Skill 默认**只读 + 报告**,不自动修文件;每个问题给出修复命令让用户自己跑或让 Claude 用 Edit 改。
---

# asset-check

跑 [tools/lint/check_assets.py](../../../tools/lint/check_assets.py) 校验 asset-lab 仓库的资源文件。

## 何时用

- 设计师刚从 Tiled 导出 `.tmj` (尤其 Tiled 项目本身在 iCloud 里时,极易带绝对路径)
- 设计师 rename pixellab sprite 目录后(metadata 容易跟磁盘对不上)
- preview 黑屏 / sprite 加载不出 / 撞墙没反应
- 准备 `./deploy.sh deploy` 上线之前
- 接手项目第一次熟悉,想先确认资源没烂

## 校验内容

| 类别 | 检查 | 严重程度 |
|---|---|---|
| 文件名 | 空格 | ERROR |
| 文件名 | 非 ASCII 字符 (中文等) | WARN |
| `items/{类目}/` | 文件名以类目前缀开头 (`furniture_` / `decor_` / `lighting_`),近邻 typo 给修复建议 | ERROR |
| `.tmj` | JSON 合法、`tilesets[].source` 不能是 iCloud / 绝对路径、必须解析到存在的 .tsx | ERROR |
| `.tmj` | 图层 gid 引用至少落在某个 firstgid 区间 | WARN |
| `.tsx` | XML 合法、`<image source>` 路径必须解析到存在的 PNG;路径深度写错时提示 "也许少 ../" | ERROR |
| sprite `metadata.json` | `export_version="2.0"` (浏览器硬卡这个) | ERROR |
| sprite `metadata.json` | `character.directions` 与 `frames.rotations` 数量一致 | WARN |
| sprite `metadata.json` | 所有引用的 PNG 存在;磁盘有 orphan PNG | ERROR / WARN |
| `preview/main.js` | `DEFAULT_MAP` / `DEFAULT_SPRITE_DIR` 指向真实存在的资源 | ERROR |

## 工作流程

### Step 1 — 跑校验

```bash
python3 tools/lint/check_assets.py
```

可选参数:
- `--quiet` 只打印汇总(适合 CI / pre-deploy)
- `--path <dir>` 限定范围(默认整个 `assets/` + `preview/main.js`)

### Step 2 — 解读输出

- ✅ 通过 → exit 0,告诉用户"资源 OK,可以继续"
- ✗ 有 ERROR → exit 1,逐条列出 + 建议修复命令
- ⚠ 只有 WARN → exit 0,告知用户但不阻塞

### Step 3 — 帮用户修

输出里 `Fix:` / `Suggestion:` 行可直接 copy-paste 到 shell 跑;
也可以让 Claude 用 Edit 工具直接改对应文件,但**改之前先确认是治标还是治本**:

| 现象 | 治标 | 治本 |
|---|---|---|
| iCloud 绝对路径 | 改 .tmj 里的 source 字段 | 让设计师把 Tiled 项目搬到 `asset_lab/assets/scenes/` 下 |
| 文件名 typo (例 `ecor_` 缺 `d`) | `mv` 文件 + grep 改所有 .tsx / .tmj 引用 | 提醒设计师存盘前 review 文件名 |
| metadata 与磁盘不一致 | 重写 metadata.json (磁盘为准,见用户记忆 `feedback_designer_edits_disk_not_metadata.md`) | 同上 |
| `.tsx` PNG 路径深度错 (`../items` vs `../../items`) | 改 .tsx 的 source | 让设计师按目录结构敲路径,而不是 Tiled 自动算的相对值 |

### Step 4 — 不做的事

- **不自动修文件**:目前没有 `--fix` flag。一切修改都先报给用户/由 Claude 显式 Edit。
- **不替设计师做架构决定**(例如不主动把 Tiled 项目从 iCloud 搬出来)。
- **不改 metadata 字段语义**,只识别机械错误(路径错、文件不存在、版本号不对)。
- **不替代** [docs/cute_pet_integration.md](../../../docs/cute_pet_integration.md) 的 readiness gates — 那是给 cute_pet 团队的契约稳定度判断,这个 Skill 只查"asset-lab 自己能不能跑"。

## 添加新检查

修改 [tools/lint/check_assets.py](../../../tools/lint/check_assets.py)。每个检查是一个 `check_xxx()` 函数,通过 `err()` / `warn()` / `info()` 报告。

加 ERROR 之前问自己:**这是不是会让 preview 跑不起来 / cute_pet 接手翻车?**
- 是 → ERROR
- 否 → WARN
- 纯风格建议 → INFO (本 v1 暂时不暴露 INFO 级别给 CLI,留给后续)

新检查若依赖外部约定(如新的 sprite schema 字段),先在 [asset-lab-plan.md](../../../asset-lab-plan.md) §13.x 落地,再写检查代码。
