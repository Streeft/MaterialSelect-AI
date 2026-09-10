"""Process attributes end to end (P0-4): the catalogue, the datasheet, and step 2
of the manual's exercise 11 — a Limit Stage over a process.

``test_filters.py`` proves the pure matching rules (reach over an envelope, set
membership over labels). This proves the wiring: values read from the database
into the snapshot in the right map, a constraint over them accepted over HTTP,
ranking that used to be refused outright now computed, and every payload the
backend refuses with the reason written instead of returning a plausible-looking
empty result.

Its own tiny universe, namespaced, for the reason ``test_process_universe.py``
gives: the seed installs a real demo universe, and an assertion about
``teste-massa`` must never quietly become an assertion about seed data.
"""

from __future__ import annotations

import pytest

from app.models.enums import BetterDirection, DataQuality, ProcessAttributeKind
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue

NS = "teste"

#: Slugs of the fixture's three attributes, spelled once.
MASSA = f"{NS}-massa"
LOTE = f"{NS}-lote"
FORMA = f"{NS}-forma"


@pytest.fixture()
def attributes(db_session) -> None:
    """Three processes and three attributes — one of each shape of value.

    | processo         | faixa de massa (kg) | lote econômico | forma                    |
    |------------------|---------------------|----------------|--------------------------|
    | teste-injecao    | 0,1 – 10            | 10 000         | Maciço 3D, Oco 3D        |
    | teste-microusina | 0,001 – 0,05        | 10             | Maciço 3D                |
    | teste-adesivo    | *ausente*           | *ausente*      | *ausente*                |

    ``teste-adesivo`` has nothing recorded on purpose, and one of its rows is an
    explicit ``is_missing`` rather than no row at all — the two are different
    states of the catalogue and both have to come out as "not selectable on",
    never as zero.
    """
    family = ProcessClass(name="Conformação de teste", slug=f"{NS}-conformacao")
    db_session.add(family)
    db_session.flush()

    injecao = Process(name="Injeção de teste", slug=f"{NS}-injecao", class_id=family.id)
    micro = Process(name="Micro-usinagem de teste", slug=f"{NS}-microusina", class_id=family.id)
    adesivo = Process(name="Adesivagem de teste", slug=f"{NS}-adesivo", class_id=family.id)
    db_session.add_all([injecao, micro, adesivo])
    db_session.flush()

    massa = ProcessAttributeDefinition(
        name="Faixa de massa de teste",
        slug=MASSA,
        kind=ProcessAttributeKind.ENVELOPE,
        physical_dimension="[mass]",
        canonical_unit="kg",
        accepted_units=["kg", "g"],
        allowed_labels=[],
        better_direction=BetterDirection.NEUTRAL,
    )
    lote = ProcessAttributeDefinition(
        name="Lote econômico de teste",
        slug=LOTE,
        kind=ProcessAttributeKind.ESCALAR,
        physical_dimension="",
        canonical_unit="dimensionless",
        accepted_units=["dimensionless"],
        allowed_labels=[],
        better_direction=BetterDirection.LOWER,
    )
    forma = ProcessAttributeDefinition(
        name="Forma de teste",
        slug=FORMA,
        kind=ProcessAttributeKind.DISCRETO,
        physical_dimension="",
        canonical_unit=None,
        accepted_units=[],
        allowed_labels=["Maciço 3D", "Oco 3D", "Chapa conformada"],
        better_direction=BetterDirection.NEUTRAL,
    )
    db_session.add_all([massa, lote, forma])
    db_session.flush()

    db_session.add_all(
        [
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=massa.id,
                value_min=0.1,
                value_max=10.0,
                value_typical=5.05,
                normalized_value=5.05,
                normalized_min=0.1,
                normalized_max=10.0,
                original_unit="kg",
                canonical_unit="kg",
                conversion_method="identity:kg",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=lote.id,
                value_scalar=10000.0,
                normalized_value=10000.0,
                original_unit="dimensionless",
                canonical_unit="dimensionless",
                conversion_method="identity:dimensionless",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=forma.id,
                labels=["Maciço 3D", "Oco 3D"],
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=micro.id,
                attribute_id=massa.id,
                value_min=0.001,
                value_max=0.05,
                value_typical=0.0255,
                normalized_value=0.0255,
                normalized_min=0.001,
                normalized_max=0.05,
                original_unit="kg",
                canonical_unit="kg",
                conversion_method="identity:kg",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=micro.id,
                attribute_id=lote.id,
                value_scalar=10.0,
                normalized_value=10.0,
                original_unit="dimensionless",
                canonical_unit="dimensionless",
                conversion_method="identity:dimensionless",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=micro.id,
                attribute_id=forma.id,
                labels=["Maciço 3D"],
                data_quality=DataQuality.ESTIMADO,
            ),
            # Explicitly missing, not absent: the row exists and says "nobody
            # wrote this down", which must read the same as having no row.
            ProcessAttributeValue(
                process_id=adesivo.id,
                attribute_id=massa.id,
                is_missing=True,
                data_quality=DataQuality.ESTIMADO,
            ),
        ]
    )
    db_session.flush()


