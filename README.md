# asset-lab

像素游戏资源调试 / 预览工具。配合 [pixellab.ai](https://www.pixellab.ai/) 生成,下游服务于 cute_pet 游戏。

详细背景与决策见 [asset-lab-plan.md](asset-lab-plan.md)。

---

## 启动

**不能直接双击 `index.html`** — 浏览器对 `file://` 协议下的 `fetch('metadata.json')` 会按 CORS 拒绝。必须本地起 HTTP server,三选一:

```bash
# A. Python (macOS 自带, 最快)
cd asset_lab && python3 -m http.server 8000
# 浏览器访问 http://localhost:8000

# B. Node
cd asset_lab && npx serve

# C. VS Code "Live Server" 扩展 (推荐设计师用这个)
#    右键 index.html → Open with Live Server
```

推荐 **Chrome / Edge 122+**。Safari / Firefox 也能跑预览,但未来文件写入功能会降级到下载按钮。

---

## 工作流

```
1. clone 仓库, 装 VS Code "Live Server" 扩展 (一次)
2. 在 pixellab 生成资源 (Web 或 Claude Code + MCP, 见下)
3. 把 pixellab 导出目录拷进 assets/{type}/{name}/
4. 右键 index.html → Open with Live Server
5. 顶部切 sprite preview / scene preview
6. 键盘交互看效果 (8 方向 / 缩放)
7. 想改场景: 跟 Claude Code 说 "把 husky 往左挪 50" → 改 scenes/*.json → 浏览器自动刷新
8. 满意 → git commit && git push
```

### Sprite preview 键盘

| 键 | 作用 |
|---|---|
| W / D / S / A | north / east / south / west |
| Q / E / Z / C | NW / NE / SW / SE |
| `+` / `-` | 整数倍缩放 (2 / 3 / 4 / 6 / 8) |
| `0` | 缩放重置回 4× |
| Space / `[` / `]` | 动画控制 (MVP 静帧, 待动画样本到位后实装) |

### Scene preview

加载 `scenes/level_001.json`,按 entities 顺序 (z-order) 渲染背景 + sprite + item + ui。改 JSON → 刷新即生效。Schema 见 [asset-lab-plan.md](asset-lab-plan.md) §6.2。

---

## 资源投放

按 `assets/{type}/{name}/` 组织,与 cute_pet 同构:

```
assets/
├── sprites/{name}/        # pixellab metadata.json + rotations/*.png
├── items/{name}.png
├── ui/{name}.png
├── scenes/{name}.png      # 背景图
├── effects/{name}/        # 帧序列
├── audio/{music,sfx}/
└── tilemaps/              # loader 暂未实装
```

Sprite 的 metadata.json 必须是 pixellab 导出格式,`export_version === "2.0"`。其它版本会硬报错而非静默兼容。

---

## pixellab MCP (一次性配置)

让 Claude Code 直接调 pixellab 生成。**Token 不进 repo**,用 user-scope CLI 注册:

```bash
claude mcp add pixellab https://api.pixellab.ai/mcp -t http -H "Authorization: Bearer YOUR_TOKEN"
```

Token 在 [pixellab.ai](https://www.pixellab.ai/) 用户中心拿。订阅建议 Tier 3 Pixel Architect ($50/mo, 含 team collaboration + 20 并发 + MCP 完整额度)。

文档: <https://api.pixellab.ai/mcp/docs>

如需 repo-scope 配置 (`.mcp.json`),参考 `.mcp.json.example`。注意 `.mcp.json` 已在 `.gitignore`,不会被提交。

---

## 不做的事

按 [asset-lab-plan.md](asset-lab-plan.md) §11:

- 任何 npm 包 / framework / build step
- 任何编辑 UI (MVP 只读, 编辑能力按真实痛点 vibe-code 长)
- 物理 / 碰撞 / 状态机 / 触发器 (那是 cute_pet 的事)
- 复刻 pixellab 的生成能力
- 非整数倍缩放 (破坏像素纯度)
- 自己设计 sprite/items 的 schema (pixellab 是 source of truth)
