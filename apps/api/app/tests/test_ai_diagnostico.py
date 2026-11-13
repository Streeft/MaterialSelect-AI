"""The AI diagnosis (D-228): ``GET /api/ai/status`` says what is configured and
``POST /api/ai/diagnostico`` tries it — one small JSON, one embedding of one
word and, when configured, one web search — and reports each in PT-BR.

No test reaches the network: the provider, the embedding client and the web
search are fakes. The key never appears in any answer — only the host.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.model_base import ModelProviderBase
from app.ai.provider import AIUnavailableError
from app.integrations import gemini_search
from app.integrations.errors import ExternalUnavailableError
from app.knowledge.embeddings import EmbeddingClient, EmbeddingHttpError
from app.models.user import User
from app.services import ai_service

GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai"
SECRET = "AIzaSy-chave-secreta-de-teste"


class _FakeModel(ModelProviderBase):
    name = "openai-compat"

    def __init__(self, answer: dict | None = None, error: Exception | None = None) -> None:
        self.answer = answer if answer is not None else {"ok": True, "palavra": "material"}
        self.error = error
        self.calls = 0

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.answer


@pytest.fixture()
def gemini_settings(monkeypatch: pytest.MonkeyPatch):
    s = ai_service.default_settings
    monkeypatch.setattr(s, "ai_provider", "openai-compat")
    monkeypatch.setattr(s, "ai_base_url", GEMINI)
    monkeypatch.setattr(s, "ai_api_key", SECRET)
    monkeypatch.setattr(s, "ai_model", "gemini-flash-lite-latest")
    monkeypatch.setattr(s, "knowledge_embedding_model", "gemini-embedding-001")
    monkeypatch.setattr(s, "knowledge_embedding_dimensions", 768)
    monkeypatch.setattr(s, "web_search_provider", "")
    return s


def _install(monkeypatch: pytest.MonkeyPatch, provider: _FakeModel) -> None:
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)


# --- status -------------------------------------------------------------------


class TestStatus:
    def test_mock_status_lists_the_capabilities(self, client: TestClient) -> None:
        body = client.get("/api/ai/status").json()
        keys = [c["key"] for c in body["capabilities"]]
        assert keys == ["texto", "json_estrito", "embeddings", "busca_web"]
        by_key = {c["key"]: c for c in body["capabilities"]}
        assert by_key["texto"]["configured"] is True
        assert body["model"] == ""
        assert body["host"] == ""

    def test_gemini_status_names_model_and_host_never_the_key(
        self, client: TestClient, gemini_settings
    ) -> None:
        response = client.get("/api/ai/status")
        body = response.json()
        assert body["provider"] == "openai-compat"
        assert body["model"] == "gemini-flash-lite-latest"
        assert body["host"] == "generativelanguage.googleapis.com"
        assert body["embedding_model"] == "gemini-embedding-001"
        by_key = {c["key"]: c for c in body["capabilities"]}
        assert by_key["json_estrito"]["configured"] is True
        assert by_key["embeddings"]["configured"] is True
        assert by_key["busca_web"]["configured"] is False
        assert "WEB_SEARCH_PROVIDER" in by_key["busca_web"]["detail"]
        assert SECRET not in response.text

    def test_object_mode_reports_strict_json_off(
        self, client: TestClient, gemini_settings, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(gemini_settings, "ai_json_mode", "object")
        body = client.get("/api/ai/status").json()
        by_key = {c["key"]: c for c in body["capabilities"]}
        assert by_key["json_estrito"]["configured"] is False
        assert "object" in by_key["json_estrito"]["detail"]


# --- diagnosis ------------------------------------------------------------------


def _diagnose(client: TestClient):
    return client.post("/api/ai/diagnostico")


class TestDiagnostico:
    def test_mock_passes_without_network(self, client: TestClient) -> None:
        response = _diagnose(client)
        assert response.status_code == 200, response.text
        body = response.json()
        checks = {c["key"]: c for c in body["checks"]}
        assert checks["json"]["status"] == "ok"
        assert checks["embeddings"]["status"] == "nao_configurado"
        assert checks["busca_web"]["status"] == "nao_configurado"
        assert body["ok"] is True

    def test_every_capability_ok(
        self, client: TestClient, gemini_settings, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = _FakeModel()
        _install(monkeypatch, provider)
        monkeypatch.setattr(EmbeddingClient, "embed", lambda self, texts: [[0.1] * 768])
        monkeypatch.setattr(gemini_settings, "web_search_provider", "gemini")
        monkeypatch.setattr(
            gemini_search,
            "search",
            lambda client, settings, query: gemini_search.WebSearchResult(
                hits=[gemini_search.WebHit(title="x", url="https://exemplo.org")],
                search_entry_point_html=None,
            ),
        )
        response = _diagnose(client)
        body = response.json()
        checks = {c["key"]: c for c in body["checks"]}
        assert [c["status"] for c in body["checks"]] == ["ok", "ok", "ok"]
        assert all(isinstance(c["latency_ms"], int) for c in body["checks"])
        assert "768" in checks["embeddings"]["message"]
        assert body["ok"] is True
        assert body["model"] == "gemini-flash-lite-latest"
        assert body["host"] == "generativelanguage.googleapis.com"
        assert provider.calls == 1
        assert SECRET not in response.text

    def test_errors_are_reported_per_capability_in_portuguese(
        self, client: TestClient, gemini_settings, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install(
            monkeypatch,
            _FakeModel(
                error=AIUnavailableError(
                    "A cota gratuita do Google acabou por agora; tente em 38 s."
                )
            ),
        )

        def _refuse(self, texts):
            raise EmbeddingHttpError(
                "recusado", status=429, retry_after=None, daily=True, detail="PerDay"
            )

        monkeypatch.setattr(EmbeddingClient, "embed", _refuse)
        monkeypatch.setattr(gemini_settings, "web_search_provider", "gemini")

        def _down(client, settings, query):
            raise ExternalUnavailableError("A busca na web do Google não respondeu.")

        monkeypatch.setattr(gemini_search, "search", _down)
        body = _diagnose(client).json()
        checks = {c["key"]: c for c in body["checks"]}
        assert body["ok"] is False
        assert checks["json"]["status"] == "erro"
        assert "cota gratuita" in checks["json"]["message"]
        assert checks["embeddings"]["status"] == "erro"
        assert "cota gratuita do Google" in checks["embeddings"]["message"]
        assert "amanhã" in checks["embeddings"]["message"]
        assert checks["busca_web"]["status"] == "erro"
        assert "não respondeu" in checks["busca_web"]["message"]

    def test_malformed_probe_answer_is_an_error(
        self, client: TestClient, gemini_settings, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install(monkeypatch, _FakeModel(answer={"resposta": "oi"}))
        monkeypatch.setattr(EmbeddingClient, "embed", lambda self, texts: [[0.1] * 768])
        body = _diagnose(client).json()
        checks = {c["key"]: c for c in body["checks"]}
        assert checks["json"]["status"] == "erro"
        assert "formato" in checks["json"]["message"]

    def test_layer_off_is_reported_not_raised(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(ai_service.default_settings, "ai_provider", "")
        body = _diagnose(client).json()
        checks = {c["key"]: c for c in body["checks"]}
        assert checks["json"]["status"] == "nao_configurado"
        assert "desativada" in checks["json"]["message"]
        assert body["ok"] is False

    def test_does_not_spend_the_daily_quota(
        self,
        client: TestClient,
        db_session: Session,
        test_user: User,
        gemini_settings,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from datetime import UTC, datetime

        from app.repositories.notebook_repository import NotebookRepository

        _install(monkeypatch, _FakeModel())
        monkeypatch.setattr(EmbeddingClient, "embed", lambda self, texts: [[0.1] * 768])
        monkeypatch.setattr(gemini_settings, "ai_daily_requests", 1)
        assert _diagnose(client).status_code == 200
        usage = NotebookRepository(db_session, test_user.id).usage(datetime.now(UTC).date())
        assert usage is None or usage.requests == 0

    def test_has_its_own_low_counter(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(ai_service.default_settings, "ai_diagnostic_per_hour", 2)
        assert _diagnose(client).status_code == 200
        second = _diagnose(client)
        assert second.status_code == 200
        assert second.json()["remaining"] == 0
        third = _diagnose(client)
        assert third.status_code == 429
        assert "diagnóstico" in third.json()["detail"]

    def test_requires_a_signed_in_user(self, anon_client: TestClient) -> None:
        assert anon_client.post("/api/ai/diagnostico").status_code == 401