def _names(payload: dict) -> list[str]:
    return [c["name"] for c in payload["candidates"]]


def _limit(constraints: list[dict]) -> dict:
    return {"kind": "limit", "constraints": constraints}


# --- the catalogue and the datasheet -----------------------------------------


def test_the_attribute_catalogue_says_which_shape_each_value_has(client, attributes) -> None:
    """``kind`` is what a client must read first — it decides whether to draw a
    number field or a label picker, before any value exists."""
    resp = client.get("/api/processes/attributes")
    assert resp.status_code == 200, resp.text

    by_slug = {a["slug"]: a for a in resp.json()}
    assert by_slug[MASSA]["kind"] == "ENVELOPE"
    assert by_slug[MASSA]["canonical_unit"] == "kg"
    assert by_slug[LOTE]["kind"] == "ESCALAR"
    assert by_slug[FORMA]["kind"] == "DISCRETO"
    # A label has no unit, and the vocabulary is closed.
    assert by_slug[FORMA]["canonical_unit"] is None
    assert by_slug[FORMA]["allowed_labels"] == ["Maciço 3D", "Oco 3D", "Chapa conformada"]


def test_the_material_property_catalogue_does_not_carry_process_attributes(
    client, attributes
) -> None:
    """The reason the tables are separate: a material property picker that could
    reach "faixa de massa" would be offering a process capability as a material
    property."""
    resp = client.get("/api/properties")
    assert resp.status_code == 200, resp.text
    assert MASSA not in {p["slug"] for p in resp.json()}


def test_the_process_datasheet_carries_the_provenance(client, attributes) -> None:
    resp = client.get(f"/api/processes/{NS}-injecao")
    assert resp.status_code == 200, resp.text

    by_slug = {a["attribute_slug"]: a for a in resp.json()["attributes"]}
    massa = by_slug[MASSA]
    assert (massa["value_min"], massa["value_max"]) == (0.1, 10.0)
    assert (massa["normalized_min"], massa["normalized_max"]) == (0.1, 10.0)
    assert massa["canonical_unit"] == "kg"
    assert massa["conversion_method"] == "identity:kg"
    assert massa["data_quality"] == "ESTIMADO"
    assert by_slug[FORMA]["labels"] == ["Maciço 3D", "Oco 3D"]


def test_a_missing_attribute_value_is_declared_and_never_a_zero(client, attributes) -> None:
    """The fourth state of data quality, all the way to the wire: every numeric
    field NULL and ``is_missing`` true, so the interface can write the label D-24
    requires instead of rendering a 0 nobody measured."""
    resp = client.get(f"/api/processes/{NS}-adesivo")
    assert resp.status_code == 200, resp.text

    value = next(a for a in resp.json()["attributes"] if a["attribute_slug"] == MASSA)
    assert value["is_missing"] is True
    assert value["value_min"] is None
    assert value["value_max"] is None
    assert value["normalized_value"] is None
    assert value["labels"] == []


