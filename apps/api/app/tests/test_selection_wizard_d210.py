"""D-210: the selection wizard's live funnel, ready-made studies and run diff.

Three small endpoints the redesigned wizard reads:

* ``POST /selection/funnel`` — the funnel's counts without the candidate list;
* ``GET /selection/templates`` — classic formulations, no material number;
* ``POST /selection/run-diff`` — what changed between two runs of a study.
"""

from __future__ import annotations

import pytest

from app.domain import study_templates
from app.domain.errors import ValidationError
from app.domain.run_diff import RunEntry, diff_runs
from app.domain.study_templates import STUDY_TEMPLATES, StudyTemplate, template_by_slug

DENSITY_LIMIT = {
    "kind": "limit",
    "root_group": {
        "operator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 3, "unit": "g/cm**3"}
        ],
        "groups": [],
    },
}


# --- /selection/funnel -------------------------------------------------------


def test_funnel_answers_the_counts_of_filter_without_the_candidates(client) -> None:
    payload = {"universe": "material", "stages": [DENSITY_LIMIT]}
    funnel = client.post("/api/selection/funnel", json=payload)
    filtered = client.post("/api/selection/filter", json=payload)
    assert funnel.status_code == 200, funnel.text
    body, reference = funnel.json(), filtered.json()

    assert "candidates" not in body
    assert body["initial_count"] == reference["initial_count"]
    assert body["final_count"] == reference["final_count"]
    assert body["final_count"] < body["initial_count"]
    assert body["funnel"] == reference["steps"]
    assert body["stages"] == reference["stages"]
    assert body["universe"] == "material"


