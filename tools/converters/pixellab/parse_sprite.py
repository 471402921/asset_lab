"""pixellab character export -> IR.Sprite.

Reads:
    {sprite_dir}/metadata.json   (pixellab character metadata)
    {sprite_dir}/rotations/{direction}.png  (one PNG per direction)

Outputs:
    IR.Sprite with one SpriteFrame per direction. Image paths are
    relative to the eventual .tsx (which lives in the same directory).
    Direction strings preserve pixellab's literal naming (south,
    south-east, etc.) — do not translate.

Validation:
    - export_version must be "2.0" (asset-lab plan §13)
    - character.directions must equal len(frames.rotations)
"""
from __future__ import annotations

import json
from pathlib import Path

from ..ir import Sprite, SpriteFrame


SUPPORTED_EXPORT_VERSION = "2.0"


def parse_sprite(sprite_dir: Path) -> Sprite:
    """Parse a single pixellab character export directory.

    Args:
        sprite_dir: directory containing metadata.json + rotations/*.png

    Raises:
        FileNotFoundError if metadata.json missing.
        ValueError on schema mismatch (export version, direction count).
    """
    meta_path = sprite_dir / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing metadata.json in {sprite_dir}")

    with open(meta_path) as f:
        meta = json.load(f)

    version = meta.get("export_version")
    if version != SUPPORTED_EXPORT_VERSION:
        raise ValueError(
            f"Unsupported pixellab export_version: {version!r} in {sprite_dir} "
            f"(supported: {SUPPORTED_EXPORT_VERSION!r})"
        )

    character = meta.get("character", {})
    expected_dirs = character.get("directions")
    rotations = meta.get("frames", {}).get("rotations", {})
    if expected_dirs != len(rotations):
        raise ValueError(
            f"{sprite_dir}: character.directions={expected_dirs} but "
            f"frames.rotations has {len(rotations)} entries"
        )

    size = character.get("size", {})
    width = size.get("width", 0)
    height = size.get("height", 0)

    frames = [
        SpriteFrame(
            image_path=rel_path,    # already relative to sprite_dir / .tsx
            width=width,
            height=height,
            direction=direction,
        )
        for direction, rel_path in rotations.items()
    ]

    return Sprite(
        name=sprite_dir.name,
        frames=frames,
        properties={
            "characterName": character.get("name", ""),
            "view": character.get("view", ""),
            "sourceTool": "pixellab",
            "exportVersion": version,
        },
    )