def test_an_unknown_process_slug_is_a_404(client, attributes) -> None:
    assert client.get("/api/processes/nao-existe").status_code == 404


# --- step 2 of exercise 11: a Limit Stage over a process ----------------------


def test_a_threshold_over_an_envelope_selects_by_reach(client, attributes) -> None:
    """The exercise's own question: which processes can make a part this heavy."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "gte", "property_slug": MASSA, "value": 5.0}])],
        },
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Injeção de teste"]


def test_the_midpoint_rule_would_have_lost_a_process_that_reaches_the_threshold(
    client, attributes
) -> None:
    """The regression the envelope rule exists for, at HTTP level.

    Micro-usinagem reaches 0,04 kg; its midpoint is 0,0255 and does not. A single
    representative number would drop it here, and the reader would have no way to
    tell that from "no process can do it".
    """
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "gte", "property_slug": MASSA, "value": 0.04}])],
        },
    )
    assert resp.status_code == 200, resp.text
    assert "Micro-usinagem de teste" in _names(resp.json())


def test_the_threshold_is_converted_before_it_meets_the_envelope(client, attributes) -> None:
    """5000 g is 5 kg: the unit trail is the same one a material property uses,
    which is why ``units.py`` was reused rather than reimplemented."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [
                _limit([{"operator": "gte", "property_slug": MASSA, "value": 5000.0, "unit": "g"}])
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Injeção de teste"]


def test_a_process_with_a_missing_value_is_not_admitted(client, attributes) -> None:
    """You cannot select on data you do not have — the rule that outranks the
    other two, and the reason the funnel number is trustworthy."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "gte", "property_slug": MASSA, "value": 0.0001}])],
        },
    )
    assert resp.status_code == 200, resp.text
    assert "Adesivagem de teste" not in _names(resp.json())


def test_a_discrete_constraint_is_set_membership(client, attributes) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [
                _limit(
                    [
                        {
                            "operator": "has_any_label",
                            "property_slug": FORMA,
                            "labels": ["Oco 3D"],
                        }
                    ]
                )
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Injeção de teste"]


def test_the_funnel_names_the_envelope_rule_where_it_was_applied(client, attributes) -> None:
    """A semantic difference the reader cannot see is the one thing this engine is
    built not to produce, so the generated label says which rule compared the
    number."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "gte", "property_slug": MASSA, "value": 5.0}])],
        },
    )
    assert resp.status_code == 200, resp.text
    labels = [step["label"] for step in resp.json()["steps"]]
    assert any("alcance do envelope" in label for label in labels)


def test_a_scalar_attribute_is_not_labelled_as_an_envelope(client, attributes) -> None:
    """The note is information, not decoration: it appears only where the rule
    actually differs."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "lte", "property_slug": LOTE, "value": 100.0}])],
        },
    )
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == ["Micro-usinagem de teste"]
    labels = [step["label"] for step in resp.json()["steps"]]
    assert not any("envelope" in label for label in labels)


# --- what is refused, and with the reason written ----------------------------


def test_a_numeric_operator_over_a_discrete_attribute_is_refused(client, attributes) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "gte", "property_slug": FORMA, "value": 1.0}])],
        },
    )
    assert resp.status_code == 400, resp.text
    assert "discreto" in resp.json()["detail"]


def test_a_label_operator_over_a_numeric_attribute_is_refused(client, attributes) -> None:
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [
                _limit(
                    [{"operator": "has_any_label", "property_slug": MASSA, "labels": ["Oco 3D"]}]
                )
            ],
        },
    )
    assert resp.status_code == 400, resp.text
    assert "não é um atributo discreto" in resp.json()["detail"]


def test_a_label_outside_the_vocabulary_is_a_404_naming_it(client, attributes) -> None:
    """A typo must not look like "no process has this capability" — which is
    exactly what matching nothing would look like."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [
                _limit([{"operator": "has_any_label", "property_slug": FORMA, "labels": ["Oco3D"]}])
            ],
        },
    )
    assert resp.status_code == 404, resp.text
    assert "Oco3D" in resp.json()["detail"]


