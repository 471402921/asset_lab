#!/usr/bin/env python3
"""asset-check — lint asset-lab files for typical designer pitfalls.

Run from repo root:
    python3 tools/lint/check_assets.py
    python3 tools/lint/check_assets.py --quiet
    python3 tools/lint/check_assets.py --path assets/scenes/test

Reports issues with suggested fixes. Exits 1 if any ERROR; 0 otherwise.
Stdlib only — no pip dependencies (per asset-lab hard constraint).
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ASSETS = REPO_ROOT / "assets"
PREVIEW_MAIN = REPO_ROOT / "preview" / "main.js"

ICLOUD_MARKERS = ("Mobile Documents", "Library/Containers", "com~apple~CloudDocs", "iCloud")

# items/{cat}/ → expected filename prefix for descendants. None = skip (less standardized).
ITEM_PREFIXES = {
    "furniture": "furniture_",
    "decor": "decor_",
    "lighting": "lighting_",
    "personal": None,
    "electronics": None,
    "nature": None,
}

issues = []  # list of (Path, severity, message)


def err(path, msg):
    issues.append((path, "ERROR", msg))


def warn(path, msg):
    issues.append((path, "WARN", msg))


def _rel(p):
    p = Path(p)
    try:
        return p.relative_to(REPO_ROOT)
    except ValueError:
        return p


def _walk_files(root):
    for r, _, files in os.walk(root):
        for f in files:
            if f in (".DS_Store", ".gitkeep"):
                continue
            yield Path(r) / f


def check_filenames(scope):
    for f in _walk_files(scope):
        name = f.name
        rel = _rel(f)
        if " " in name:
            fixed = f.parent / name.replace(" ", "_")
            err(rel, f'filename contains space(s): "{name}"\n'
                     f'    Fix: mv "{f}" "{fixed}"\n'
                     f'         # then grep -rn "{name}" assets/ preview/ index.html — update any reference')
        try:
            name.encode("ascii")
        except UnicodeEncodeError:
            warn(rel, f'filename has non-ASCII chars: "{name}" (preview / cute_pet may handle, but pixellab + Tiled prefer ASCII)')


def check_item_prefixes(scope):
    items = ASSETS / "items"
    if not items.exists() or items not in scope.parents and scope != items and not str(scope).startswith(str(items)):
        # If scope doesn't include items/, skip
        try:
            items.relative_to(scope)
        except ValueError:
            if not (str(items).startswith(str(scope)) or str(scope).startswith(str(items))):
                return

    for cat_dir in items.iterdir():
        if not cat_dir.is_dir():
            continue
        prefix = ITEM_PREFIXES.get(cat_dir.name)
        if not prefix:
            continue
        for png in cat_dir.rglob("*.png"):
            if png.name.startswith(prefix):
                continue
            # Likely typo: missing leading char of expected prefix?
            suggestion = ""
            if len(prefix) > 1 and png.name.startswith(prefix[1:]):
                fixed = png.parent / (prefix[0] + png.name)
                suggestion = (f'\n    Likely typo (missing leading "{prefix[0]}"). '
                              f'Fix: mv "{png}" "{fixed}"\n'
                              f'         # then grep -rn "{png.name}" assets/scenes — update any .tsx reference')
            err(_rel(png),
                f'filename "{png.name}" does not start with expected prefix "{prefix}" '
                f'for items/{cat_dir.name}/{suggestion}')


def _bad_path_kind(src):
    """Return 'icloud' / 'absolute' / None for a path source string."""
    if any(m in src for m in ICLOUD_MARKERS):
        return "icloud"
    if os.path.isabs(src) or re.match(r"^[A-Za-z]:[\\/]", src):
        return "absolute"
    return None


def check_tmj(tmj_path):
    rel = _rel(tmj_path)
    try:
        data = json.loads(tmj_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        err(rel, f"invalid JSON: {e}")
        return

    firstgids = []
    for i, ts in enumerate(data.get("tilesets", [])):
        src = ts.get("source")
        if src is None:
            # Embedded — sanity check
            if "tiles" not in ts and "image" not in ts:
                warn(rel, f"tilesets[{i}] embedded but has neither 'tiles' nor 'image' field")
            firstgids.append((ts.get("firstgid", 1), None))
            continue
        kind = _bad_path_kind(src)
        if kind == "icloud":
            err(rel, f'tilesets[{i}].source is iCloud / non-portable path:\n'
                     f'      "{src}"\n'
                     f'    Suggestion: copy "{Path(src).name}" alongside this .tmj and use sibling form\n'
                     f'    Root cause: Tiled saves source paths relative to its project root. If your project\n'
                     f'                root is in iCloud, paths leak. Move the Tiled project into asset_lab/assets/scenes/.')
            continue
        if kind == "absolute":
            err(rel, f'tilesets[{i}].source is absolute path: "{src}"\n'
                     f'    Suggestion: use sibling form "{Path(src).name}"')
            continue
        tsx_path = (tmj_path.parent / src).resolve()
        if not tsx_path.exists():
            sibling = tmj_path.parent / Path(src).name
            hint = f'\n    Hint: sibling "{Path(src).name}" exists — try changing source to just "{Path(src).name}"' if sibling.exists() else ""
            err(rel, f'tilesets[{i}].source does not resolve to existing file:\n'
                     f'      source="{src}"  →  {_rel(tsx_path)}{hint}')
            firstgids.append((ts.get("firstgid", 1), None))
            continue
        firstgids.append((ts.get("firstgid", 1), tsx_path))

    # Layer gid sanity (cheap check: no gid below smallest firstgid)
    if firstgids:
        min_fg = min(fg for fg, _ in firstgids)
        all_gids = set()
        for layer in data.get("layers", []):
            if layer.get("type") == "tilelayer":
                all_gids.update(g for g in layer.get("data", []) if g)
            elif layer.get("type") == "objectgroup":
                # 'walls' legacy layer uses empty rects (no gid) — fine
                for obj in layer.get("objects", []):
                    if obj.get("gid"):
                        all_gids.add(obj["gid"])
        orphan = [g for g in all_gids if g < min_fg]
        if orphan:
            warn(rel, f"layer references gid={orphan[0]} below smallest firstgid={min_fg} — orphan tile, missing tileset?")


def check_tsx(tsx_path):
    rel = _rel(tsx_path)
    try:
        tree = ET.parse(tsx_path)
    except (ET.ParseError, UnicodeDecodeError) as e:
        err(rel, f"invalid XML: {e}")
        return
    root = tree.getroot()

    def _check_image(src, ctx):
        kind = _bad_path_kind(src)
        if kind == "icloud":
            err(rel, f'{ctx} image source is iCloud / non-portable:\n'
                     f'      "{src}"\n'
                     f'    Suggestion: copy PNG into assets/ and use a relative path under it')
            return
        if kind == "absolute":
            err(rel, f'{ctx} image source is absolute path: "{src}"')
            return
        png = (tsx_path.parent / src).resolve()
        if png.exists():
            return
        # Try common adjustments — wrong number of "../" levels
        hint = ""
        depth_alts = []
        for prefix in ("../", "../../", "../../../"):
            alt_src = prefix + src.lstrip("./")
            alt_png = (tsx_path.parent / alt_src).resolve()
            if alt_png.exists():
                depth_alts.append(alt_src)
        if depth_alts:
            hint = f'\n    Hint: file exists if you change source to one of: {", ".join(repr(s) for s in depth_alts)}\n' \
                   f'           (your relative path likely has the wrong number of "../" segments)'
        err(rel, f'{ctx} image source does not exist on disk:\n'
                 f'      source="{src}"  →  resolved to {_rel(png)}{hint}')

    for img in root.findall("image"):
        s = img.get("source")
        if s:
            _check_image(s, "<image> (atlas style)")
    for tile in root.findall("tile"):
        tid = tile.get("id", "?")
        for img in tile.findall("image"):
            s = img.get("source")
            if s:
                _check_image(s, f"<tile id={tid}>")


def check_sprite_metadata(scope):
    sprites = ASSETS / "sprites"
    if not sprites.exists():
        return
    for sprite_dir in sprites.iterdir():
        if not sprite_dir.is_dir():
            continue
        # Honor scope
        try:
            sprite_dir.relative_to(scope)
        except ValueError:
            if not (str(sprite_dir).startswith(str(scope)) or str(scope).startswith(str(sprite_dir))):
                continue

        meta_path = sprite_dir / "metadata.json"
        if not meta_path.exists():
            warn(_rel(sprite_dir), "sprite directory has no metadata.json — incomplete pixellab export?")
            continue
        rel = _rel(meta_path)
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            err(rel, f"invalid JSON: {e}")
            continue

        ev = meta.get("export_version")
        if ev != "2.0":
            err(rel, f'export_version="{ev}" (browser version_guard hard-errors on != "2.0")')

        char = meta.get("character") or {}
        declared_dirs = char.get("directions")
        rotations = (meta.get("frames") or {}).get("rotations") or {}
        if declared_dirs is not None and declared_dirs != len(rotations):
            warn(rel, f"character.directions={declared_dirs} but frames.rotations has {len(rotations)} entries — "
                       f"set directions={len(rotations)} (or add missing rotation files)")

        referenced = set()
        for d, p in rotations.items():
            full = (sprite_dir / p).resolve()
            referenced.add(full)
            if not full.exists():
                err(rel, f'frames.rotations["{d}"] = "{p}" not found on disk\n'
                         f'    Resolved to: {_rel(full)}')

        animations = (meta.get("frames") or {}).get("animations") or {}
        for state, by_dir in animations.items():
            for d, frames in (by_dir or {}).items():
                for i, p in enumerate(frames):
                    full = (sprite_dir / p).resolve()
                    referenced.add(full)
                    if not full.exists():
                        err(rel, f'frames.animations.{state}.{d}[{i}] = "{p}" not found on disk')

        all_pngs = {p.resolve() for p in sprite_dir.rglob("*.png")}
        orphans = sorted(all_pngs - referenced)
        if orphans:
            sample = ", ".join(str(p.relative_to(sprite_dir)) for p in orphans[:3])
            more = f" (+{len(orphans)-3} more)" if len(orphans) > 3 else ""
            warn(rel, f"{len(orphans)} PNG(s) on disk not referenced by metadata.json: {sample}{more}\n"
                       f"    If these were renamed or new states added in pixellab, re-export metadata\n"
                       f"    OR rewrite metadata.json to match disk (per feedback_designer_edits_disk_not_metadata.md)")


def check_preview_defaults():
    if not PREVIEW_MAIN.exists():
        return
    rel = _rel(PREVIEW_MAIN)
    try:
        txt = PREVIEW_MAIN.read_text(encoding="utf-8")
    except UnicodeDecodeError as e:
        err(rel, f"cannot read: {e}")
        return
    for const in ("DEFAULT_MAP", "DEFAULT_SPRITE_DIR"):
        m = re.search(rf"const\s+{const}\s*=\s*['\"]([^'\"]+)['\"]", txt)
        if not m:
            continue
        target = REPO_ROOT / m.group(1)
        if not target.exists():
            err(rel, f'{const} = "{m.group(1)}" does not exist on disk\n'
                     f'    Fix: either create the asset, or update preview/main.js to point to a real path')


def main():
    ap = argparse.ArgumentParser(description="Lint asset-lab resource files.")
    ap.add_argument("--quiet", action="store_true", help="only print summary line + count")
    ap.add_argument("--path", default=None,
                    help="restrict to a sub-path (default: assets/ + preview/main.js)")
    args = ap.parse_args()

    if not ASSETS.exists():
        print(f"❌ assets/ not found at {ASSETS}", file=sys.stderr)
        return 2

    scope = (REPO_ROOT / args.path).resolve() if args.path else ASSETS
    if not scope.exists():
        print(f"❌ --path {scope} does not exist", file=sys.stderr)
        return 2

    check_filenames(scope)
    if (ASSETS / "items").exists():
        check_item_prefixes(scope)

    scenes = ASSETS / "scenes"
    if scenes.exists():
        for tmj in scenes.rglob("*.tmj"):
            try:
                tmj.relative_to(scope)
            except ValueError:
                if not str(tmj).startswith(str(scope)):
                    continue
            check_tmj(tmj)

    for tsx in ASSETS.rglob("*.tsx"):
        try:
            tsx.relative_to(scope)
        except ValueError:
            if not str(tsx).startswith(str(scope)):
                continue
        check_tsx(tsx)

    check_sprite_metadata(scope)

    if args.path is None:
        check_preview_defaults()

    errs = sum(1 for _, s, _ in issues if s == "ERROR")
    warns = sum(1 for _, s, _ in issues if s == "WARN")

    if not issues:
        print("✅ asset-check: no issues found")
        return 0

    by_file = {}
    for path, sev, msg in issues:
        by_file.setdefault(path, []).append((sev, msg))

    if args.quiet:
        print(f"asset-check: {errs} error(s), {warns} warning(s) across {len(by_file)} file(s)")
    else:
        print(f"🔍 asset-check report — {errs} error(s), {warns} warning(s) across {len(by_file)} file(s)\n")
        for path in sorted(by_file.keys(), key=str):
            print(f"  {path}")
            for sev, msg in by_file[path]:
                symbol = "✗" if sev == "ERROR" else "⚠"
                print(f"    {symbol} {sev:5} {msg}")
            print()

    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
