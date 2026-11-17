"""The laudo's SVG figures as PNG, for the formats that cannot embed SVG (D-243).

Word and PowerPoint draw a picture, not our markup: the DOCX and the PPTX of the
laudo need each ``figures.py`` chart as an image. The SVG stays the one drawing
(a second renderer would be a second truth about the same chart); this module only
rasterises it.

**Why ``resvg``** (``resvg-py``: one 3 MB wheel of Rust, no system library) and not
the alternatives measured for D-243: ``cairosvg`` needs ``libcairo`` in the image,
``matplotlib`` would have to redraw seven charts and costs ~55 MB of RSS just to be
imported (against 1.6 MB here, and ~14 MB of peak for twenty-one figures). It is
imported inside the function, never at boot (D-235), so a process that never writes
a DOCX does not hold it.

**Fonts are shipped.** The API image (``python:3.12-slim``) has no fonts at all, and a
chart without text is not a chart. ``exporters/fonts`` carries DejaVu Sans (regular and
bold; Bitstream Vera licence, copied beside them), covers every glyph the figures use
(accents, ``₂``, ``✓``, ``✕``), and system fonts are skipped so the PNG is the same on
every machine.

A figure that cannot be rasterised is a :class:`FigureRasterError`; the callers write
the figure's title and say it is missing — absence declared, not hidden.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from html import unescape
from pathlib import Path

from app.exporters.xml_text import xml_legal

FONT_DIR = Path(__file__).resolve().parent / "fonts"
FONT_FILES = ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
FONT_FAMILY = "DejaVu Sans"

#: The figures are drawn on a 720-unit canvas (``figures.WIDTH``); twice that is sharp on
#: paper and on a projector, and a chart weighs ~40 KB.
PNG_WIDTH = 1440

_VIEW_BOX = re.compile(r'viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"')


class FigureRasterError(Exception):
    """The figure could not be turned into a PNG."""


@dataclass(frozen=True)
class Raster:
    png: bytes
    width: int
    height: int

    @property
    def aspect(self) -> float:
        """Height over width, for placing the picture in a box."""
        return self.height / self.width


def _size(svg: str) -> tuple[int, int]:
    found = _VIEW_BOX.search(svg)
    if found is None:
        raise FigureRasterError("A figura não declara o seu tamanho (viewBox).")
    box_w, box_h = float(found.group(1)), float(found.group(2))
    if box_w <= 0 or box_h <= 0:
        raise FigureRasterError("A figura tem tamanho zero.")
    return PNG_WIDTH, max(1, round(PNG_WIDTH * box_h / box_w))


def svg_to_png(svg: str) -> Raster:
    """Rasterise one of our SVG figures at ``PNG_WIDTH`` pixels wide, on its white ground."""
    width, height = _size(svg)
    try:
        import resvg_py  # imported on demand (D-235)

        data = resvg_py.svg_to_bytes(
            svg_string=svg,
            width=width,
            font_files=[str(FONT_DIR / name) for name in FONT_FILES],
            skip_system_fonts=True,
            font_family=FONT_FAMILY,
            serif_family=FONT_FAMILY,
            sans_serif_family=FONT_FAMILY,
            monospace_family=FONT_FAMILY,
            background="white",
        )
    except FigureRasterError:
        raise
    except Exception as exc:  # the library raises ValueError, and a missing wheel ImportError
        raise FigureRasterError("Não foi possível desenhar a figura.") from exc
    png = bytes(data)
    if not png.startswith(b"\x89PNG"):
        raise FigureRasterError("A figura não gerou uma imagem PNG.")
    return Raster(png=png, width=width, height=height)


_TITLE = re.compile(r"<title>(.*?)</title>", re.S)
_DESC = re.compile(r"<desc>(.*?)</desc>", re.S)


def figure_alt(svg: str) -> str:
    """The chart's own title and description, for a picture's alternative text."""
    title = _TITLE.search(svg)
    desc = _DESC.search(svg)
    parts = [unescape(m.group(1)).strip() for m in (title, desc) if m and m.group(1).strip()]
    return xml_legal(". ".join(parts)) or "Figura do laudo"
