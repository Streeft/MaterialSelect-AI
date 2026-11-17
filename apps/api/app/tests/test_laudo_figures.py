"""The laudo's summary charts (D-241): valid SVG, no NaN, geometry from the data."""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET

import pytest

from app.exporters.figures import (
    Axis,
    CurveFigure,
    CurveSeries,
    DonutFigure,
    DonutSegment,
    HBar,
    HBarFigure,
    Light,
    RadarFigure,
    RadarSeries,
    TrafficLightFigure,
    WaterfallBar,
    WaterfallFigure,
    render_curves,
    render_donut,
    render_hbars,
    render_radar,
    render_traffic_light,
    render_waterfall,
)
from app.exporters.laudo_theme import STATUS, format_br

SVG = "{http://www.w3.org/2000/svg}"


def _parse(svg: str) -> ET.Element:
    root = ET.fromstring(svg)
    assert root.tag == f"{SVG}svg"
    return root


def _assert_clean(svg: str) -> ET.Element:
    """Parses as XML, names itself, and carries no NaN/inf anywhere."""
    root = _parse(svg)
    assert root.get("role") == "img"
    assert root.get("aria-label")
    assert root.find(f"{SVG}title") is not None and root.find(f"{SVG}title").text
    assert root.find(f"{SVG}desc") is not None
    assert not re.search(r"\b(nan|inf)\b", svg, re.IGNORECASE)
    return root


def _texts(root: ET.Element) -> list[str]:
    return ["".join(t.itertext()) for t in root.iter(f"{SVG}text")]


# --- horizontal bars --------------------------------------------------------


def test_hbars_scale_from_the_data_and_write_each_value() -> None:
    svg = render_hbars(
        HBarFigure(
            title="Custo",
            unit="u.m.",
            bars=[HBar("A", 100.0, highlighted=True), HBar("B", 50.0)],
            description="d",
        )
    )
    root = _assert_clean(svg)
    rects = [r for r in root.iter(f"{SVG}rect") if r.get("height") == "14"]
    widths = [float(r.get("width")) for r in rects]
    assert widths[0] == pytest.approx(2 * widths[1], rel=1e-3)
    assert any("100 u.m." in t for t in _texts(root))
    assert any("50 u.m." in t for t in _texts(root))


def test_an_absent_bar_is_a_word_never_zero() -> None:
    svg = render_hbars(HBarFigure(title="t", unit="kg", bars=[HBar("A", None), HBar("B", 2.0)]))
    root = _assert_clean(svg)
    texts = _texts(root)
    assert "ausente" in texts
    assert not any(t.startswith("0 kg") for t in texts)


def test_negative_bars_grow_left_of_zero() -> None:
    svg = render_hbars(HBarFigure(title="t", unit="", bars=[HBar("A", -1.0), HBar("B", 1.0)]))
    root = _assert_clean(svg)
    rects = [r for r in root.iter(f"{SVG}rect") if r.get("height") == "14"]
    assert float(rects[0].get("x")) < float(rects[1].get("x"))


# --- radar ------------------------------------------------------------------


def _polygon_points(element: ET.Element) -> list[tuple[float, float]]:
    return [tuple(map(float, p.split(","))) for p in element.get("points").split()]


def test_radar_vertex_distance_follows_the_value() -> None:
    svg = render_radar(
        RadarFigure(
            title="Radar",
            axes=["a", "b", "c", "d"],
            series=[RadarSeries("X", [1.0, 0.5, 0.0, 0.25], highlighted=True)],
            description="d",
        )
    )
    root = _assert_clean(svg)
    filled = [p for p in root.iter(f"{SVG}polygon") if p.get("fill-opacity")]
    assert len(filled) == 1
    points = _polygon_points(filled[0])
    from app.exporters.figures import RADAR_CX, RADAR_CY, RADAR_R

    radii = [math.hypot(x - RADAR_CX, y - RADAR_CY) for x, y in points]
    assert radii == pytest.approx([RADAR_R, RADAR_R / 2, 0.0, RADAR_R / 4], abs=0.02)


def test_a_series_with_a_missing_value_is_not_closed() -> None:
    svg = render_radar(
        RadarFigure(title="R", axes=["a", "b", "c"], series=[RadarSeries("X", [1.0, None, 0.5])])
    )
    root = _assert_clean(svg)
    assert not [p for p in root.iter(f"{SVG}polygon") if p.get("fill-opacity")]
    assert any("dado ausente" in t for t in _texts(root))


def test_radar_needs_three_axes() -> None:
    svg = render_radar(RadarFigure(title="R", axes=["a", "b"], series=[]))
    assert "pelo menos três critérios" in svg
    _assert_clean(svg)


# --- donut ------------------------------------------------------------------


