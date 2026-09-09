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

#: The fixture's own slug namespace. The seed installs a real demo universe
#: (P0-2), so building one here with the obvious slugs would collide with it —
#: and, worse, an assertion about f"{NS}-solda" would silently become an assertion
#: about seed data. Everything below is prefixed, so a stage that selects these
#: folders and processes cannot reach a seeded link, and the candidate lists stay
#: exact.
NS = "teste"


@pytest.fixture()
def universe(db_session) -> None:
    """A two-family process tree, one family with sub-folders, wired to materials.

        teste-conformacao ── teste-liquido ── teste-fundicao → Liga Alumínio Demo A
                          └─ teste-solido  ── teste-forja    → Aço Demo B
        teste-uniao ────────────────────────── teste-solda   → Aço Demo B

    "Polímero Demo C" gets none of these: within this namespace it is a material
    with no process, which is the case a process stage must reject rather than
    wave through.
    """
    conformacao = ProcessClass(name="Conformação de teste", slug=f"{NS}-conformacao")
    uniao = ProcessClass(name="União de teste", slug=f"{NS}-uniao")
    db_session.add_all([conformacao, uniao])
    db_session.flush()

    liquido = ProcessClass(
        name="Estado líquido de teste", slug=f"{NS}-liquido", parent_id=conformacao.id
    )
    solido = ProcessClass(
        name="Estado sólido de teste", slug=f"{NS}-solido", parent_id=conformacao.id
    )
    db_session.add_all([liquido, solido])
    db_session.flush()

    fundicao = Process(name="Fundição de teste", slug=f"{NS}-fundicao", class_id=liquido.id)
    forjamento = Process(name="Forjamento de teste", slug=f"{NS}-forja", class_id=solido.id)
    solda = Process(name="Solda de teste", slug=f"{NS}-solda", class_id=uniao.id)
    # Withdrawn from the catalogue: it must not admit anything, even though the
    # link below still exists.
    obsoleto = Process(
        name="Processo desativado de teste",
        slug=f"{NS}-desativado",
        class_id=uniao.id,
        is_active=False,
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


def _names(payload: dict) -> list[str]:
    return sorted(c["name"] for c in payload["candidates"])


# --- the catalogue endpoints -------------------------------------------------


def test_list_process_classes_counts_only_what_sits_directly_in_each_folder(
    client, universe
) -> None:
    resp = client.get("/api/processes/classes")
    assert resp.status_code == 200, resp.text
    by_slug = {c["slug"]: c for c in resp.json()}

    # f"{NS}-conformacao" holds no process directly — both of its children do.
    assert by_slug[f"{NS}-conformacao"]["process_count"] == 0
    assert by_slug[f"{NS}-liquido"]["process_count"] == 1
    # Two, because the inactive one is still filed here: the count describes the
    # folder, and hiding it would make an operator wonder where it went.
    assert by_slug[f"{NS}-uniao"]["process_count"] == 2
    assert by_slug[f"{NS}-liquido"]["parent_id"] == by_slug[f"{NS}-conformacao"]["id"]


def test_list_processes_reports_the_join_and_hides_inactive_ones(client, universe) -> None:
    resp = client.get("/api/processes")
    assert resp.status_code == 200, resp.text
    by_slug = {p["slug"]: p for p in resp.json()}

    assert f"{NS}-desativado" not in by_slug
    assert by_slug[f"{NS}-solda"]["class_name"] == "União de teste"
    assert by_slug[f"{NS}-solda"]["material_count"] == 1
    assert by_slug[f"{NS}-forja"]["material_count"] == 1
    assert by_slug[f"{NS}-fundicao"]["material_count"] == 1


def test_the_process_catalogue_needs_a_session(anon_client) -> None:
    assert anon_client.get("/api/processes").status_code == 401
    assert anon_client.get("/api/processes/classes").status_code == 401


# --- the process stage, over HTTP -------------------------------------------


def test_a_process_stage_keeps_the_materials_that_process_applies_to(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_slugs": [f"{NS}-solda"]}]},
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Aço Demo B"]


def test_a_process_folder_carries_its_descendants(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [{"kind": "process", "process_class_slugs": [f"{NS}-conformacao"]}]},
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
    assert picking(f"{NS}-conformacao") == []
    assert picking(f"{NS}-liquido") == ["Liga Alumínio Demo A"]


def test_a_material_with_no_process_never_survives_a_process_stage(client, universe) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={
            "stages": [
                {"kind": "process", "process_class_slugs": [f"{NS}-conformacao", f"{NS}-uniao"]}
            ]
        },
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
                {"kind": "process", "process_slugs": [f"{NS}-solda"]},
                {"kind": "process", "process_class_slugs": [f"{NS}-conformacao"]},
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
                {"kind": "process", "process_class_slugs": [f"{NS}-conformacao"]},
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
                {"kind": "process", "label": "Soldável", "process_slugs": [f"{NS}-solda"]},
                {"kind": "process", "process_class_slugs": [f"{NS}-conformacao"], "enabled": False},
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
                    "process_slugs": [f"{NS}-solda"],
                    "process_class_slugs": [f"{NS}-conformacao"],
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
    assert process_stage["process_slugs"] == [f"{NS}-solda"]
    assert process_stage["process_class_slugs"] == [f"{NS}-conformacao"]
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
                "process_slugs": [f"{NS}-solda"],
                "constraints": [{"operator": "exists", "property_slug": "densidade"}],
            },
            "não leva restrições",
        ),
        (
            {"kind": "process", "process_slugs": [f"{NS}-solda"], "class_slugs": ["metais"]},
            "não leva classes de material",
        ),
        (
            {"kind": "limit", "process_slugs": [f"{NS}-solda"]},
            "não leva processos",
        ),
        (
            {"kind": "tree", "class_slugs": ["metais"], "process_class_slugs": [f"{NS}-uniao"]},
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


# --- the demo universe the seed installs -------------------------------------


def test_the_seeded_process_universe_is_coherent(client) -> None:
    """The seed's own universe, without the fixture above.

    It checks the shape, not the contents: which processes a demo material is
    declared compatible with is fictitious data that may be reworked, but the
    universe must always be navigable — every process in a folder that exists,
    every folder reachable from a root, and every record flagged as demo.
    """
    classes = client.get("/api/processes/classes").json()
    processes = client.get("/api/processes").json()
    assert classes and processes

    class_ids = {c["id"] for c in classes}
    for cls in classes:
        assert cls["parent_id"] is None or cls["parent_id"] in class_ids
    for process in processes:
        assert process["class_id"] in class_ids
        # Demonstration data, and it says so — principle 6.
        assert process["is_demo"] is True

    # The three families the taxonomy is rooted on, and at least one process
    # under each of them once descendants are counted.
    roots = [c["slug"] for c in classes if c["parent_id"] is None]
    assert len(roots) >= 3
    for root in roots:
        resp = client.post(
            "/api/selection/filter",
            json={"stages": [{"kind": "process", "process_class_slugs": [root]}]},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["final_count"] > 0, f"nenhum material sob {root}"


# --- the report and the laudo -------------------------------------------------


@pytest.fixture()
def documented_study(client, universe) -> int:
    """A study whose pipeline mixes all three stage kinds, so the document has to
    describe each of them."""
    payload = {
        "name": "Estudo documentado com processo",
        "free_variables": [],
        "criteria": [{"key": "densidade", "weight": 1.0}],
        "stages": [
            {"kind": "tree", "label": "Só metais", "class_slugs": ["metais"]},
            {
                "kind": "process",
                "label": "Soldável",
                "process_slugs": [f"{NS}-solda"],
            },
            {
                "kind": "process",
                "process_class_slugs": [f"{NS}-conformacao"],
                "enabled": False,
            },
        ],
    }
    resp = client.post("/api/selection/studies", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_the_report_names_the_process_stage_by_type(client, documented_study) -> None:
    text = client.get(f"/api/exports/estudos/{documented_study}.html").text
    stages_section = text.split("Estágios")[1]

    # "Processos", not the raw `process` slug the engine uses.
    assert "Processos" in stages_section
    assert "process" not in stages_section.split("Restantes")[0]
    assert "Soldável" in text
    # The unnamed stage is named by what it is, never a dash (D-24).
    assert "Sem rótulo" in stages_section
    assert "—" not in stages_section.split("Habilitado")[0]


def test_the_problem_section_spells_out_the_process_selection(client, documented_study) -> None:
    """The document says "algum de", and names the processes and folders by their
    display names — a reader who assumed every selected process must apply would
    misread the candidate list."""
    text = client.get(f"/api/exports/estudos/{documented_study}.html").text
    problem = text.split("Estágios")[0]

    assert "algum de" in problem
    assert "Solda de teste" in problem
    assert "Conformação de teste" in problem
    assert "com descendentes" in problem
    # And the disabled stage is described as disabled, not omitted.
    assert "desabilitado" in problem


def test_the_funnel_names_the_process_question_not_the_tree_one(client, universe) -> None:
    """Found by reading the rendered document, not by an assertion: a process
    stage used to report `in_tree` on its funnel line, telling the reader the
    selection had filtered by material class."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "stages": [
                {"kind": "tree", "class_slugs": ["metais"]},
                {"kind": "process", "process_slugs": [f"{NS}-solda"]},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert [step["operator"] for step in resp.json()["steps"]] == ["in_tree", "in_process"]


def test_the_laudo_describes_the_process_stage_too(client, documented_study) -> None:
    resp = client.get(f"/api/exports/estudos/{documented_study}/laudo.html")
    assert resp.status_code == 200, resp.text
    assert "Processos" in resp.text
    assert "Solda de teste" in resp.text


def test_a_process_stage_with_nothing_selected_says_so_in_the_document(client, universe) -> None:
    """Absence written out, not an empty cell the reader has to interpret."""
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Estudo com processo vazio",
            "free_variables": [],
            "criteria": [],
            "stages": [{"kind": "process", "label": "Ainda a definir"}],
        },
    )
    assert created.status_code == 201, created.text
    text = client.get(f"/api/exports/estudos/{created.json()['id']}.html").text
    assert "nenhum processo selecionado" in text
