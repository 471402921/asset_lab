"""IR.TileMap -> Tiled .tmx XML.

Emits a minimal but flame_tiled-compatible .tmx with:
  - <map> root with required attributes (orthogonal, right-down, etc.)
  - one or more <imagelayer> / <objectgroup> children
  - <object> rectangles inside object groups for static collision

Does NOT emit:
  - <tileset> references (we use image layers; designer can upgrade later)
  - tile layers (no per-cell tile data)
  - properties on map root (added when needed)

Tiled docs: https://doc.mapeditor.org/en/stable/reference/tmx-map-format/
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from ..ir import TileMap, ImageLayer, ObjectLayer

TILED_VERSION = "1.10"


def write_tmx(tilemap: TileMap, output_path: Path) -> None:
    """Serialize an IR.TileMap to a Tiled .tmx file.

    Caller is responsible for ensuring all ImageLayer.image_path values
    are correct relative paths from output_path's directory.
    """
    map_el = ET.Element(
        "map",
        {
            "version": "1.10",
            "tiledversion": TILED_VERSION,
            "orientation": "orthogonal",
            "renderorder": "right-down",
            "width": str(tilemap.width),
            "height": str(tilemap.height),
            "tilewidth": str(tilemap.tile_width),
            "tileheight": str(tilemap.tile_height),
            "infinite": "0",
            "nextlayerid": str(len(tilemap.layers) + 1),
            "nextobjectid": str(_total_objects(tilemap) + 1),
        },
    )

    if tilemap.properties:
        _emit_properties(map_el, tilemap.properties)

    next_layer_id = 1
    next_object_id = 1
    for layer in tilemap.layers:
        if isinstance(layer, ImageLayer):
            _emit_image_layer(map_el, layer, next_layer_id)
        elif isinstance(layer, ObjectLayer):
            next_object_id = _emit_object_layer(
                map_el, layer, next_layer_id, next_object_id
            )
        else:
            raise TypeError(f"Unknown layer type: {type(layer).__name__}")
        next_layer_id += 1

    _indent(map_el)
    tree = ET.ElementTree(map_el)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(output_path, encoding="UTF-8", xml_declaration=True)


def _emit_properties(parent: ET.Element, properties: dict) -> None:
    props_el = ET.SubElement(parent, "properties")
    for key, value in properties.items():
        ET.SubElement(props_el, "property", {"name": key, "value": str(value)})


def _emit_image_layer(parent: ET.Element, layer: ImageLayer, layer_id: int) -> None:
    el = ET.SubElement(
        parent,
        "imagelayer",
        {"id": str(layer_id), "name": layer.name},
    )
    ET.SubElement(
        el,
        "image",
        {
            "source": layer.image_path,
            "width": str(layer.image_width),
            "height": str(layer.image_height),
        },
    )


def _emit_object_layer(
    parent: ET.Element,
    layer: ObjectLayer,
    layer_id: int,
    next_object_id: int,
) -> int:
    el = ET.SubElement(
        parent,
        "objectgroup",
        {"id": str(layer_id), "name": layer.name},
    )
    for obj in layer.objects:
        attrs = {
            "id": str(next_object_id),
            "x": _fmt(obj.x),
            "y": _fmt(obj.y),
            "width": _fmt(obj.width),
            "height": _fmt(obj.height),
        }
        if obj.name:
            attrs["name"] = obj.name
        if obj.object_type:
            attrs["type"] = obj.object_type
        obj_el = ET.SubElement(el, "object", attrs)
        if obj.properties:
            _emit_properties(obj_el, obj.properties)
        next_object_id += 1
    return next_object_id


def _total_objects(tilemap: TileMap) -> int:
    return sum(
        len(layer.objects) for layer in tilemap.layers if isinstance(layer, ObjectLayer)
    )


def _fmt(n: float) -> str:
    """Tiled integers stay int; non-integers keep float repr."""
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return str(n)


def _indent(elem: ET.Element, level: int = 0) -> None:
    """Pretty-print indentation in-place. Backport of ET.indent for Py<3.9."""
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
