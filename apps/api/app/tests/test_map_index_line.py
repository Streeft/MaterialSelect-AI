"""The movable index line and the classic map presets (D-211).

Same fixture as ``test_charts_api``: the five seeded demo materials. The line
the reader drags is the map's own overlay, so every assertion here is checked
against what ``/property-map`` says about the same index — the two endpoints
must never disagree about a material's side of the line.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from app.calculations.powerlaw import (
    index_line,
    level_steps,
    median_level,
    nearest_step,
    segment_handle,
)
from app.domain.map_presets import MAP_PRESETS

MAP_URL = "/api/charts/property-map"
LINE_URL = "/api/charts/index-line"
PRESETS_URL = "/api/charts/presets"

SPECIFIC_STIFFNESS = {"expression": "modulo_young / densidade", "goal": "maximize"}


def _line(client: TestClient, **overrides):
    payload = {"x": "densidade", "y": "modulo_young", "index": SPECIFIC_STIFFNESS}
    payload.update(overrides)
    response = client.post(LINE_URL, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _index_values(client: TestClient, index=SPECIFIC_STIFFNESS) -> dict[int, float | None]:
    response = client.post(
        MAP_URL, json={"x": "densidade", "y": "modulo_young", "scale": "log", "index": index}
    )
    assert response.status_code == 200, response.text
    return {p["material_id"]: p["index_value"] for p in response.json()["points"]}


# --- calculations -----------------------------------------------------------


class TestLevelCalculations:
    def test_level_at_inverts_y_for_x(self) -> None:
        line = index_line("sqrt(modulo_young) / densidade", "densidade", "modulo_young")
        y = line.y_for_x(3.0, 2700.0)
        assert y is not None
        assert line.level_at(2700.0, y) == pytest.approx(3.0)

    def test_level_at_refuses_the_non_positive_quadrant(self) -> None:
        line = index_line("modulo_young / densidade", "densidade", "modulo_young")
        assert line.level_at(0.0, 10.0) is None
        assert line.level_at(-1.0, 10.0) is None

    def test_steps_are_geometric_rounded_and_span_the_values(self) -> None:
        steps = level_steps([1.0, 1000.0], count=4)
        assert steps == [1.0, 10.0, 100.0, 1000.0]

    def test_steps_widen_a_single_value_by_half_a_decade(self) -> None:
        steps = level_steps([100.0], count=3)
        assert steps[0] == pytest.approx(100 / math.sqrt(10), rel=1e-2)
        assert steps[-1] == pytest.approx(100 * math.sqrt(10), rel=1e-2)
        assert steps[1] == pytest.approx(100.0)

    def test_steps_fall_back_to_arithmetic_with_non_positive_values(self) -> None:
        assert level_steps([-2.0, 2.0], count=5) == [-2.0, -1.0, 0.0, 1.0, 2.0]

    def test_no_values_no_steps(self) -> None:
        assert level_steps([]) == []
        assert median_level([]) is None

    def test_median_is_a_stated_value(self) -> None:
        # Even count: the lower middle — a value the catalogue holds, not an average.
        assert median_level([4.0, 1.0, 3.0, 2.0]) == 2.0

    def test_nearest_step_in_log_space(self) -> None:
        assert nearest_step([1.0, 10.0, 100.0], 30.0) == 1
        assert nearest_step([1.0, 10.0, 100.0], 40.0) == 2
        assert nearest_step([], 1.0) is None

    def test_handle_is_the_visual_middle_of_the_scale(self) -> None:
        assert segment_handle([[1.0, 1.0], [100.0, 10000.0]], log=True) == [10.0, 100.0]
        assert segment_handle([[0.0, 0.0], [4.0, 2.0]], log=False) == [2.0, 1.0]


# --- /charts/index-line -----------------------------------------------------


class TestIndexLineEndpoint:
    def test_a_level_splits_the_map_like_the_overlay_does(self, client: TestClient) -> None:
        values = _index_values(client)
        level = sorted(v for v in values.values() if v is not None)[2]
        data = _line(client, level=level)
        assert data["available"] is True
        assert data["value"] == level
        assert data["better_ids"] == sorted(mid for mid, v in values.items() if v >= level)
        assert data["worse_ids"] == sorted(mid for mid, v in values.items() if v < level)
        assert data["undefined_ids"] == []
        # Same segment as the map draws for the same level, in reading units.
        overlay = client.post(
            MAP_URL,
            json={
                "x": "densidade",
                "y": "modulo_young",
                "index": SPECIFIC_STIFFNESS,
                "index_levels": [level],
            },
        ).json()["index"]["levels"][0]
        flat = [c for point in data["points"] for c in point]
        assert flat == pytest.approx([c for point in overlay["points"] for c in point])

    def test_dragging_through_a_point_reads_the_level_off_the_expression(
        self, client: TestClient
    ) -> None:
        # The point is in reading units (g/cm³, GPa, D-70); the level is canonical
        # (Pa per kg/m³), exactly what the map's own index values are in.
        data = _line(client, through={"x": 2.7, "y": 69.0})
        assert data["value"] == pytest.approx(69e9 / 2700)
        # The line passes through the point the reader let go of.
        (x0, y0), (x1, y1) = data["points"]
        slope = (math.log10(y1) - math.log10(y0)) / (math.log10(x1) - math.log10(x0))
        assert slope == pytest.approx(1.0)
        expected = 10 ** (math.log10(y0) + slope * (math.log10(2.7) - math.log10(x0)))
        assert expected == pytest.approx(69.0)

    def test_the_reader_unit_choice_moves_the_drag_point_too(self, client: TestClient) -> None:
        response = client.post(
            LINE_URL,
            json={
                "x": "densidade",
                "y": "modulo_young",
                "index": SPECIFIC_STIFFNESS,
                "through": {"x": 2700.0, "y": 69e9},
            },
            params={"unidades": "densidade:kg/m**3,modulo_young:Pa"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["value"] == pytest.approx(69e9 / 2700)

    def test_no_level_starts_at_the_median_material(self, client: TestClient) -> None:
        values = sorted(v for v in _index_values(client).values() if v is not None)
        data = _line(client)
        assert data["value"] == values[(len(values) - 1) // 2]
        assert data["steps"][0] <= values[0] * 1.01
        assert data["steps"][-1] >= values[-1] * 0.99
        assert data["steps"] == sorted(data["steps"])
        assert 0 <= data["step_index"] < len(data["steps"])
        assert data["handle"] is not None

    def test_minimise_flips_the_better_side(self, client: TestClient) -> None:
        index = {"expression": "modulo_young / densidade", "goal": "minimize"}
        values = _index_values(client, index)
        level = sorted(v for v in values.values() if v is not None)[2]
        data = _line(client, index=index, level=level)
        assert data["better_ids"] == sorted(mid for mid, v in values.items() if v <= level)

    def test_a_non_power_law_has_no_line_but_says_why(self, client: TestClient) -> None:
        data = _line(
            client, index={"expression": "abs(modulo_young) / densidade", "goal": "maximize"}
        )
        assert data["available"] is False
        assert data["unavailable_reason"]
        assert data["points"] == []

    def test_level_and_point_together_are_refused(self, client: TestClient) -> None:
        response = client.post(
            LINE_URL,
            json={
                "x": "densidade",
                "y": "modulo_young",
                "index": SPECIFIC_STIFFNESS,
                "level": 1e7,
                "through": {"x": 2.7, "y": 69.0},
            },
        )
        assert response.status_code == 400

    def test_a_point_outside_the_positive_quadrant_is_a_422(self, client: TestClient) -> None:
        response = client.post(
            LINE_URL,
            json={
                "x": "densidade",
                "y": "modulo_young",
                "index": SPECIFIC_STIFFNESS,
                "through": {"x": 0, "y": 69.0},
            },
        )
        assert response.status_code == 422

    def test_a_level_that_misses_the_data_is_unavailable_not_invented(
        self, client: TestClient
    ) -> None:
        data = _line(client, level=-5.0)
        assert data["available"] is False
        assert data["points"] == []
        assert data["better_ids"] == []

    def test_unknown_property_is_404(self, client: TestClient) -> None:
        response = client.post(
            LINE_URL, json={"x": "densidade", "y": "inexistente", "index": SPECIFIC_STIFFNESS}
        )
        assert response.status_code == 404


# --- /charts/presets ---------------------------------------------------------


class TestMapPresets:
    def test_every_preset_is_listed_with_axes_and_no_material_number(
        self, client: TestClient
    ) -> None:
        response = client.get(PRESETS_URL)
        assert response.status_code == 200, response.text
        data = response.json()
        assert [p["slug"] for p in data] == [p.slug for p in MAP_PRESETS]
        for preset in data:
            assert set(preset) == {
                "slug",
                "name",
                "description",
                "x",
                "y",
                "x_name",
                "y_name",
                "scale",
                "index",
                "available",
                "missing_properties",
            }
            assert preset["x"] != preset["y"]

    def test_the_classic_stiffness_chart_reuses_the_catalogued_index(
        self, client: TestClient
    ) -> None:
        data = {p["slug"]: p for p in client.get(PRESETS_URL).json()}
        chart = data["modulo-densidade"]
        assert chart["available"] is True
        assert chart["x_name"] and chart["y_name"]
        assert chart["index"]["slug"] == "viga-leve-rigidez"
        assert chart["index"]["expression"] == "sqrt(modulo_young) / densidade"

    def test_a_preset_the_catalogue_cannot_draw_names_what_is_missing(
        self, client: TestClient
    ) -> None:
        data = client.get(PRESETS_URL).json()
        for preset in data:
            assert preset["available"] is (preset["missing_properties"] == [])
        # The base test catalogue has no volume cost, so this one is unavailable.
        cost = next(p for p in data if p["slug"] == "modulo-custo")
        if not cost["available"]:
            assert "custo_volume" in cost["missing_properties"]

    def test_every_preset_index_has_a_straight_line_on_its_axes(self) -> None:
        for preset in MAP_PRESETS:
            if preset.index is None:
                continue
            line = index_line(preset.index.expression, preset.x, preset.y)
            assert line.orientation in {"oblique", "vertical"}

    def test_a_preset_drawn_through_the_map_endpoint_matches(self, client: TestClient) -> None:
        chart = next(p for p in client.get(PRESETS_URL).json() if p["slug"] == "modulo-densidade")
        response = client.post(
            MAP_URL,
            json={
                "x": chart["x"],
                "y": chart["y"],
                "scale": chart["scale"],
                "index": {
                    "expression": chart["index"]["expression"],
                    "goal": chart["index"]["goal"],
                },
            },
        )
        assert response.status_code == 200
        assert response.json()["index"]["available"] is True
        assert response.json()["index"]["slope"] == pytest.approx(2.0)