def test_a_process_study_cannot_constrain_a_material_property(client, attributes) -> None:
    """The defect P0-4 fixed, stated as a test.

    Before this, a limit stage in a process study resolved its slugs against the
    *material* catalogue: "densidade ≥ 1000" was accepted, converted, and then
    admitted nobody, because the process snapshot had no values at all. Zero
    results with no explanation is the worst available answer, so now it is a 404
    naming the thing that does not exist.
    """
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [
                _limit([{"operator": "gte", "property_slug": "densidade", "value": 1000.0}])
            ],
        },
    )
    assert resp.status_code == 404, resp.text
    assert "Atributo não encontrado" in resp.json()["detail"]


def test_a_material_study_cannot_constrain_a_process_attribute(client, attributes) -> None:
    """The mirror, and the reason the catalogues are two tables."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "material",
            "stages": [_limit([{"operator": "gte", "property_slug": MASSA, "value": 5.0}])],
        },
    )
    assert resp.status_code == 404, resp.text
    assert "Propriedade não encontrada" in resp.json()["detail"]


def test_in_class_inside_a_process_study_names_a_process_family(client, attributes) -> None:
    """``in_class`` compares the record's own class slug, and in a process study
    that slug is a process family — so validating it against the material
    taxonomy would 404 a legitimate one."""
    resp = client.post(
        "/api/selection/filter",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "in_class", "class_slugs": [f"{NS}-conformacao"]}])],
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(_names(resp.json())) == 3


# --- ranking and index, which P0-3 refused outright --------------------------


def test_ranking_a_process_study_works_now(client, attributes) -> None:
    """P0-3 refused this with the reason "processo não tem atributo cadastrado".
    P0-4 gave processes attributes, so the refusal was retired rather than
    reworded — the smaller economic batch wins, because the attribute declares
    LOWER is better.
    """
    resp = client.post(
        "/api/selection/run",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "exists", "property_slug": LOTE}])],
            "ranking": {"criteria": [{"key": LOTE, "weight": 1.0}]},
        },
    )
    assert resp.status_code == 200, resp.text
    ranked = resp.json()["ranking"]["ranked"]
    assert [r["name"] for r in ranked][0] == "Micro-usinagem de teste"


def test_ranking_reads_an_envelope_through_its_representative_point(client, attributes) -> None:
    """An envelope is filtered by its bounds and ranked by the point that stands
    for it — the same number ``normalized_value`` has always meant. Leaving it out
    would make every ranged attribute unrankable, which is a property of the map
    it was filed in, not of the datum.
    """
    resp = client.post(
        "/api/selection/run",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "exists", "property_slug": MASSA}])],
            "ranking": {"criteria": [{"key": MASSA, "weight": 1.0}]},
        },
    )
    assert resp.status_code == 200, resp.text
    ranked = resp.json()["ranking"]["ranked"]
    # NEUTRAL defaults to maximize, so the wider envelope's midpoint leads.
    assert [r["name"] for r in ranked][0] == "Injeção de teste"


def test_ranking_by_a_discrete_attribute_is_refused_with_the_reason(client, attributes) -> None:
    """One label is not better than another, so there is no order to rank by.
    Returning an arbitrary one would be the silent version of this."""
    resp = client.post(
        "/api/selection/run",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "exists", "property_slug": FORMA}])],
            "ranking": {"criteria": [{"key": FORMA, "weight": 1.0}]},
        },
    )
    assert resp.status_code == 400, resp.text
    assert "não tem ordem" in resp.json()["detail"]


def test_an_index_over_a_discrete_attribute_is_refused_by_name(client, attributes) -> None:
    """Refused by name, rather than through the dimension error its NULL unit
    would eventually produce."""
    resp = client.post(
        "/api/selection/run",
        json={
            "universe": "process",
            "stages": [_limit([{"operator": "exists", "property_slug": LOTE}])],
            "index": {"expression": FORMA.replace("-", "_"), "goal": "maximize"},
        },
    )
    assert resp.status_code == 400, resp.text
    assert "não tem" in resp.json()["detail"]


# --- persistence --------------------------------------------------------------


def test_a_discrete_constraint_survives_a_save_and_a_re_run(client, attributes) -> None:
    """The labels are a column of their own, so a saved study reopens saying what
    it said — and re-running it selects the same processes."""
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Formas ocas",
            "universe": "process",
            "free_variables": [],
            "criteria": [],
            "stages": [
                _limit(
                    [
                        {
                            "operator": "has_any_label",
                            "property_slug": FORMA,
                            "labels": ["Oco 3D"],
                        }
                    ]
                )
            ],
        },
    )
    assert created.status_code == 201, created.text
    study_id = created.json()["id"]

    read_back = client.get(f"/api/selection/studies/{study_id}")
    assert read_back.status_code == 200, read_back.text
    stages = read_back.json()["stages"]
    # The persisted tree comes back in `root_group` — the read side M6 fixed, so
    # reopening a study never loses its parentheses.
    assert stages[0]["root_group"]["constraints"][0]["labels"] == ["Oco 3D"]

    rerun = client.post(f"/api/selection/studies/{study_id}/run")
    assert rerun.status_code == 200, rerun.text
    assert _names(rerun.json()) == ["Injeção de teste"]


def test_an_envelope_constraint_survives_a_save_and_a_re_run(client, attributes) -> None:
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Peças de 5 kg",
            "universe": "process",
            "free_variables": [],
            "criteria": [],
            "stages": [_limit([{"operator": "gte", "property_slug": MASSA, "value": 5.0}])],
        },
    )
    assert created.status_code == 201, created.text

    rerun = client.post(f"/api/selection/studies/{created.json()['id']}/run")
    assert rerun.status_code == 200, rerun.text
    assert _names(rerun.json()) == ["Injeção de teste"]


def test_a_material_study_is_untouched_by_all_of_this(client, attributes) -> None:
    """The regression that matters most: the default universe still behaves
    exactly as it did, with no ``universe`` in the payload at all."""
    plain = client.post("/api/selection/filter", json={"constraints": []})
    assert plain.status_code == 200, plain.text
    assert plain.json()["universe"] == "material"
    assert plain.json()["initial_count"] > 0

    numeric = client.post(
        "/api/selection/filter",
        json={"constraints": [{"operator": "gte", "property_slug": "densidade", "value": 1000.0}]},
    )
    assert numeric.status_code == 200, numeric.text


def test_a_ranked_process_study_laudo_still_names_no_material(client, attributes) -> None:
    """The defect enabling ranking created, and the guard that closes it.

    The laudo's Ashby map is drawn by ``ChartService.property_map``, which reads
    the *material* catalogue and is handed the ranked ids to highlight. In a
    process study those are process ids, so it would have marked the materials
    that happen to carry them and printed the result as this study's map — the
    same silent id collision P0-3 fixed in the provenance sheet, in the one place
    P0-3 could not reach, because a process study could not rank at all until
    processes had attributes.
    """
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Processos ranqueados",
            "universe": "process",
            "free_variables": [],
            "criteria": [{"key": LOTE, "weight": 1.0}],
            "stages": [_limit([{"operator": "exists", "property_slug": LOTE}])],
        },
    )
    assert created.status_code == 201, created.text

    laudo = client.get(f"/api/exports/estudos/{created.json()['id']}/laudo.html")
    assert laudo.status_code == 200, laudo.text
    body = laudo.text
    assert "Injeção de teste" in body  # the processes are there...
    for material in ("Liga Alumínio Demo A", "Aço Demo B", "Polímero Demo C"):
        assert material not in body  # ...and no material stands in for one


def test_a_process_study_with_an_index_does_not_try_to_draw_a_material_map(
    client, attributes
) -> None:
    """The first of the two things that keep a material map out of a process laudo.

    The map's axes are filtered against the *material* property catalogue, so an
    ordinary process attribute slug never resolves as an axis and the figure is
    omitted before any id is handed over. That is what this proves, and it is not
    the universe guard — the guard is only reachable when a slug collides across
    the two catalogues, which
    ``test_a_slug_collision_does_not_make_the_laudo_draw_a_material_map`` builds
    on purpose.
    """
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Processos com índice",
            "universe": "process",
            "free_variables": [],
            "criteria": [],
            "index": {
                "name": "Massa por lote",
                "expression": f"{MASSA.replace('-', '_')} / {LOTE.replace('-', '_')}",
                "goal": "maximize",
            },
            "stages": [_limit([{"operator": "exists", "property_slug": MASSA}])],
        },
    )
    assert created.status_code == 201, created.text

    laudo = client.get(f"/api/exports/estudos/{created.json()['id']}/laudo.html")
    assert laudo.status_code == 200, laudo.text
    for material in ("Liga Alumínio Demo A", "Aço Demo B"):
        assert material not in laudo.text


@pytest.fixture()
def colliding_attributes(db_session) -> None:
    """Two process attributes slugged exactly like two material properties.

    Contrived on purpose: it is the only way the universe guard in ``_map_figure``
    is reachable. The map's axes are filtered against the *material* property
    catalogue, so an ordinary process attribute slug never resolves as an axis and
    the figure is omitted for that reason alone. Slugs are unique per table, so
    nothing stops a process attribute from being called ``densidade`` — and then
    the axes do resolve, and the ranked ids handed over to highlight are process
    ids.
    """
    family = ProcessClass(name="Colisão de teste", slug=f"{NS}-colisao")
    db_session.add(family)
    db_session.flush()

    process = Process(name="Processo colidente", slug=f"{NS}-colidente", class_id=family.id)
    db_session.add(process)
    db_session.flush()

    definitions = [
        ProcessAttributeDefinition(
            name=f"Homônimo de {slug}",
            slug=slug,
            kind=ProcessAttributeKind.ESCALAR,
            physical_dimension="",
            canonical_unit="dimensionless",
            accepted_units=["dimensionless"],
            allowed_labels=[],
            better_direction=BetterDirection.NEUTRAL,
        )
        for slug in ("densidade", "custo_massa")
    ]
    db_session.add_all(definitions)
    db_session.flush()

    db_session.add_all(
        [
            ProcessAttributeValue(
                process_id=process.id,
                attribute_id=definition.id,
                value_scalar=2.0,
                normalized_value=2.0,
                original_unit="dimensionless",
                canonical_unit="dimensionless",
                conversion_method="identity:dimensionless",
                data_quality=DataQuality.ESTIMADO,
            )
            for definition in definitions
        ]
    )
    db_session.flush()


def test_a_slug_collision_does_not_make_the_laudo_draw_a_material_map(
    client, colliding_attributes
) -> None:
    """With the axes resolvable, only the universe guard stands between the
    reader and a map of materials presented as a selection of processes."""
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Processos homônimos",
            "universe": "process",
            "free_variables": [],
            "criteria": [{"key": "densidade", "weight": 1.0}],
            "index": {
                "name": "Homônimo",
                "expression": "densidade / custo_massa",
                "goal": "maximize",
            },
            "stages": [_limit([{"operator": "exists", "property_slug": "densidade"}])],
        },
    )
    assert created.status_code == 201, created.text

    laudo = client.get(f"/api/exports/estudos/{created.json()['id']}/laudo.html")
    assert laudo.status_code == 200, laudo.text
    assert "Processo colidente" in laudo.text
    for material in ("Liga Alumínio Demo A", "Aço Demo B", "Polímero Demo C"):
        assert material not in laudo.text
