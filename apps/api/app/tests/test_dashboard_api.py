"""End-to-end tests for the catalogue panel.

The seeded demo set (see app/db/seed.py) is the fixture: 5 materials across 5
classes (one class, elastômeros, with no material at all), 8 properties, one
declared-missing value (Cerâmica Demo D has no condutividade_termica), and every
other (material, property) pair either filled or never recorded. That mix is
exactly what exercises the panel's three-valued vocabulary — filled, declared
missing, not recorded — instead of the two-valued one most dashboards default
to.

Per-material coverage, worked out by hand from the seed:
  Liga Alumínio Demo A (metais)    -> densidade, modulo_young,
                                       limite_escoamento, temp_max_servico,
                                       custo_massa                    (5 filled)
  Aço Demo B (metais)              -> densidade, modulo_young,
                                       resistencia_tracao, dureza,
                                       temp_max_servico                (5 filled)
  Polímero Demo C (polimeros)      -> densidade, modulo_young,
                                       limite_escoamento,
                                       temp_max_servico                (4 filled)
  Cerâmica Demo D (ceramicas)      -> densidade, modulo_young, dureza,
                                       temp_max_servico        (4 filled, 1 missing)
  Compósito Demo E (compositos)    -> densidade, modulo_young,
                                       resistencia_tracao, custo_massa (4 filled)

Totals: 22 filled, 1 declared missing, 40 slots (5 materials × 8 properties),
17 not recorded.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

OVERVIEW_URL = "/api/dashboard/overview"


def _overview(client: TestClient) -> dict:
    response = client.get(OVERVIEW_URL)
    assert response.status_code == 200, response.text
    return response.json()


def _distribution(client: TestClient, slug: str) -> dict:
    response = client.get(f"/api/dashboard/distribution/{slug}")
    assert response.status_code == 200, response.text
    return response.json()


class TestOverviewTotals:
    def test_counts_materials_classes_and_properties(self, client: TestClient) -> None:
        data = _overview(client)
        assert data["materials"] == 5
        assert data["classes"] == 5
        assert data["properties"] == 8
        # All five seeded materials are demonstration data; a real import would
        # bring this below the total without the total itself changing.
        assert data["demo_materials"] == 5

    def test_the_coverage_total_matches_the_hand_count(self, client: TestClient) -> None:
        coverage = _overview(client)["coverage"]
        assert coverage["slots"] == 40
        assert coverage["filled"] == 22
        assert coverage["declared_missing"] == 1
        assert coverage["not_recorded"] == 17
        assert coverage["filled_pct"] == 55.0

    def test_the_three_states_always_add_up_to_the_slots(self, client: TestClient) -> None:
        # Not a fact about this fixture — a fact that has to hold for any
        # catalogue, at the total and at every row underneath it.
        data = _overview(client)
        coverage = data["coverage"]
        assert (
            coverage["filled"] + coverage["declared_missing"] + coverage["not_recorded"]
            == coverage["slots"]
        )
        for row in data["by_class"] + data["by_property"]:
            c = row["coverage"]
            assert c["filled"] + c["declared_missing"] + c["not_recorded"] == c["slots"]


class TestProvenanceMix:
    def test_the_slices_are_shares_of_every_slot_not_of_stored_rows(
        self, client: TestClient
    ) -> None:
        # The denominator has to be all 40 slots, not the 23 rows that exist.
        # Sharing out only what was stored would let a mostly-empty catalogue
        # read as "100% estimado".
        data = _overview(client)
        buckets = {slice_["bucket"]: slice_ for slice_ in data["by_quality"]}
        assert set(buckets) == {"MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE", "NAO_REGISTRADO"}
        assert sum(b["count"] for b in buckets.values()) == 40
        # Every seeded value was written with quality=ESTIMADO.
        assert buckets["ESTIMADO"]["count"] == 22
        assert buckets["MEDIDO"]["count"] == 0
        assert buckets["AUSENTE"]["count"] == 1
        assert buckets["NAO_REGISTRADO"]["count"] == 17

    def test_declared_missing_is_never_folded_into_not_recorded(self, client: TestClient) -> None:
        # The one distinction this screen exists to draw. If a future edit
        # merged the two, this is the assertion that would catch it.
        data = _overview(client)
        buckets = {s["bucket"]: s["count"] for s in data["by_quality"]}
        assert buckets["AUSENTE"] != buckets["NAO_REGISTRADO"]
        assert buckets["AUSENTE"] == 1
        assert buckets["NAO_REGISTRADO"] == 17


class TestPerClassCoverage:
    def test_every_class_appears_even_the_empty_one(self, client: TestClient) -> None:
        data = _overview(client)
        slugs = {row["slug"] for row in data["by_class"]}
        assert slugs == {"metais", "polimeros", "ceramicas", "compositos", "elastomeros"}

    def test_a_class_with_no_materials_has_no_coverage_to_report(self, client: TestClient) -> None:
        # Zero materials, not a hidden division by zero: no slots, and
        # `filled_pct` is None rather than a misleading 0%.
        data = _overview(client)
        elastomeros = next(row for row in data["by_class"] if row["slug"] == "elastomeros")
        assert elastomeros["materials"] == 0
        assert elastomeros["coverage"] == {
            "filled": 0,
            "declared_missing": 0,
            "not_recorded": 0,
            "slots": 0,
            "filled_pct": None,
        }

    def test_the_class_with_the_missing_value_reports_it(self, client: TestClient) -> None:
        data = _overview(client)
        ceramicas = next(row for row in data["by_class"] if row["slug"] == "ceramicas")
        assert ceramicas["materials"] == 1
        assert ceramicas["coverage"]["slots"] == 8
        assert ceramicas["coverage"]["filled"] == 4
        assert ceramicas["coverage"]["declared_missing"] == 1
        assert ceramicas["coverage"]["not_recorded"] == 3

    def test_metais_sums_its_two_materials(self, client: TestClient) -> None:
        data = _overview(client)
        metais = next(row for row in data["by_class"] if row["slug"] == "metais")
        assert metais["materials"] == 2
        assert metais["coverage"]["slots"] == 16
        assert metais["coverage"]["filled"] == 10


class TestPerPropertyCoverage:
    def test_every_property_appears(self, client: TestClient) -> None:
        data = _overview(client)
        slugs = {row["slug"] for row in data["by_property"]}
        assert len(slugs) == 8
        assert "densidade" in slugs

    def test_a_property_every_material_carries_is_fully_covered(self, client: TestClient) -> None:
        data = _overview(client)
        densidade = next(row for row in data["by_property"] if row["slug"] == "densidade")
        assert densidade["coverage"] == {
            "filled": 5,
            "declared_missing": 0,
            "not_recorded": 0,
            "slots": 5,
            "filled_pct": 100.0,
        }

    def test_the_property_with_the_missing_value_reports_it_at_its_own_row(
        self, client: TestClient
    ) -> None:
        data = _overview(client)
        k = next(row for row in data["by_property"] if row["slug"] == "condutividade_termica")
        assert k["coverage"]["filled"] == 0
        assert k["coverage"]["declared_missing"] == 1
        assert k["coverage"]["not_recorded"] == 4
        assert k["coverage"]["slots"] == 5


class TestGaps:
    def test_the_worst_covered_property_leads_the_list(self, client: TestClient) -> None:
        data = _overview(client)
        assert data["gaps"], "gaps não deveria vir vazio com um catálogo parcialmente preenchido"
        worst = data["gaps"][0]
        assert worst["slug"] == "condutividade_termica"
        assert worst["coverage"]["filled"] == 0

    def test_never_lists_more_than_five(self, client: TestClient) -> None:
        assert len(_overview(client)["gaps"]) <= 5

    def test_is_sorted_worst_first(self, client: TestClient) -> None:
        gaps = _overview(client)["gaps"]
        counts = [row["coverage"]["filled"] for row in gaps]
        assert counts == sorted(counts)


class TestDistribution:
    def test_boxes_one_per_class_that_has_the_property(self, client: TestClient) -> None:
        # densidade is on all 5 materials, spread over 4 classes with materials
        # (elastômeros has none, so it cannot be "missing" anything).
        data = _distribution(client, "densidade")
        assert data["property_slug"] == "densidade"
        assert data["canonical_unit"] == "kg/m**3"
        slugs = {box["class_slug"] for box in data["boxes"]}
        assert slugs == {"metais", "polimeros", "ceramicas", "compositos"}
        assert data["classes_without_data"] == []

    def test_the_two_metal_densities_produce_a_real_five_number_summary(
        self, client: TestClient
    ) -> None:
        # 2700 kg/m**3 (Liga Alumínio, seeded as 2.70 g/cm**3) and
        # 7850 kg/m**3 (Aço, seeded already in kg/m**3).
        data = _distribution(client, "densidade")
        metais = next(box for box in data["boxes"] if box["class_slug"] == "metais")
        assert metais["count"] == 2
        assert metais["minimum"] == 2700.0
        assert metais["maximum"] == 7850.0
        assert metais["median"] == 5275.0

    def test_boxes_are_sorted_by_median_descending(self, client: TestClient) -> None:
        data = _distribution(client, "densidade")
        medians = [box["median"] for box in data["boxes"]]
        assert medians == sorted(medians, reverse=True)

    def test_names_the_classes_that_have_materials_but_no_value(self, client: TestClient) -> None:
        # dureza is filled only for Aço (metais) and Cerâmica (ceramicas).
        # Polímeros and Compósitos each have a material but no dureza value;
        # elastômeros has no material at all and is therefore not "missing" it.
        data = _distribution(client, "dureza")
        assert set(data["classes_without_data"]) == {"Polímeros", "Compósitos"}
        assert "Elastômeros" not in data["classes_without_data"]

    def test_a_property_nobody_has_yet_returns_no_boxes_not_an_error(
        self, client: TestClient
    ) -> None:
        # limite_escoamento is only on Liga Alumínio and Polímero — but a
        # property that had zero values anywhere should still be a 200 with an
        # empty list, not a 404 or an exception.
        data = _distribution(client, "condutividade_termica")
        assert data["boxes"] == []
        assert "Cerâmicas" in data["classes_without_data"]

    def test_an_unknown_property_is_a_404_not_an_empty_200(self, client: TestClient) -> None:
        response = client.get("/api/dashboard/distribution/nao-existe")
        assert response.status_code == 404

    def test_carries_the_property_s_own_log_scale_preference(self, client: TestClient) -> None:
        # Sent by the backend rather than guessed by the client: this catalogue
        # mixes properties that span decades with ones that do not, and the
        # definition already knows which of its own axes is honest.
        data = _distribution(client, "densidade")
        assert data["allows_log_scale"] is True
