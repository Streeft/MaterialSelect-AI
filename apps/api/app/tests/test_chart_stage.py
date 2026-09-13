"""The Chart stage end to end (P1-2): a region of one plane as a criterion.

``test_filters.py`` proves the pure rule — the box, the line, and the record that
cannot be placed on the plane. This proves the wiring: an axis resolved against
the catalogue of the study's own universe, an expression evaluated by the service
*before* the engine sees a record, a stage saved and re-run to the same answer,
and every payload the backend refuses with the reason written instead of
returning a plausible-looking empty result.

Two things here are not available to any other stage type, and each has its own
test: an axis can be a **derived** quantity (a limit stage names property slugs,
so it cannot reach one at all), and a record with no coordinate is rejected even
where the box bounds nothing.
"""

from __future__ import annotations

import json

import pytest

from app.models.enums import BetterDirection, DataQuality, ProcessAttributeKind
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue

#: The index of the manual's light-stiff-beam exercise, over the seeded demo
#: catalogue. Spelled once: it is both an axis and a line below, and the two have
#: to be the same string or they would be two different derived quantities.
INDEX = "sqrt(modulo_young)/densidade"

#: What that index evaluates to for each seeded material, in SI. Written out so a
#: reader can check the expected candidate lists by eye rather than trusting the
#: same arithmetic the code does.
#:
#:   Liga Alumínio Demo A   √(69e9)/2700  ≈  97,3
#:   Aço Demo B             √(210e9)/7850 ≈  58,4
#:   Polímero Demo C        √(2,5e9)/1050 ≈  47,6
#:   Cerâmica Demo D        √(380e9)/3900 ≈ 158,1
#:   Compósito Demo E       √(120e9)/1600 ≈ 216,5
LIGHT_AND_STIFF = {"Cerâmica Demo D", "Compósito Demo E"}

NS = "grafico"
MASSA = f"{NS}-massa"
LOTE = f"{NS}-lote"
FORMA = f"{NS}-forma"


#: The keys that belong to the plane rather than to the stage around it.
_CHART_KEYS = {"x", "y", "index_expression", "index_level", "index_goal"}


def _chart(**over) -> dict:
    """A chart stage over the seeded material catalogue, plane already chosen.

    Splits its keyword arguments by where they belong: anything in
    ``_CHART_KEYS`` goes inside ``chart``, everything else (``enabled``,
    ``label``, and the wrong-field payloads the refusal tests send) stays on the
    stage — which is the same split the schema makes.
    """
    chart = {
        "x": {"property_slug": "densidade"},
        "y": {"property_slug": "modulo_young"},
    }
    stage = {"kind": "chart", "chart": chart}
    for key, value in over.items():
        (chart if key in _CHART_KEYS else stage)[key] = value
    return stage


def _names(payload: dict) -> set[str]:
    return {c["name"] for c in payload["candidates"]}


def _run(client, stage: dict) -> dict:
    resp = client.post("/api/selection/run", json={"stages": [stage]})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _refused(client, stage: dict, status: int = 400) -> str:
    resp = client.post("/api/selection/run", json={"stages": [stage]})
    assert resp.status_code == status, resp.text
    return resp.json()["detail"]


# --- the box ----------------------------------------------------------------


def test_the_box_bounds_each_axis_in_canonical_units(client) -> None:
    """The numbers are read off an axis the chart already draws in canonical
    units, so there is no unit field to get wrong — 2800 here is kg/m³."""
    body = _run(client, _chart(x={"property_slug": "densidade", "max_value": 2800.0}))

    assert _names(body) == {"Liga Alumínio Demo A", "Polímero Demo C", "Compósito Demo E"}


def test_a_box_open_on_one_side_is_a_box(client) -> None:
    """NULL is "no bound" and 0 is a bound — "everything above 200 GPa" must not
    have to invent a ceiling to be expressible."""
    body = _run(client, _chart(y={"property_slug": "modulo_young", "min_value": 200e9}))

    assert _names(body) == {"Aço Demo B", "Cerâmica Demo D"}


def test_both_axes_narrow_together(client) -> None:
    body = _run(
        client,
        _chart(
            x={"property_slug": "densidade", "max_value": 2800.0},
            y={"property_slug": "modulo_young", "min_value": 100e9},
        ),
    )

    assert _names(body) == {"Compósito Demo E"}


