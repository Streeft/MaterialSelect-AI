"""D-223: API docs only outside production, and a deep health check apart.

``/api/health`` is what Fly probes every few seconds: it must answer without
the database (a sleeping Neon would otherwise fail the machine). The database
is checked at ``/api/health/db``, which nothing polls on a schedule.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.config import Settings, settings
from app.db.base import get_db
from app.main import app, docs_routes
from app.repositories.health_repository import HealthRepository

# --- docs --------------------------------------------------------------------


def test_docs_are_on_by_default_outside_production():
    assert Settings(environment="development").docs_enabled is True
    assert Settings(environment="staging").docs_enabled is True


def test_docs_are_off_in_production_unless_forced():
    assert Settings(environment="production").docs_enabled is False
    assert Settings(environment="Production").docs_enabled is False
    assert Settings(environment="production", api_docs_enabled=True).docs_enabled is True
    assert Settings(environment="development", api_docs_enabled=False).docs_enabled is False


def test_an_app_built_without_docs_serves_none_of_the_three():
    closed = FastAPI(**docs_routes(False))

    @closed.get("/ping")
    def ping() -> dict[str, str]:
        return {"ok": "sim"}

    with TestClient(closed) as http:
        assert http.get("/docs").status_code == 404
        assert http.get("/redoc").status_code == 404
        assert http.get("/openapi.json").status_code == 404
        assert http.get("/ping").status_code == 200


def test_the_test_app_serves_its_schema_in_development(client):
    assert settings.docs_enabled
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/").json()["docs"] == "/docs"


def test_the_root_does_not_point_at_docs_that_are_off(client, monkeypatch):
    monkeypatch.setattr(settings, "api_docs_enabled", False)
    assert client.get("/").json()["docs"] == ""


# --- health --------------------------------------------------------------------


def test_liveness_never_touches_the_database(client):
    def _no_database():
        raise AssertionError("/api/health abriu uma sessão do banco")
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = _no_database
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_deep_health_answers_ok_with_the_database_up(client):
    resp = client.get("/api/health/db")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["latency_ms"] >= 0


def test_deep_health_answers_503_in_portuguese_when_the_database_is_down(client, monkeypatch):
    def _down(self) -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(HealthRepository, "ping", _down)
    resp = client.get("/api/health/db")
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert "banco de dados" in detail.lower()
    # The driver's message (host, user) stays in the log, not in the answer.
    assert "connection refused" not in detail


def test_deep_health_needs_no_login(anon_client):
    assert anon_client.get("/api/health/db").status_code == 200