def test_donut_slices_are_shares_of_the_circumference() -> None:
    svg = render_donut(
        DonutFigure(
            title="D",
            segments=[DonutSegment("Atende", 3, "ok"), DonutSegment("Atenção", 1, "warn")],
            centre="3 de 4",
            centre_caption="atendidas",
        )
    )
    root = _assert_clean(svg)
    dashed = [c for c in root.iter(f"{SVG}circle") if c.get("stroke-dasharray")]
    lengths = [float(c.get("stroke-dasharray").split()[0]) for c in dashed]
    assert lengths[0] == pytest.approx(3 * lengths[1], rel=1e-3)
    texts = _texts(root)
    assert "Atende: 3" in texts and "Atenção: 1" in texts
    assert STATUS["ok"].glyph in texts


def test_an_empty_donut_still_draws() -> None:
    _assert_clean(render_donut(DonutFigure(title="D", segments=[], centre="0 de 0")))


# --- waterfall --------------------------------------------------------------


def test_waterfall_steps_sit_where_the_calculation_put_them() -> None:
    svg = render_waterfall(
        WaterfallFigure(
            title="CO₂",
            unit="kg de CO₂",
            bars=[
                WaterfallBar("Material", 10.0, 0.0, 10.0),
                WaterfallBar("Manufatura", 5.0, 10.0, 15.0),
                WaterfallBar("Fim de vida", -3.0, 15.0, 12.0),
                WaterfallBar("Total", 12.0, 0.0, 12.0, is_total=True),
            ],
            domain=(0.0, 15.0),
            description="d",
        )
    )
    root = _assert_clean(svg)
    bars = [r for r in root.iter(f"{SVG}rect") if r.get("rx") == "2"]
    heights = [float(r.get("height")) for r in bars]
    assert heights[0] == pytest.approx(2 * heights[1], rel=1e-3)
    assert heights[3] == pytest.approx(heights[0] + heights[1] - heights[2], rel=1e-3)
    assert "−" not in svg  # values are written with format_br's plain minus
    assert any(t.startswith("-3") for t in _texts(root))


def test_an_uncomputed_phase_is_written_not_drawn() -> None:
    svg = render_waterfall(
        WaterfallFigure(
            title="CO₂",
            unit="kg",
            bars=[
                WaterfallBar("Material", 10.0, 0.0, 10.0),
                WaterfallBar("Fim de vida", None, 10.0, 10.0, reason="sem fator"),
                WaterfallBar("Total", None, None, None, reason="sem total", is_total=True),
            ],
            domain=(0.0, 10.0),
        )
    )
    root = _assert_clean(svg)
    assert sum(t.startswith("não calculada") for t in _texts(root)) == 2
    assert "sem fator" in svg


# --- cost curves ------------------------------------------------------------


def test_curves_draw_one_line_per_series_and_mark_the_batch() -> None:
    svg = render_curves(
        CurveFigure(
            title="Custo × lote",
            x=Axis("Lote", "log", 1, 1e5),
            y=Axis("Custo", "log", 1, 1e3),
            series=[
                CurveSeries(
                    "A", [(1, 900), (100, 20), (1e5, 5)], current=(100, 20), highlighted=True
                ),
                CurveSeries("B", [(1, 500), (1e5, 8)], current=None),
            ],
            description="d",
        )
    )
    root = _assert_clean(svg)
    lines = list(root.iter(f"{SVG}polyline"))
    assert len(lines) == 2
    assert len(_polygon_points(lines[0])) == 3
    markers = [c for c in root.iter(f"{SVG}circle") if c.get("r") == "4.5"]
    assert len(markers) == 1


# --- traffic light ----------------------------------------------------------


def test_every_light_writes_its_word() -> None:
    svg = render_traffic_light(
        TrafficLightFigure(
            title="Requisitos",
            lights=[
                Light("Limite A", "ok", "detalhe"),
                Light("Dados", "warn"),
                Light("Custo", "na", "informe a massa"),
                Light("Fadiga", "fail"),
            ],
            description="d",
        )
    )
    root = _assert_clean(svg)
    texts = _texts(root)
    for key in ("ok", "warn", "na", "fail"):
        assert STATUS[key].word in texts
        assert STATUS[key].glyph in texts


def test_hostile_text_is_escaped_in_every_chart() -> None:
    hostile = '<script>alert(1)</script>"'
    svgs = [
        render_hbars(HBarFigure(title=hostile, unit=hostile, bars=[HBar(hostile, 1.0)])),
        render_radar(
            RadarFigure(title=hostile, axes=[hostile] * 3, series=[RadarSeries(hostile, [1, 1, 1])])
        ),
        render_traffic_light(
            TrafficLightFigure(title=hostile, lights=[Light(hostile, "ok", hostile)])
        ),
    ]
    for svg in svgs:
        assert "<script>" not in svg
        _parse(svg)


def test_format_br_is_ptbr_and_never_zero_for_absence() -> None:
    assert format_br(1234.5) == "1.234"
    assert format_br(0.0123) == "0,0123"
    assert format_br(3.14159) == "3,14"
    assert format_br(None) == "ausente"
    assert format_br(float("nan")) == "ausente"
    assert format_br(2e8).startswith("2,00 × 10")