# --- what only a chart stage can do -----------------------------------------


def test_an_axis_can_be_an_index_expression(client) -> None:
    """The one thing this stage adds over a limit stage, and it is real: a limit
    stage names *property slugs*, so it cannot bound E^(1/2)/ρ at all."""
    body = _run(client, _chart(x={"expression": INDEX, "min_value": 100.0}))

    assert _names(body) == LIGHT_AND_STIFF


def test_a_limit_stage_cannot_reach_the_same_quantity(client) -> None:
    """The other half of the claim above, stated as a test rather than as prose:
    the expression is not a slug, and the limit stage says so by name."""
    detail = _refused(
        client,
        {
            "kind": "limit",
            "constraints": [{"operator": "gte", "property_slug": INDEX, "value": 100}],
        },
        status=404,
    )

    assert INDEX in detail


def test_the_index_line_admits_the_favourable_side(client) -> None:
    """A line slid up the plane until it isolates the candidates — which is a
    comparison on the index value, not geometry, and is why the figure and the
    funnel agree by construction."""
    body = _run(client, _chart(index_expression=INDEX, index_level=100.0, index_goal="maximize"))

    assert _names(body) == LIGHT_AND_STIFF


def test_minimizing_turns_the_line_around(client) -> None:
    body = _run(client, _chart(index_expression=INDEX, index_level=100.0, index_goal="minimize"))

    assert _names(body) == {"Liga Alumínio Demo A", "Aço Demo B", "Polímero Demo C"}


def test_the_axis_and_the_line_can_be_the_same_index(client) -> None:
    """Filed under the expression's own text, so naming it twice computes it
    once — and, more to the point, cannot compute it two different ways."""
    body = _run(
        client,
        _chart(x={"expression": INDEX}, index_expression=INDEX, index_level=150.0),
    )

    assert _names(body) == LIGHT_AND_STIFF


# --- plottability -----------------------------------------------------------


def test_a_record_with_no_coordinate_is_rejected_even_where_nothing_is_bounded(
    client,
) -> None:
    """The rule a limit stage would *not* give: a threshold only rejects what it
    can compare, while this stage's criterion is "inside this region of this
    plane", and a record with no coordinate is not drawn on the plane at all.

    ``custo_massa`` is recorded for two of the five seeded materials, and this
    stage puts no bound on it whatsoever — so an unbounded chart stage is a
    meaningful thing to write: "must be plottable here".
    """
    body = _run(client, _chart(y={"property_slug": "custo_massa"}))

    assert _names(body) == {"Liga Alumínio Demo A", "Compósito Demo E"}


def test_an_index_that_cannot_be_computed_leaves_no_value_rather_than_a_zero(
    client,
) -> None:
    """Principle 3, one layer up, on the derived side.

    ``custo_massa`` is recorded for two of the five seeded materials, so this
    index is undefined for the other three. A zero would sail straight through a
    ``>= 0`` bound and put them back on a plane they were never on; leaving no
    key at all is what makes them unplottable, which is what they are.

    The bound is ``0`` on purpose: it is the one value that tells a missing key
    apart from a zero, because every real value here is above it either way.
    """
    body = _run(client, _chart(x={"expression": "densidade/custo_massa", "min_value": 0.0}))

    assert _names(body) == {"Liga Alumínio Demo A", "Compósito Demo E"}


# --- the funnel -------------------------------------------------------------


def test_the_funnel_line_says_it_filtered_by_a_chart(client) -> None:
    """Same reason ``in_process`` exists: a line reading ``in_tree`` would tell
    the reader the selection filtered by class when it filtered by a region."""
    body = _run(client, _chart(x={"property_slug": "densidade", "max_value": 2800.0}))

    assert [step["operator"] for step in body["funnel"]] == ["in_chart"]
    assert body["stages"][0]["kind"] == "chart"


def test_a_disabled_chart_stage_still_reports_what_it_would_admit(client) -> None:
    body = _run(
        client,
        _chart(enabled=False, x={"property_slug": "densidade", "max_value": 2800.0}),
    )

    stage = body["stages"][0]
    assert stage["enabled"] is False
    assert stage["passed"] == 3
    assert body["final_count"] == 5


