"""Lengths in EMU (English Metric Units) without importing python-pptx.

``pptx.util.Inches`` and ``Pt`` are plain integer arithmetic; the slide
constants of :mod:`app.exporters.pptx` are needed at import time, and importing
python-pptx just for them would put it (and ``lxml``) in the API's boot memory
(D-235). The values are the ones the library computes, so a deck is unchanged.
"""

from __future__ import annotations

_EMU_PER_INCH = 914_400
_EMU_PER_PT = 12_700


def Inches(value: float) -> int:  # noqa: N802 - mirrors pptx.util.Inches
    return int(value * _EMU_PER_INCH)


def Pt(value: float) -> int:  # noqa: N802 - mirrors pptx.util.Pt
    return int(value * _EMU_PER_PT)
