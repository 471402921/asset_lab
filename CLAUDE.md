# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

MVP skeleton committed. Two preview modes (sprite + level) wired up but **no seed assets yet** — both modes show friendly empty-state overlays until the designer drops pixellab exports into `assets/`.

[asset-lab-plan.md](asset-lab-plan.md) is the design doc and source of truth for scope/architecture/decisions. It originated from multi-round discussion. **Read it before doing anything non-trivial.** The execution checklist lives in §10.

## What this tool is

asset-lab is a debugging/preview tool for pixel-art game assets produced by [pixellab.ai](https://www.pixellab.ai/), consumed downstream by the cute_pet game (Flutter+Flame, separate repo at https://github.com/471402921/cute_pixel). It fills three gaps pixellab does not: keyboard-driven sprite interaction preview, multi-asset level composition, and project-level resource management via git.

Two main modes: **sprite preview** (single sprite, keyboard-controlled directions/animations) and **level preview** (declarative JSON composing map + sprites + items + ui via a unified `entities[]` array).

## Terminology (canonical — do not regress)

After a 2026-05-04 alignment, the following terms are canonical. Don't reintroduce "scene" anywhere in code/docs/JSON unless quoting historical context.

| Concept | Canonical term | Path / symbol |
|---|---|---|
| 关卡组合 (multi-asset composition) | **level** | `levels/*.json`, `LevelPreviewMode`, `loadLevel`, `LEVEL_KEYMAP` |
| 全图地图 (full-image background) | **map** | `assets/maps/*.png`, `loadMap`, `{"type":"map"}` entity |
| 瓦片地图 (tile-based map) | **tilemap** | `assets/tilemaps/`, `loadTilemap` (stub) |
| 角色 sprite | **sprite** | `assets/sprites/{name}/`, `loadSprite` |

**Banned: "scene"** as a code/JSON identifier. Map is just one entity type within a level — there is no special "background" field on a level (the JSON has `entities[]` only). z-order = array order; map naturally goes first.

## Hard constraints (do not violate without explicit user sign-off)

These come from plan §9 and §11. They are load-bearing decisions, not preferences.

- **Zero build, zero deps.** No npm packages, no React/Vue/Phaser/p5, no webpack/vite. Pure HTML + Vanilla JS + Canvas 2D. The whole point is that designers + Claude Code can vibe-code on raw JS.
- **pixellab `metadata.json` is upstream contract.** Never change field semantics. asset-lab and cute_pet both read the same shape. Reference sample in plan §13. Check `export_version === "2.0"` on load and hard-error otherwise — do not silently accept unknown versions.
- **Direction strings stay raw.** Use pixellab's literal strings (`south`, `south-east`, `east`, ...) in code and keymaps. Do **not** translate to `N/E/S/W`.
- **Pixel purity is a P0 invariant.** Every Canvas render path must set `ctx.imageSmoothingEnabled = false` AND the canvas element must have `image-rendering: pixelated` (+ Firefox/spec fallbacks). Zoom is **integer-only** (2×/3×/4×/6×/8×, default 4×). Non-integer zoom breaks pixel art — reject it.
- **MVP is read-only.** Do not add edit UIs preemptively. Editing capabilities grow ~30–80 LOC at a time, only when the designer asks for a specific pain point.
- **Don't engine-ify.** No physics, no collision, no animation state machines, no level-to-level triggers. That belongs in cute_pet, not here.
- **Loaders are a plugin slot.** `loaders/{type}_loader.js` per asset type. Adding a new asset type must not touch `core/`.
- **Secrets stay out of git.** `.mcp.json` holds the pixellab API token — it must be `.gitignore`d, with `.mcp.json.example` as the template (plan §12.2).

## Architecture

- `core/` — renderer (pixel-purity + integer zoom), input (keymap-reflected prompt panel), level_loader, version_guard. Asset-type-agnostic.
- `loaders/` — one file per asset type (sprite, item, ui, map, effect, audio, tilemap-stub). Sprite loader reads pixellab `metadata.json`; others mostly load single PNGs or frame sequences. `loaders/_image.js` is a tiny shared `loadImage(src)` helper.
- `modes/` — `sprite_preview.js` and `level_preview.js`. The two main entry flows.
- `assets/` — designer's drop zone, mirrors cute_pet's `assets/` structure so resources can be copied across without restructuring.
- `levels/` — declarative `level_xxx.json` (entity-unified schema, see below). asset-lab is the schema's source of truth; cute_pet will eventually consume the same files.
- `keymap.js` — single source for keybindings; the on-screen prompt panel is generated from this so designers always see current bindings.

### Level JSON schema

```json
{
  "entities": [
    { "type": "map",    "asset": "maps/forest_clearing.png" },
    { "type": "sprite", "asset": "sprites/husky_chibi", "x": 120, "y": 200, "facing": "south" },
    { "type": "item",   "asset": "items/bone.png", "x": 180, "y": 220 },
    { "type": "ui",     "asset": "ui/dialogue_frame.png", "x": 0, "y": 400 }
  ]
}
```

- All entries live under one `entities[]`. No special-cased background field.
- Array order = z-order (later wins, so put map first).
- `x/y` only meaningful for non-`map` types (map fills the whole canvas).
- `facing` only meaningful for `sprite` (defaults to `south`).
- Asset paths are relative to `assets/`.

File writes (for editing level JSON, future game_meta editor) will use the File System Access API on Chromium with a download-button fallback for Safari/Firefox. **Not implemented yet** (`core/file_writer.js` deliberately doesn't exist — MVP is read-only).

## Running

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

The primary user is one designer using Claude Code in VS Code. Typical request flow: "move the husky 50px left" → edit `levels/*.json` → browser refresh. "Add an animation speed slider" → ~50 LOC → refresh. Prefer the smallest change that solves the stated pain. Ask before adding level-JSON fields — schema drift is the main risk.

## pixellab MCP

Plan §12. Already registered at user scope via `claude mcp add pixellab https://api.pixellab.ai/mcp -t http -H "Authorization: Bearer ..."` — token lives in `~/.claude.json`, not in this repo. The `.mcp.json.example` template is provided for anyone preferring repo-scope config. pixellab MCP only exposes **generation** tools (`create_character`, `animate_character`, `create_tileset`, etc.) — it cannot list previously generated assets. Asset inventory lives in this git repo, not in pixellab.
