"""The infographic layout (D-98): deterministic, non-overlapping, in bounds."""

from __future__ import annotations

import itertools

import pytest

from app.notebooks import infographic
from app.notebooks.infographic import MARGIN, STYLES, WIDTHS, layout


def _content(**overrides) -> dict:
    base = {
        "title": "Seleção de materiais para uma viga leve",
        "subtitle": "O que as fontes do caderno dizem sobre rigidez e massa",
        "stats": [
            {"value": "210 GPa", "label": "módulo do aço", "citations": [1]},
            {"value": "70 GPa", "label": "módulo do alumínio", "citations": [2]},
            {"value": "7,85 g/cm³", "label": "densidade do aço", "citations": [1]},
            {"value": "2,70 g/cm³", "label": "densidade do alumínio", "citations": [2]},
            {"value": "35 %", "label": "redução de massa", "citations": [3]},
        ],
        "points": [
            {"heading": "Rigidez específica", "text": "E/ρ ordena por peso.", "citations": [1]},
            {"heading": "Custo", "text": "O alumínio custa mais por quilo.", "citations": [2]},
            {"heading": "Processo", "text": "Extrusão serve às duas ligas.", "citations": [3]},
        ],
        "steps": [
            {"text": "Traduzir o requisito", "citations": [1]},
            {"text": "Aplicar os limites", "citations": [2]},
            {"text": "Ranquear pelo índice", "citations": [3]},
        ],
    }
    base.update(overrides)
    return base


def _overlap(a, b) -> bool:
    return (
        a.x < b.x + b.width
        and b.x < a.x + a.width
        and a.y < b.y + b.height
        and b.y < a.y + a.height
    )


ORIENTATIONS = ["paisagem", "retrato", "quadrado"]


def test_empty_content_is_none():
    assert layout(None, "paisagem") is None
    assert layout({}, "paisagem") is None


def test_deterministic():
    first = layout(_content(), "quadrado")
    second = layout(_content(), "quadrado")
    assert first == second
    assert first.to_dict() == second.to_dict()


@pytest.mark.parametrize("orientation", ORIENTATIONS)
def test_width_by_orientation(orientation):
    assert layout(_content(), orientation).width == WIDTHS[orientation]


def test_unknown_orientation_falls_back_to_landscape():
    drawn = layout(_content(), "diagonal")
    assert drawn.width == 1200
    assert drawn.orientation == "paisagem"
    assert layout(_content(), None).width == 1200


@pytest.mark.parametrize("orientation", ORIENTATIONS)
def test_no_overlap_and_in_bounds(orientation):
    drawn = layout(_content(), orientation)
    for block in drawn.blocks:
        assert block.x >= MARGIN and block.y >= MARGIN
        assert block.x + block.width <= drawn.width - MARGIN
        assert block.y + block.height <= drawn.height - MARGIN
        for value in (block.x, block.y, block.width, block.height):
            assert isinstance(value, int)
    for a, b in itertools.combinations(drawn.blocks, 2):
        assert not _overlap(a, b), (a, b)


def test_band_order_and_kinds():
    drawn = layout(_content(), "paisagem")
    kinds = [block.kind for block in drawn.blocks]
    assert kinds == ["title", "subtitle"] + ["stat"] * 5 + ["point"] * 3 + ["step"] * 3
    tops = {}
    for block in drawn.blocks:
        tops.setdefault(block.kind, block.y)
    assert tops["title"] < tops["subtitle"] < tops["stat"] < tops["point"] < tops["step"]


@pytest.mark.parametrize("orientation,per_row", [("paisagem", 4), ("retrato", 2), ("quadrado", 3)])
def test_stats_per_row(orientation, per_row):
    drawn = layout(_content(), orientation)
    stats = [b for b in drawn.blocks if b.kind == "stat"]
    first_row = [b for b in stats if b.y == stats[0].y]
    assert len(first_row) == per_row


@pytest.mark.parametrize("orientation,columns", [("paisagem", 2), ("retrato", 1), ("quadrado", 2)])
def test_point_columns(orientation, columns):
    drawn = layout(_content(), orientation)
    points = [b for b in drawn.blocks if b.kind == "point"]
    assert len({b.x for b in points}) == columns


def test_stat_value_is_heading_label_is_body():
    drawn = layout(_content(), "paisagem")
    stat = next(b for b in drawn.blocks if b.kind == "stat")
    assert stat.heading_lines == ["210 GPa"]
    assert stat.body_lines == ["módulo do aço"]
    assert stat.citations == [1]


