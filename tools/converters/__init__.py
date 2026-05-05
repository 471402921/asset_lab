"""Converter pipeline.

Architecture:
    [source export] -> parser/* -> IR -> writer/* -> [target format]

- IR (ir.py) is tool-agnostic.
- parsers/{source}/* MUST output IR dataclasses, never raw XML.
- writers/{target}/* MUST consume IR dataclasses, never source files.
- Adding a new source = new parser, IR + writers unchanged.
- Adding a new target = new writer, IR + parsers unchanged.

Currently supported:
    sources: pixellab/  (Map Editor export, character export)
    targets: tiled/     (.tmx, .tsx)
"""