# --- what the payload refuses -----------------------------------------------


def test_an_axis_naming_both_a_property_and_an_expression_is_refused(client) -> None:
    detail = _refused(client, _chart(x={"property_slug": "densidade", "expression": INDEX}))

    assert "eixo X" in detail


def test_an_axis_naming_neither_is_refused(client) -> None:
    detail = _refused(client, _chart(y={}))

    assert "eixo Y" in detail


def test_an_inverted_box_is_refused_rather_than_admitting_nobody(client) -> None:
    """It would return an empty list and look like an answer — which is the exact
    shape of bug the stage checks exist to prevent."""
    detail = _refused(
        client,
        _chart(x={"property_slug": "densidade", "min_value": 8000.0, "max_value": 1000.0}),
    )

    assert "eixo X" in detail


def test_a_line_needs_both_its_expression_and_its_level(client) -> None:
    assert "nível" in _refused(client, _chart(index_expression=INDEX))
    assert "nível" in _refused(client, _chart(index_level=100.0))


def test_a_chart_stage_carrying_constraints_is_refused(client) -> None:
    stage = _chart()
    stage["constraints"] = [{"operator": "lte", "property_slug": "densidade", "value": 2800}]

    assert "restrições" in _refused(client, stage)


def test_a_chart_stage_carrying_classes_is_refused(client) -> None:
    stage = _chart()
    stage["class_slugs"] = ["metais"]

    assert "classes" in _refused(client, stage)


def test_a_chart_stage_with_no_plane_is_refused(client) -> None:
    """There is nothing to select on, and no plane to redraw in the document."""
    assert "precisa de um plano" in _refused(client, {"kind": "chart"})


def test_another_kind_of_stage_carrying_a_plane_is_refused(client) -> None:
    """Not ignored: a plane silently dropped is a filter the user wrote and the
    tool did not run."""
    stage = _chart()
    stage["kind"] = "tree"
    stage["class_slugs"] = ["metais"]

    assert "plano" in _refused(client, stage)


def test_an_unknown_property_on_an_axis_is_a_404_naming_it(client) -> None:
    detail = _refused(client, _chart(x={"property_slug": "nao-existe"}), status=404)

    assert "nao-existe" in detail


def test_an_expression_that_does_not_evaluate_is_refused_with_the_reason(client) -> None:
    detail = _refused(client, _chart(x={"expression": "densidade / naovariavel"}))

    assert "naovariavel" in detail


def test_a_non_finite_bound_is_refused_by_the_schema(client) -> None:
    """NaN compares false against everything, so a box with one would reject the
    whole catalogue without a word.

    Sent as raw bytes because the test client's own JSON encoder refuses to
    write ``NaN`` — which is the point: only a hand-written request can get one
    this far, and the schema is what has to stop it when one does.
    """
    stage = _chart(x={"property_slug": "densidade", "min_value": "__nan__"})
    body = json.dumps({"stages": [stage]}).replace('"__nan__"', "NaN")
    resp = client.post(
        "/api/selection/run",
        content=body,
        headers={"content-type": "application/json"},
    )

    assert resp.status_code == 422


# --- saving and re-running --------------------------------------------------


def test_a_saved_chart_stage_round_trips_and_re_runs_to_the_same_answer(client) -> None:
    """A saved study has to re-run to the same answer, which is why the level is
    stored as a number and not as "the line through material 7"."""
    stage = _chart(
        x={"property_slug": "densidade", "max_value": 2800.0},
        y={"expression": INDEX, "min_value": 90.0},
        index_expression=INDEX,
        index_level=90.0,
        index_goal="maximize",
    )
    created = client.post(
        "/api/selection/studies",
        json={"name": "Viga leve e rígida", "stages": [stage], "criteria": []},
    )
    assert created.status_code == 201, created.text
    study_id = created.json()["id"]

    read_back = client.get(f"/api/selection/studies/{study_id}")
    assert read_back.status_code == 200, read_back.text
    saved = read_back.json()["stages"][0]
    assert saved["kind"] == "chart"
    assert saved["chart"]["x"] == {
        "property_slug": "densidade",
        "expression": None,
        "min_value": None,
        "max_value": 2800.0,
    }
    assert saved["chart"]["y"]["expression"] == INDEX
    assert saved["chart"]["y"]["min_value"] == 90.0
    assert (saved["chart"]["index_expression"], saved["chart"]["index_level"]) == (INDEX, 90.0)
    assert saved["chart"]["index_goal"] == "maximize"

    run = client.post(f"/api/selection/studies/{study_id}/run")
    assert run.status_code == 200, run.text
    assert _names(run.json()) == {"Liga Alumínio Demo A", "Compósito Demo E"}


