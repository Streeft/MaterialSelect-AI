"""A Chart Stage region crossing between the map and the stage (D-81).

The map draws in reading units (D-70: density in g/cm³, modulus in GPa); the
Chart Stage stores and compares in canonical units (D-60: kg/m³, Pa). Before
D-81 a box drawn on the map was written into the stage as if it were canonical
— 2.5 g/cm³ became "2.5 kg/m³" — and a stored region was drawn off the chart.

The seeded demo set is the fixture: "Liga Alumínio Demo A" is 2.70 g/cm³ and
69 GPa (2700 kg/m³ and 69e9 Pa canonically).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.tests.test_process_charts import (  # noqa: F401 — fixture reused as-is
    LOTE_SLUG,
    MASSA_SLUG,
    process_map_fixture,
)

MAP_URL = "/api/charts/property-map"
BOX_URL = "/api/charts/map-box"


def _box(client: TestClient, params: dict | None = None, **payload):
    response = client.post(BOX_URL, json=payload, params=params or {})
    assert response.status_code == 200, response.text
    return response.json()


class TestDrawnRegionReachesTheStageInCanonicalUnits:
    def test_a_box_drawn_in_g_cm3_and_gpa_is_stored_in_kg_m3_and_pa(
        self, client: TestClient
    ) -> None:
        data = _box(
            client,
            x="densidade",
            y="modulo_young",
            to="canonical",
            box={"x_min": 2.0, "x_max": 3.0, "y_min": 60.0, "y_max": 80.0},
        )
        assert data["box"]["x_min"] == pytest.approx(2000.0)
        assert data["box"]["x_max"] == pytest.approx(3000.0)
        assert data["box"]["y_min"] == pytest.approx(60e9)
        assert data["box"]["y_max"] == pytest.approx(80e9)
        assert data["x_unit"] == "kg/m**3"
        assert data["y_unit"] == "Pa"

    def test_a_stored_region_is_drawn_where_its_materials_are(self, client: TestClient) -> None:
        data = _box(
            client,
            x="densidade",
            y="modulo_young",
            to="display",
            box={"x_min": 2000.0, "x_max": 8000.0, "y_min": 50e9, "y_max": 300e9},
        )
        assert data["box"]["x_min"] == pytest.approx(2.0)
        assert data["box"]["x_max"] == pytest.approx(8.0)
        assert data["box"]["y_min"] == pytest.approx(50.0)
        assert data["box"]["y_max"] == pytest.approx(300.0)
        assert data["x_unit"] == "g/cm**3"
        assert data["y_unit"] == "GPa"

    def test_the_box_drawn_around_a_point_contains_that_point_on_the_stage(
        self, client: TestClient
    ) -> None:
        """The invariant that matters: map and stage agree about who is inside.

        Draw a box around the aluminium's *plotted* coordinates, convert it, and
        the aluminium's *canonical* values fall inside the converted box — the
        numbers the stage will compare against.
        """
        chart = client.post(MAP_URL, json={"x": "densidade", "y": "modulo_young"}).json()
        aluminium = next(
            p for p in chart["points"] if p["material_name"].startswith("Liga Alumínio")
        )
        drawn = {
            "x_min": aluminium["x"] * 0.95,
            "x_max": aluminium["x"] * 1.05,
            "y_min": aluminium["y"] * 0.95,
            "y_max": aluminium["y"] * 1.05,
        }
        stored = _box(client, x="densidade", y="modulo_young", to="canonical", box=drawn)["box"]
        assert stored["x_min"] < 2700.0 < stored["x_max"]
        assert stored["y_min"] < 69e9 < stored["y_max"]

    def test_a_drawn_edge_arrives_without_float_noise(self, client: TestClient) -> None:
        """1.646 g/cm³ is 1646 kg/m³ — not 1645.9999999999998 in the stage field."""
        data = _box(client, x="densidade", y="modulo_young", to="canonical", box={"x_min": 1.646})
        assert data["box"]["x_min"] == 1646.0

    def test_the_round_trip_is_exact(self, client: TestClient) -> None:
        drawn = {"x_min": 1.25, "x_max": 7.5, "y_min": 0.01, "y_max": 400.0}
        stored = _box(client, x="densidade", y="modulo_young", to="canonical", box=drawn)
        back = _box(client, x="densidade", y="modulo_young", to="display", box=stored["box"])
        for side, value in drawn.items():
            assert back["box"][side] == pytest.approx(value)


class TestWhatDoesNotMove:
    def test_an_open_side_stays_open(self, client: TestClient) -> None:
        """No limit is not a limit of zero (D-60), in either direction."""
        for to in ("canonical", "display"):
            data = _box(client, x="densidade", y="modulo_young", to=to, box={"x_min": 2.0})
            assert data["box"]["x_max"] is None
            assert data["box"]["y_min"] is None
            assert data["box"]["y_max"] is None

    def test_an_index_axis_is_never_converted(self, client: TestClient) -> None:
        """An index has a derived dimension (D-35); the map never rescales it."""
        data = _box(
            client,
            x=None,
            y="modulo_young",
            to="canonical",
            box={"x_min": 10.0, "x_max": 20.0, "y_min": 60.0, "y_max": 80.0},
        )
        assert data["box"]["x_min"] == 10.0
        assert data["box"]["x_max"] == 20.0
        assert data["x_unit"] is None
        assert data["box"]["y_min"] == pytest.approx(60e9)

    def test_an_offset_scale_axis_stays_canonical_like_the_map(self, client: TestClient) -> None:
        """°C is not a scale factor, so the map keeps service temperature in kelvin.

        The region must stay in kelvin too; converting it to °C here while the
        map draws kelvin would shift it by 273 units.
        """
        chart = client.post(
            MAP_URL, json={"x": "densidade", "y": "temp_max_servico", "scale": "linear"}
        ).json()
        assert chart["y_axis"]["unit"] == "kelvin"

        data = _box(
            client,
            x="densidade",
            y="temp_max_servico",
            to="display",
            box={"y_min": 400.0, "y_max": 500.0},
        )
        assert data["box"]["y_min"] == 400.0
        assert data["box"]["y_max"] == 500.0
        assert data["y_unit"] == "kelvin"

    def test_the_readers_unit_choice_is_followed_like_the_map(self, client: TestClient) -> None:
        params = {"unidades": "densidade:kg/m**3,modulo_young:MPa"}
        data = _box(
            client,
            params=params,
            x="densidade",
            y="modulo_young",
            to="canonical",
            box={"x_min": 2000.0, "y_min": 60000.0},
        )
        assert data["box"]["x_min"] == pytest.approx(2000.0)
        assert data["box"]["y_min"] == pytest.approx(60e9)

    def test_a_process_region_passes_through_whole(
        self, client: TestClient, process_map_fixture  # noqa: F811
    ) -> None:
        """Only the material map reads in D-70 units; a process map is canonical."""
        box = {"x_min": 0.1, "x_max": 10.0, "y_min": 1.0, "y_max": 2.0}
        data = _box(client, universe="process", x=MASSA_SLUG, y=LOTE_SLUG, to="canonical", box=box)
        assert data["box"] == box

    def test_an_unknown_process_attribute_is_a_404(self, client: TestClient) -> None:
        response = client.post(
            BOX_URL,
            json={"universe": "process", "x": "nao_existe", "to": "canonical", "box": {}},
        )
        assert response.status_code == 404

    def test_an_unknown_property_is_a_404(self, client: TestClient) -> None:
        response = client.post(
            BOX_URL,
            json={"x": "nao_existe", "y": "densidade", "to": "canonical", "box": {}},
        )
        assert response.status_code == 404
