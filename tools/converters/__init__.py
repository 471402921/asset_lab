"""Converter pipeline.

Architecture:
    [source export] -> parser/* -> IR -> writer/* -> [target format]

- IR (ir.py) is tool-agnostic.
- parsers/{source}/* MUST output IR dataclasses, never raw XML.
- writers/{target}/* MUST consume IR dataclasses, never source files.
- Adding a new source = new parser, IR + writers unchanged.
- Adding a new target = new writer, IR + parsers unchanged.

Currently supported:
    sources: pixellab/  (character export only — Map Editor was dropped
                        on 2026-05-05 when designer moved level editing
                        into Tiled directly)
    targets: tiled/     (.tsx via image collection)
"""
