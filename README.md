# asset-lab

像素游戏资源中间层。**三件事**(长期定位):

1. **基于 GitHub 的资源文件管理**(`assets/` 目录,设计师拖拽资源 + git 版本)
2. **pixellab sprite → Tiled `.tsx` 转换**(Python 脚本,在 `tools/`)
3. **Web 端 sprite 预览**(浏览器跑,纯 vanilla JS;按 sprite 实际方向数 4 或 8 自适应键盘交互;状态切换 + 动画播放已实装,触屏 UI 自动启用)

外加**临时拐杖**:**Web 端关卡运行时预览**(Phaser CDN,`preview/`)。设计师改完 `.tmj` 浏览器秒开就能"走一走"。等 cute_pet 工程师把 `lib/demo/level_preview.dart` 写好后整段拆掉。详见 [preview/README.md](preview/README.md)。

**地图和关卡编辑由设计师在 [Tiled](https://www.mapeditor.org/) 里直接做并导出 `.tmj`**,asset-lab 不参与地图转换。**pixellab 在工作流里只产基础 PNG 元素 + 角色 sprite**(后者动画帧多,需要转换支持)。**cute_pet** 用 `flame_tiled` 直接消费 `.tmj`,asset-lab 不替它写 Dart。

详细决策见 [asset-lab-plan.md](asset-lab-plan.md)。给 cute_pet 工程师的契约见 [docs/cute_pet_integration.md](docs/cute_pet_integration.md)(⚠️ 当前 DRAFT,等 readiness gates 全绿再发给 cute_pet 工程师)。

---

## 一次性安装

```bash
# 1. clone 本仓
git clone https://github.com/471402921/asset_lab.git
cd asset_lab

# 2. 装 Tiled (设计师用; 关卡编辑器, 免费)
brew install --cask tiled       # macOS
# 或 https://www.mapeditor.org/download.html

# 3. (设计师) VS Code 装 "Live Server" 扩展, 用来跑 sprite preview

# 4. (开发者) 配 pixellab MCP — 见下面

# 5. (一次性) 验证 sprite converter 跑得通
python3 tools/pixellab_to_tiled.py --help
```

---

## 工作流

### 改地图 / 关卡(Tiled 编辑 + asset-lab 预览跑)

```
1. (可选) pixellab 生成基础 tile / 家具 / UI 单 PNG → 拷进 assets/ 对应位置
2. Tiled 里手画 / 拼地图 / 配 collision / 摆 NPC
3. Tiled 导出 .tmj (File > Save As 选 .tmj 格式), 勾选 Embed Tilesets
4. 放到 assets/maps/level_001.tmj (路径 / 命名设计师定)
5. 浏览器开 asset-lab → 切到 "level preview" 模式 → 立刻走起来
6. git commit + push
7. (cute_pet schema 稳定后) cute_pet 工程师 git pull → flame_tiled 加载新关卡
```

### sprite 资源(pixellab → 浏览器预览 + 转 .tsx)

```
1. pixellab 生成 character → 导出
2. 拷进 assets/sprites/{name}/ (含 metadata.json + rotations/)
3. python3 tools/pixellab_to_tiled.py --sprites
   生成 {name}.tsx, 让 Tiled 也能放 NPC
4. 浏览器跑 asset-lab (右键 index.html → Open with Live Server)
5. WASD 切方向 (8-dir sprite 时多 QEZC), Digit 1-9 切状态/动画, Space 播放/暂停, +/- 整数倍缩放, 0 重置
6. git commit + push
```

### 跑 sprite preview 浏览器界面

**不能直接双击 `index.html`** — `file://` 协议下 fetch 会被 CORS 拒。三选一:

```bash
# A. Python (macOS 自带)
python3 -m http.server 8000
# 浏览器开 http://localhost:8000

# B. Node
npx serve

# C. VS Code "Live Server" 扩展 (推荐, 改 metadata.json 自动刷新)
```

推荐 Chrome / Edge 122+。

### 手机预览 (触屏自动启用)

支持手机浏览器跑 sprite + level preview。**已部署在 <https://1.14.190.95/>**(自签证书,首次访问浏览器会跳"不安全"警告页 → "高级" → "继续"即可)。改完代码本机一行 redeploy:

```bash
./deploy.sh deploy
```

部署细节、systemd unit、为什么走 HTTPS+443 都在 [deploy.sh](deploy.sh) 头部注释里。

- **触发条件**: 媒体查询 `(pointer: coarse), (max-width: 900px)` 命中即开触屏 UI
- **桌面零回归**: 大屏 + 鼠标 (`pointer: fine`) 行为完全跟之前一样,触屏 UI 自动隐藏
- **触屏 UI**:
  - sprite preview: state 横向滚动条 + DPad (按 sprite 实际方向数显示) + 播放控制 (◀/▶/▶|) + 缩放 (-/⊙/+)
  - level preview: 左下角悬浮 DPad、右下角悬浮 zoom 按钮、半透明覆盖在 Phaser 上不挡视野
- **像素纯度**: 浏览器走 nearest-neighbor 缩放 (CSS `image-rendering: pixelated`),mobile 默认 zoom 提到 6× 留余地。**不引入 pinch-to-zoom** (破坏整数像素)
- **viewport meta**: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">` 防双击放大

#### Sprite preview 键盘

| 键 | 作用 |
|---|---|
| W / D / S / A | north / east / south / west (4 cardinals,所有 sprite 都有) |
| Q / E / Z / C | NW / NE / SW / SE (**仅 8-dir sprite 时显示**;4-dir sprite 自动隐藏) |
| `+` / `-` | 整数倍缩放 (2 / 3 / 4 / 6 / 8) |
| `0` | 缩放重置回 4× |
| Digit 1-9 | 切换状态/动画 (按 `frames.animations` 顺序; 选中后自动播放) |
| Tab | 清状态, 回 N 方向静帧 |
| Space | 播放 / 暂停当前动画 |
| `[` / `]` | 单帧步进 (前 / 后, 自动暂停) |

state_key 缺当前方向时自动 fallback 到 `south` 帧 (info 面板会标 `↳ south fallback`)。提示面板按 sprite 真实 `frames.rotations` 过滤,4-dir sprite 不显示 QEZC。

#### Level preview 键盘 (临时拐杖)

切到顶部 "level preview" tab 后:

| 键 | 作用 |
|---|---|
| W / D / S / A | 玩家上 / 右 / 下 / 左移动 (移动时自动播 walk 动画) |
| Q / E / Z / C | 仅 sprite 是 8-dir 时生效 (NW/NE/SW/SE 斜向移动);4-dir sprite 时静默 |
| X | 相机 zoom 切换 (远景 2× ↔ 近景 4×, 都跟随玩家) |

走路动画按 sprite `frames.animations` 里启发式找含 `walk` 的 state_key (设计师源头 semantic 命名后命中)。该方向缺 → south fallback → 静帧。停止时若 sprite 有 `idle`/`stand`/`breath` 段则播放,否则静帧。

需要 `assets/maps/level_001.tmj` + `assets/sprites/yellow_Shiba/`(或其它默认 sprite,见 `preview/main.js` `DEFAULT_SPRITE_DIR`)才能跑;缺资源给友好空态。Phaser 是 lazy load (CDN),切到 level mode 第一次加载需 ~1-2 秒。详细约束见 [preview/README.md](preview/README.md)。

---

## 目录结构

```
assets/                              # 仓内资源 (设计师投放区, 由设计师定具体子目录约定)
├── maps/                            # 设计师从 Tiled 导出的 .tmj + 引用的 PNG (Embed Tilesets)
├── tilesets/                        # 设计师在 Tiled 里建的 .tsx + tile PNG (如不 embed)
├── sprites/{name}/                  # pixellab 角色资源
│   ├── metadata.json                #   asset-lab sprite preview 读
│   ├── rotations/{south,...}.png    #   pixellab 原 4 或 8 方向 (character.directions)
│   ├── animations/{state}/{dir}/    #   动画帧 (semantic state_key, plan §13.1)
│   └── {name}.tsx                   #   tools/pixellab_to_tiled.py 生成 (Tiled 用)
└── audio/{music,sfx}/

temporary_asset/                     # workflow buffer, 内容 .gitignore (不进 git)

tools/                               # 转换 pipeline (sprite-only)
├── pixellab_to_tiled.py             # CLI 入口
└── converters/                      # 分层架构 (parsers / IR / writers)
    ├── ir.py                        # 工具无关中间表示
    ├── pixellab/                    # 输入解析器 (pixellab → IR)
    └── tiled/                       # 输出生成器 (IR → Tiled)

preview/                             # ★ 临时拐杖: Phaser 关卡运行时预览
└── main.js                          # lazy-load Phaser CDN, 加载 .tmj, 玩家走+撞墙

docs/cute_pet_integration.md         # 给 cute_pet 工程师的契约 (DRAFT)

modes/sprite_preview.js              # 浏览器 sprite 预览
core/, loaders/, keymap.js, index.html
```

`assets/` 子目录约定由**设计师定**(她在 Tiled 里习惯什么布局就用什么),asset-lab 跟随。详见 [asset-lab-plan.md](asset-lab-plan.md)。

---

## pixellab MCP (一次性配置)

让 Claude Code 直接调 pixellab 生成。**Token 不进 repo**,用 user-scope CLI 注册:

```bash
claude mcp add pixellab https://api.pixellab.ai/mcp -t http -H "Authorization: Bearer YOUR_TOKEN"
```

Token 在 [pixellab.ai](https://www.pixellab.ai/) 用户中心拿。订阅建议 Tier 3 Pixel Architect ($50/mo, 含 team collaboration + 20 并发 + MCP 完整额度)。

文档: <https://api.pixellab.ai/mcp/docs>

如需 repo-scope 配置 (`.mcp.json`),参考 `.mcp.json.example`(`.mcp.json` 已在 `.gitignore`)。

---

## 不做的事

- **不转换地图** — 设计师在 Tiled 里直接画 + 导出 .tmj,asset-lab 不参与转换
- **不重造 Tiled** — 关卡编辑全部交给 Tiled
- **不替 cute_pet 写 Flutter / Dart 代码** — asset-lab 只出 spec
- **不引擎化** — 物理 / 碰撞 / 状态机 / 触发器都是 cute_pet 的事(`preview/` 是临时拐杖,不算引擎化,cute_pet 接手后拆)
- 任何 npm 包 / framework / 浏览器侧 build step
- 复刻 pixellab 的生成能力
- 非整数倍缩放 (sprite preview 部分,破坏像素纯度)
