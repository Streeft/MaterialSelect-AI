"""The Engineering Solver and the Index Finder over the real catalogue (P2)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.user import User

BEAM = {
    "case_key": "viga-rigidez",
    "inputs": {"rigidez": 2.0e5, "comprimento": 0.8, "constante_apoio": 48.0},
}


def _solve(client: TestClient, **overrides: object):
    payload: dict[str, object] = {**BEAM}
    payload.update(overrides)
    return client.post("/api/solver/resolver", json=payload)


# --- Performance Index Finder ---------------------------------------------


def test_the_finder_lists_the_facets_and_the_index_each_case_yields(
    client: TestClient,
) -> None:
    """função → restrição → objetivo → índice, which is the flow the item names."""
    response = client.get("/api/solver/casos")

    assert response.status_code == 200, response.text
    cases = response.json()
    assert len(cases) >= 7
    beam = next(case for case in cases if case["key"] == "viga-rigidez")
    assert beam["constraint_label"]
    assert beam["objective_label"] == "Minimizar massa"
    assert beam["index_slug"] == "viga-leve-rigidez"
    assert beam["index_expression"] == "sqrt(modulo_young) / densidade"
    assert beam["index_goal"] == "maximize"


def test_the_expression_shown_is_read_from_the_catalogue(client: TestClient) -> None:
    """Never authored in the case: a second copy would become a second answer."""
    catalogue = {i["slug"]: i["expression"] for i in client.get("/api/performance-indices").json()}
    for case in client.get("/api/solver/casos").json():
        assert case["index_expression"] == catalogue[case["index_slug"]]
        # The cost twin is read the same way, for the same reason (D-65).
        assert case["cost_index_expression"] == catalogue[case["cost_index_slug"]]


def test_the_finder_shows_both_objectives_a_case_answers(client: TestClient) -> None:
    """One derivation, two readings — and the reader sees both before choosing."""
    beam = next(
        case for case in client.get("/api/solver/casos").json() if case["key"] == "viga-rigidez"
    )
    assert beam["cost_index_slug"] == "viga-leve-rigidez-custo"
    assert beam["cost_objective_label"] == "Minimizar custo de material"
    assert beam["cost_index_expression"] != beam["index_expression"]


def test_each_case_carries_the_derivation_that_produced_its_index(
    client: TestClient,
) -> None:
    for case in client.get("/api/solver/casos").json():
        assert len(case["derivation"]) >= 4
        assert case["reference"]


def test_one_case_can_be_fetched_and_an_unknown_one_is_a_404(client: TestClient) -> None:
    assert client.get("/api/solver/casos/viga-rigidez").status_code == 200
    assert client.get("/api/solver/casos/nao-existe").status_code == 404


# --- Engineering Solver ----------------------------------------------------


def test_the_brief_comes_back_with_a_mass_per_material(client: TestClient) -> None:
    response = _solve(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["solved"]
    assert body["objective_unit"] == "kg"
    assert body["objective_dimension"] == "[mass]"
    assert all(record["objective_value"] > 0 for record in body["solved"])


def test_the_lightest_is_first_and_the_ranks_are_dense(client: TestClient) -> None:
    body = _solve(client).json()

    masses = [record["objective_value"] for record in body["solved"]]
    assert masses == sorted(masses)
    assert [record["rank"] for record in body["solved"]] == list(range(1, len(masses) + 1))


def test_the_structural_factor_is_returned_so_the_number_can_be_checked(
    client: TestClient,
) -> None:
    """Mass = structural factor / index; both sides are on the response."""
    body = _solve(client).json()
    first = body["solved"][0]
    assert first["objective_value"] == body["structural_factor"] / first["index_value"]


def test_the_free_variable_is_an_area_here_and_a_thickness_for_a_plate(
    client: TestClient,
) -> None:
    beam = _solve(client).json()
    assert beam["free_unit"] == "m**2"
    assert beam["free_dimension"] == "[length] ** 2"

    plate = _solve(
        client,
        case_key="placa-rigidez",
        inputs={
            "rigidez": 5.0e4,
            "comprimento": 0.6,
            "largura": 0.3,
            "constante_apoio": 48.0,
        },
    ).json()
    assert plate["free_unit"] == "m"
    assert plate["free_dimension"] == "[length]"


def test_a_material_without_the_property_is_excluded_and_named(
    client: TestClient, db_session: Session
) -> None:
    """Principle 3 on the solver's surface: absence is written, never a zero."""
    body = _solve(client).json()
    solved = {record["record_id"] for record in body["solved"]}
    for item in body["excluded"]:
        assert item["record_id"] not in solved
        assert item["reason"]
        assert item["missing_labels"] == [] or all(item["missing_labels"])


def test_an_unknown_case_is_a_404(client: TestClient) -> None:
    assert _solve(client, case_key="nao-existe").status_code == 404


def test_a_non_positive_input_is_refused_with_the_variables_name(
    client: TestClient,
) -> None:
    response = _solve(
        client, inputs={"rigidez": 2.0e5, "comprimento": 0.0, "constante_apoio": 48.0}
    )
    assert response.status_code == 400
    assert "Comprimento" in response.json()["detail"]


def test_a_missing_design_variable_is_refused(client: TestClient) -> None:
    response = _solve(client, inputs={"rigidez": 2.0e5, "comprimento": 0.8})
    assert response.status_code == 400
    assert "constante_apoio" in response.json()["detail"]


