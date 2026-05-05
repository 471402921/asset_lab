"""pixellab Map Editor export -> IR.TileMap.

Reads:
    - map.json               (terrain definitions, dimensions, tilesets manifest)
    - terrain-map.json       (sparse: which terrain at each cell + default)
    - map-composite.png      (rendered preview, used as image layer)
    - tilesets/*.png         (wang tilesets, copied + renamed by orchestrator)

Outputs:
    PixellabMapParsed = IR.TileMap (image layer + walls + furniture-empty)
    + auxiliary data (terrain grid, file paths) for the orchestrator to
    use when producing terrain-info.json and copying assets.

The IR.TileMap returned has its ImageLayer.image_path set to "" — the
CLI orchestrator must set it after deciding the output directory layout.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..ir import TileMap, ImageLayer, ObjectLayer, MapObject


@dataclass
class PixellabMapParsed:
    tilemap: TileMap
    terrain_grid: list[list[int]]            # [row][col] = terrainId
    terrain_id_to_name: dict[int, str]       # 1 -> "black void..."
    composite_source: Path                   # source path of map-composite.png
    wang_tile_sources: dict[str, Path] = field(default_factory=dict)
    # short_name -> source path of wang tileset PNG
    # short_name is something like "void_beige" computed from terrain prompts


def parse_map(input_dir: Path, walls_terrain_id: int = 1) -> PixellabMapParsed:
    """Parse a pixellab Map Editor export directory.

    Args:
        input_dir: directory with map.json + terrain-map.json + tilesets/
        walls_terrain_id: which terrainId becomes 'walls' collision objectgroup.
            Default 1 = "black void" (pixellab convention).

    Raises:
        FileNotFoundError if required files missing.
        KeyError if map.json schema doesn't match expected pixellab format.
    """
    map_json_path = input_dir / "map.json"
    terrain_map_path = input_dir / "terrain-map.json"
    composite_path = input_dir / "map-composite.png"

    if not map_json_path.exists():
        raise FileNotFoundError(f"Missing map.json in {input_dir}")
    if not terrain_map_path.exists():
        raise FileNotFoundError(f"Missing terrain-map.json in {input_dir}")
    if not composite_path.exists():
        raise FileNotFoundError(f"Missing map-composite.png in {input_dir}")

    with open(map_json_path) as f:
        map_data = json.load(f)
    with open(terrain_map_path) as f:
        terrain_data = json.load(f)

    cfg = map_data["mapConfig"]
    width = cfg["dimensions"]["width"]
    height = cfg["dimensions"]["height"]
    pixel_w = cfg["dimensions"]["pixelWidth"]
    pixel_h = cfg["dimensions"]["pixelHeight"]
    tile_size = cfg["tileSize"]

    # pixellab uses a "world coordinate" boundingBox; subtract minX/minY
    # to translate into local 0-based grid coords.
    bbox = cfg["boundingBox"]
    min_x, min_y = bbox["minX"], bbox["minY"]

    terrain_id_to_name: dict[int, str] = {
        t["id"]: t["name"] for t in map_data["terrains"]
    }

    default_terrain = terrain_data.get("defaultTerrain", 1)

    # Flatten sparse terrain data into a dense width x height grid.
    grid: list[list[int]] = [
        [default_terrain for _ in range(width)] for _ in range(height)
    ]
    for cell in terrain_data.get("cells", []):
        local_x = cell["x"] - min_x
        local_y = cell["y"] - min_y
        if 0 <= local_x < width and 0 <= local_y < height:
            grid[local_y][local_x] = cell["terrainId"]

    # Build IR layers.
    # ImageLayer.image_path left empty here; CLI will set the relative path
    # once it knows where the .tmx will live.
    image_layer = ImageLayer(
        name="background",
        image_path="",
        image_width=pixel_w,
        image_height=pixel_h,
    )

    walls_objects: list[MapObject] = []
    for row in range(height):
        for col in range(width):
            if grid[row][col] == walls_terrain_id:
                walls_objects.append(
                    MapObject(
                        x=col * tile_size,
                        y=row * tile_size,
                        width=tile_size,
                        height=tile_size,
                    )
                )

    # Walls layer = static map collision.
    # Furniture layer = empty slot, designer fills in Tiled (per-tile
    # collision will travel with the tile's tileset, so this layer just
    # holds tile-object references when designer drops furniture in).
    layers = [
        image_layer,
        ObjectLayer(name="walls", objects=walls_objects),
        ObjectLayer(name="furniture", objects=[]),
    ]

    tilemap = TileMap(
        name=map_data.get("name", input_dir.name) or input_dir.name,
        width=width,
        height=height,
        tile_width=tile_size,
        tile_height=tile_size,
        layers=layers,
        properties={
            "sourceTool": "pixellab-map-editor",
            "sourceVersion": map_data.get("version", ""),
            "wallsTerrainId": str(walls_terrain_id),
        },
    )

    # Discover wang tileset source files. pixellab names them with full
    # prompt strings, which are too long for sane filenames; produce short
    # canonical names.
    wang_sources: dict[str, Path] = {}
    tilesets_dir = input_dir / "tilesets"
    if tilesets_dir.exists():
        for tileset_def in map_data.get("tilesets", []):
            full_path = tilesets_dir / tileset_def["filename"]
            if full_path.exists():
                short = (
                    f"{_shorten(tileset_def['lowerTerrain'])}"
                    f"_{_shorten(tileset_def['upperTerrain'])}"
                )
                # Disambiguate if duplicate after shortening.
                if short in wang_sources:
                    short = f"{short}_{tileset_def['id'][:6]}"
                wang_sources[short] = full_path

    return PixellabMapParsed(
        tilemap=tilemap,
        terrain_grid=grid,
        terrain_id_to_name=terrain_id_to_name,
        composite_source=composite_path,
        wang_tile_sources=wang_sources,
    )


# Words to drop when shortening pixellab terrain prompts — they're padding,
# not identifying. Keep substantive material words.
_SKIP_WORDS = {
    "and", "or", "the", "a", "an", "of", "with", "warm", "cold", "empty",
    "dark", "light", "subtle", "flat", "horizontal", "vertical", "ash",
    "pale", "between", "tones", "background", "pattern", "joints", "visible",
    "staggered", "shadow", "surface", "floor", "low", "top", "down", "view",
}


def _shorten(prompt: str, max_words: int = 2) -> str:
    """Take 1-2 substantive words from a pixellab terrain prompt for use
    as a short identifier.

    >>> _shorten("black void, empty dark background")
    'black_void'
    >>> _shorten("beige diamond tile floor, warm cream and brown tones")
    'beige_diamond'
    """
    words = re.findall(r"[a-z]+", prompt.lower())
    keep = [w for w in words if w not in _SKIP_WORDS][:max_words]
    if not keep:
        keep = words[:max_words] or ["unnamed"]
    return "_".join(keep)
