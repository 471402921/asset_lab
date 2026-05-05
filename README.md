# asset-lab

像素游戏资源中间层。**两件事**:

1. **sprite 八方向键盘交互预览**(浏览器跑,纯 vanilla JS)
2. **pixellab 资源 → Tiled 格式转换**(Python 脚本,在 `tools/`)

关卡编辑由 [Tiled](https://www.mapeditor.org/) 负责;cute_pet 用 `flame_tiled` 直接消费。asset-lab 是中间桥,**不重造 Tiled 轮子,也不替 cute_pet 写 Dart**。

详细决策见 [asset-lab-plan.md](asset-lab-plan.md)。给 cute_pet 工程师的契约见 [docs/cute_pet_integration.md](docs/cute_pet_integration.md)(⚠️ 当前 DRAFT,等 readiness gates 全绿再发给 cute_pet 工程师)。

---

## 一次性安装

```bash
# 1. clone 本仓
git clone https://github.com/471402921/asset_lab.git
cd asset_lab

# 2. 装 Tiled (关卡编辑器, 免费)
brew install --cask tiled       # macOS
# 或 https://www.mapeditor.org/download.html

# 3. (设计师) VS Code 装 "Live Server" 扩展, 用来跑 sprite preview
# 4. (开发者) 配 pixellab MCP — 见下面

# 5. (一次性) 验证 pixellab → Tiled converter 跑得通
python3 tools/pixellab_to_tiled.py --help
```

---

## 工作流

### 改地图(用 pixellab Map Editor + Tiled + converter)

```
1. pixellab Map Editor 里画地图
2. 导出整个目录 → 拖进 temporary_asset/
3. python3 tools/pixellab_to_tiled.py \
     --map-input "temporary_asset/{export_dir}/" \
     --name      room_dark_floors_v1
4. (可选) Tiled 打开 assets/maps/room_dark_floors_v1.tmx 调家具 / 改 collision
5. git commit + push
6. cute_pet 工程师 git pull → flame_tiled 自动加载新关卡
```

### 看 sprite 八方向(用 sprite preview)

```
1. pixellab 生成 character → 导出
2. 拷进 assets/sprites/{name}/ (含 metadata.json + rotations/)
3. (可选) python3 tools/pixellab_to_tiled.py --sprites
   生成 {name}.tsx 让 Tiled 也能放 NPC
4. 浏览器跑 asset-lab (右键 index.html → Open with Live Server)
5. WASDQEZC 切 8 方向, +/- 整数倍缩放, 0 重置
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

#### Sprite preview 键盘

| 键 | 作用 |
|---|---|
| W / D / S / A | north / east / south / west |
| Q / E / Z / C | NW / NE / SW / SE |
| `+` / `-` | 整数倍缩放 (2 / 3 / 4 / 6 / 8) |
| `0` | 缩放重置回 4× |
| Space / `[` / `]` | 动画控制 (待 pixellab 动画样本到位再实装) |

---

## 目录结构

```
assets/                              # 仓内"可消费资源"
├── maps/                            # Tiled .tmx 关卡
├── tilesets/                        # Tiled .tsx + 引用的 PNG
│   ├── {map_name}/                  # 从 pixellab Map Editor 转换出
│   │   ├── composite.png
│   │   ├── terrain-info.json        # cute_pet 可选: 查每格地形
│   │   └── tiles/*.png              # 原 wang tilesets
│   ├── furniture/                   # 家具 image collection (设计师在 Tiled 配 collision)
│   ├── items/
│   └── ui/
├── sprites/                         # 角色, asset-lab + Tiled 共用
│   └── {name}/
│       ├── metadata.json            # asset-lab sprite preview 读
│       ├── rotations/*.png          # pixellab 原 8 方向
│       └── {name}.tsx               # converter 生成 (Tiled 用)
└── audio/{music,sfx}/

temporary_asset/                     # ★ 仓根 workflow buffer
                                     # pixellab 原始导出在此暂存
                                     # 内容 .gitignore (不进 git)

tools/                               # 转换 pipeline
├── pixellab_to_tiled.py             # CLI 入口
└── converters/                      # 分层架构 (parsers / IR / writers)
    ├── ir.py                        # 工具无关中间表示
    ├── pixellab/                    # 输入解析器 (pixellab → IR)
    └── tiled/                       # 输出生成器 (IR → Tiled)

docs/cute_pet_integration.md         # ★ 给 cute_pet 工程师的契约文档

modes/sprite_preview.js              # 浏览器 sprite 预览
core/, loaders/, keymap.js, index.html
```

详细决策与历史见 [asset-lab-plan.md](asset-lab-plan.md)。

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

- 重造 Tiled (关卡编辑全部交给 Tiled)
- 替 cute_pet 写 Flutter / Dart 代码 (asset-lab 只出 spec)
- 任何 npm 包 / framework / 浏览器侧 build step
- 物理 / 碰撞 / 状态机 / 触发器 (那是 cute_pet 的事)
- 复刻 pixellab 的生成能力
- 非整数倍缩放 (破坏像素纯度)
- 自己设计 sprite/items 的 schema (pixellab + Tiled 是 source of truth)