def test_the_problem_section_describes_the_plane_and_the_bounds(client) -> None:
    """A reader who never sees the figure still has to know what was compared."""
    stage = _chart(
        x={"property_slug": "densidade", "max_value": 2800.0},
        index_expression=INDEX,
        index_level=90.0,
    )
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Viga descrita",
            # A second stage, so the document renders the pipeline rather than
            # collapsing to a single limit tree.
            "stages": [{"kind": "tree", "class_slugs": ["metais", "compositos"]}, stage],
            "criteria": [],
        },
    )
    assert created.status_code == 201, created.text
    study_id = created.json()["id"]

    resp = client.get(f"/api/exports/estudos/{study_id}.html")
    assert resp.status_code == 200, resp.text
    html = resp.text

    assert "Módulo de Young × Densidade" in html
    assert "eixo X ≤ 2800" in html
    assert f"{INDEX} ≥ 90" in html


def test_a_plane_with_no_box_and_no_line_says_what_it_asks(client) -> None:
    """ "Apenas plotável" is a real criterion, and a sentence that named a plane
    and then appeared to ask for nothing would read as a bug."""
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Só plotável",
            "stages": [{"kind": "tree", "class_slugs": ["metais"]}, _chart()],
            "criteria": [],
        },
    )
    assert created.status_code == 201, created.text

    resp = client.get(f"/api/exports/estudos/{created.json()['id']}.html")
    assert resp.status_code == 200, resp.text
    assert "apenas plotável" in resp.text


# --- the process universe ----------------------------------------------------


@pytest.fixture()
def process_universe(db_session) -> None:
    """Two processes with attributes, namespaced so no seeded row can drift in.

    | processo          | faixa de massa (kg) | lote econômico | forma     |
    |-------------------|---------------------|----------------|-----------|
    | grafico-injecao   | 0,1 – 10 (rep. 5,05)| 10 000         | Maciço 3D |
    | grafico-microusina| 0,001 – 0,05 (0,0255)| 10            | Maciço 3D |

    The representative point of each envelope is written out because it is the
    number a chart stage reads, while a limit stage reads the bounds — the whole
    point of the contrast test below.
    """
    family = ProcessClass(name="Conformação de gráfico", slug=f"{NS}-conformacao")
    db_session.add(family)
    db_session.flush()

    injecao = Process(name="Injeção de gráfico", slug=f"{NS}-injecao", class_id=family.id)
    micro = Process(name="Micro-usinagem de gráfico", slug=f"{NS}-microusina", class_id=family.id)
    db_session.add_all([injecao, micro])
    db_session.flush()

    massa = ProcessAttributeDefinition(
        name="Faixa de massa de gráfico",
        slug=MASSA,
        kind=ProcessAttributeKind.ENVELOPE,
        physical_dimension="[mass]",
        canonical_unit="kg",
        accepted_units=["kg"],
        allowed_labels=[],
        better_direction=BetterDirection.NEUTRAL,
    )
    lote = ProcessAttributeDefinition(
        name="Lote econômico de gráfico",
        slug=LOTE,
        kind=ProcessAttributeKind.ESCALAR,
        physical_dimension="",
        canonical_unit="dimensionless",
        accepted_units=["dimensionless"],
        allowed_labels=[],
        better_direction=BetterDirection.LOWER,
    )
    forma = ProcessAttributeDefinition(
        name="Forma de gráfico",
        slug=FORMA,
        kind=ProcessAttributeKind.DISCRETO,
        physical_dimension="",
        canonical_unit=None,
        accepted_units=[],
        allowed_labels=["Maciço 3D", "Oco 3D"],
        better_direction=BetterDirection.NEUTRAL,
    )
    db_session.add_all([massa, lote, forma])
    db_session.flush()

    def envelope(process_id: int, low: float, high: float, typical: float):
        return ProcessAttributeValue(
            process_id=process_id,
            attribute_id=massa.id,
            value_min=low,
            value_max=high,
            value_typical=typical,
            normalized_value=typical,
            normalized_min=low,
            normalized_max=high,
            original_unit="kg",
            canonical_unit="kg",
            conversion_method="identity:kg",
            data_quality=DataQuality.ESTIMADO,
        )

    def scalar(process_id: int, value: float):
        return ProcessAttributeValue(
            process_id=process_id,
            attribute_id=lote.id,
            value_scalar=value,
            normalized_value=value,
            original_unit="dimensionless",
            canonical_unit="dimensionless",
            conversion_method="identity:dimensionless",
            data_quality=DataQuality.ESTIMADO,
        )

    db_session.add_all(
        [
            envelope(injecao.id, 0.1, 10.0, 5.05),
            scalar(injecao.id, 10000.0),
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=forma.id,
                labels=["Maciço 3D"],
                data_quality=DataQuality.ESTIMADO,
            ),
            envelope(micro.id, 0.001, 0.05, 0.0255),
            scalar(micro.id, 10.0),
        ]
    )
    db_session.flush()


