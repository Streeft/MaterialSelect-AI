"""The report's figures: what they draw, and what they refuse to draw.

Every test here is about a way a chart can lie. A bar of length zero for a
material that has no value, an envelope drawn through two points, a point
clamped onto a log axis it has no place on, a legend built from a material name
that turns out to be markup — each of those produces a figure that looks
finished and says something false.
"""

from __future__ import annotations

import re

from app.exporters.figures import (
    PLOT_BOTTOM,
    PLOT_LEFT,
    PLOT_RIGHT,
    PLOT_TOP,
    Axis,
    Bar,
    BarFigure,
    Line,
    Point,
    Polygon,
    ScatterFigure,
    render_bars,
    render_scatter,
)


def _map(**overrides: object) -> ScatterFigure:
    base: dict[str, object] = {
        "title": "Módulo de Young × Densidade",
        "x": Axis(label="Densidade (kg/m³)", scale="log", min_value=100.0, max_value=20000.0),
        "y": Axis(label="Módulo de Young (Pa)", scale="log", min_value=1e8, max_value=1e12),
        "points": [
            Point(x=2700.0, y=7e10, label="Alumínio 6061", group="Metais"),
            Point(x=7850.0, y=2.1e11, label="Aço AISI 1020", group="Metais"),
            Point(
                x=1550.0, y=1.4e11, label="Fibra de carbono", group="Compósitos", highlighted=True
            ),
        ],
        "caption": "3 de 5 materiais no mapa.",
        "description": "Mapa de módulo de Young contra densidade.",
    }
    base.update(overrides)
    return ScatterFigure(**base)  # type: ignore[arg-type]


def _circles(svg: str) -> list[dict[str, str]]:
    return [
        dict(re.findall(r'(\w[\w-]*)="([^"]*)"', tag)) for tag in re.findall(r"<circle[^>]*>", svg)
    ]


def _rects(svg: str) -> list[dict[str, str]]:
    return [
        dict(re.findall(r'(\w[\w-]*)="([^"]*)"', tag)) for tag in re.findall(r"<rect[^>]*>", svg)
    ]


def _bars(svg: str) -> list[dict[str, str]]:
    """Only the bars — not the white ground the whole figure is drawn on."""
    return [r for r in _rects(svg) if r.get("x") == str(PLOT_LEFT)]


class TestTheFigureIsAnArtefact:
    """It has to be reproducible and self-contained, like the rest of the report."""

    def test_the_same_figure_renders_the_same_bytes(self) -> None:
        # The report re-runs the pipeline; a figure that jitters in the last
        # decimal would make two runs of the same study differ.
        assert render_scatter(_map()) == render_scatter(_map())

    def test_nothing_is_styled_by_stylesheet(self) -> None:
        # Served under `default-src 'none'`, and saved standalone by readers.
        svg = render_scatter(_map())
        assert "<style" not in svg
        assert 'class="' not in svg

    def test_it_carries_an_accessible_name_and_description(self) -> None:
        svg = render_scatter(_map())
        assert 'role="img"' in svg
        assert "<title>Módulo de Young × Densidade</title>" in svg
        assert "<desc>Mapa de módulo de Young contra densidade.</desc>" in svg


class TestUntrustedTextInAFigure:
    """Material names come from imported spreadsheets and reach the legend."""

    def test_markup_in_a_name_is_escaped(self) -> None:
        svg = render_scatter(
            _map(
                points=[Point(x=2700.0, y=7e10, label="<script>alert(1)</script>", group="Metais")]
            )
        )
        assert "<script>" not in svg
        assert "&lt;script&gt;" in svg

    def test_a_quote_in_a_group_cannot_break_out_of_an_attribute(self) -> None:
        svg = render_scatter(_map(points=[Point(x=2700.0, y=7e10, label='" onload="x', group="G")]))
        assert 'onload="x' not in svg
        assert "&quot;" in svg

    def test_an_axis_label_is_escaped_too(self) -> None:
        svg = render_scatter(_map(x=Axis(label="<b>ρ</b>", min_value=1.0, max_value=10.0)))
        assert "<b>" not in svg


