# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Working MVP. Two functional pieces:

1. **Browser sprite preview** (vanilla JS) — sprite_preview mode reads pixellab character `metadata.json` + 8 directional PNGs, supports keyboard interaction. Empty-state until designer drops in a real sprite.
2. **pixellab → Tiled converter** (Python, in [tools/](tools/)) — turns pixellab Map Editor exports and pixellab character exports into Tiled `.tmx` / `.tsx` files that `flame_tiled` can directly consume.

[asset-lab-plan.md](asset-lab-plan.md) is the design doc + decision log; **read it before any non-trivial work**. Major scope shift on 2026-05-05: dropped the in-browser level preview (Tiled does this better). See plan's 修订记录 section.

## What this tool is (and is NOT)

asset-lab is the **bridge layer** between pixellab.ai (resource generation) and cute_pet (the game, Flutter+Flame+GetX).

- ✅ Sprite 8-direction preview that pixellab's web UI doesn't do
- ✅ pixellab → Tiled conversion (Map Editor exports + character exports)
- ✅ Asset organization via git (`assets/`)
- ❌ **Not a level editor** — Tiled is. Designer installs Tiled.
- ❌ **Not a game engine** — cute_pet uses Flame.
- ❌ **Not a Flutter/Dart project** — we hand cute_pet a spec, they implement it.

## Hard constraints (do not violate without explicit user sign-off)

These are load-bearing decisions, not preferences. From plan §9.

### Browser side (sprite preview)
- **Zero build, zero deps.** No npm, no React/Vue/Phaser/p5, no webpack/vite. Pure HTML + Vanilla JS + Canvas 2D. Designer + Claude Code vibe-codes on raw JS.
- **pixellab `metadata.json` is upstream contract.** Never change field semantics. Hard-error on `export_version !== "2.0"`.
- **Direction strings stay raw.** Use pixellab's literal `south`, `south-east`, `east`, ... in code. Do NOT translate to `N/E/S/W`.
- **Pixel purity is P0.** `ctx.imageSmoothingEnabled = false` AND CSS `image-rendering: pixelated`. Zoom is integer-only (2/3/4/6/8, default 4). Reject non-integer zoom.

### Converter side (Python in tools/)
- **Layered architecture is load-bearing.** `tools/converters/` has three sections: `pixellab/` (parsers), `ir.py` (tool-agnostic intermediate representation), `tiled/` (writers). **Parsers must not import from writers, and vice versa.** Future migration (pixellab → some other tool, or Tiled → Phaser format) only swaps one side. Verify with `grep -rn pixellab tools/converters/tiled/` (must be empty modulo docstrings).
- **Stdlib only.** No pip dependencies. Same "zero deps" spirit as browser side.
- **CLI must be safe to re-run** (idempotent, overwrites cleanly).
- **`temporary_asset/` is a workflow buffer, never source of truth.** Contents are in `.gitignore`. Designer drops pixellab exports here, runs converter, output goes into `assets/`. The original pixellab exports live in pixellab.ai itself, not in this repo.

### Cross-cutting
- **Don't replace Tiled.** No in-browser level editor. No level JSON schema. If feature seems to need it, push back to "let designer use Tiled."
- **Don't write Flutter/Dart code in this repo.** cute_pet is its own project. We write specs in [docs/cute_pet_integration.md](docs/cute_pet_integration.md), they implement.

## Architecture

### Browser side
- `core/` — `renderer.js` (pixel-purity + integer zoom), `input.js` (keymap-driven prompt panel), `version_guard.js` (export_version check).
- `loaders/` — `sprite_loader.js` (the only one left after Tiled adoption); `_image.js` (small shared `loadImage(src)` helper).
- `modes/sprite_preview.js` — single mode now (level preview was dropped).
- `keymap.js` — only `SPRITE_KEYMAP` left.
- `index.html` — minimal entry, no mode toggle.

### Converter side ([tools/](tools/))
- `pixellab_to_tiled.py` — CLI orchestrator. Handles file copies, output paths, calls parsers + writers.
- `converters/ir.py` — `TileMap`, `ImageLayer`, `ObjectLayer`, `MapObject`, `Sprite`, `SpriteFrame` dataclasses. **Tool-agnostic.**
- `converters/pixellab/parse_map.py` — pixellab Map Editor export → `IR.TileMap` (image layer + walls/furniture object layers) + auxiliary terrain grid for sidecar JSON.
- `converters/pixellab/parse_sprite.py` — pixellab character export → `IR.Sprite` (8 frames with `direction` property each).
- `converters/tiled/write_tmx.py` — IR → Tiled `.tmx` XML.
- `converters/tiled/write_tsx.py` — IR → Tiled `.tsx` XML (image collection style).

See [tools/converters/README.md](tools/converters/README.md) for the decoupling rules and how to add a new source/target.

## Running

### Browser (sprite preview)
**Cannot double-click `index.html`** — `file://` blocks fetch. Always serve over HTTP:
```bash
python3 -m http.server 8000      # or `npx serve`, or VS Code Live Server
```

### Converter
```bash
python3 tools/pixellab_to_tiled.py --map-input "temporary_asset/{export}/" --name {map_name}
python3 tools/pixellab_to_tiled.py --sprites
```

There is no test suite, no lint, no CI. This is a debugging/conversion tool, not a product.

## Working with the designer

Primary user is one designer using Claude Code in VS Code + Tiled (GUI level editor) + pixellab (asset generation).

- **Sprite preview tweaks**: if designer wants "show animation FPS" or "switch sprite via Tab", that's vibe-code-able in `modes/sprite_preview.js` (~30-80 LOC at a time, per plan §9).
- **Converter changes**: if a new pixellab field appears or a new Tiled convention is needed, that's a converter change. Stay in the parser/writer split; don't blob logic into the CLI orchestrator.
- **Don't touch `temporary_asset/`** when restructuring directories — that's the designer's drop zone.
- **If the request is "preview a level in the browser,"** redirect to "open .tmx in Tiled" instead. Don't reintroduce level_preview.

## pixellab MCP

Already registered at user scope (`claude mcp add pixellab ...` writes to `~/.claude.json`). Token is not in this repo. `.mcp.json.example` provided for repo-scope users; `.mcp.json` itself is `.gitignore`d. pixellab MCP only exposes generation tools; asset inventory is git, not pixellab.

## Cute_pet integration

[docs/cute_pet_integration.md](docs/cute_pet_integration.md) is the **contract** for the downstream Flutter project. asset-lab schema/path/Tiled-convention changes go there first. cute_pet engineers read it as their source of truth. Don't put cute_pet-specific Dart code in this repo.
