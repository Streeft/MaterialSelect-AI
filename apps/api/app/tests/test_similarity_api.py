"""Find Similar over the real catalogue, through the API (P2)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.user import User

BASIS = ["densidade", "modulo_young"]


def _first_material_id(db_session: Session) -> int:
    return db_session.execute(select(Material.id).order_by(Material.id)).scalars().first()


def _post(client: TestClient, material_id: int, **overrides: object):
    payload: dict[str, object] = {"property_slugs": BASIS}
    payload.update(overrides)
    return client.post(f"/api/materials/{material_id}/similares", json=payload)


def test_the_answer_carries_the_basis_it_was_measured_on(
    client: TestClient, db_session: Session
) -> None:
    """A list of neighbours without the basis is a verdict, not a result."""
    response = _post(client, _first_material_id(db_session))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["basis"] == BASIS
    assert body["basis_labels"] == ["Densidade", "Módulo de Young"]


def test_the_reference_is_never_among_its_own_neighbours(
    client: TestClient, db_session: Session
) -> None:
    material_id = _first_material_id(db_session)

    body = _post(client, material_id).json()

    assert material_id not in [n["record_id"] for n in body["neighbours"]]


def test_neighbours_come_back_ranked_from_nearest(client: TestClient, db_session: Session) -> None:
    body = _post(client, _first_material_id(db_session)).json()

    distances = [n["distance"] for n in body["neighbours"]]
    assert distances == sorted(distances)
    assert [n["rank"] for n in body["neighbours"]] == list(range(1, len(distances) + 1))


def test_every_neighbour_explains_its_position_property_by_property(
    client: TestClient, db_session: Session
) -> None:
    body = _post(client, _first_material_id(db_session)).json()

    for neighbour in body["neighbours"]:
        assert set(neighbour["contributions"]) == set(BASIS)


def test_the_limit_is_respected(client: TestClient, db_session: Session) -> None:
    body = _post(client, _first_material_id(db_session), limit=1).json()

    assert len(body["neighbours"]) <= 1


def test_an_unknown_property_is_refused_by_name(client: TestClient, db_session: Session) -> None:
    response = _post(client, _first_material_id(db_session), property_slugs=["não_existe"])

    assert response.status_code == 404
    assert "não_existe" in response.text


def test_an_empty_basis_is_refused_by_the_schema(client: TestClient, db_session: Session) -> None:
    """The basis has no default on purpose: defaulting to "whatever the
    reference happens to have" would let the catalogue's recording habits choose
    the question without the reader ever seeing it chosen."""
    response = _post(client, _first_material_id(db_session), property_slugs=[])

    assert response.status_code == 422


def test_an_unknown_material_is_not_found(client: TestClient) -> None:
    response = _post(client, 999999)

    assert response.status_code == 404


def test_a_material_that_lacks_a_basis_property_is_excluded_with_the_reason(
    client: TestClient, db_session: Session
) -> None:
    """The shorter list *and* the reason it is shorter."""
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    db_session.add(Material(name="Sem propriedade alguma", class_id=klass.id, keywords=[]))
    db_session.flush()

    body = _post(client, _first_material_id(db_session)).json()

    excluded = {e["name"]: e for e in body["excluded"]}
    assert "Sem propriedade alguma" in excluded
    assert set(excluded["Sem propriedade alguma"]["missing_slugs"]) == set(BASIS)
    assert excluded["Sem propriedade alguma"]["missing_labels"]


def test_another_persons_record_is_neither_neighbour_nor_exclusion(
    client: TestClient, login_as, db_session: Session, other_user: User
) -> None:
    """Appearing in `excluded` would leak it just as surely as appearing in the
    results: the name is the leak, whichever list carries it."""
    klass = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
    )
    db_session.add(
        Material(
            name="Liga privada de Bruno",
            class_id=klass.id,
            keywords=[],
            owner_id=other_user.id,
        )
    )
    db_session.flush()

    body = _post(client, _first_material_id(db_session)).json()

    assert "Liga privada de Bruno" not in response_text(body)


def test_my_own_record_does_take_part_in_my_own_search(
    client: TestClient, db_session: Session
) -> None:
    """The other direction, which a leak test cannot see (the lesson of D-62)."""
    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    created = client.post(
        "/api/materials",
        json={
            "name": "Minha liga semelhante",
            "class_id": class_id,
            "is_own_record": True,
            "values": [
                {
                    "property_slug": "densidade",
                    "kind": "scalar",
                    "value": 2700.0,
                    "unit": "kg/m**3",
                },
                {"property_slug": "modulo_young", "kind": "scalar", "value": 70.0, "unit": "GPa"},
            ],
        },
    )
    assert created.status_code == 201, created.text

    body = _post(client, _first_material_id(db_session)).json()

    names = [n["name"] for n in body["neighbours"]]
    assert "Minha liga semelhante" in names
    assert next(n for n in body["neighbours"] if n["name"] == "Minha liga semelhante")[
        "is_own_record"
    ]


def response_text(body: dict) -> str:
    """The whole answer as one string, so a leak anywhere in it is caught."""
    import json

    return json.dumps(body, ensure_ascii=False)
