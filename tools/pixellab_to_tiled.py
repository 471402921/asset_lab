#!/usr/bin/env python3
"""pixellab → Tiled converter CLI.

Pipeline (decoupled architecture):
    pixellab export -> parser/* -> IR -> writer/tiled/* -> .tmx + .tsx

Usage:
    # Convert one pixellab Map Editor export
    python3 tools/pixellab_to_tiled.py \\
        --map-input  temporary_asset/Untitled\\ Map-export-2/ \\
        --name       pixellab_demo_001 \\
        --walls      1

    # Also (or only) convert all pixellab character sprites in assets/sprites/
    python3 tools/pixellab_to_tiled.py --sprites

    # Both at once
    python3 tools/pixellab_to_tiled.py \\
        --map-input  temporary_asset/Untitled\\ Map-export-2/ \\
        --name       pixellab_demo_001 \\
        --sprites

Outputs (relative to repo root):
    Map mode:
        assets/maps/{name}.tmx
        assets/tilesets/{name}/composite.png
        assets/tilesets/{name}/tiles/{short}.png         (renamed wang PNGs)
        assets/tilesets/{name}/terrain-info.json
    Sprite mode:
        assets/sprites/{sprite_name}/{sprite_name}.tsx   (per sprite)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

# Make tools/ importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from converters.pixellab.parse_map import parse_map
from converters.pixellab.parse_sprite import parse_sprite
from converters.tiled.write_tmx import write_tmx
from converters.tiled.write_tsx import write_sprite_tsx


REPO_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = REPO_ROOT / "assets"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="pixellab -> Tiled (.tmx/.tsx) converter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--map-input",
        type=Path,
        help="pixellab Map Editor export directory (containing map.json)",
    )
    parser.add_argument(
        "--name",
        help="Output name for the map (becomes assets/maps/{name}.tmx). "
        "Required if --map-input given.",
    )
    parser.add_argument(
        "--walls",
        type=int,
        default=1,
        help="Which terrainId becomes the walls collision layer (default: 1)",
    )
    parser.add_argument(
        "--sprites",
        action="store_true",
        help="Also generate .tsx for each pixellab sprite in assets/sprites/",
    )
    args = parser.parse_args()

    did_anything = False

    if args.map_input:
        if not args.name:
            parser.error("--name is required when --map-input is given")
        convert_map(args.map_input.resolve(), args.name, args.walls)
        did_anything = True

    if args.sprites:
        convert_all_sprites()
        did_anything = True

    if not did_anything:
        parser.print_help()
        return 1

    print("\n[OK] converter done")
    return 0


def convert_map(input_dir: Path, name: str, walls_terrain_id: int) -> None:
    print(f"[map] parsing {input_dir} (walls=terrainId {walls_terrain_id})")
    parsed = parse_map(input_dir, walls_terrain_id=walls_terrain_id)

    tileset_out_dir = ASSETS_DIR / "tilesets" / name
    tiles_out_dir = tileset_out_dir / "tiles"
    map_out_path = ASSETS_DIR / "maps" / f"{name}.tmx"
    terrain_info_path = tileset_out_dir / "terrain-info.json"

    tileset_out_dir.mkdir(parents=True, exist_ok=True)
    tiles_out_dir.mkdir(parents=True, exist_ok=True)
    map_out_path.parent.mkdir(parents=True, exist_ok=True)

    # Copy composite.
    composite_dst = tileset_out_dir / "composite.png"
    shutil.copy2(parsed.composite_source, composite_dst)
    print(f"[map]   wrote {composite_dst.relative_to(REPO_ROOT)}")

    # Copy + rename wang tilesets.
    for short_name, src in parsed.wang_tile_sources.items():
        dst = tiles_out_dir / f"{short_name}.png"
        shutil.copy2(src, dst)
        print(f"[map]   wrote {dst.relative_to(REPO_ROOT)}")

    # Set image_path on the IR ImageLayer relative to the .tmx output path.
    # .tmx is at assets/maps/{name}.tmx
    # composite is at assets/tilesets/{name}/composite.png
    # so relative path is ../tilesets/{name}/composite.png
    for layer in parsed.tilemap.layers:
        # ImageLayer is the only layer type with image_path; check by attribute
        # to avoid importing ir here just for isinstance.
        if hasattr(layer, "image_path") and layer.image_path == "":
            layer.image_path = f"../tilesets/{name}/composite.png"

    # Write .tmx.
    write_tmx(parsed.tilemap, map_out_path)
    print(f"[map]   wrote {map_out_path.relative_to(REPO_ROOT)}")

    # Write terrain-info.json (flat grid + terrain dict).
    terrain_info = {
        "tileSize": parsed.tilemap.tile_width,
        "width": parsed.tilemap.width,
        "height": parsed.tilemap.height,
        "terrains": {str(tid): name for tid, name in parsed.terrain_id_to_name.items()},
        "wallsTerrainId": walls_terrain_id,
        "grid": parsed.terrain_grid,
    }
    terrain_info_path.write_text(json.dumps(terrain_info, indent=2, ensure_ascii=False))
    print(f"[map]   wrote {terrain_info_path.relative_to(REPO_ROOT)}")


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
