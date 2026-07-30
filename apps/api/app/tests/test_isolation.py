"""Guards the per-test transactional isolation itself.

These two tests exist because the isolation was once broken in a way no other
test could catch: a test whose *first* database statement was a write escaped
the rollback and leaked its rows into every test that ran afterwards. Every
existing test happened to read before writing, so the suite stayed green while
silently losing isolation.

They must stay adjacent and in this order: the second only means something
because the first wrote before it.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

LEAK_CANARY = "Canário de Isolamento"


def test_write_as_the_very_first_statement(client: TestClient) -> None:
    """Create a material without reading anything first."""
    response = client.post(
        "/api/materials",
        json={
            "name": LEAK_CANARY,
            "class_id": 1,
            "keywords": [],
            "values": [
                {
                    "property_slug": "densidade",
                    "kind": "scalar",
                    "value": 1234.0,
                    "unit": "kg/m**3",
                    "data_quality": "ESTIMADO",
                }
            ],
        },
    )
    assert response.status_code == 201, response.text


def test_the_previous_write_was_rolled_back(client: TestClient) -> None:
    names = [m["name"] for m in client.get("/api/materials").json()]
    assert LEAK_CANARY not in names, (
        "A escrita do teste anterior vazou: a transação por teste não está "
        "isolando (ver o tratamento de BEGIN do pysqlite em conftest.py)."
    )
    assert len(names) == 5  # the seeded demo set, untouched
