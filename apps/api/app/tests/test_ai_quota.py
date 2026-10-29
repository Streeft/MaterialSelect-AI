"""The daily AI quota outside the notebooks (D-179).

``/ai/interpret``, ``/ai/explain`` and the laudo's narrative spend the same
model key the Cadernos do, so they count on the same per-user, per-day
``requests`` counter (``AIUsage``), stopping at ``ai_daily_requests``. The
simulated provider is never counted.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.model_base import ModelProviderBase
from app.models.user import User
from app.repositories.notebook_repository import NotebookRepository
from app.services import ai_service

STATEMENT = "Viga leve e rígida para uma estrutura aeroespacial."


class _RealLookingProvider(ModelProviderBase):
    """Not simulated, never leaves the machine: it answers nothing useful."""

    name = "modelo-de-teste"

    def __init__(self) -> None:
        self.calls = 0

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        self.calls += 1
        return {}


def _today():
    return datetime.now(UTC).date()


def _used(db: Session, user: User) -> int:
    usage = NotebookRepository(db, user.id).usage(_today())
    return usage.requests if usage is not None else 0


@pytest.fixture()
def real_provider(monkeypatch: pytest.MonkeyPatch) -> _RealLookingProvider:
    provider = _RealLookingProvider()
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 2)
    return provider


def _interpret(client: TestClient):
    return client.post("/api/ai/interpret", json={"statement": STATEMENT})


def _study_id(client: TestClient) -> int:
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Estudo da cota",
            "combinator": "AND",
            "constraints": [
                {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
            ],
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_interpret_within_the_quota_passes_and_is_counted(
    client: TestClient, db_session: Session, test_user: User, real_provider
) -> None:
    assert _interpret(client).status_code == 200
    assert _used(db_session, test_user) == 1


def test_ai_interpret_counts_against_the_daily_quota(client: TestClient, real_provider) -> None:
    assert _interpret(client).status_code == 200
    assert _interpret(client).status_code == 200
    response = _interpret(client)
    assert response.status_code == 429
    assert "consultas à IA de hoje" in response.json()["detail"]
    # Refused before the provider: the key is not spent.
    assert real_provider.calls == 2


def test_explain_counts_on_the_same_counter(client: TestClient, real_provider) -> None:
    study_id = _study_id(client)
    assert _interpret(client).status_code == 200
    assert client.post("/api/ai/explain", json={"study_id": study_id}).status_code == 200
    response = client.post("/api/ai/explain", json={"study_id": study_id})
    assert response.status_code == 429


def test_the_laudo_loses_its_narrative_not_the_file(
    client: TestClient, db_session: Session, test_user: User, real_provider
) -> None:
    study_id = _study_id(client)
    assert client.get(f"/api/exports/estudos/{study_id}/laudo.html").status_code == 200
    assert _used(db_session, test_user) == 1
    assert _interpret(client).status_code == 200
    response = client.get(f"/api/exports/estudos/{study_id}/laudo.html")
    assert response.status_code == 200
    assert "consultas à IA de hoje" in response.text
    assert real_provider.calls == 2


def test_counters_do_not_leak_between_users(
    client: TestClient, login_as, other_user: User, real_provider
) -> None:
    assert _interpret(client).status_code == 200
    assert _interpret(client).status_code == 200
    assert _interpret(client).status_code == 429
    with login_as(other_user):
        assert _interpret(client).status_code == 200


def test_the_simulated_provider_is_not_counted(
    client: TestClient, db_session: Session, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 1)
    for _ in range(3):
        assert _interpret(client).status_code == 200
    assert _used(db_session, test_user) == 0


def test_a_provider_failure_hands_the_unit_back(
    client: TestClient, db_session: Session, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ai.provider import AIUnavailableError

    class _Down(_RealLookingProvider):
        def _complete(self, system: str, user: str, schema: dict) -> dict:
            raise AIUnavailableError("fora do ar")

    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: _Down())
    assert _interpret(client).status_code == 503
    assert _used(db_session, test_user) == 0