def test_missing_bands_take_no_height():
    full = layout(_content(), "paisagem")
    no_stats = layout(_content(stats=[]), "paisagem")
    assert not [b for b in no_stats.blocks if b.kind == "stat"]
    assert no_stats.height < full.height
    # The points band moves up to where the stats band would have been.
    first_point = next(b for b in no_stats.blocks if b.kind == "point")
    subtitle = next(b for b in no_stats.blocks if b.kind == "subtitle")
    assert first_point.y == subtitle.y + subtitle.height + infographic.BAND_GAP

    only_points = layout(_content(title="", subtitle="", stats=[], steps=[]), "paisagem")
    assert {b.kind for b in only_points.blocks} == {"point"}
    assert only_points.blocks[0].y == MARGIN
    assert only_points.connectors == []
    last = max(b.y + b.height for b in only_points.blocks)
    assert only_points.height == last + MARGIN


def test_nothing_but_title():
    drawn = layout({"title": "Só o título"}, "retrato")
    assert [b.kind for b in drawn.blocks] == ["title"]
    assert drawn.height == drawn.blocks[0].y + drawn.blocks[0].height + MARGIN


def test_stat_without_value_is_skipped():
    drawn = layout(_content(stats=[{"value": "  ", "label": "x", "citations": []}]), "paisagem")
    assert not [b for b in drawn.blocks if b.kind == "stat"]


def test_long_text_wraps_and_grows_the_block():
    long_text = " ".join(["propriedade"] * 40)
    short = layout(
        _content(points=[{"heading": "A", "text": "curto", "citations": [1]}]), "retrato"
    )
    tall = layout(
        _content(points=[{"heading": "A", "text": long_text, "citations": [1]}]), "retrato"
    )
    small = next(b for b in short.blocks if b.kind == "point")
    big = next(b for b in tall.blocks if b.kind == "point")
    assert len(big.body_lines) > 1
    style = STYLES["point"]
    chars = int((big.width - 2 * style.pad_x) // style.body_char)
    assert all(len(line) <= chars for line in big.body_lines)
    assert big.height > small.height
    assert big.height == (
        2 * style.pad_y
        + len(big.heading_lines) * style.heading_line
        + len(big.body_lines) * style.body_line
        + style.gap
    )


def test_grid_row_shares_the_tallest_height():
    points = [
        {"heading": "A", "text": " ".join(["longo"] * 60), "citations": [1]},
        {"heading": "B", "text": "curto", "citations": [2]},
    ]
    drawn = layout(_content(points=points), "paisagem")
    a, b = [blk for blk in drawn.blocks if blk.kind == "point"]
    assert a.y == b.y and a.height == b.height


@pytest.mark.parametrize("orientation", ORIENTATIONS)
def test_connectors_join_consecutive_steps(orientation):
    drawn = layout(_content(), orientation)
    steps = [b for b in drawn.blocks if b.kind == "step"]
    assert len(drawn.connectors) == len(steps) - 1
    for connector, (a, b) in zip(
        drawn.connectors, zip(steps, steps[1:], strict=False), strict=True
    ):
        # Starts on the edge of the earlier step, ends on the edge of the next.
        if connector.y1 == connector.y2:  # horizontal flow
            assert connector.x1 == a.x + a.width and connector.x2 == b.x
            assert a.y <= connector.y1 <= a.y + a.height
        else:  # vertical flow
            assert connector.x1 == connector.x2
            assert connector.y1 == a.y + a.height and connector.y2 == b.y
        assert (connector.x1, connector.y1) != (connector.x2, connector.y2)


def test_step_flow_direction():
    landscape = [b for b in layout(_content(), "paisagem").blocks if b.kind == "step"]
    assert len({b.y for b in landscape}) == 1  # side by side
    portrait = [b for b in layout(_content(), "retrato").blocks if b.kind == "step"]
    assert len({b.x for b in portrait}) == 1  # stacked
    many = [{"text": f"Etapa {i}", "citations": []} for i in range(6)]
    square_many = [b for b in layout(_content(steps=many), "quadrado").blocks if b.kind == "step"]
    assert len({b.x for b in square_many}) == 1  # too narrow side by side: vertical


def test_steps_are_numbered_and_tones_cycle():
    many = [{"text": f"Etapa {i}", "citations": [i]} for i in range(8)]
    drawn = layout(_content(steps=many), "retrato")
    steps = [b for b in drawn.blocks if b.kind == "step"]
    assert [b.heading_lines for b in steps] == [[str(i + 1)] for i in range(8)]
    assert [b.index for b in steps] == list(range(8))
    assert [b.tone for b in steps] == [0, 1, 2, 3, 4, 5, 0, 1]
    assert all(0 <= b.tone < infographic.TONES for b in drawn.blocks)


def test_to_dict_is_plain():
    data = layout(_content(), "quadrado").to_dict()
    assert data["width"] == 1000
    assert set(data["blocks"][0]) == {
        "kind",
        "x",
        "y",
        "width",
        "height",
        "heading_lines",
        "body_lines",
        "citations",
        "tone",
        "index",
    }
    assert set(data["connectors"][0]) == {"x1", "y1", "x2", "y2"}
    assert set(data["styles"]) == {"title", "subtitle", "stat", "point", "step"}
