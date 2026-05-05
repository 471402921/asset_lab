"""IR.Sprite -> Tiled .tsx (image collection tileset).

Each sprite frame becomes a <tile> with its own <image> reference and
a "direction" property (or "frame" for non-directional sprites).

Output is an Image Collection tileset (no fixed grid), suitable for
directional characters where each direction is a separate PNG.

Tiled docs: https://doc.mapeditor.org/en/stable/reference/tmx-map-format/#tileset
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from ..ir import Sprite


TILED_VERSION = "1.10"


def write_sprite_tsx(sprite: Sprite, output_path: Path) -> None:
    """Serialize an IR.Sprite as a Tiled image collection .tsx.

    All SpriteFrame.image_path values must already be relative to
    output_path's directory (the .tsx file).
    """
    if not sprite.frames:
        raise ValueError(f"Sprite {sprite.name!r} has no frames")

    # Tiled requires tilewidth/tileheight on the tileset element. Use the
    # first frame as the reference; image collections allow per-tile size
    # overrides via <image width=.. height=..> if frames differ.
    ref = sprite.frames[0]

    tileset_el = ET.Element(
        "tileset",
        {
            "version": "1.10",
            "tiledversion": TILED_VERSION,
            "name": sprite.name,
            "tilewidth": str(ref.width),
            "tileheight": str(ref.height),
            "tilecount": str(len(sprite.frames)),
            "columns": "0",   # 0 = image collection (no grid)
        },
    )

    # Tileset-level grid hint (Tiled uses this for layout in editor).
    ET.SubElement(
        tileset_el,
        "grid",
        {
            "orientation": "orthogonal",
            "width": str(ref.width),
            "height": str(ref.height),
        },
    )

    if sprite.properties:
        _emit_properties(tileset_el, sprite.properties)

    for tile_id, frame in enumerate(sprite.frames):
        tile_el = ET.SubElement(tileset_el, "tile", {"id": str(tile_id)})
        if frame.direction:
            _emit_properties(tile_el, {"direction": frame.direction})
        ET.SubElement(
            tile_el,
            "image",
            {
                "source": frame.image_path,
                "width": str(frame.width),
                "height": str(frame.height),
            },
        )

    _indent(tileset_el)
    tree = ET.ElementTree(tileset_el)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(output_path, encoding="UTF-8", xml_declaration=True)


def _emit_properties(parent: ET.Element, properties: dict) -> None:
    props_el = ET.SubElement(parent, "properties")
    for key, value in properties.items():
        ET.SubElement(props_el, "property", {"name": key, "value": str(value)})


def _indent(elem: ET.Element, level: int = 0) -> None:
    pad = "\n" + level * " "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = pad + " "
        if not elem.tail or not elem.tail.strip():
            elem.tail = pad
        for child in elem:
            _indent(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = pad
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = pad
