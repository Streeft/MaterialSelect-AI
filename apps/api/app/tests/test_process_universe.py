"""The process universe end to end: catalogue endpoints and the process stage (P0-2).

``test_filters.py`` proves the pure matching. This proves the wiring: the join
read from the database into the snapshot, a process stage accepted over HTTP,
saved, read back and re-run, and every payload the backend refuses rather than
silently ignores.

The demo universe the seed installs is deliberately *not* used here — these
tests build their own tiny one, so an assertion never becomes a statement about
seed data that a later edit can move underneath it.
"""

from __future__ import annotations

import pytest

from app.models.material import Material
from app.models.process import MaterialProcess, Process, ProcessClass


@pytest.fixture()
def universe(db_session) -> dict[str, int]:
    """A two-family process tree, one family with sub-folders, wired to materials.

        conformacao ── conformacao_liquido ── fundicao-areia  → Liga Alumínio Demo A
                    └─ conformacao_solido  ── forjamento      → Aço Demo B
        uniao ─────────────────────────────── solda-mig       → Aço Demo B

    "Polímero Demo C" is left with no process at all: the fourth state of the
    data, and the case a process stage must reject rather than wave through.
    """
    conformacao = ProcessClass(name="Conformação", slug="conformacao")
    uniao = ProcessClass(name="União", slug="uniao")
    db_session.add_all([conformacao, uniao])
    db_session.flush()

    liquido = ProcessClass(
        name="Conformação em estado líquido", slug="conformacao_liquido", parent_id=conformacao.id
    )
    solido = ProcessClass(
        name="Conformação em estado sólido", slug="conformacao_solido", parent_id=conformacao.id
    )
    db_session.add_all([liquido, solido])
    db_session.flush()

    fundicao = Process(name="Fundição em areia", slug="fundicao-areia", class_id=liquido.id)
    forjamento = Process(name="Forjamento", slug="forjamento", class_id=solido.id)
    solda = Process(name="Solda MIG", slug="solda-mig", class_id=uniao.id)
    # Withdrawn from the catalogue: it must not admit anything, even though the
    # link below still exists.
    obsoleto = Process(
        name="Processo desativado", slug="processo-desativado", class_id=uniao.id, is_active=False
    )
    db_session.add_all([fundicao, forjamento, solda, obsoleto])
    db_session.flush()

    ids = {m.name: m.id for m in db_session.query(Material).all()}
    db_session.add_all(
        [
            MaterialProcess(material_id=ids["Liga Alumínio Demo A"], process_id=fundicao.id),
            MaterialProcess(material_id=ids["Aço Demo B"], process_id=forjamento.id),
            MaterialProcess(material_id=ids["Aço Demo B"], process_id=solda.id),
            MaterialProcess(material_id=ids["Cerâmica Demo D"], process_id=obsoleto.id),
        ]
    )
    db_session.flush()
    return {"conformacao": conformacao.id, "uniao": uniao.id, "solda": solda.id}


def _names(payload: dict) -> list[str]:
    return sorted(c["name"] for c in payload["candidates"])


# --- the catalogue endpoints -------------------------------------------------


def test_list_process_classes_counts_only_what_sits_directly_in_each_folder(
    client, universe
) -> None:
    resp = client.get("/api/processes/classes")
    assert resp.status_code == 200, resp.text
    by_slug = {c["slug"]: c for c in resp.json()}

    # "conformacao" holds no process directly — both of its children do.
    assert by_slug["conformacao"]["process_count"] == 0
    assert by_slug["conformacao_liquido"]["process_count"] == 1
    # Two, because the inactive one is still filed here: the count describes the
    # folder, and hiding it would make an operator wonder where it went.
    assert by_slug["uniao"]["process_count"] == 2
    assert by_slug["conformacao_liquido"]["parent_id"] == by_slug["conformacao"]["id"]


def test_list_processes_reports_the_join_and_hides_inactive_ones(client, universe) -> None:
    resp = client.get("/api/processes")
    assert resp.status_code == 200, resp.text
    by_slug = {p["slug"]: p for p in resp.json()}

    assert "processo-desativado" not in by_slug
    assert by_slug["solda-mig"]["class_name"] == "União"
    assert by_slug["solda-mig"]["material_count"] == 1
    assert by_slug["forjamento"]["material_count"] == 1
    assert by_slug["fundicao-areia"]["material_count"] == 1


def test_the_process_catalogue_needs_a_session(anon_client) -> None:
    assert anon_client.get("/api/processes").status_code == 401
    assert anon_client.get("/api/processes/classes").status_code == 401


# --- the process stage, over HTTP -------------------------------------------


