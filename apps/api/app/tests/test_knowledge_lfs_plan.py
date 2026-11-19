"""lfs_plan: o que o `ingerir` baixa do Git LFS — só o que o banco ainda não tem.

O comando roda antes do download, num log público. Estes testes confirmam o
contrato com o workflow: a lista de caminhos separada por NUL (um caminho pode
ter vírgula, espaço e acento), os oids distintos para a chave do cache, e uma
saída que só conta — nenhum nome de arquivo, nem num `--file` errado.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from app.config import settings
from app.knowledge.lfs_plan import main
from app.knowledge.service import KnowledgeService
from app.tests.test_knowledge_ingest import _pdf_bytes, _pointer_for, _to_pointer, _write


@pytest.fixture
def root(db_session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "cerebro"
    root.mkdir()
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    monkeypatch.setattr("app.knowledge.lfs_plan.SessionLocal", lambda: db_session)
    return root


def _run(tmp_path: Path, *argv: str) -> tuple[list[str], list[str]]:
    output, ids = tmp_path / "baixar.nul", tmp_path / "baixar.ids"
    main(["--output", str(output), "--ids", str(ids), *argv])
    paths = [p.decode("utf-8") for p in output.read_bytes().split(b"\0") if p]
    return paths, ids.read_text(encoding="ascii").split()


class TestPlanCli:
    def test_lists_what_to_fetch_and_prints_only_counts(
        self, db_session, root: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        indexed = _write(root, "Livro indexado.pdf", ["Já está na base."])
        KnowledgeService(db_session).ingest()
        _to_pointer(indexed)
        new = _pdf_bytes(["Trabalho novo."])
        (root / "Pasta, com vírgula").mkdir()
        (root / "Pasta, com vírgula/Trabalho do Fulano.pdf").write_bytes(_pointer_for(new))
        (root / "Pasta, com vírgula/Trabalho do Fulano (1).pdf").write_bytes(_pointer_for(new))
        capsys.readouterr()

        paths, oids = _run(tmp_path)

        assert paths == ["Pasta, com vírgula/Trabalho do Fulano (1).pdf"]
        assert oids == [hashlib.sha256(new).hexdigest()]
        out = capsys.readouterr().out
        assert (
            "[lfs] 3 ponteiro(s) LFS entre os arquivos desta execução: 1 já indexado(s) com "
            "os mesmos bytes, 1 cópia(s) de outro caminho, 0 na lista de remoção"
        ) in out
        assert "[lfs] baixar 1 arquivo(s), 0,0 MB: 1 novo(s) na base, 0 com versão nova" in out
        assert "Fulano" not in out and "Livro" not in out and "vírgula" not in out

    def test_nothing_to_fetch_writes_empty_lists(
        self, db_session, root: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        indexed = _write(root, "livro.pdf", ["Já está na base."])
        KnowledgeService(db_session).ingest()
        _to_pointer(indexed)

        assert _run(tmp_path) == ([], [])
        assert "[lfs] nada a baixar do Git LFS." in capsys.readouterr().out

    def test_file_narrows_the_plan_like_the_ingestion(
        self, root: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        (root / "a.pdf").write_bytes(_pointer_for(_pdf_bytes(["a"])))
        (root / "b.pdf").write_bytes(_pointer_for(_pdf_bytes(["b"])))

        paths, _ = _run(tmp_path, "--file", "b.pdf")

        assert paths == ["b.pdf"]

    def test_a_bad_file_is_named_by_position(
        self, root: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        (root / "a.pdf").write_bytes(_pointer_for(_pdf_bytes(["a"])))

        with pytest.raises(SystemExit) as exc:
            _run(tmp_path, "--file", "a.pdf", "--file", "Trabalho do Fulano.pdf")

        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert out.strip() == ("[lfs] ERRO: --file nº 2: Arquivo não encontrado em KNOWLEDGE_DIR.")


class TestKnownFailures:
    """D-247: a pointer whose bytes already failed here is not downloaded again."""

    def _failed_pointer(self, db_session, root: Path) -> Path:
        scanned = _write(root, "digitalizado.pdf", ["", ""])
        (outcome,) = KnowledgeService(db_session).ingest().outcomes
        assert outcome.action == "falhou"
        _to_pointer(scanned)
        return scanned

    def test_plan_does_not_fetch_it_and_says_so(
        self, db_session, root: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        self._failed_pointer(db_session, root)
        capsys.readouterr()

        assert _run(tmp_path) == ([], [])
        out = capsys.readouterr().out
        assert "1 ponteiro(s) já falharam com estes mesmos bytes" in out
        assert "digitalizado" not in out

    def test_ingest_reports_it_failed_without_reading_it(
        self, db_session, root: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.tests.test_knowledge_ingest import _refuse_reading

        self._failed_pointer(db_session, root)
        _refuse_reading(monkeypatch)

        (outcome,) = KnowledgeService(db_session).ingest().outcomes

        assert outcome.action == "falhou"
        assert "não foi baixado de novo" in (outcome.detail or "")

    def test_force_fetches_it_again(self, db_session, root: Path, tmp_path: Path) -> None:
        scanned = self._failed_pointer(db_session, root)

        paths, _ = _run(tmp_path, "--force")

        assert paths == [scanned.name]

    def test_a_new_version_of_the_file_is_fetched(
        self, db_session, root: Path, tmp_path: Path
    ) -> None:
        scanned = self._failed_pointer(db_session, root)
        scanned.write_bytes(_pointer_for(_pdf_bytes(["Agora tem texto."])))

        paths, _ = _run(tmp_path)

        assert paths == [scanned.name]
