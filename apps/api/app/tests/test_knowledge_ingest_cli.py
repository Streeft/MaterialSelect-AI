"""O ponto de entrada de linha de comando — mesmo padrão de app/db/seed.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import settings
from app.knowledge.ingest import main


def _write_pdf(path: Path) -> None:
    from app.tests.test_knowledge_ingest import _pdf_bytes

    path.write_bytes(_pdf_bytes(["conteúdo de teste"]))


class TestCLI:
    def test_runs_ingestion_and_prints_a_summary(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        root = tmp_path / "cerebro"
        root.mkdir()
        _write_pdf(root / "doc.pdf")
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        main()

        out = capsys.readouterr().out
        assert "[ingest]" in out
        assert "1" in out  # 1 documento criado

    def test_exits_with_error_when_a_document_fails(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        root = tmp_path / "cerebro"
        root.mkdir()
        (root / "quebrado.pdf").write_bytes(b"nao e um pdf")
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code != 0

    def test_runs_targeted_ingestion_with_file_argument(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        root = tmp_path / "cerebro"
        root.mkdir()
        (root / "Links.md").write_text("https://matweb.com/\n", encoding="utf-8")
        (root / "manifesto.json").write_text(
            json.dumps({"documentos": [{"path": "Links.md", "titulo": "Links"}]}),
            encoding="utf-8",
        )
        _write_pdf(root / "outro.pdf")
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        main(["--file", "Links.md"])

        out = capsys.readouterr().out
        assert "[ingest]" in out
        assert "1 criados" in out

    def test_exits_with_error_on_validation_failure(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        root = tmp_path / "cerebro"
        root.mkdir()
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        with pytest.raises(SystemExit) as exc:
            main(["--file", "arquivo_inexistente.pdf"])
        assert exc.value.code == 1

        out = capsys.readouterr().out
        assert "[ingest] ERRO:" in out
        assert "não encontrado" in out
