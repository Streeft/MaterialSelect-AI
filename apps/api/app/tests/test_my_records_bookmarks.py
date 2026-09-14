"""Favourites and recents, in both universes (P1-4)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.my_records import RecentRecord
from app.models.process import Process
from app.models.user import User
from app.repositories.bookmark_repository import RECENT_LIMIT


def _a_material(db_session: Session) -> Material:
    return db_session.execute(select(Material).order_by(Material.id)).scalars().first()


def _a_process(db_session: Session) -> Process:
    return db_session.execute(select(Process).order_by(Process.id)).scalars().first()


def test_the_space_starts_empty_and_says_so_in_three_lists(client) -> None:
    body = client.get("/api/my-records").json()
    assert body == {"favorites": [], "recents": [], "own_records": []}


def test_starring_a_material_puts_it_in_the_favourites(client, db_session: Session) -> None:
    material = _a_material(db_session)

    body = client.put(f"/api/my-records/favorites/material/{material.id}").json()

    assert [f["universe"] for f in body["favorites"]] == ["material"]
    assert body["favorites"][0]["material"]["name"] == material.name
    assert body["favorites"][0]["process"] is None


def test_starring_a_process_puts_it_in_the_same_list(client, db_session: Session) -> None:
    """Both universes, one list — a favourite is a bookmark, and the reader does
    not keep two sets of bookmarks in their head."""
    process = _a_process(db_session)

    body = client.put(f"/api/my-records/favorites/process/{process.id}").json()

    assert [f["universe"] for f in body["favorites"]] == ["process"]
    assert body["favorites"][0]["process"]["slug"] == process.slug
    assert body["favorites"][0]["material"] is None


def test_starring_twice_is_the_same_as_starring_once(client, db_session: Session) -> None:
    """Idempotent rather than a conflict: a star is a desired end state."""
    material = _a_material(db_session)

    client.put(f"/api/my-records/favorites/material/{material.id}")
    second = client.put(f"/api/my-records/favorites/material/{material.id}")

    assert second.status_code == 200
    assert len(second.json()["favorites"]) == 1


def test_unstarring_removes_it(client, db_session: Session) -> None:
    material = _a_material(db_session)
    client.put(f"/api/my-records/favorites/material/{material.id}")

    body = client.delete(f"/api/my-records/favorites/material/{material.id}").json()

    assert body["favorites"] == []


def test_unstarring_something_that_was_never_starred_is_not_an_error(
    client, db_session: Session
) -> None:
    response = client.delete(f"/api/my-records/favorites/material/{_a_material(db_session).id}")
    assert response.status_code == 200


def test_starring_a_record_that_does_not_exist_is_not_found(client) -> None:
    assert client.put("/api/my-records/favorites/material/999999").status_code == 404
    assert client.put("/api/my-records/favorites/process/999999").status_code == 404


def test_an_unknown_universe_is_refused_by_the_schema(client, db_session: Session) -> None:
    """``universe`` is a closed vocabulary, same as everywhere else it appears
    (D-58) — a typo must not create a third kind of bookmark."""
    response = client.put(f"/api/my-records/favorites/molecula/{_a_material(db_session).id}")
    assert response.status_code == 422


def test_opening_a_record_puts_it_in_the_recents(client, db_session: Session) -> None:
    material = _a_material(db_session)

    assert client.post(f"/api/my-records/recents/material/{material.id}").status_code == 204

    body = client.get("/api/my-records").json()
    assert [r["material"]["name"] for r in body["recents"]] == [material.name]


def test_opening_the_same_record_again_moves_it_rather_than_duplicating_it(
    client, db_session: Session, test_user: User
) -> None:
    """A set with an order, not a log. The uniqueness constraint guarantees it
    at the database; this proves the service agrees rather than erroring."""
    first, second = (
        db_session.execute(select(Material).order_by(Material.id).limit(2)).scalars().all()
    )
    client.post(f"/api/my-records/recents/material/{first.id}")
    client.post(f"/api/my-records/recents/material/{second.id}")
    client.post(f"/api/my-records/recents/material/{first.id}")

    body = client.get("/api/my-records").json()
    names = [r["material"]["name"] for r in body["recents"]]
    assert names == [first.name, second.name]

    rows = (
        db_session.execute(select(RecentRecord).where(RecentRecord.user_id == test_user.id))
        .scalars()
        .all()
    )
    assert len(rows) == 2


def test_the_recents_are_one_chronology_across_both_universes(client, db_session: Session) -> None:
    """Merged and re-sorted, not concatenated: a reader who opened a process
    after a material should see the process first."""
    material = _a_material(db_session)
    process = _a_process(db_session)

    client.post(f"/api/my-records/recents/material/{material.id}")
    client.post(f"/api/my-records/recents/process/{process.id}")

    body = client.get("/api/my-records").json()
    assert [r["universe"] for r in body["recents"]] == ["process", "material"]


def test_the_recents_are_capped(client, db_session: Session, test_user: User) -> None:
    """Twenty is "where was I"; two hundred would be a history, and the audit
    trail already answers that question properly."""
    # The seeded catalogue holds fewer records than the cap, so the test makes
    # its own until there are enough — the assertion below refuses to run
    # otherwise, because a cap never reached proves nothing about cutting.
    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    for index in range(8):
        client.post(
            "/api/materials",
            json={
                "name": f"Liga de lastro {index}",
                "class_id": class_id,
                "values": [],
                "is_own_record": True,
            },
        )

    materials = db_session.execute(select(Material).order_by(Material.id)).scalars().all()
    processes = db_session.execute(select(Process).order_by(Process.id)).scalars().all()
    opened = 0
    for material in materials:
        client.post(f"/api/my-records/recents/material/{material.id}")
        opened += 1
    for process in processes:
        client.post(f"/api/my-records/recents/process/{process.id}")
        opened += 1

    assert opened > RECENT_LIMIT, "o catálogo semeado precisa exceder o teto para provar o corte"
    rows = (
        db_session.execute(select(RecentRecord).where(RecentRecord.user_id == test_user.id))
        .scalars()
        .all()
    )
    assert len(rows) == RECENT_LIMIT


def test_own_records_are_listed_apart_from_the_shared_catalogue(
    client, db_session: Session
) -> None:
    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    client.post(
        "/api/materials",
        json={
            "name": "Liga do meu espaço",
            "class_id": class_id,
            "values": [],
            "is_own_record": True,
        },
    )

    body = client.get("/api/my-records").json()
    assert [item["name"] for item in body["own_records"]] == ["Liga do meu espaço"]


def test_one_persons_bookmarks_are_invisible_to_another(
    client, login_as, db_session: Session, other_user: User
) -> None:
    material = _a_material(db_session)
    client.put(f"/api/my-records/favorites/material/{material.id}")

    with login_as(other_user):
        body = client.get("/api/my-records").json()

    assert body["favorites"] == []


def test_a_withdrawn_material_drops_out_of_the_favourites_without_losing_the_star(
    client, db_session: Session, test_user: User
) -> None:
    """The row stays because withdrawal is reversible; the listing hides it
    because "material 41" is worse than nothing."""
    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    created = client.post(
        "/api/materials",
        json={"name": "Liga retirável", "class_id": class_id, "values": [], "is_own_record": True},
    ).json()
    client.put(f"/api/my-records/favorites/material/{created['id']}")

    client.delete(f"/api/materials/{created['id']}")

    assert client.get("/api/my-records").json()["favorites"] == []
    from app.models.my_records import Favorite

    kept = (
        db_session.execute(select(Favorite).where(Favorite.user_id == test_user.id)).scalars().all()
    )
    assert len(kept) == 1


def test_a_star_on_a_withdrawn_record_can_still_be_removed(
    client, db_session: Session, test_user: User
) -> None:
    """Otherwise the reader is stuck with a star they cannot see and cannot
    clear — which is why un-starring deliberately does not resolve the record
    first."""
    from app.models.my_records import Favorite

    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    created = client.post(
        "/api/materials",
        json={"name": "Liga presa", "class_id": class_id, "values": [], "is_own_record": True},
    ).json()
    client.put(f"/api/my-records/favorites/material/{created['id']}")
    client.delete(f"/api/materials/{created['id']}")

    response = client.delete(f"/api/my-records/favorites/material/{created['id']}")

    assert response.status_code == 200
    assert (
        db_session.execute(select(Favorite).where(Favorite.user_id == test_user.id)).scalars().all()
        == []
    )
