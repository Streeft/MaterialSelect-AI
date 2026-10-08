"""Composition as a limit-stage criterion (TM2-b, D-105).

Same seeded baseline as the search tests: "Aço Demo B" (Cr 17,5–19,5 %) and
"Liga Alumínio Demo A" (Cr 0,04–0,35 %) have a fictitious composition; the
polymer, the ceramic and the composite have none, which must never pass.
"""

from __future__ import annotations

import pytest

STEEL = "Aço Demo B"
ALUMINIUM = "Liga Alumínio Demo A"


def _filter(client, *constraints: dict, **extra) -> dict:
    response = client.post(
        "/api/selection/filter", json={"constraints": list(constraints), **extra}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _names(body: dict) -> list[str]:
    return sorted(c["name"] for c in body["candidates"])


def _comp(text: str, operator: str = "composition") -> dict:
    return {"operator": operator, "text": text}


class TestCompositionCriterion:
    def test_reach_admits_the_range_that_gets_there(self, client) -> None:
        body = _filter(client, _comp("Cr>=12"))
        assert _names(body) == [STEEL]

    def test_the_guarantee_side_is_the_complement_of_reach(self, client) -> None:
        # "No conforming heat has less than 12 %" keeps the steel only; the
        # aluminium alloy can have less, and materials without data are out.
        assert _names(_filter(client, _comp("Cr<12", "not_composition"))) == [STEEL]
        # "No conforming heat reaches 12 %": the aluminium alloy.
        assert _names(_filter(client, _comp("Cr>=12", "not_composition"))) == [ALUMINIUM]

    def test_missing_composition_never_passes_even_under_the_negative(self, client) -> None:
        for operator in ("composition", "not_composition"):
            body = _filter(client, _comp("Cr>=12", operator))
            assert "Polímero Demo C" not in _names(body)
            assert "Cerâmica Demo D" not in _names(body)

    def test_the_funnel_counts_who_could_not_be_decided(self, client) -> None:
        body = _filter(client, _comp("Cr>=12"))
        (step,) = body["steps"]
        assert step["operator"] == "composition"
        assert step["undetermined"] == 3
        assert step["passed"] == 1
        assert "alcance" in step["label"]

    def test_a_guarantee_is_labelled_as_such(self, client) -> None:
        (step,) = _filter(client, _comp("Cr<12", "not_composition"))["steps"]
        assert "garantia" in step["label"]

    def test_other_criteria_report_no_undetermined_count(self, client) -> None:
        body = _filter(client, {"operator": "lte", "property_slug": "densidade", "value": 3000})
        assert all(step["undetermined"] is None for step in body["steps"])

    def test_it_combines_with_a_property_limit(self, client) -> None:
        body = _filter(
            client,
            _comp("Cr>=0,1"),
            {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"},
        )
        assert _names(body) == [ALUMINIUM]

    @pytest.mark.parametrize("text", ["", "Zz>=1", "Cr >= 12", "Cr>=120"])
    def test_a_bad_condition_is_a_400_in_portuguese(self, client, text) -> None:
        response = client.post("/api/selection/filter", json={"constraints": [_comp(text)]})
        assert response.status_code == 400
        assert response.json()["detail"]

    def test_the_condition_survives_a_saved_study(self, client) -> None:
        created = client.post(
            "/api/selection/studies",
            json={
                "name": "Estudo de composição",
                "free_variables": [],
                "constraints": [_comp("Cr>=12")],
                "criteria": [],
            },
        )
        assert created.status_code == 201, created.text
        run = client.post(f"/api/selection/studies/{created.json()['id']}/run")
        assert run.status_code == 200, run.text
        assert [c["name"] for c in run.json()["candidates"]] == [STEEL]
        assert run.json()["funnel"][0]["undetermined"] == 3

    def test_a_process_study_refuses_composition(self, client) -> None:
        response = client.post(
            "/api/selection/filter",
            json={"universe": "process", "constraints": [_comp("Cr>=12")]},
        )
        assert response.status_code == 400


def test_the_report_states_the_rule_and_the_undecided(client) -> None:
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Laudo de composição",
            "free_variables": [],
            "constraints": [_comp("Cr>=12")],
            "criteria": [],
        },
    )
    assert created.status_code == 201, created.text
    page = client.get(f"/api/exports/estudos/{created.json()['id']}.html")
    assert page.status_code == 200, page.text
    assert "alcance da faixa" in page.text
    assert "sem o dado de composição" in page.text