def test_funnel_with_no_limit_keeps_the_whole_catalogue(client) -> None:
    # What a pristine wizard sends: one limit stage with nothing in it.
    empty = {"kind": "limit", "root_group": {"operator": "AND", "constraints": [], "groups": []}}
    resp = client.post("/api/selection/funnel", json={"universe": "material", "stages": [empty]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["final_count"] == body["initial_count"]
    assert body["funnel"] == []


def test_funnel_refuses_an_unknown_property_like_the_run_does(client) -> None:
    payload = {
        "stages": [
            {
                "kind": "limit",
                "root_group": {
                    "operator": "AND",
                    "constraints": [{"operator": "exists", "property_slug": "nao_existe"}],
                },
            }
        ]
    }
    funnel = client.post("/api/selection/funnel", json=payload)
    run = client.post("/api/selection/run", json=payload)
    assert funnel.status_code == run.status_code
    assert funnel.status_code >= 400


def test_funnel_requires_login(anon_client) -> None:
    assert anon_client.post("/api/selection/funnel", json={}).status_code == 401


# --- /selection/templates ----------------------------------------------------


def test_templates_list_the_four_classic_formulations(client) -> None:
    resp = client.get("/api/selection/templates")
    assert resp.status_code == 200, resp.text
    slugs = [t["slug"] for t in resp.json()]
    assert slugs == ["viga-leve-rigida", "mola-leve", "painel-leve-rigido", "trocador-de-calor"]


def test_templates_carry_no_material_number(client) -> None:
    """Principle 1: a template is words and an index, never a threshold."""
    for template in client.get("/api/selection/templates").json():
        for stage in template["stages"]:
            for constraint in stage["root_group"]["constraints"]:
                assert constraint["operator"] == "exists"
                assert constraint["value"] is None
                assert constraint["value_min"] is None
                assert constraint["value_max"] is None
        assert template["criteria"] == [
            {"key": "__index__", "label": None, "direction": None, "weight": 1.0}
        ]


def test_templates_are_available_on_the_seeded_catalogue(client) -> None:
    for template in client.get("/api/selection/templates").json():
        assert template["available"] is True, template
        assert template["missing_properties"] == []


def test_a_template_reuses_the_catalogue_index_when_there_is_one(client) -> None:
    by_slug = {t["slug"]: t for t in client.get("/api/selection/templates").json()}
    indices = {i["slug"]: i for i in client.get("/api/performance-indices").json()}
    beam = by_slug["viga-leve-rigida"]
    assert beam["index_slug"] == "viga-leve-rigidez"
    assert beam["index"]["expression"] == indices["viga-leve-rigidez"]["expression"]
    # The spring has no seeded index: its expression travels as written.
    spring = by_slug["mola-leve"]
    assert spring["index_slug"] is None
    assert spring["index"]["expression"] == template_by_slug("mola-leve").index_expression


@pytest.mark.parametrize("slug", [t.slug for t in STUDY_TEMPLATES])
def test_every_template_runs_through_the_real_pipeline(client, slug) -> None:
    template = next(t for t in client.get("/api/selection/templates").json() if t["slug"] == slug)
    resp = client.post(
        "/api/selection/run",
        json={
            "universe": template["universe"],
            "stages": template["stages"],
            "index": template["index"],
            "ranking": {"criteria": template["criteria"]},
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Every surviving candidate has the properties the index reads, so the
    # funnel is the reason a material fell — never a silent undefined index.
    assert len(body["funnel"]) == len(template_by_slug(slug).required_properties)
    assert body["winner"]["kind"] in {"ranked", "none"}


def test_a_template_whose_property_is_missing_says_so(client, monkeypatch) -> None:
    ghost = StudyTemplate(
        slug="fantasma",
        name="Fantasma",
        summary="",
        function_text="",
        objective_text="",
        design_constraint="",
        free_variables=(),
        required_properties=("densidade", "propriedade_inexistente"),
        index_slug=None,
        index_name="Fantasma",
        index_expression="propriedade_inexistente / densidade",
        index_goal="maximize",
        reference="",
    )
    monkeypatch.setattr(study_templates, "STUDY_TEMPLATES", (ghost,))
    monkeypatch.setattr("app.services.selection_service.STUDY_TEMPLATES", (ghost,))
    [template] = client.get("/api/selection/templates").json()
    assert template["available"] is False
    assert template["missing_properties"] == ["propriedade_inexistente"]


# --- run diff ----------------------------------------------------------------


def test_diff_names_every_kind_of_change() -> None:
    before = [
        RunEntry(1, "A", 1),
        RunEntry(2, "B", 2),
        RunEntry(3, "C", 3),
        RunEntry(4, "D", 4),
    ]
    after = [
        RunEntry(2, "B", 1),
        RunEntry(1, "A", 2),
        RunEntry(3, "C", 3),
        RunEntry(5, "E", 4),
    ]
    diff = diff_runs(before, after)
    by_id = {r.record_id: r for r in diff.rows}
    assert by_id[2].change == "up" and by_id[2].positions == 1
    assert by_id[1].change == "down" and by_id[1].positions == -1
    assert by_id[3].change == "same" and by_id[3].positions == 0
    assert by_id[5].change == "entered" and by_id[5].rank_before is None
    assert by_id[4].change == "left" and by_id[4].rank_after is None
    assert [r.record_id for r in diff.rows] == [2, 1, 3, 5, 4]
    assert (diff.entered, diff.left, diff.moved, diff.unchanged) == (1, 1, 2, 1)
    assert diff.winners_before == ["A"] and diff.winners_after == ["B"]
    assert diff.winner_changed is True


def test_diff_never_counts_a_move_without_two_ranks() -> None:
    """A run with no ranking compares by presence: no "zero positions" claimed."""
    diff = diff_runs([RunEntry(1, "A", None)], [RunEntry(1, "A", 1)])
    [row] = diff.rows
    assert row.change == "unranked"
    assert row.positions is None


def test_diff_refuses_a_repeated_record() -> None:
    with pytest.raises(ValidationError):
        diff_runs([RunEntry(1, "A", 1), RunEntry(1, "A", 2)], [])


def test_run_diff_endpoint(client) -> None:
    resp = client.post(
        "/api/selection/run-diff",
        json={
            "before": [{"record_id": 1, "name": "A", "rank": 1}],
            "after": [
                {"record_id": 1, "name": "A", "rank": 1},
                {"record_id": 2, "name": "B", "rank": 2},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["winner_changed"] is False
    assert body["entered"] == 1
    assert [r["change"] for r in body["rows"]] == ["same", "entered"]


def test_run_diff_endpoint_refuses_repeats_and_bad_ranks(client) -> None:
    repeated = client.post(
        "/api/selection/run-diff",
        json={
            "before": [{"record_id": 1, "name": "A"}, {"record_id": 1, "name": "A"}],
            "after": [],
        },
    )
    assert repeated.status_code == 400
    zero = client.post(
        "/api/selection/run-diff",
        json={"before": [{"record_id": 1, "name": "A", "rank": 0}], "after": []},
    )
    assert zero.status_code == 422
