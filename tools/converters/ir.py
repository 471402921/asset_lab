"""Tool-agnostic intermediate representation (IR) for converters.

Parsers MUST output these dataclasses; they MUST NOT emit target-format
data structures (e.g. raw XML, Tiled-specific dicts) directly.

Writers MUST consume these dataclasses; they MUST NOT read source-format
data (e.g. pixellab JSON) directly.

This decoupling lets us swap pixellab for another tool (or Tiled for
another engine target) by writing a single new module on either side.

Current scope: only Sprite. Map / TileMap was deleted on 2026-05-05
when the designer moved level editing fully into Tiled (no pixellab Map
Editor in the pipeline anymore). If a future source needs richer IR
types (animation timelines, multi-state sprites, etc.), add them here
once with a real consumer in mind.
"""
from __future__ import annotations

from dataclasses import dataclass, field


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
