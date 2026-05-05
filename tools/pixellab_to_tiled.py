#!/usr/bin/env python3
"""pixellab → Tiled converter CLI.

Pipeline (decoupled architecture):
    pixellab character export -> parser -> IR -> writer -> .tsx

Current scope: only character sprites. Map / tilemap conversion was
removed on 2026-05-05 — the designer edits maps in Tiled directly,
so asset-lab no longer transforms map data.

Usage:
    # Generate Tiled .tsx for every pixellab sprite in assets/sprites/.
    # Re-runnable; overwrites existing {name}.tsx files.
    python3 tools/pixellab_to_tiled.py --sprites

Outputs (relative to repo root):
    assets/sprites/{sprite_name}/{sprite_name}.tsx   (per sprite)

If a sprite directory is missing metadata.json or has a wrong
export_version, it's skipped with a warning (other sprites still convert).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make tools/ importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from converters.pixellab.parse_sprite import parse_sprite
from converters.tiled.write_tsx import write_sprite_tsx


REPO_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = REPO_ROOT / "assets"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="pixellab → Tiled (.tsx) converter (sprite-only).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--sprites",
        action="store_true",
        help="Generate .tsx for every pixellab sprite in assets/sprites/",
    )
    args = parser.parse_args()

    if not args.sprites:
        parser.print_help()
        return 1

    convert_all_sprites()
    print("\n[OK] converter done")
    return 0


def convert_all_sprites() -> None:
    sprites_root = ASSETS_DIR / "sprites"
    if not sprites_root.exists():
        print("[sprites] no assets/sprites/ directory; nothing to do")
        return

    sprite_dirs = [
        d for d in sprites_root.iterdir()
        if d.is_dir() and (d / "metadata.json").exists()
    ]
    if not sprite_dirs:
        print("[sprites] no sprite directories with metadata.json found")
        return

    for sprite_dir in sprite_dirs:
        print(f"[sprite] parsing {sprite_dir.relative_to(REPO_ROOT)}")
        try:
            sprite = parse_sprite(sprite_dir)
        except Exception as e:
            print(f"[sprite]   SKIP: {e}")
            continue
        out_path = sprite_dir / f"{sprite.name}.tsx"
        write_sprite_tsx(sprite, out_path)
        print(f"[sprite]   wrote {out_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
