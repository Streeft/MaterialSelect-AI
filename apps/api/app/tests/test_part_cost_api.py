"""The Part Cost Estimator over the real catalogue, through the API (P3)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import MaterialProcess, Process
from app.models.property_definition import PropertyDefinition
from app.models.user import User


def _aluminium_id(db_session: Session) -> int:
    """A seeded material that carries cost per mass and shaping processes."""
    return (
        db_session.execute(select(Material.id).where(Material.name.like("%Alumínio%")))
        .scalars()
        .first()
    )


def _estimate(client: TestClient, material_id: int, **overrides):
    payload: dict[str, object] = {
        "material_id": material_id,
        "part_mass": 2.0,
        "batch_size": 1_000,
    }
    payload.update(overrides)
    return client.post("/api/custo/estimar", json=payload)


def test_the_estimate_prices_every_compatible_process(
    client: TestClient, db_session: Session
) -> None:
    response = _estimate(client, _aluminium_id(db_session))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["costed"]
    assert all(item["terms"]["total"] > 0 for item in body["costed"])


def test_the_terms_add_up_to_the_total(client: TestClient, db_session: Session) -> None:
    """The decomposition is the point; a total that is not their sum is a bug."""
    body = _estimate(client, _aluminium_id(db_session)).json()

    for item in body["costed"]:
        terms = item["terms"]
        assert terms["total"] == (
            terms["material"] + terms["tooling"] + terms["overhead"] + terms["capital"]
        )


def test_the_cheapest_ranks_first_and_the_ranks_are_dense(
    client: TestClient, db_session: Session
) -> None:
    body = _estimate(client, _aluminium_id(db_session)).json()

    totals = [item["terms"]["total"] for item in body["costed"]]
    assert totals == sorted(totals)
    assert [item["rank"] for item in body["costed"]] == list(range(1, len(totals) + 1))


def test_a_bigger_batch_never_raises_any_total(client: TestClient, db_session: Session) -> None:
    """Only the tooling term moves, and it moves down. Nothing else may drift."""
    material_id = _aluminium_id(db_session)
    small = {
        i["process_slug"]: i["terms"]
        for i in _estimate(client, material_id, batch_size=10).json()["costed"]
    }
    large = {
        i["process_slug"]: i["terms"]
        for i in _estimate(client, material_id, batch_size=100_000).json()["costed"]
    }

    assert small and small.keys() == large.keys()
    for slug, terms in small.items():
        assert large[slug]["total"] <= terms["total"]
        assert large[slug]["material"] == terms["material"]
        assert large[slug]["overhead"] == terms["overhead"]
        assert large[slug]["capital"] == terms["capital"]


def test_the_batch_can_reorder_the_answer(client: TestClient, db_session: Session) -> None:
    """The crossover is what the estimator exists to show.

    A tooling-heavy, fast process loses at ten parts and wins at a hundred
    thousand. If the ranking never changed with the batch, the decomposition
    would be decoration.
    """
    material_id = _aluminium_id(db_session)
    few = [i["process_slug"] for i in _estimate(client, material_id, batch_size=1).json()["costed"]]
    many = [
        i["process_slug"]
        for i in _estimate(client, material_id, batch_size=1_000_000).json()["costed"]
    ]

    assert few != many, "nenhum cruzamento: o lote não reordenou nada"


def test_a_process_without_economic_data_is_named_not_priced(
    client: TestClient, db_session: Session
) -> None:
    """Principle 3: a blank tooling cost is not zero, which would look cheapest."""
    body = _estimate(client, _aluminium_id(db_session)).json()

    costed = {item["process_slug"] for item in body["costed"]}
    assert body["uncosted"], "o catálogo semeia processos sem dado econômico de propósito"
    for item in body["uncosted"]:
        assert item["process_slug"] not in costed
        assert item["reason"]
        assert item["missing_labels"] or item["reason"]


def test_the_answer_says_what_it_is_denominated_in(client: TestClient, db_session: Session) -> None:
    """Money is outside the unit system, and the answer admits it."""
    body = _estimate(client, _aluminium_id(db_session)).json()

    assert "moeda" in body["monetary_unit_note"]
    assert body["material_cost_per_mass"] > 0


def test_the_shop_assumptions_come_back_with_the_answer(
    client: TestClient, db_session: Session
) -> None:
    body = _estimate(client, _aluminium_id(db_session), write_off_years=2, load_factor=0.25).json()

    assert body["write_off_years"] == 2
    assert body["load_factor"] == 0.25


def test_a_shorter_horizon_raises_only_the_capital_term(
    client: TestClient, db_session: Session
) -> None:
    material_id = _aluminium_id(db_session)
    base = {i["process_slug"]: i["terms"] for i in _estimate(client, material_id).json()["costed"]}
    short = {
        i["process_slug"]: i["terms"]
        for i in _estimate(client, material_id, write_off_years=2.5).json()["costed"]
    }

    for slug, terms in base.items():
        assert short[slug]["capital"] > terms["capital"]
        assert short[slug]["material"] == terms["material"]
        assert short[slug]["tooling"] == terms["tooling"]


def test_a_material_without_cost_per_mass_is_refused_with_the_reason(
    client: TestClient, db_session: Session
) -> None:
    """No material term means no estimate — only a part of one."""
    material_class = db_session.execute(select(MaterialClass).limit(1)).scalars().one()
    material = Material(name="Sem custo cadastrado", class_id=material_class.id, is_active=True)
    db_session.add(material)
    db_session.flush()

    response = _estimate(client, material.id)

    assert response.status_code == 400
    assert "custo por massa" in response.json()["detail"]


def test_an_unknown_material_is_a_404(client: TestClient) -> None:
    assert _estimate(client, 999_999).status_code == 404


def test_a_non_positive_mass_is_refused_by_the_schema(
    client: TestClient, db_session: Session
) -> None:
    assert _estimate(client, _aluminium_id(db_session), part_mass=0).status_code == 422


def test_a_batch_below_one_part_is_refused_by_the_schema(
    client: TestClient, db_session: Session
) -> None:
    assert _estimate(client, _aluminium_id(db_session), batch_size=0).status_code == 422


def test_a_load_factor_above_one_is_refused_by_the_schema(
    client: TestClient, db_session: Session
) -> None:
    assert _estimate(client, _aluminium_id(db_session), load_factor=1.5).status_code == 422


# --- isolation (P1-4) ------------------------------------------------------
#
# A POST, so the openapi sweep in ``test_my_records_isolation`` does not reach
# it — the gap D-62 recorded, covered here as the solver's is.


def _own_material(db_session: Session, owner: User, name: str) -> Material:
    material_class = db_session.execute(select(MaterialClass).limit(1)).scalars().one()
    material = Material(name=name, class_id=material_class.id, owner_id=owner.id, is_active=True)
    db_session.add(material)
    db_session.flush()
    definition = (
        db_session.execute(
            select(PropertyDefinition).where(PropertyDefinition.slug == "custo_massa")
        )
        .scalars()
        .one()
    )
    db_session.add(
        MaterialPropertyValue(
            material_id=material.id,
            property_id=definition.id,
            value_scalar=10.0,
            original_unit="dimensionless",
            normalized_value=10.0,
            canonical_unit="dimensionless",
            is_missing=False,
        )
    )
    process = db_session.execute(select(Process).limit(1)).scalars().one()
    db_session.add(MaterialProcess(material_id=material.id, process_id=process.id))
    db_session.flush()
    return material


def test_my_own_record_can_be_costed_by_me(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    """The positive control D-62 taught us not to omit."""
    material = _own_material(db_session, test_user, "Liga propria de custo")

    response = _estimate(client, material.id)

    assert response.status_code == 200, response.text
    assert response.json()["material_name"] == material.name


def test_someone_elses_record_is_a_404_not_an_estimate(
    client: TestClient, db_session: Session, other_user: User
) -> None:
    material = _own_material(db_session, other_user, "Superliga alheia de custo")

    response = _estimate(client, material.id)

    assert response.status_code == 404
    assert material.name not in response.text