def _process_chart(**over) -> dict:
    chart = {"x": {"property_slug": MASSA}, "y": {"property_slug": LOTE}}
    chart.update(over)
    return {"kind": "chart", "chart": chart}


def _run_processes(client, stage: dict) -> dict:
    resp = client.post("/api/selection/run", json={"universe": "process", "stages": [stage]})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_a_plane_is_a_plane_in_the_process_universe_too(client, process_universe) -> None:
    """Nothing about the stage is material-specific: a process has had
    magnitudes since P0-4, so a region of one of its planes selects the same way.
    Every seeded process is off this plane — it has neither attribute — which is
    the plottability rule doing the work."""
    body = _run_processes(client, _process_chart())

    assert {c["name"] for c in body["candidates"]} == {
        "Injeção de gráfico",
        "Micro-usinagem de gráfico",
    }


def test_the_same_envelope_reads_one_way_on_a_plane_and_another_under_a_limit(
    client, process_universe
) -> None:
    """The obligation D-59 took on, now with two stages that disagree on purpose.

    A limit stage compares a capability envelope by **reach** — a process that
    shapes 0,1–10 kg meets "≥ 7 kg", because it genuinely can. A chart stage
    compares the **representative point**, because that is the single point the
    map draws, and 5,05 kg is not ≥ 7. Both are right for what they ask, so the
    document has to say which one ran — and this test is what makes that
    difference impossible to change by accident.
    """
    by_reach = _run_processes(
        client,
        {
            "kind": "limit",
            "constraints": [{"operator": "gte", "property_slug": MASSA, "value": 7.0}],
        },
    )
    assert {c["name"] for c in by_reach["candidates"]} == {"Injeção de gráfico"}

    on_the_plane = _run_processes(
        client, _process_chart(x={"property_slug": MASSA, "min_value": 7.0})
    )
    assert on_the_plane["candidates"] == []


def test_a_discrete_attribute_cannot_be_an_axis(client, process_universe) -> None:
    """It has labels and no magnitude, so it has no axis to be plotted on.
    Refusing it by name beats the alternative: every record would come back
    unplottable and the stage would read as "nothing is in this region"."""
    resp = client.post(
        "/api/selection/run",
        json={"universe": "process", "stages": [_process_chart(y={"property_slug": FORMA})]},
    )

    assert resp.status_code == 400, resp.text
    assert "Forma de gráfico" in resp.json()["detail"]


def test_an_axis_resolves_against_the_catalogue_of_its_own_universe(
    client, process_universe
) -> None:
    """A material property named on a process study's plane is a 404, not a
    stage that quietly admits nobody — the same defect P0-4 found on the limit
    stage, which is the reason ``_load_catalogue`` takes a universe at all."""
    resp = client.post(
        "/api/selection/run",
        json={
            "universe": "process",
            "stages": [_process_chart(x={"property_slug": "densidade"})],
        },
    )

    assert resp.status_code == 404, resp.text
    assert "densidade" in resp.json()["detail"]
