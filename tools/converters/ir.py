"""Tool-agnostic intermediate representation (IR) for converters.

Parsers MUST output these dataclasses; they MUST NOT emit target-format
data structures (e.g. raw XML, Tiled-specific dicts) directly.

Writers MUST consume these dataclasses; they MUST NOT read source-format
data (e.g. pixellab JSON) directly.

This decoupling lets us swap pixellab for another tool (or Tiled for
another engine target) by writing a single new module on either side.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class MapObject:
    """A free-form object inside an ObjectLayer (typically a collision rect)."""
    x: float
    y: float
    width: float
    height: float
    name: str = ""
    object_type: str = ""
    properties: dict = field(default_factory=dict)


@dataclass
class ObjectLayer:
    name: str
    objects: list[MapObject] = field(default_factory=list)


@dataclass
class ImageLayer:
    name: str
    # path relative to the .tmx file location; set by orchestrator (CLI)
    # after output layout is decided. Parser leaves this as "" if it can't
    # know.
    image_path: str
    image_width: int
    image_height: int


@dataclass
class TileMap:
    """A complete map (becomes one .tmx)."""
    name: str
    width: int            # in tiles
    height: int           # in tiles
    tile_width: int       # in px
    tile_height: int      # in px
    layers: list = field(default_factory=list)   # mix of ImageLayer + ObjectLayer
    properties: dict = field(default_factory=dict)


@dataclass
class SpriteFrame:
    """One direction (or animation frame) of a sprite."""
    image_path: str    # relative to the sprite .tsx
    width: int
    height: int
    direction: str = ""    # "south", "north-east", etc.; "" if non-directional


@dataclass
class Sprite:
    """A character sprite (becomes one image-collection .tsx)."""
    name: str
    frames: list[SpriteFrame] = field(default_factory=list)
    properties: dict = field(default_factory=dict)
