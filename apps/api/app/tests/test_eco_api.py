"""The Eco Audit over the real catalogue (P3).

The calculation layer is proved in ``test_eco_audit.py``. What is proved here is
everything the catalogue adds: that three tables meet correctly, that a material
or process the reader cannot see is not audited, and that the seeded gaps —
a ceramic with no recycling figure, a rail mode with no carbon intensity — reach
the answer as written absences rather than as zeros.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import MaterialProcess, Process
from app.models.property_definition import PropertyDefinition
from app.models.user import User

MOBILE_USE = {
    "model": "movel",
    "distance_km": 200000.0,
    "mobile_intensity": 0.0025,
    "life_years": 12.0,
    "carbon_per_energy": 0.07,
}

STATIC_USE = {
    "model": "estatico",
    "power_watts": 60.0,
    "duty_cycle": 0.25,
    "life_years": 10.0,
    "carbon_per_energy": 0.05,
}


def _material_id(db: Session, like: str) -> int:
    return (db.execute(select(Material).where(Material.name.like(like))).scalars().first()).id


def _process_id(db: Session, slug: str) -> int:
    return (db.execute(select(Process).where(Process.slug == slug)).scalars().one()).id


def _brief(db: Session, **overrides):
    payload = {
        "material_id": _material_id(db, "%Alumínio%"),
        "process_id": _process_id(db, "fundicao-areia"),
        "part_mass": 2.0,
        "recycled_fraction": 0.0,
        "transport_mode": "rodoviario",
        "transport_distance_km": 1500.0,
        "use": MOBILE_USE,
        "end_of_life": "reciclagem",
    }
    payload.update(overrides)
    return payload


def _audit(client: TestClient, db: Session, **overrides):
    return client.post("/api/eco/auditar", json=_brief(db, **overrides))


def _phase(body, name):
    return next(phase for phase in body["phases"] if phase["phase"] == name)


# --- the transport catalogue ------------------------------------------------


def test_the_transport_catalogue_comes_back_in_reading_order(client: TestClient) -> None:
    response = client.get("/api/eco/modais")

    assert response.status_code == 200, response.text
    modes = response.json()
    assert [mode["slug"] for mode in modes] == [
        "maritimo",
        "ferroviario",
        "rodoviario",
        "aereo",
    ]


def test_a_mode_without_a_carbon_intensity_says_so_rather_than_saying_zero(
    client: TestClient,
) -> None:
    """Absence is a state in the catalogue too, not a favourable number."""
    rail = next(m for m in client.get("/api/eco/modais").json() if m["slug"] == "ferroviario")
    assert rail["energy_intensity"] is not None
    assert rail["carbon_intensity"] is None


def test_every_mode_is_marked_as_demonstration_data(client: TestClient) -> None:
    assert all(mode["is_demo"] for mode in client.get("/api/eco/modais").json())


# --- the audit over the seeded catalogue ------------------------------------


def test_the_five_phases_come_back_with_the_two_podiums(
    client: TestClient, db_session: Session
) -> None:
    response = _audit(client, db_session)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [phase["phase"] for phase in body["phases"]] == [
        "material",
        "manufatura",
        "transporte",
        "uso",
        "fim-de-vida",
    ]
    assert body["energy_dominance"]["phase"] is not None
    assert body["carbon_dominance"]["phase"] is not None
    assert body["total_energy"] > 0


def test_the_answer_carries_both_masses_so_the_scrap_is_visible(
    client: TestClient, db_session: Session
) -> None:
    """The material phase is larger than a reader expects, and this says why."""
    body = _audit(client, db_session).json()
    assert body["mass_in_part"] == 2.0
    assert body["mass_bought"] > body["mass_in_part"]
    assert body["scrap_fraction"] > 0


def test_the_energy_total_is_the_sum_of_the_five_phases(
    client: TestClient, db_session: Session
) -> None:
    body = _audit(client, db_session).json()
    assert body["total_energy"] == pytest.approx(sum(phase["energy"] for phase in body["phases"]))


def test_the_carbon_unit_is_words_and_the_energy_unit_is_derived(
    client: TestClient, db_session: Session
) -> None:
    body = _audit(client, db_session).json()
    assert body["energy_unit"] == "MJ"
    assert body["carbon_unit"] == "kg de CO₂"
    assert "adimensional" in body["carbon_unit_note"]


def test_the_credit_note_travels_with_every_answer(client: TestClient, db_session: Session) -> None:
    assert "não abate crédito" in _audit(client, db_session).json()["recycling_credit_note"]


def test_air_freight_moves_the_transport_phase_by_an_order_of_magnitude(
    client: TestClient, db_session: Session
) -> None:
    """The seeded ordering is the teaching: same brief, a different modal decides it."""
    sea = _audit(client, db_session, transport_mode="maritimo").json()
    air = _audit(client, db_session, transport_mode="aereo").json()
    assert _phase(air, "transporte")["energy"] > 10 * _phase(sea, "transporte")["energy"]


def test_the_rail_mode_gives_energy_without_carbon_and_forfeits_one_podium(
    client: TestClient, db_session: Session
) -> None:
    body = _audit(client, db_session, transport_mode="ferroviario").json()
    transport = _phase(body, "transporte")

    assert transport["energy"] is not None
    assert transport["carbon"] is None
    assert transport["carbon_reason"]
    assert body["energy_dominance"]["phase"] is not None
    assert body["carbon_dominance"]["phase"] is None
    assert "Transporte" in body["carbon_dominance"]["refusal"]


def test_a_landfill_route_lists_the_phases_and_refuses_the_podium(
    client: TestClient, db_session: Session
) -> None:
    """Not quantified in v1, and never quantified as zero."""
    body = _audit(client, db_session, end_of_life="aterro").json()
    end = _phase(body, "fim-de-vida")

    assert end["energy"] is None
    assert "zero" in end["energy_reason"]
    assert body["total_energy"] is None
    assert body["energy_dominance"]["phase"] is None


def test_a_ceramic_with_no_recycling_figure_is_refused_on_that_route(
    client: TestClient, db_session: Session
) -> None:
    """The seeded gap is a real one in the domain, and it reaches the answer."""
    body = _audit(
        client,
        db_session,
        material_id=_material_id(db_session, "%Cerâmica%"),
        process_id=_process_id(db_session, "prensagem-sinterizacao"),
        end_of_life="reciclagem",
    ).json()
    end = _phase(body, "fim-de-vida")

    assert end["energy"] is None
    assert "energia_reciclagem" in end["energy_missing"]
    assert body["energy_dominance"]["phase"] is None


def test_the_static_model_makes_the_mass_irrelevant_to_the_use_phase(
    client: TestClient, db_session: Session
) -> None:
    light = _audit(client, db_session, part_mass=1.0, use=STATIC_USE).json()
    heavy = _audit(client, db_session, part_mass=20.0, use=STATIC_USE).json()
    assert _phase(light, "uso")["energy"] == pytest.approx(_phase(heavy, "uso")["energy"])


# --- refusals ---------------------------------------------------------------


def test_a_field_of_the_other_use_model_is_a_400_with_the_field_named(
    client: TestClient, db_session: Session
) -> None:
    """Ignored, it would be a number the reader typed and the sum never held."""
    response = _audit(client, db_session, use={**MOBILE_USE, "power_watts": 60.0})

    assert response.status_code == 400
    assert "outro modelo" in response.json()["detail"]
    assert "potência" in response.json()["detail"]


def test_a_process_that_does_not_make_this_material_is_a_404(
    client: TestClient, db_session: Session
) -> None:
    """The candidate set is the P0-2 join, not the whole process table."""
    polymer = _material_id(db_session, "%Polímero%")
    response = _audit(
        client,
        db_session,
        material_id=polymer,
        process_id=_process_id(db_session, "prensagem-sinterizacao"),
    )
    assert response.status_code == 404


def test_an_unknown_transport_mode_is_a_404(client: TestClient, db_session: Session) -> None:
    assert _audit(client, db_session, transport_mode="teletransporte").status_code == 404


def test_an_unknown_end_of_life_route_is_refused_by_the_schema(
    client: TestClient, db_session: Session
) -> None:
    assert _audit(client, db_session, end_of_life="compostagem").status_code == 422


def test_a_non_positive_mass_is_refused_by_the_schema(
    client: TestClient, db_session: Session
) -> None:
    assert _audit(client, db_session, part_mass=0.0).status_code == 422


def test_a_non_finite_use_input_is_refused_before_it_reaches_the_parser(
    client: TestClient, db_session: Session
) -> None:
    body = _brief(db_session)
    payload = str(body).replace("'", '"').replace("0.0025", "Infinity")
    response = client.post(
        "/api/eco/auditar", content=payload, headers={"content-type": "application/json"}
    )
    assert response.status_code == 422


# --- isolation (P1-4) -------------------------------------------------------
#
# The openapi sweep in ``test_my_records_isolation`` covers GET routes only, so
# this POST needs its own pair — the gap D-62 recorded, written down rather than
# rediscovered.


def _own_record(db_session: Session, owner: User, name: str) -> Material:
    """A private record with everything an audit needs, linked to a real process."""
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
    for slug, value in (
        ("densidade", 2700.0),
        ("energia_incorporada", 180.0),
        ("pegada_co2", 10.0),
        ("energia_reciclagem", 20.0),
        ("co2_reciclagem", 1.4),
    ):
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
    process = (
        db_session.execute(select(Process).where(Process.slug == "fundicao-areia")).scalars().one()
    )
    db_session.add(MaterialProcess(material_id=material.id, process_id=process.id))
    db_session.flush()
    return material


def test_my_own_record_can_be_audited(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    """The positive control D-62 taught us not to omit: fail-closed must open."""
    material = _own_record(db_session, test_user, "Liga propria do eco audit")

    response = _audit(client, db_session, material_id=material.id)

    assert response.status_code == 200, response.text
    assert response.json()["material_name"] == material.name


def test_someone_elses_record_cannot_be_audited(
    client: TestClient, db_session: Session, other_user: User
) -> None:
    """A 404, like everywhere: any other answer would say whether it exists."""
    material = _own_record(db_session, other_user, "Superliga alheia do eco audit")

    response = _audit(client, db_session, material_id=material.id)

    assert response.status_code == 404
    assert material.name not in response.text
