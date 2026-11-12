"""The palette's light search, ``GET /api/search`` (D-207).

The palette used to download the whole catalogue (plus processes, notebooks and
studies) the first time it opened and match in the browser, by plain
"contains": typing "aço" listed "Argamassa ... Traço 1:3" before any steel.
These tests pin the order the reader expects (name starts with the term >
whole word > word that starts with it > contains anywhere), accent and case
tolerance, the limit, the narrow payload, ownership and the login gate.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.quick_search import fold, relevance
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.notebook import Notebook
from app.models.user import User


@pytest.fixture()
def steels(db_session: Session, test_user: User, other_user: User) -> dict[str, int]:
    """Names chosen so each tier of the ranking has exactly one witness."""
    klass = MaterialClass(name="Classe da busca rápida", slug="classe-busca-rapida")
    db_session.add(klass)
    db_session.flush()
    rows = {
        "contains": Material(name="Argamassa Traço 1:3 qzx", class_id=klass.id, keywords=[]),
        "word_prefix": Material(name="Liga qzx açoforte", class_id=klass.id, keywords=[]),
        "whole_word": Material(name="Liga qzx de aço", class_id=klass.id, keywords=[]),
        "prefix": Material(name="Aço qzx 1020", class_id=klass.id, keywords=[]),
        "inactive": Material(name="Aço qzx retirado", class_id=klass.id, keywords=[]),
        "theirs": Material(
            name="Aço qzx do Bruno", class_id=klass.id, keywords=[], owner_id=other_user.id
        ),
        "mine": Material(
            name="Aço qzx da Ana", class_id=klass.id, keywords=[], owner_id=test_user.id
        ),
    }
    rows["inactive"].is_active = False
    for row in rows.values():
        db_session.add(row)
    db_session.commit()
    return {key: row.id for key, row in rows.items()}


def _names(client: TestClient, q: str, limit: int = 50) -> list[str]:
    response = client.get("/api/search", params={"q": q, "limit": limit})
    assert response.status_code == 200, response.text
    return [hit["name"] for hit in response.json()["items"] if hit["kind"] == "material"]


def test_prefix_beats_whole_word_beats_word_prefix_beats_contains(
    client: TestClient, steels: dict[str, int]
) -> None:
    names = [n for n in _names(client, "aço qzx") if "qzx" in n]
    assert names.index("Aço qzx 1020") < names.index("Liga qzx de aço")
    assert names.index("Liga qzx de aço") < names.index("Liga qzx açoforte")
    assert names.index("Liga qzx açoforte") < names.index("Argamassa Traço 1:3 qzx")


def test_aco_lists_steels_before_traco(client: TestClient, steels: dict[str, int]) -> None:
    """The audit's case: "aço" must not open on a mortar whose name ends in "Traço"."""
    names = _names(client, "aço")
    assert names, "a busca por aço tem de achar alguma coisa"
    assert fold(names[0]).startswith("aco")
    assert names.index("Aço qzx 1020") < names.index("Argamassa Traço 1:3 qzx")


def test_accents_and_case_are_tolerated(client: TestClient, steels: dict[str, int]) -> None:
    assert _names(client, "ACO QZX 1020")[:1] == ["Aço qzx 1020"]


def test_limit_is_applied_per_kind(client: TestClient, steels: dict[str, int]) -> None:
    response = client.get("/api/search", params={"q": "qzx", "limit": 2})
    hits = [h for h in response.json()["items"] if h["kind"] == "material"]
    assert len(hits) == 2


def test_limit_is_bounded(client: TestClient) -> None:
    assert client.get("/api/search", params={"q": "a", "limit": 500}).status_code == 422
    assert client.get("/api/search", params={"q": "a", "limit": 0}).status_code == 422


def test_payload_is_only_what_the_palette_shows(client: TestClient, steels: dict[str, int]) -> None:
    hit = client.get("/api/search", params={"q": "Aço qzx 1020"}).json()["items"][0]
    assert set(hit) == {"kind", "id", "name", "class_name", "slug"}
    assert hit == {
        "kind": "material",
        "id": steels["prefix"],
        "name": "Aço qzx 1020",
        "class_name": "Classe da busca rápida",
        "slug": None,
    }


def test_withdrawn_and_other_peoples_records_never_appear(
    client: TestClient, steels: dict[str, int]
) -> None:
    names = _names(client, "qzx")
    assert "Aço qzx retirado" not in names
    assert "Aço qzx do Bruno" not in names
    assert "Aço qzx da Ana" in names


def test_notebooks_are_the_readers_own(
    client: TestClient, db_session: Session, test_user: User, other_user: User
) -> None:
    db_session.add(Notebook(owner_id=test_user.id, title="Caderno qzx da Ana"))
    db_session.add(Notebook(owner_id=other_user.id, title="Caderno qzx do Bruno"))
    db_session.commit()
    hits = client.get("/api/search", params={"q": "caderno qzx"}).json()["items"]
    notebooks = [h["name"] for h in hits if h["kind"] == "notebook"]
    assert notebooks == ["Caderno qzx da Ana"]


def test_processes_carry_their_slug(client: TestClient) -> None:
    hits = client.get("/api/search", params={"q": "fundi"}).json()["items"]
    processes = [h for h in hits if h["kind"] == "process"]
    assert processes, "o seed tem processos de fundição"
    assert all(h["slug"] for h in processes)


def test_blank_query_returns_nothing(client: TestClient) -> None:
    response = client.get("/api/search", params={"q": "   "})
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_requires_login(anon_client: TestClient) -> None:
    assert anon_client.get("/api/search", params={"q": "aço"}).status_code == 401


def test_requires_access(client_without_subscription: TestClient) -> None:
    assert client_without_subscription.get("/api/search", params={"q": "aço"}).status_code in (
        402,
        403,
    )


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Aço 1020", 4),
        ("Liga de aço", 3),
        ("Liga açoforte", 2),
        ("Argamassa Traço", 1),
        ("Alumínio", None),
    ],
)
def test_relevance_tiers(name: str, expected: int | None) -> None:
    assert relevance("aco", name) == expected


def test_relevance_of_several_words_needs_every_word() -> None:
    assert relevance("aco inox", "Aço inoxidável 304") is not None
    assert relevance("aco titanio", "Aço inoxidável 304") is None
    # A word found only in the class still counts, at the lowest weight.
    assert relevance("aco metais", "Aço 1020", "Metais") is not None
