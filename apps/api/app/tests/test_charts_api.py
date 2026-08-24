"""End-to-end tests for the visualisation endpoints.

The seeded demo set is the fixture: five materials, one of them (Cerâmica Demo D)
with an explicitly missing thermal conductivity, one (Polímero Demo C) with an
interval yield strength given in MPa, and one (Compósito Demo E) carrying an
uncertainty. Between them they exercise every honesty rule the charts must obey.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

MAP_URL = "/api/charts/property-map"
COMPARE_URL = "/api/charts/compare"


def _map(client: TestClient, **overrides):
    payload = {"x": "densidade", "y": "modulo_young", "scale": "log"}
    payload.update(overrides)
    response = client.post(MAP_URL, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


class TestPropertyMapBasics:
    def test_plots_every_material_with_both_axes(self, client: TestClient) -> None:
        data = _map(client)
        # All five demo materials have both densidade and modulo_young.
        assert data["plotted_count"] == 5
        assert data["considered_count"] == 5
        assert data["excluded"] == []

    def test_axes_carry_canonical_units_and_range(self, client: TestClient) -> None:
        data = _map(client)
        assert data["x_axis"]["unit"] == "kg/m**3"
        assert data["y_axis"]["unit"] == "Pa"
        assert data["x_axis"]["symbol"] == "ρ"
        xs = [p["x"] for p in data["points"]]
        assert data["x_axis"]["min_value"] == min(xs)
        assert data["x_axis"]["max_value"] == max(xs)

    def test_values_are_normalised_to_canonical_units(self, client: TestClient) -> None:
        data = _map(client)
        aluminium = next(
            p for p in data["points"] if p["material_name"].startswith("Liga Alumínio")
        )
        # Seeded as 2.70 g/cm**3 and 69 GPa.
        assert aluminium["x"] == 2700.0
        assert aluminium["y"] == 69e9

    def test_missing_axis_value_excludes_with_a_reason(self, client: TestClient) -> None:
        data = _map(client, y="condutividade_termica")
        # Only the ceramic even has a (missing) row; nobody has a usable value.
        assert data["plotted_count"] == 0
        assert data["excluded"]
        assert all("Sem valor para" in e["reason"] for e in data["excluded"])

    def test_rejects_the_same_property_on_both_axes(self, client: TestClient) -> None:
        response = client.post(MAP_URL, json={"x": "densidade", "y": "densidade"})
        assert response.status_code == 400

    def test_unknown_property_is_404(self, client: TestClient) -> None:
        response = client.post(MAP_URL, json={"x": "densidade", "y": "inexistente"})
        assert response.status_code == 404

    def test_unknown_class_filter_is_404(self, client: TestClient) -> None:
        response = client.post(
            MAP_URL, json={"x": "densidade", "y": "modulo_young", "class_slugs": ["nao-existe"]}
        )
        assert response.status_code == 404

    def test_class_filter_narrows_the_map(self, client: TestClient) -> None:
        data = _map(client, class_slugs=["metais"])
        assert data["considered_count"] == 2
        assert {p["class_slug"] for p in data["points"]} == {"metais"}

    def test_material_ids_filter_narrows_the_map(self, client: TestClient) -> None:
        every = _map(client)
        chosen = [every["points"][0]["material_id"], every["points"][1]["material_id"]]
        data = _map(client, material_ids=chosen)
        assert sorted(p["material_id"] for p in data["points"]) == sorted(chosen)


class TestIntervalsAndUncertainty:
    def test_interval_bounds_are_converted_to_canonical_units(self, client: TestClient) -> None:
        data = _map(client, x="densidade", y="limite_escoamento", scale="linear")
        polymer = next(p for p in data["points"] if p["material_name"].startswith("Polímero"))
        # Seeded as 40–60 MPa with a typical of 48 MPa.
        assert polymer["y_is_interval"] is True
        assert polymer["y_min"] == 40e6
        assert polymer["y_max"] == 60e6
        assert polymer["y"] == 48e6

    def test_uncertainty_is_converted_as_a_difference(self, client: TestClient) -> None:
        # custo_massa is dimensionless: the ±8 must survive untouched.
        data = _map(client, x="densidade", y="custo_massa", scale="linear")
        composite = next(p for p in data["points"] if p["material_name"].startswith("Compósito"))
        assert composite["y_uncertainty"] == 8.0

    def test_offset_units_do_not_corrupt_a_difference(self, client: TestClient) -> None:
        # temp_max_servico is seeded in °C and stored canonically in kelvin. The
        # absolute value shifts by 273.15; a tolerance must not.
        from app.calculations.units import to_canonical, to_canonical_delta

        absolute, _ = to_canonical(150.0, "degC", "kelvin")
        assert absolute == 423.15
        assert to_canonical_delta(5.0, "degC", "kelvin") == 5.0

    def test_scalar_value_has_no_interval_bounds(self, client: TestClient) -> None:
        data = _map(client)
        steel = next(p for p in data["points"] if p["material_name"].startswith("Aço"))
        assert steel["y_is_interval"] is False
        assert steel["y_min"] is None and steel["y_max"] is None


class TestEnvelopes:
    def test_one_envelope_per_class_present(self, client: TestClient) -> None:
        data = _map(client)
        slugs = {e["class_slug"] for e in data["envelopes"]}
        assert slugs == {"metais", "polimeros", "ceramicas", "compositos"}

    def test_single_material_class_yields_a_single_vertex(self, client: TestClient) -> None:
        data = _map(client)
        ceramic = next(e for e in data["envelopes"] if e["class_slug"] == "ceramicas")
        assert ceramic["point_count"] == 1
        assert len(ceramic["polygon"]) == 1

    def test_two_material_class_yields_a_segment(self, client: TestClient) -> None:
        data = _map(client)
        metals = next(e for e in data["envelopes"] if e["class_slug"] == "metais")
        assert metals["point_count"] == 2
        assert len(metals["polygon"]) == 2

    def test_envelope_vertices_are_real_material_coordinates(self, client: TestClient) -> None:
        # The hull is computed in log space and mapped back; the round trip must
        # land on the original coordinates, not on a rounded neighbourhood.
        data = _map(client)
        metals = next(e for e in data["envelopes"] if e["class_slug"] == "metais")
        plotted = {(p["x"], p["y"]) for p in data["points"] if p["class_slug"] == "metais"}
        for vertex_x, vertex_y in metals["polygon"]:
            assert any(
                math.isclose(vertex_x, px, rel_tol=1e-9)
                and math.isclose(vertex_y, py, rel_tol=1e-9)
                for px, py in plotted
            )

    def test_envelopes_can_be_switched_off(self, client: TestClient) -> None:
        assert _map(client, include_envelopes=False)["envelopes"] == []


class TestIndexOverlay:
    def test_specific_stiffness_line_has_slope_one(self, client: TestClient) -> None:
        data = _map(client, index={"expression": "modulo_young / densidade", "goal": "maximize"})
        overlay = data["index"]
        assert overlay["available"] is True
        assert overlay["orientation"] == "oblique"
        assert overlay["slope"] == 1.0
        assert overlay["dimension"]  # derived, not assumed

    def test_light_stiff_beam_line_has_slope_two(self, client: TestClient) -> None:
        data = _map(
            client, index={"expression": "sqrt(modulo_young) / densidade", "goal": "maximize"}
        )
        assert data["index"]["slope"] == 2.0

    def test_index_values_are_attached_to_every_point(self, client: TestClient) -> None:
        data = _map(client, index={"expression": "modulo_young / densidade", "goal": "maximize"})
        aluminium = next(
            p for p in data["points"] if p["material_name"].startswith("Liga Alumínio")
        )
        assert aluminium["index_value"] == 69e9 / 2700.0
        assert data["index"]["defined_count"] == 5
        assert data["index"]["undefined_count"] == 0

    def test_level_through_a_material_passes_exactly_through_it(self, client: TestClient) -> None:
        base = _map(client, index={"expression": "modulo_young / densidade", "goal": "maximize"})
        aluminium = next(
            p for p in base["points"] if p["material_name"].startswith("Liga Alumínio")
        )

        data = _map(
            client,
            index={"expression": "modulo_young / densidade", "goal": "maximize"},
            index_level_material_ids=[aluminium["material_id"]],
        )
        level = data["index"]["levels"][0]
        assert level["material_name"].startswith("Liga Alumínio")
        assert level["value"] == aluminium["index_value"]

        # The segment is a straight line in log-log with slope 1; the material
        # must sit on it.
        (x1, y1), (x2, y2) = level["points"]
        slope = (math.log10(y2) - math.log10(y1)) / (math.log10(x2) - math.log10(x1))
        assert slope == pytest.approx(1.0)
        expected_y = 10 ** (math.log10(y1) + slope * (math.log10(aluminium["x"]) - math.log10(x1)))
        assert math.isclose(expected_y, aluminium["y"], rel_tol=1e-9)

    def test_superior_materials_are_reported_per_level(self, client: TestClient) -> None:
        base = _map(client, index={"expression": "modulo_young / densidade", "goal": "maximize"})
        by_id = {p["material_id"]: p["index_value"] for p in base["points"]}
        aluminium = next(
            p for p in base["points"] if p["material_name"].startswith("Liga Alumínio")
        )

        data = _map(
            client,
            index={"expression": "modulo_young / densidade", "goal": "maximize"},
            index_level_material_ids=[aluminium["material_id"]],
        )
        level = data["index"]["levels"][0]
        expected = sorted(mid for mid, value in by_id.items() if value >= level["value"])
        assert level["superior_material_ids"] == expected
        assert aluminium["material_id"] in expected  # the line touches its own material

    def test_minimise_goal_flips_the_favourable_side(self, client: TestClient) -> None:
        base = _map(client, index={"expression": "modulo_young / densidade", "goal": "minimize"})
        by_id = {p["material_id"]: p["index_value"] for p in base["points"]}
        target = next(iter(by_id))

        data = _map(
            client,
            index={"expression": "modulo_young / densidade", "goal": "minimize"},
            index_level_material_ids=[target],
        )
        level = data["index"]["levels"][0]
        assert level["superior_material_ids"] == sorted(
            mid for mid, value in by_id.items() if value <= level["value"]
        )

    def test_explicit_numeric_levels_are_drawn(self, client: TestClient) -> None:
        data = _map(
            client,
            index={"expression": "modulo_young / densidade", "goal": "maximize"},
            index_levels=[1e7, 5e7],
        )
        assert [level["value"] for level in data["index"]["levels"]] == [1e7, 5e7]
        assert all(level["material_id"] is None for level in data["index"]["levels"])

    def test_index_over_a_third_property_yields_values_but_no_line(
        self, client: TestClient
    ) -> None:
        data = _map(
            client, index={"expression": "modulo_young / (densidade * dureza)", "goal": "maximize"}
        )
        overlay = data["index"]
        assert overlay["available"] is False
        assert "apenas dos dois eixos" in overlay["unavailable_reason"]
        # The values themselves are still computed and disclosed.
        assert overlay["defined_count"] + overlay["undefined_count"] == 5

    def test_non_power_law_index_yields_no_line(self, client: TestClient) -> None:
        # A dimensionally *valid* sum (Pa + Pa) that still has no straight-line
        # contour: the request succeeds, only the line is withheld.
        data = _map(client, index={"expression": "modulo_young + modulo_young", "goal": "maximize"})
        assert data["index"]["available"] is False
        assert "lei de potência" in data["index"]["unavailable_reason"]

    def test_dimensionally_inconsistent_index_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            MAP_URL,
            json={
                "x": "densidade",
                "y": "modulo_young",
                "index": {"expression": "modulo_young + densidade", "goal": "maximize"},
            },
        )
        assert response.status_code == 400

    def test_undefined_index_reports_the_missing_property(self, client: TestClient) -> None:
        data = _map(client, index={"expression": "dureza / densidade", "goal": "maximize"})
        undefined = [p for p in data["points"] if p["index_value"] is None]
        assert undefined  # only two demo materials have Vickers hardness
        assert all("Dados ausentes" in p["index_undefined_reason"] for p in undefined)
        assert data["index"]["undefined_count"] == len(undefined)

    def test_unsafe_expression_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            MAP_URL,
            json={
                "x": "densidade",
                "y": "modulo_young",
                "index": {"expression": "__import__('os').system('echo x')", "goal": "maximize"},
            },
        )
        assert response.status_code == 400

    def test_index_independent_of_y_draws_a_vertical_line(self, client: TestClient) -> None:
        # 1/rho does not involve the y axis, so its contour is a vertical line.
        data = _map(
            client,
            index={"expression": "1 / densidade", "goal": "maximize"},
            index_levels=[1 / 2700],
        )
        overlay = data["index"]
        assert overlay["available"] is True
        assert overlay["orientation"] == "vertical"
        assert overlay["slope"] is None

        (x1, y1), (x2, y2) = overlay["levels"][0]["points"]
        assert x1 == pytest.approx(2700.0)
        assert x2 == pytest.approx(2700.0)
        assert y1 != y2  # the segment spans the plotted ordinates

    def test_vertical_line_survives_a_non_positive_abscissa(self, client: TestClient) -> None:
        # Regression: a vertical contour takes its abscissa from the level, not
        # from the plotted x range, so it must still be drawn when no plotted x
        # is positive (only the y span is actually needed).
        created = client.post(
            "/api/materials",
            json={
                "name": "Material Origem Zero",
                "class_id": 1,
                "keywords": [],
                "values": [
                    {
                        "property_slug": "densidade",
                        "kind": "scalar",
                        "value": 0.0,
                        "unit": "kg/m**3",
                        "data_quality": "ESTIMADO",
                    },
                    {
                        "property_slug": "modulo_young",
                        "kind": "scalar",
                        "value": 10.0,
                        "unit": "GPa",
                        "data_quality": "ESTIMADO",
                    },
                ],
            },
        )
        assert created.status_code == 201, created.text
        material_id = created.json()["id"]

        data = _map(
            client,
            scale="linear",
            material_ids=[material_id],
            index={"expression": "1 / densidade", "goal": "maximize"},
            index_levels=[1e-3],
        )
        assert data["plotted_count"] == 1
        assert data["x_axis"]["max_value"] == 0.0  # nothing positive on the x axis
        level = data["index"]["levels"][0]
        assert level["points"][0][0] == pytest.approx(1000.0)
        assert level["points"][1][0] == pytest.approx(1000.0)

    def test_level_for_a_material_outside_the_map_is_reported(self, client: TestClient) -> None:
        data = _map(
            client,
            index={"expression": "modulo_young / densidade", "goal": "maximize"},
            index_level_material_ids=[99999],
        )
        assert data["index"]["levels"] == []
        assert any("99999" in note for note in data["notes"])


class TestIndexAxis:
    """An axis can be a computed index instead of a catalogued property.

    This reuses the same evaluation path as the index overlay
    (``ChartService._material_variables`` / ``evaluate_index``), so a material
    excluded here for the same reason it would be excluded from an overlay's
    values is the expected behaviour, not a gap.
    """

    def test_index_on_x_axis_replaces_the_property(self, client: TestClient) -> None:
        data = _map(
            client,
            x=None,
            x_index={"name": "Rigidez específica", "expression": "modulo_young / densidade"},
            y="densidade",
            scale="linear",
        )
        assert data["x_axis"]["is_index"] is True
        assert data["x_axis"]["property_slug"] is None
        assert data["x_axis"]["property_name"] == "Rigidez específica"
        assert data["x_axis"]["expression"] == "modulo_young / densidade"
        assert data["x_axis"]["unit"]  # dimension is derived, not assumed

        aluminium = next(
            p for p in data["points"] if p["material_name"].startswith("Liga Alumínio")
        )
        assert aluminium["x"] == pytest.approx(69e9 / 2700.0)

    def test_index_axis_carries_no_quality_badge_or_bounds(self, client: TestClient) -> None:
        data = _map(
            client,
            x=None,
            x_index={"expression": "modulo_young / densidade"},
            y="densidade",
            scale="linear",
        )
        for point in data["points"]:
            assert point["x_quality"] is None
            assert point["x_min"] is None and point["x_max"] is None
            assert point["x_is_interval"] is False

    def test_unnamed_index_axis_falls_back_to_its_expression(self, client: TestClient) -> None:
        data = _map(
            client, x=None, x_index={"expression": "modulo_young / densidade"}, y="densidade"
        )
        assert data["x_axis"]["property_name"] == "modulo_young / densidade"

    def test_index_axis_direction_follows_its_own_goal(self, client: TestClient) -> None:
        data = _map(
            client,
            x=None,
            x_index={"expression": "modulo_young / densidade", "goal": "minimize"},
            y="densidade",
        )
        assert data["x_axis"]["better_direction"] == "LOWER"

    def test_both_axes_can_be_independent_indices(self, client: TestClient) -> None:
        data = _map(
            client,
            x=None,
            y=None,
            x_index={"expression": "modulo_young / densidade"},
            y_index={"expression": "1 / densidade"},
            scale="linear",
        )
        assert data["x_axis"]["is_index"] is True
        assert data["y_axis"]["is_index"] is True
        assert data["plotted_count"] == 5

    def test_material_lacking_a_variable_is_excluded_with_the_axis_label(
        self, client: TestClient
    ) -> None:
        # Only two demo materials have Vickers hardness (see TestIndexOverlay).
        data = _map(
            client,
            x=None,
            x_index={"name": "Dureza específica", "expression": "dureza / densidade"},
            y="modulo_young",
        )
        assert data["plotted_count"] == 2
        assert len(data["excluded"]) == 3
        assert all("Dureza específica" in e["reason"] for e in data["excluded"])

    def test_rejects_the_same_index_on_both_axes(self, client: TestClient) -> None:
        response = client.post(
            MAP_URL,
            json={
                "x": None,
                "y": None,
                "x_index": {"expression": "modulo_young / densidade"},
                "y_index": {"expression": "modulo_young / densidade"},
            },
        )
        assert response.status_code == 400

    def test_rejects_an_axis_with_neither_property_nor_index(self, client: TestClient) -> None:
        response = client.post(MAP_URL, json={"x": None, "y": "densidade"})
        assert response.status_code == 400

    def test_rejects_an_axis_with_both_property_and_index(self, client: TestClient) -> None:
        response = client.post(
            MAP_URL,
            json={
                "x": "densidade",
                "x_index": {"expression": "modulo_young / densidade"},
                "y": "modulo_young",
            },
        )
        assert response.status_code == 400

    def test_overlay_index_cannot_combine_with_an_index_axis(self, client: TestClient) -> None:
        response = client.post(
            MAP_URL,
            json={
                "x": None,
                "x_index": {"expression": "modulo_young / densidade"},
                "y": "modulo_young",
                "index": {"expression": "1 / densidade", "goal": "maximize"},
            },
        )
        assert response.status_code == 400


class TestCompare:
    def _ids(self, client: TestClient) -> list[int]:
        return [m["id"] for m in client.get("/api/materials").json()]

    def test_matrix_shape_and_order_follow_the_request(self, client: TestClient) -> None:
        ids = self._ids(client)[:3]
        response = client.post(
            COMPARE_URL,
            json={
                "material_ids": list(reversed(ids)),
                "property_slugs": ["modulo_young", "densidade"],
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert [m["material_id"] for m in data["materials"]] == list(reversed(ids))
        assert [p["property_slug"] for p in data["properties"]] == ["modulo_young", "densidade"]
        assert all(len(m["cells"]) == 2 for m in data["materials"])

    def test_lower_is_better_inverts_the_normalised_score(self, client: TestClient) -> None:
        ids = self._ids(client)
        response = client.post(
            COMPARE_URL, json={"material_ids": ids, "property_slugs": ["densidade"]}
        )
        data = response.json()
        cells = [
            (m["name"], m["cells"][0]["value"], m["cells"][0]["normalized"])
            for m in data["materials"]
        ]
        lightest = min(cells, key=lambda c: c[1])
        heaviest = max(cells, key=lambda c: c[1])
        # densidade is flagged "menor é melhor" in the catalogue.
        assert lightest[2] == 1.0
        assert heaviest[2] == 0.0

    def test_missing_value_stays_missing(self, client: TestClient) -> None:
        ids = self._ids(client)
        response = client.post(
            COMPARE_URL, json={"material_ids": ids, "property_slugs": ["condutividade_termica"]}
        )
        data = response.json()
        for material in data["materials"]:
            cell = material["cells"][0]
            assert cell["is_missing"] is True
            assert cell["value"] is None
            assert cell["normalized"] is None  # never 0
            assert material["complete"] is False
        assert any("ausente" in note for note in data["notes"])

    def test_provenance_travels_with_each_cell(self, client: TestClient) -> None:
        ids = self._ids(client)
        response = client.post(
            COMPARE_URL, json={"material_ids": ids, "property_slugs": ["modulo_young"]}
        )
        cell = next(
            m["cells"][0]
            for m in response.json()["materials"]
            if m["name"].startswith("Liga Alumínio")
        )
        assert cell["original_value"] == 69.0
        assert cell["original_unit"] == "GPa"
        assert cell["conversion_method"] == "pint:GPa->Pa"
        assert cell["value"] == 69e9

    def test_interval_bounds_are_reported_for_the_table(self, client: TestClient) -> None:
        ids = self._ids(client)
        response = client.post(
            COMPARE_URL, json={"material_ids": ids, "property_slugs": ["limite_escoamento"]}
        )
        polymer = next(m for m in response.json()["materials"] if m["name"].startswith("Polímero"))
        assert polymer["cells"][0]["value_min"] == 40.0
        assert polymer["cells"][0]["value_max"] == 60.0

    def test_axis_reports_who_is_missing(self, client: TestClient) -> None:
        ids = self._ids(client)
        response = client.post(
            COMPARE_URL, json={"material_ids": ids, "property_slugs": ["dureza"]}
        )
        axis = response.json()["properties"][0]
        assert axis["present_count"] == 2
        assert len(axis["missing_material_ids"]) == len(ids) - 2

    def test_vector_normalisation_is_accepted(self, client: TestClient) -> None:
        ids = self._ids(client)
        response = client.post(
            COMPARE_URL,
            json={
                "material_ids": ids,
                "property_slugs": ["modulo_young"],
                "normalization": "vector",
            },
        )
        assert response.json()["normalization"] == "vector"

    def test_duplicate_inputs_are_collapsed(self, client: TestClient) -> None:
        ids = self._ids(client)[:2]
        response = client.post(
            COMPARE_URL,
            json={
                "material_ids": [*ids, ids[0]],
                "property_slugs": ["densidade", "densidade"],
            },
        )
        data = response.json()
        assert len(data["materials"]) == 2
        assert len(data["properties"]) == 1

    def test_unknown_material_is_404(self, client: TestClient) -> None:
        response = client.post(
            COMPARE_URL, json={"material_ids": [999999], "property_slugs": ["densidade"]}
        )
        assert response.status_code == 404

    def test_unknown_property_is_404(self, client: TestClient) -> None:
        ids = self._ids(client)[:1]
        response = client.post(
            COMPARE_URL, json={"material_ids": ids, "property_slugs": ["inexistente"]}
        )
        assert response.status_code == 404

    def test_empty_selection_is_rejected_by_the_schema(self, client: TestClient) -> None:
        response = client.post(COMPARE_URL, json={"material_ids": [], "property_slugs": []})
        assert response.status_code == 422

    def test_too_many_materials_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            COMPARE_URL,
            json={"material_ids": list(range(1, 40)), "property_slugs": ["densidade"]},
        )
        assert response.status_code == 422


class TestChartAndSelectionAgree:
    def test_index_values_match_the_selection_pipeline(self, client: TestClient) -> None:
        expression = "sqrt(modulo_young) / densidade"
        run = client.post(
            "/api/selection/run",
            json={
                "combinator": "AND",
                "constraints": [],
                "index": {"expression": expression, "goal": "maximize"},
            },
        ).json()
        from_selection = {v["material_id"]: v["value"] for v in run["index"]["values"]}

        chart = _map(client, index={"expression": expression, "goal": "maximize"})
        from_chart = {p["material_id"]: p["index_value"] for p in chart["points"]}

        assert from_chart == {k: v for k, v in from_selection.items() if k in from_chart}
