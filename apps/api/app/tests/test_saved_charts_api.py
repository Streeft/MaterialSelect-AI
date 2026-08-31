"""Integration tests for the saved charts API."""

from __future__ import annotations


def test_create_and_get_saved_chart(client):
    payload = {"name": "Densidade x Módulo", "configuration": {"scale": "log", "xAxis": {}}}
    created = client.post("/api/saved-charts", json=payload).json()
    assert created["name"] == "Densidade x Módulo"
    assert created["configuration"] == {"scale": "log", "xAxis": {}}
    assert created["id"]
    assert created["created_at"]

    fetched = client.get(f"/api/saved-charts/{created['id']}").json()
    assert fetched["id"] == created["id"]
    assert fetched["configuration"] == payload["configuration"]


def test_list_omits_configuration(client):
    client.post("/api/saved-charts", json={"name": "A", "configuration": {"x": 1}})
    client.post("/api/saved-charts", json={"name": "B", "configuration": {"y": 2}})
    listing = client.get("/api/saved-charts").json()
    assert len(listing) == 2
    # Check that configuration is not in list response
    for item in listing:
        assert "configuration" not in item
        assert "id" in item
        assert "name" in item
        assert "created_at" in item


def test_cannot_see_another_projects_saved_chart(client, other_user, login_as):
    created = client.post(
        "/api/saved-charts", json={"name": "A", "configuration": {}}
    ).json()
    assert created["id"]

    with login_as(other_user):
        response = client.get(f"/api/saved-charts/{created['id']}")
        assert response.status_code == 404

    # Original user can still see it
    assert client.get(f"/api/saved-charts/{created['id']}").status_code == 200


def test_delete_saved_chart(client):
    created = client.post(
        "/api/saved-charts", json={"name": "A", "configuration": {}}
    ).json()
    assert client.get(f"/api/saved-charts/{created['id']}").status_code == 200

    response = client.delete(f"/api/saved-charts/{created['id']}")
    assert response.status_code == 204

    assert client.get(f"/api/saved-charts/{created['id']}").status_code == 404