def test_a_process_stage_keeps_the_materials_that_process_applies_to(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_slugs": ["solda-mig"]}]},
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Aço Demo B"]


def test_a_process_folder_carries_its_descendants(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_class_slugs": ["conformacao"]}]},
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Aço Demo B", "Liga Alumínio Demo A"]


def test_a_process_folder_without_descendants_admits_only_its_own(client, universe) -> None:
    def picking(slug: str) -> list[str]:
        resp = client.post(
            "/api/selection/filter",
            json={
                "stages": [
                    {
                        "kind": "process",
                        "process_class_slugs": [slug],
                        "include_descendants": False,
                    }
                ]
            },
        )
        assert resp.status_code == 200, resp.text
        return _names(resp.json())

    # Both halves, on purpose: the empty one alone would pass just as well if the
    # whole join were broken, so the positive case is what proves it is not.
    assert picking("conformacao") == []
    assert picking("conformacao_liquido") == ["Liga Alumínio Demo A"]


def test_a_material_with_no_process_never_survives_a_process_stage(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_class_slugs": ["conformacao", "uniao"]}]},
    )
    assert resp.status_code == 200, resp.text
    # Polímero Demo C has no link; Cerâmica Demo D's only process is inactive.
    assert "Polímero Demo C" not in _names(resp.json())
    assert "Cerâmica Demo D" not in _names(resp.json())


def test_two_process_stages_intersect(client, universe) -> None:
    """ "Weldable AND forgeable" is two stages — the composition P0-1 exists for."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "stages": [
                {"kind": "process", "process_slugs": ["solda-mig"]},
                {"kind": "process", "process_class_slugs": ["conformacao"]},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Aço Demo B"]


def test_a_process_stage_combines_with_a_limit_stage(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={
            "stages": [
                {"kind": "process", "process_class_slugs": ["conformacao"]},
                {
                    "kind": "limit",
                    "constraints": [
                        {
                            "operator": "lt",
                            "property_slug": "densidade",
                            "value": 3.0,
                            "unit": "g/cm**3",
                        }
                    ],
                },
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Liga Alumínio Demo A"]


def test_the_funnel_reports_the_process_stage(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={
            "stages": [
                {"kind": "process", "label": "Soldável", "process_slugs": ["solda-mig"]},
                {"kind": "process", "process_class_slugs": ["conformacao"], "enabled": False},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    stages = resp.json()["stages"]
    assert [s["kind"] for s in stages] == ["process", "process"]
    assert stages[0]["label"] == "Soldável"
    assert stages[0]["passed"] == 1
    assert stages[0]["remaining"] == 1
    # Disabled: it reports what it *would* admit alone, and does not narrow.
    assert stages[1]["enabled"] is False
    assert stages[1]["passed"] == 2
    assert stages[1]["remaining"] == 1
    # Its whole question is the selection, so it has no inner funnel.
    assert stages[0]["steps"] == []


# --- saving, reading back and re-running ------------------------------------


def test_a_process_stage_round_trips_through_a_saved_study(client, universe) -> None:
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Estudo com processo",
            "free_variables": [],
            "criteria": [],
            "stages": [
                {"kind": "limit", "constraints": []},
                {
                    "kind": "process",
                    "label": "Conformável",
                    "process_slugs": ["solda-mig"],
                    "process_class_slugs": ["conformacao"],
                    "include_descendants": False,
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    study_id = created.json()["id"]

    read = client.get(f"/api/selection/studies/{study_id}")
    assert read.status_code == 200, read.text
    stages = read.json()["stages"]
    assert [s["kind"] for s in stages] == ["limit", "process"]
    process_stage = stages[1]
    assert process_stage["label"] == "Conformável"
    assert process_stage["process_slugs"] == ["solda-mig"]
    assert process_stage["process_class_slugs"] == ["conformacao"]
    assert process_stage["include_descendants"] is False
    # Not a tree stage: the material-class list stays empty.
    assert process_stage["class_slugs"] == []

    run = client.post(f"/api/selection/studies/{study_id}/run")
    assert run.status_code == 200, run.text
    # `include_descendants=False` kills the folder half; the process half stands.
    assert [c["name"] for c in run.json()["candidates"]] == ["Aço Demo B"]


# --- what the backend refuses -----------------------------------------------


@pytest.mark.parametrize(
    ("stage", "fragment"),
    [
        (
            {
                "kind": "process",
                "process_slugs": ["solda-mig"],
                "constraints": [{"operator": "exists", "property_slug": "densidade"}],
            },
            "não leva restrições",
        ),
        (
            {"kind": "process", "process_slugs": ["solda-mig"], "class_slugs": ["metais"]},
            "não leva classes de material",
        ),
        (
            {"kind": "limit", "process_slugs": ["solda-mig"]},
            "não leva processos",
        ),
        (
            {"kind": "tree", "class_slugs": ["metais"], "process_class_slugs": ["uniao"]},
            "não leva processos",
        ),
    ],
)
def test_a_stage_that_mixes_kinds_is_refused_not_ignored(
    client, universe, stage: dict, fragment: str
) -> None:
    """Silently dropping half a stage is how a user ends up staring at a
    selection that does not narrow."""
    resp = client.post("/api/selection/filter", json={"stages": [stage]})
    assert resp.status_code == 400, resp.text
    assert fragment in resp.json()["detail"]


def test_an_unknown_process_slug_is_a_404_that_names_it(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_slugs": ["nao-existe"]}]},
    )
    assert resp.status_code == 404, resp.text
    assert "nao-existe" in resp.json()["detail"]


def test_an_unknown_process_class_slug_is_a_404_that_names_it(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_class_slugs": ["nao-existe"]}]},
    )
    assert resp.status_code == 404, resp.text
    assert "nao-existe" in resp.json()["detail"]


def test_saving_a_study_with_an_unknown_process_is_refused(client, universe) -> None:
    resp = client.post(
        "/api/selection/studies",
        json={
            "name": "Estudo inválido",
            "free_variables": [],
            "criteria": [],
            "stages": [{"kind": "process", "process_slugs": ["nao-existe"]}],
        },
    )
    assert resp.status_code == 404, resp.text


def test_an_empty_process_stage_does_not_narrow(client, universe) -> None:
    """Same convention as an empty constraint group and an empty tree stage."""
    everything = client.post("/api/selection/filter", json={"constraints": []})
    resp = client.post("/api/selection/filter", json={"stages": [{"kind": "process"}]})
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == _names(everything.json())