def test_a_non_finite_input_is_refused_before_it_reaches_the_parser(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/solver/resolver",
        content=(
            '{"case_key": "viga-rigidez", "inputs": '
            '{"rigidez": Infinity, "comprimento": 0.8, "constante_apoio": 48.0}}'
        ),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422


def test_the_limit_caps_the_list(client: TestClient) -> None:
    body = _solve(client, limit=2).json()
    assert len(body["solved"]) <= 2


# --- the cost objective (D-65) ---------------------------------------------


def test_the_same_brief_answers_a_cost_when_asked_for_one(client: TestClient) -> None:
    body = _solve(client, objective="custo").json()

    assert body["objective"] == "custo"
    assert body["objective_label"] == "Minimizar custo de material"
    assert body["index_slug"] == "viga-leve-rigidez-custo"
    assert body["solved"], "nenhum material do seed tem custo por massa"
    assert all(record["objective_value"] > 0 for record in body["solved"])


def test_the_objective_defaults_to_the_mass(client: TestClient) -> None:
    """A client written before D-65 keeps the answer it was getting."""
    body = _solve(client).json()
    assert body["objective"] == "massa"
    assert body["index_slug"] == "viga-leve-rigidez"
    assert body["objective_unit"] == "kg"
    assert body["objective_note"] is None


def test_the_cost_run_names_its_unit_in_words_and_says_why(client: TestClient) -> None:
    body = _solve(client, objective="custo").json()

    assert body["objective_unit"] == "unidade monetária não especificada"
    # Same dimension as the mass run, because money is in no unit system — the
    # response owes the reader that sentence rather than a symbol.
    assert body["objective_dimension"] == "[mass]"
    assert "adimensional" in body["objective_note"]


def test_the_cost_of_a_part_is_its_mass_times_its_price_per_kilogram(
    client: TestClient, db_session: Session
) -> None:
    """End to end over the seeded catalogue: the two runs are one derivation.

    The structural factor is the same number in both, and every material's cost
    is its own mass scaled by its own catalogued ``custo_massa`` — which is the
    claim that makes the cost objective a reading of the derivation rather than
    a second one.
    """
    prices = {
        material_id: float(value)
        for material_id, value in db_session.execute(
            select(MaterialPropertyValue.material_id, MaterialPropertyValue.normalized_value)
            .join(PropertyDefinition)
            .where(
                PropertyDefinition.slug == "custo_massa",
                MaterialPropertyValue.is_missing.is_(False),
                MaterialPropertyValue.normalized_value.is_not(None),
            )
        ).all()
    }
    mass = _solve(client, limit=50).json()
    cost = _solve(client, objective="custo", limit=50).json()

    assert cost["structural_factor"] == mass["structural_factor"]
    by_id = {record["record_id"]: record for record in mass["solved"]}
    compared = 0
    for record in cost["solved"]:
        twin = by_id[record["record_id"]]
        assert record["objective_value"] == pytest.approx(
            twin["objective_value"] * prices[record["record_id"]], rel=1e-9
        )
        compared += 1
    assert compared > 0, "nenhum material do seed permitiu a comparação"


def test_a_material_without_a_catalogued_price_is_excluded_from_the_cost_run(
    client: TestClient,
) -> None:
    """Absence again (principle 3): no price is not a price of zero."""
    mass = {record["record_id"] for record in _solve(client, limit=50).json()["solved"]}
    cost = _solve(client, objective="custo", limit=50).json()
    solved = {record["record_id"] for record in cost["solved"]}

    for record_id in mass - solved:
        excluded = next(item for item in cost["excluded"] if item["record_id"] == record_id)
        assert "custo_massa" in excluded["missing_slugs"]
        assert excluded["missing_labels"] and all(excluded["missing_labels"])


def test_the_objective_the_case_does_not_have_is_refused(client: TestClient) -> None:
    """Not silently treated as a mass: the answer would be a different question."""
    assert _solve(client, objective="carbono").status_code == 422


# --- isolation (P1-4) ------------------------------------------------------
#
# The openapi sweep in ``test_my_records_isolation`` covers GET routes only, so
# the solver's POST needs its own proof — the gap D-62 recorded, written down
# rather than rediscovered.


def _own_record(db_session: Session, owner: User, name: str) -> Material:
    material_class = db_session.execute(select(MaterialClass).limit(1)).scalars().one()
    material = Material(
        name=name,
        class_id=material_class.id,
        owner_id=owner.id,
        is_active=True,
        is_demo=False,
    )
    db_session.add(material)
    db_session.flush()
    for slug, value in (("modulo_young", 7.0e10), ("densidade", 2700.0)):
        definition = (
            db_session.execute(select(PropertyDefinition).where(PropertyDefinition.slug == slug))
            .scalars()
            .one()
        )
        db_session.add(
            MaterialPropertyValue(
                material_id=material.id,
                property_id=definition.id,
                value_scalar=value,
                original_unit=definition.canonical_unit,
                normalized_value=value,
                canonical_unit=definition.canonical_unit,
                is_missing=False,
            )
        )
    db_session.flush()
    return material


def test_my_own_record_is_dimensioned_in_my_own_brief(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    """The positive control D-62 taught us not to omit: fail-closed must open."""
    material = _own_record(db_session, test_user, "Liga propria do solver")

    body = _solve(client).json()
    names = [record["name"] for record in body["solved"]] + [
        item["name"] for item in body["excluded"]
    ]

    assert material.name in names
    solved = next(record for record in body["solved"] if record["name"] == material.name)
    assert solved["is_own_record"] is True


def test_someone_elses_record_appears_nowhere_in_the_answer(
    client: TestClient, db_session: Session, other_user: User
) -> None:
    """Being named in ``excluded`` would leak as much as being ranked."""
    material = _own_record(db_session, other_user, "Superliga alheia do solver")

    response = _solve(client, limit=50)

    assert material.name not in response.text
