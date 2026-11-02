"""Squarified treemap (D-193): areas proportional to weights, box tiled."""

from __future__ import annotations

import pytest

from app.calculations.treemap import Rect, squarify

BOX = Rect(0.0, 0.0, 160.0, 90.0)


def _area(r: Rect) -> float:
    return r.width * r.height


def test_areas_are_proportional_and_tile_the_box() -> None:
    weights = [235, 155, 126, 98, 64]
    rects = squarify(weights, BOX)
    total = sum(weights)
    for w, r in zip(weights, rects, strict=True):
        assert _area(r) == pytest.approx(_area(BOX) * w / total, rel=1e-9)
    assert sum(_area(r) for r in rects) == pytest.approx(_area(BOX))


def test_cells_stay_inside_and_do_not_overlap() -> None:
    rects = squarify([6, 6, 4, 3, 2, 2, 1], BOX)
    for r in rects:
        assert BOX.x0 - 1e-9 <= r.x0 <= r.x1 <= BOX.x1 + 1e-9
        assert BOX.y0 - 1e-9 <= r.y0 <= r.y1 <= BOX.y1 + 1e-9
    for i, a in enumerate(rects):
        for b in rects[i + 1 :]:
            overlap_w = min(a.x1, b.x1) - max(a.x0, b.x0)
            overlap_h = min(a.y1, b.y1) - max(a.y0, b.y0)
            assert overlap_w <= 1e-9 or overlap_h <= 1e-9


def test_squarified_cells_are_not_slivers() -> None:
    # The classic example from Bruls et al.: worst aspect ratio stays small.
    rects = squarify([6, 6, 4, 3, 2, 2, 1], Rect(0, 0, 6, 4))
    worst = max(max(r.width / r.height, r.height / r.width) for r in rects)
    assert worst < 3.0


def test_zero_weight_keeps_its_slot_with_no_area() -> None:
    rects = squarify([3, 0, 1], BOX)
    assert len(rects) == 3
    assert _area(rects[1]) == 0.0


def test_negative_weight_is_refused() -> None:
    with pytest.raises(ValueError):
        squarify([1, -1], BOX)


def test_empty_input() -> None:
    assert squarify([], BOX) == []