class TestALogAxisDropsWhatItCannotShow:
    def test_a_non_positive_value_is_not_plotted(self) -> None:
        # Clamping it to the axis floor would put the material somewhere it is
        # not; the caller counts and names it in the caption instead.
        svg = render_scatter(
            _map(
                points=[
                    Point(x=0.0, y=7e10, label="Zero", group="G"),
                    Point(x=-5.0, y=7e10, label="Negativo", group="G"),
                    Point(x=2700.0, y=7e10, label="Válido", group="G"),
                ]
            )
        )
        assert "Válido" in svg
        assert "Zero" not in svg
        assert "Negativo" not in svg

    def test_decades_are_labelled_as_powers_of_ten(self) -> None:
        assert "10³" in render_scatter(_map())


class TestDegenerateGeometry:
    def test_an_axis_whose_bounds_are_equal_still_renders(self) -> None:
        svg = render_scatter(
            _map(
                x=Axis(label="x", min_value=5.0, max_value=5.0),
                y=Axis(label="y", min_value=0.0, max_value=0.0),
                points=[Point(x=5.0, y=0.0, label="Único", group="G")],
            )
        )
        assert "Único" in svg
        assert "nan" not in svg.lower()

    def test_two_vertices_are_not_an_envelope(self) -> None:
        # A hull of two points is a segment. Drawing it as a polygon would claim
        # an area the class does not occupy.
        svg = render_scatter(
            _map(polygons=[Polygon(label="Metais", vertices=[(2700.0, 7e10), (7850.0, 2.1e11)])])
        )
        assert "<polygon" not in svg

    def test_three_vertices_are(self) -> None:
        svg = render_scatter(
            _map(
                polygons=[
                    Polygon(
                        label="Metais",
                        vertices=[(2700.0, 7e10), (7850.0, 2.1e11), (5000.0, 9e10)],
                    )
                ]
            )
        )
        assert "<polygon" in svg

    def test_a_one_point_index_line_is_not_a_line(self) -> None:
        svg = render_scatter(_map(lines=[Line(label="E^(1/2)/ρ", points=[(2700.0, 7e10)])]))
        assert "<polyline" not in svg


class TestHighlighting:
    def test_a_highlighted_point_gets_a_ring_not_a_bigger_dot(self) -> None:
        # Size on a property map reads as a third variable, and there isn't one.
        radii = sorted({c.get("r") for c in _circles(render_scatter(_map()))})
        assert radii == ["4", "8"]
        assert sum(1 for c in _circles(render_scatter(_map())) if c.get("r") == "8") == 1


class TestBarsNeverInventAValue:
    def test_a_missing_value_is_a_word_not_a_zero_length_bar(self) -> None:
        svg = render_bars(
            BarFigure(
                title="Índice",
                value_label="M",
                bars=[Bar(label="Aço", value=2.0), Bar(label="Sem dado", value=None)],
            )
        )
        assert "ausente" in svg
        # The absent row is a full-width track, not a bar: it says "no value",
        # where a zero-length bar would say "the worst value".
        widths = [r["width"] for r in _bars(svg)]
        assert str(PLOT_RIGHT - PLOT_LEFT) in widths

    def test_bars_are_measured_from_zero(self) -> None:
        # A truncated bar chart exaggerates differences, and this one exists to
        # be compared: half the top value must be half the width.
        svg = render_bars(
            BarFigure(
                title="Índice",
                value_label="M",
                bars=[Bar(label="A", value=10.0), Bar(label="B", value=5.0)],
            )
        )
        widths = [float(r["width"]) for r in _bars(svg)]
        assert len(widths) == 2
        assert widths[1] == round(widths[0] / 2, 2)

    def test_the_bars_stay_inside_the_frame(self) -> None:
        svg = render_bars(
            BarFigure(
                title="Índice",
                value_label="M",
                bars=[Bar(label=f"M{i}", value=float(i + 1)) for i in range(16)],
            )
        )
        bars = _bars(svg)
        assert len(bars) == 16
        tops = [float(r["y"]) for r in bars]
        heights = [float(r["height"]) for r in bars]
        assert min(tops) >= PLOT_TOP
        assert max(t + h for t, h in zip(tops, heights, strict=True)) <= PLOT_BOTTOM

    def test_a_bar_label_is_escaped(self) -> None:
        svg = render_bars(
            BarFigure(title="t", value_label="M", bars=[Bar(label="<i>x</i>", value=1.0)])
        )
        assert "<i>" not in svg

    def test_no_bars_at_all_still_renders(self) -> None:
        svg = render_bars(BarFigure(title="Índice", value_label="M", bars=[]))
        assert svg.startswith("<svg")
