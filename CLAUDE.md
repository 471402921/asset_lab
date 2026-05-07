# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Working MVP. Three pieces (long-term scope):

1. **GitHub-based asset file management** — `assets/` directory holds all resources, designer drops files in, git tracks history. asset-lab does no special processing on most of it.
2. **pixellab sprite → Tiled `.tsx` converter** (Python, [tools/](tools/)) — turns pixellab character exports into Tiled `.tsx` (image collection, 8-direction tiles with `direction` property). **Sprite-only**; map/tilemap conversion was deleted on 2026-05-05.
3. **Browser sprite preview** (vanilla JS) — sprite_preview reads pixellab character `metadata.json` + N directional PNGs (N ∈ {4, 8}, **designer chose 4 cardinals as of 2026-05-05**), supports keyboard interaction (face / zoom / state / animation playback). Face keymap is sprite-driven: 4-dir sprites only show WASD; 8-dir sprites also wire QEZC. **Mobile touch UI** auto-enabled via `(pointer: coarse), (max-width: 900px)` media query — DPad + state strip + playback + zoom buttons; desktop keyboards keep working unchanged. Schema + fallback rules in plan §13.1.

Plus a **temporary scaffold**: **Browser level runtime preview** ([preview/](preview/), Phaser via CDN lazy-load). Lets the designer "walk around" a freshly-edited `.tmj` in the browser. Plays sprite walking animation when player moves (heuristic state_key lookup). Movement keys also sprite-driven (4-dir sprites only allow WASD). **Mobile touch UI** has floating overlay DPad + zoom button (won't bloat preview/main.js since it shares the same DOM container declared in index.html). **Will be removed** once cute_pet engineer ships `lib/demo/level_preview.dart`. Do NOT let `preview/` accrete business logic — it's a bridge, not a long-term home.

[asset-lab-plan.md](asset-lab-plan.md) is the design doc + decision log; **read it before any non-trivial work**. Major scope shifts logged in its 修订记录:
- 2026-05-05: dropped in-browser level preview (Tiled does this better)
- 2026-05-05 (later same day): dropped pixellab Map Editor → .tmx converter (designer prefers Tiled directly; pixellab now only outputs basic PNG elements + sprites)
- 2026-05-05 (later again): added `preview/` Phaser temporary scaffold for level runtime preview while cute_pet engineer waits for schema to stabilize
- 2026-05-05 (4th revision): sprite animation + state switching landed (STATE SLOT placeholder → real impl) when first sprite arrived
- 2026-05-05 (5th revision): sprite cut to 4-cardinal directions; code became sprite-driven for direction count; sprite schema 雏形 declared stable
- 2026-05-05 (6th revision): mobile touch UI added (sprite + level both); media-query gated, zero desktop regression
- 2026-05-05 (7th revision): final assets/ directory layout settled (scenes/ replaces maps/, tile/ replaces tilesets/, items/ deeply categorized, +effects/fonts/ui/wall); preview/main.js gains external .tsx loader + object-layer tile-object rendering + `solid:true` collision (designer shipped first real .tmj `interior_test.tmj`)
- 2026-05-07: lissy joins as second designer (branch `lissy`). preview/ gains: Tiled tile-object **rotation** support (`obj.rotation`, pivots at bottom-left, AABB body for solid+rotated); per-shape collision via Tiled's **Collision Editor** (each shape inside a tile's `<objectgroup>` can carry `solid:true`, allowing precise footprints like "cabinet base solid, cabinet body not"); mobile **1:1 rendering** (`Phaser.Scale.RESIZE` + zoom 1×, full 384×576 map fits on phone); deploy.sh accepts `ASSET_LAB_SSH_KEY` env override per-developer. New default scene `assets/scenes/test2/untitled.tmj` (lissy's). Old `assets/scenes/test/` removed.

## What this tool is (and is NOT)

asset-lab is the **bridge layer** between pixellab.ai (resource generation) and cute_pet (the game, Flutter+Flame+GetX).

- ✅ git-managed asset directory
- ✅ Sprite preview with N-direction support (4 or 8, sprite-driven from `character.directions`) — pixellab's web UI doesn't do keyboard interaction; mobile touch UI auto-enabled on coarse-pointer devices
- ✅ pixellab character → Tiled `.tsx` conversion (sprite-only)
- ✅ Browser level runtime preview (`preview/`, Phaser, **temporary scaffold**) — lets designer walk around a `.tmj`. Cute_pet engineer will replace this with their own `lib/demo/level_preview.dart`
- ❌ **Not a level editor** — Tiled is. Designer installs Tiled and edits/exports .tmj directly.
- ❌ **Not a map converter** — pixellab Map Editor isn't in the pipeline anymore. If it comes back, the layered converter architecture means we add a parser; doesn't break sprite path.
- ❌ **Not a game engine** — cute_pet uses Flame. `preview/` uses Phaser only as a temporary scaffold to let designer "walk around"; it does NOT implement business logic, state machines, NPC AI, dialogue, inventory, etc.
- ❌ **Not a Flutter/Dart project** — we hand cute_pet a spec, they implement it.

## Hard constraints (do not violate without explicit user sign-off)

These are load-bearing decisions, not preferences. From plan §9.

### Browser side (sprite preview)
- **Zero build, zero deps.** No npm, no React/Vue/Phaser/p5, no webpack/vite. Pure HTML + Vanilla JS + Canvas 2D. Designer + Claude Code vibe-codes on raw JS.
- **pixellab `metadata.json` is upstream contract.** Never change field semantics. Hard-error on `export_version !== "2.0"`.
- **Direction strings stay raw.** Use pixellab's literal `south`, `east`, `north`, `west` (and `south-east` etc. when 8-dir) in code. Do NOT translate to `N/E/S/W`. Don't hardcode the direction count — `character.directions ∈ {4, 8}`, derive from `frames.rotations` keys.
- **Pixel purity is P0.** `ctx.imageSmoothingEnabled = false` AND CSS `image-rendering: pixelated`. Zoom is integer-only (2/3/4/6/8, default 4 desktop / 6 mobile). Reject non-integer zoom. **No pinch-to-zoom on mobile** (would break this).
- **STATE SLOT is implemented (2026-05-05).** When first real sprite arrived with non-empty `frames.animations`, the placeholder became real (Tab + Digit1-9 + Space + [/]). Same rule still applies for **future schema discoveries**: don't guess at unknown pixellab fields — wait for real samples and update plan §13/§14 first. Add new fallback rules to plan §13.1 (current rule: exact dir → south → static rotation; no mirror fallback).

### Converter side (Python in tools/)
- **Layered architecture is load-bearing.** `tools/converters/` has three sections: `pixellab/` (parsers), `ir.py` (tool-agnostic intermediate representation), `tiled/` (writers). **Parsers must not import from writers, and vice versa.** Future migration (pixellab → some other tool, or Tiled → another engine target) only swaps one side. Verify with `grep -rn pixellab tools/converters/tiled/` (must be empty modulo docstrings).
- **Stdlib only.** No pip dependencies. Same "zero deps" spirit as browser side.
- **CLI must be safe to re-run** (idempotent, overwrites cleanly).
- **`temporary_asset/` is a workflow buffer, never source of truth.** Contents are in `.gitignore`. Originally for pixellab raw exports; current usage is minimal since pipeline narrowed. Don't store assets here.
- **Don't add IR types speculatively.** TileMap/ImageLayer/etc. were deleted when their use case (map converter) went away. Only add IR types when there's a real consumer. The architecture's value is enabling future addition cheaply, not having lots of types preemptively.

### Cross-cutting
- **Don't replace Tiled.** No in-browser level editor. No level JSON schema. If feature seems to need it, push back to "let designer use Tiled."
- **Don't reintroduce map conversion.** Designer dropped it deliberately. If feature seems to need it, ask the user why first.
- **Don't write Flutter/Dart code in this repo.** cute_pet is its own project. We write specs in [docs/cute_pet_integration.md](docs/cute_pet_integration.md), they implement.
- **`assets/` subdirectory layout is owned by the designer.** Designer finalized 2026-05-05 (round 2 restructure): `scenes/{name}/` (Tiled `.tmj`+`.tsx`), `tile/` (terrain atlases), `wall/`, `items/{大类}/{子类}/` (deeply nested), `sprites/{name}/`, `audio/`, `effects/`, `fonts/`, `ui/`. asset-lab follows; don't impose new top-level dirs without checking.
- **Tiled collision is `solid: true`, applied at TWO granularities** (both honored, per-shape preferred):
  - **Per-tile collision shape** (Tiled "Collision Editor"): inside `<tile><objectgroup><object>...<properties><property name="solid" value="true"/></properties></object>`. Lets one tile have multiple shapes where only some are solid (cabinet body shape non-solid for hint, cabinet base shape solid for footprint). preview/ creates one static body per solid shape, transformed through the tile's flip + rotation. **Designer's preferred path** (precise + reusable across maps).
  - **Tile-level property** (`<tile id=N><properties><property name="solid" value="true"/></properties></tile>`): whole tile is solid. Fallback / lazy-mode for tiles that don't bother with the Collision Editor.
  - NOT `collides:true` — that was an early plan guess, never used. preview/ + cute_pet should both follow `solid`.
- **Tiled tile-object data via Phaser**: see memory `feedback_tiled_phaser_parsing_gotchas.md`. Three things to know before touching object-layer code: (1) Phaser strips flip bits from `obj.gid` and exposes `obj.flippedHorizontal/Vertical/AntiDiagonal` instead. (2) Rotation is `obj.rotation` (degrees, CW, pivots at bottom-left for orthogonal default). (3) Per-tile collision lives on individual SHAPES inside the tile's objectgroup, not on tile properties.

### `preview/` temporary scaffold rules

`preview/` is a Phaser-based runtime so the designer can "walk around" a freshly edited `.tmj` without booting cute_pet. It's a **bridge**, not a permanent feature. Specific guardrails:

- **Lazy-load Phaser via CDN `<script>` tag.** No npm, no bundling, no offline copy. The lazy load is intentional so the sprite-preview path stays fast and Phaser-free.
- **Single-file `preview/main.js`.** Don't split into scene/player/etc. — small surface area, easier to delete entirely when cute_pet engineer ships their demo entry.
- **Keep it boring.** Player walks, walls/furniture stop it, camera follows with two zoom levels. That's it. No state machines, NPC AI, dialogue, inventory, audio, save/load, mobile gestures (pinch / swipe), multi-level switching UI, etc. — those are all cute_pet's job.
- **`.tmj` only (not `.tmx`).** Phaser eats Tiled JSON natively; flame_tiled also supports `.tmj`. **External `.tsx` references are supported** (preview/main.js fetches them, parses XML, splices into Phaser's tilemap cache as embedded data) — Embed Tilesets is no longer required.
- **Honor what designer drew in Tiled**: tile-object `rotation` (deg, CW, BL pivot), `flippedHorizontal/Vertical` (Phaser pre-strips bits from gid), per-tile Collision Editor shapes with `solid:true`. See memory `feedback_tiled_phaser_parsing_gotchas.md` before changing object-layer code.
- **Mobile = 1:1 pixels**. Detect via `(pointer: coarse), (max-width: 900px)` (same media query as touch DPad) → `Phaser.Scale.RESIZE` (canvas internal == DOM == viewport, no upscale) + zoom default 1× (`ZOOM_LEVELS = [1, 2]`). Desktop stays `FIT 640×640` + `[2, 4]`. Don't make this configurable; map height (576) is below typical phone viewport and "原大小" was an explicit designer ask.
- **Mobile touch UI.** DPad + zoom DOM lives in `index.html` (`#level-touch`); `preview/main.js` wires `pointerdown/up` → shared `touchState` object that scene `update()` reads alongside `this.keys`. Don't add gesture libraries — buttons only. Empty state hides touch UI (game isn't running, controls are useless).
- **Don't add features intended for cute_pet to "reuse"** — Phaser JS and Flame Dart aren't interoperable. Code reuse via copy-paste is a fantasy here.
- **When user says "cute_pet engineer wrote demo entry":** propose `git rm -r preview/` + revert `index.html` to single sprite-preview entry + mark plan §14.7 as "removed" + flip `docs/cute_pet_integration.md` accordingly. Do NOT keep `preview/` "just in case."

## Architecture

### Browser side
- `core/` — `renderer.js` (pixel-purity + integer zoom), `input.js` (keymap-driven prompt panel), `version_guard.js` (export_version check).
- `loaders/` — `sprite_loader.js` (loads rotations + animations dict per plan §13.1); `_image.js` (small shared `loadImage(src)` helper).
- `modes/sprite_preview.js` — sprite-preview mode (vanilla JS Canvas). RAF-driven animation playback with fallback chain (exact dir → south → static rotation).
- `preview/main.js` — level-preview mode (Phaser via CDN, **temporary scaffold**, see preview/README.md). Self-contained, doesn't reuse `core/`/`loaders/` deliberately. Plays walking anim heuristically (state_key contains 'walk'); idle anim if state_key contains 'idle'/'stand'/'breath'.
- `keymap.js` — `SPRITE_KEYMAP` (face / animation / state / zoom). Tab + Digit1-9 select state; Space toggles play; [/] step frame.
- `index.html` — single entry, top button bar toggles between sprite preview and level preview. Persists choice via `?mode=...` query param. Lazy-imports `preview/main.js` only when level mode is selected.

### Converter side ([tools/](tools/))
- `pixellab_to_tiled.py` — CLI orchestrator (sprite-only mode: `--sprites`).
- `converters/ir.py` — `Sprite`, `SpriteFrame` dataclasses. Tool-agnostic. Slim now; grow only with real consumers.
- `converters/pixellab/parse_sprite.py` — pixellab character export → `IR.Sprite` (one tile per `frames.rotations` direction, each with `direction` property; `character.directions` ∈ {4, 8} drives the count).
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
python3 tools/pixellab_to_tiled.py --sprites
```

There is no general test suite or CI. **Designer-facing lint** lives at [tools/lint/check_assets.py](tools/lint/check_assets.py), invoked via the `/asset-check` Skill ([.claude/skills/asset-check/SKILL.md](.claude/skills/asset-check/SKILL.md)) — catches filename spaces / typos, broken `.tmj`/`.tsx` paths, iCloud absolute path leaks, sprite metadata vs disk drift. Run it after any designer-side asset change before assuming preview will work.

## Deployment

Live preview at **<https://1.14.190.95/>** (Tencent Cloud CVM, self-signed cert — designer click-throughs the warning). One-line redeploy after editing code:

```bash
./deploy.sh deploy            # rsync → systemctl restart asset-lab-https → curl verify
```

Other [`deploy.sh`](deploy.sh) subcommands: `ssh` / `run "<cmd>"` / `ping`. Server-side runtime is a systemd unit ([deploy/asset-lab-https.service](deploy/asset-lab-https.service)) running [`_https_server.py`](_https_server.py) — a 12-line TLS-wrapped `SimpleHTTPServer` on :443. Logs via `./deploy.sh run 'sudo journalctl -u asset-lab-https -n 50 --no-pager'`.

Hard rules around deploy:
- **Don't reinvent.** All deploy state (host, user, key, port choice, systemd unit) is documented in `deploy.sh`'s header comment. Read it first; don't re-derive.
- **HTTPS on :443 is forced by the security group**, not by HTTP-protocol filtering. The security group on this CVM only opens 22 / 443 / 22940 / 18789. Other ports look reachable (`nc -zv` says "succeeded") but the cloud edge spoofs the TCP handshake and silently drops data — so don't waste time on `python3 -m http.server 8000` thinking it'll work externally. To use a different port: 控制台 → 安全组 → 入站规则.
- **`cert.pem` / `key.pem` live only on the remote** (generated once with `openssl`, gitignored). `deploy` doesn't overwrite them.
- **`_https_server.py` and `deploy/asset-lab-https.service` ARE tracked** — they're the deploy contract.
- **Per-developer SSH key** via `ASSET_LAB_SSH_KEY` env (e.g., lissy: `export ASSET_LAB_SSH_KEY=~/.ssh/lissy.pem` in her shell rc). Default falls back to `~/.ssh/jet.pem`. Don't hardcode the key path in deploy.sh.

## Working with the designer

Primary users are designers (currently jet.d + lissy) using Claude Code in VS Code + Tiled (GUI level editor) + pixellab (sprite + basic PNG generation). Lissy works on the `lissy` git branch; jet.d on `main`. The `lissy` branch is where new scenes / wallsets get iterated on; merge to `main` once stable.

- **Sprite preview tweaks**: if designer wants "show animation FPS" or "switch sprite via Tab", that's vibe-code-able in `modes/sprite_preview.js` (~30-80 LOC at a time, per plan §9).
- **Designer edits the filesystem, not `metadata.json`.** She renames pixellab asset directories directly; metadata only updates when she re-exports from pixellab UI. So metadata can drift relative to disk between exports. **Disk is canonical** — when they diverge, rewrite metadata.json to match disk (don't ask "which is right"). Re-run the converter if `frames.rotations` changed. Confirmed across 3 yellow_Shiba rounds on 2026-05-05.
- **state_key naming**: designer renames at pixellab source to semantic names (`idle` / `walking` / `sleeping` / `lying` / `crouch` etc.). asset-lab does NOT maintain an alias map. Phaser `preview/main.js` finds walking/idle by substring heuristic — designer's semantic names will hit cleanly.
- **Adding per-anim FPS**: if designer wants different speeds per state (currently all 8 fps), add `frames.animations[state].fps` to metadata + read it in sprite_loader.js + apply in both sprite_preview RAF and Phaser anim. Don't pre-implement.
- **Converter changes**: if a new pixellab field appears or a new Tiled convention is needed, that's a converter change. Stay in the parser/writer split; don't blob logic into the CLI orchestrator.
- **Don't touch `temporary_asset/`** when restructuring directories — that's the designer's drop zone.
- **When designer reports "preview broken" / "新资源加载不出来" / "刚导出了 .tmj"**: trigger the `/asset-check` Skill *first*, before guessing what's wrong. Catches 90% of designer-side breakage (path issues, iCloud leaks, metadata drift, filename typos) in seconds. Don't manually grep around unless the lint comes back clean.
- **If the request is "edit a level in the browser"**, redirect to "open .tmj in Tiled" instead. Don't reintroduce a level _editor_ in asset-lab. (Runtime "walking around" is what `preview/` already provides — that's a separate thing and stays.)
- **If the request is "convert this pixellab Map Editor export"**, redirect to "let designer rebuild in Tiled directly". Don't reintroduce map converter.

## pixellab MCP

Already registered at user scope (`claude mcp add pixellab ...` writes to `~/.claude.json`). Token is not in this repo. `.mcp.json.example` provided for repo-scope users; `.mcp.json` itself is `.gitignore`d. pixellab MCP only exposes generation tools; asset inventory is git, not pixellab.

## Cute_pet integration

[docs/cute_pet_integration.md](docs/cute_pet_integration.md) is the **contract** for the downstream Flutter project. asset-lab schema/path/Tiled-convention changes go there first. cute_pet engineers read it as their source of truth. Don't put cute_pet-specific Dart code in this repo.

⚠️ **Current status: DRAFT.** Schema is still iterating; do NOT tell the user "send it to cute_pet team yet." The doc itself has a banner with explicit readiness gates — when all gates green, asset-lab proactively notifies and the banner is removed. Until then, the doc is a working draft, useful for asset-lab's own decision tracking but not yet a stable contract.
