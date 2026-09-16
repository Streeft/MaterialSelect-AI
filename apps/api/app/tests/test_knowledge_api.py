"""POST /api/knowledge/ingest — a mesma autorização de qualquer rota logada;
não existe papel de administrador neste projeto (D-42)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings


@pytest.fixture
def corpus(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    from app.tests.test_knowledge_ingest import _pdf_bytes

    root = tmp_path / "cerebro"
    root.mkdir()
    (root / "doc.pdf").write_bytes(_pdf_bytes(["conteúdo"]))
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    return root


class TestIngestRoute:
    def test_requires_login(self, anon_client: TestClient, corpus: Path) -> None:
        response = anon_client.post("/api/knowledge/ingest", headers={"Cookie": ""})
        assert response.status_code in (401, 403)

    def test_runs_ingestion_and_reports_the_summary(self, client: TestClient, corpus: Path) -> None:
        response = client.post("/api/knowledge/ingest")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["created"] == 1
        assert body["total_chunks"] >= 1

    def test_disabled_layer_is_a_400(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "knowledge_dir", "")
        response = client.post("/api/knowledge/ingest")
        assert response.status_code == 400

    def test_concurrent_call_is_refused_with_409(self, client: TestClient, corpus: Path) -> None:
        from app.routers.knowledge import _ingest_lock

        # Simulate a run already in progress by holding the lock directly,
        # rather than actually racing two requests.
        _ingest_lock.acquire()
        try:
            response = client.post("/api/knowledge/ingest")
        finally:
            _ingest_lock.release()
        assert response.status_code == 409
        assert "andamento" in response.json()["detail"]

    def test_lock_is_released_after_a_normal_call(self, client: TestClient, corpus: Path) -> None:
        from app.routers.knowledge import _ingest_lock

        first = client.post("/api/knowledge/ingest")
        assert first.status_code == 200, first.text
        # A finally-block release, not a leak: the lock must be free again,
        # and a second sequential call must succeed normally.
        assert not _ingest_lock.locked()
        second = client.post("/api/knowledge/ingest")
        assert second.status_code == 200, second.text
