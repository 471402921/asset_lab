# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Pre-code. The repo currently contains only [asset-lab-plan.md](asset-lab-plan.md) (the design doc) and LICENSE. **Read [asset-lab-plan.md](asset-lab-plan.md) before doing anything non-trivial** — it is the source of truth for scope, architecture, and decisions, and was distilled from multi-round discussion. The execution checklist lives in §10.

## What this tool is

asset-lab is a debugging/preview tool for pixel-art game assets produced by [pixellab.ai](https://www.pixellab.ai/), consumed downstream by the cute_pet game (Flutter+Flame, separate repo at https://github.com/471402921/cute_pixel). asset-lab fills three gaps pixellab does not: keyboard-driven sprite interaction preview, multi-asset scene composition, and project-level resource management via git.

Two main modes: **sprite preview** (single sprite, keyboard-controlled directions/animations) and **scene preview** (declarative JSON composing background + entities).

## Hard constraints (do not violate without explicit user sign-off)

These come from plan §9 and §11. They are load-bearing decisions, not preferences.

- **Zero build, zero deps.** No npm packages, no React/Vue/Phaser/p5, no webpack/vite. Pure HTML + Vanilla JS + Canvas 2D. The whole point is that designers + Claude Code can vibe-code on raw JS.
- **pixellab `metadata.json` is upstream contract.** Never change field semantics. asset-lab and cute_pet both read the same shape. Reference sample in plan §13. Check `export_version === "2.0"` on load and hard-error otherwise — do not silently accept unknown versions.
- **Direction strings stay raw.** Use pixellab's literal strings (`south`, `south-east`, `east`, ...) in code and keymaps. Do **not** translate to `N/E/S/W`.
- **Pixel purity is a P0 invariant.** Every Canvas render path must set `ctx.imageSmoothingEnabled = false` AND the canvas element must have `image-rendering: pixelated` (+ Firefox/spec fallbacks). Zoom is **integer-only** (2×/3×/4×/6×/8×, default 4×). Non-integer zoom breaks pixel art — reject it.
- **MVP is read-only.** Do not add edit UIs preemptively. Editing capabilities grow ~30–80 LOC at a time, only when the designer asks for a specific pain point.
- **Don't engine-ify.** No physics, no collision, no animation state machines, no scene-to-scene triggers. That belongs in cute_pet, not here.
- **Loaders are a plugin slot.** `loaders/{type}_loader.js` per asset type. Adding a new asset type must not touch `core/`.
- **Secrets stay out of git.** `.mcp.json` holds the pixellab API token — it must be `.gitignore`d, with `.mcp.json.example` as the template (plan §12.2).

## Architecture (target — not yet built)

Planned layout in plan §5. Key separations:

- `core/` — renderer, input, scene_loader, version_guard, file_writer. Asset-type-agnostic.
- `loaders/` — one file per asset type. Sprite loader reads pixellab `metadata.json`; others mostly load single PNGs or frame sequences.
- `modes/` — `sprite_preview.js` and `scene_preview.js`. The two main entry flows.
- `assets/` — designer's drop zone, mirrors cute_pet's `assets/` structure so resources can be copied across without restructuring.
- `scenes/` — declarative `level_xxx.json` (schema in plan §6.2). asset-lab is the schema's source of truth; cute_pet will eventually consume the same files.
- `keymap.js` — single source for keybindings; the on-screen prompt panel is generated from this so designers always see current bindings.

File writes (for editing scene JSON, future game_meta editor) use the File System Access API on Chromium, with a download-button fallback for Safari/Firefox. Recommend Chrome/Edge to designers.

## Running (once code exists)

**Cannot be opened by double-clicking `index.html`** — `file://` protocol blocks `fetch('metadata.json')` via CORS. Designers will see a blank screen and assume it's broken. Always serve over HTTP. Three options (plan §4.4):

```bash
# A — Python (macOS built-in)
python3 -m http.server 8000

# B — Node
npx serve

# C — VS Code "Live Server" extension (recommended for designers)
```

There is no test suite, no lint, no CI, and none is planned. This is a debugging tool, not a product (plan §11).

## Working with the designer

The primary user is one designer using Claude Code in VS Code. Typical request flow: "move the husky 50px left" → edit `scenes/*.json` → browser refresh. "Add an animation speed slider" → ~50 LOC → refresh. Prefer the smallest change that solves the stated pain. Ask before adding scene-JSON fields — schema drift is the main risk.

## pixellab MCP

Plan §12. The repo expects an `.mcp.json` pointing at `https://api.pixellab.ai/mcp` with a Bearer token. pixellab MCP only exposes **generation** tools (`create_character`, `animate_character`, `create_tileset`, etc.) — it cannot list previously generated assets. Asset inventory lives in this git repo, not in pixellab.
