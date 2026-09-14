"""Creating a record of one's own, over a catalogue that stays shared (P1-4)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.user import User


def _payload(name: str, class_id: int, **overrides: object) -> dict:
    payload = {"name": name, "class_id": class_id, "values": []}
    payload.update(overrides)
    return payload


def _metals_id(db_session: Session) -> int:
    return (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )


def test_creating_without_the_flag_still_writes_to_the_shared_catalogue(
    client, db_session: Session
) -> None:
    """The default is the old behaviour, exactly. Every client written before
    My Records goes on adding reference data, and none of them silently starts
    filing private records instead."""
    response = client.post(
        "/api/materials", json=_payload("Aço compartilhado", _metals_id(db_session))
    )

    assert response.status_code == 201
    assert response.json()["is_own_record"] is False
    material = (
        db_session.execute(select(Material).where(Material.name == "Aço compartilhado"))
        .scalars()
        .one()
    )
    assert material.owner_id is None


def test_creating_with_the_flag_files_it_under_the_person_who_asked(
    client, db_session: Session, test_user: User
) -> None:
    response = client.post(
        "/api/materials",
        json=_payload("Minha liga", _metals_id(db_session), is_own_record=True),
    )

    assert response.status_code == 201
    assert response.json()["is_own_record"] is True
    material = (
        db_session.execute(select(Material).where(Material.name == "Minha liga")).scalars().one()
    )
    assert material.owner_id == test_user.id


def test_an_own_record_appears_in_its_owners_catalogue(client, db_session: Session) -> None:
    """It is a record, not a separate shelf: it lists, charts and selects with
    everything else."""
    client.post(
        "/api/materials",
        json=_payload("Liga listável", _metals_id(db_session), is_own_record=True),
    )

    listing = client.get("/api/materials").json()
    entry = next(item for item in listing if item["name"] == "Liga listável")
    assert entry["is_own_record"] is True


def test_two_people_may_each_keep_a_record_under_the_same_name(
    client, login_as, db_session: Session, other_user: User
) -> None:
    """The consequence of scoping the duplicate-name check to the visible set.

    A global check would refuse the second one — and the refusal would be the
    only evidence anywhere in the product that the first one exists.
    """
    class_id = _metals_id(db_session)
    first = client.post(
        "/api/materials", json=_payload("Liga do projeto", class_id, is_own_record=True)
    )
    with login_as(other_user):
        second = client.post(
            "/api/materials", json=_payload("Liga do projeto", class_id, is_own_record=True)
        )

    assert [first.status_code, second.status_code] == [201, 201]


def test_a_name_already_in_the_shared_catalogue_is_still_refused(
    client, db_session: Session
) -> None:
    """Scoping to the visible set does not switch the check off: the shared
    catalogue is visible to everyone, so it still collides with everyone."""
    class_id = _metals_id(db_session)
    client.post("/api/materials", json=_payload("Liga única", class_id))

    again = client.post("/api/materials", json=_payload("Liga única", class_id, is_own_record=True))

    assert again.status_code == 409


def test_the_owner_may_edit_and_withdraw_their_own_record(client, db_session: Session) -> None:
    created = client.post(
        "/api/materials",
        json=_payload("Liga editável", _metals_id(db_session), is_own_record=True),
    ).json()

    renamed = client.patch(f"/api/materials/{created['id']}", json={"name": "Liga renomeada"})
    withdrawn = client.delete(f"/api/materials/{created['id']}")

    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Liga renomeada"
    assert renamed.json()["is_own_record"] is True
    assert withdrawn.status_code == 204


def test_an_own_record_is_audited_like_any_other(client, db_session: Session) -> None:
    """M2 does not get an exception for private records: who changed what and
    when is the same question regardless of which shelf the row is on."""
    client.post(
        "/api/materials",
        json=_payload("Liga auditada", _metals_id(db_session), is_own_record=True),
    )

    events = client.get("/api/audit").json()
    labels = [event["entity_label"] for event in events]
    assert "Liga auditada" in labels
