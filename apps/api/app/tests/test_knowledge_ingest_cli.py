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


# --- segurança da ingestão e log público (D-101) -----------------------------


@pytest.fixture
def cli_root(db_session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Uma raiz de corpus com a sessão de teste no lugar da de produção."""
    root = tmp_path / "cerebro"
    root.mkdir()
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)
    return root


def _pdf(path: Path, text: str) -> None:
    from app.tests.test_knowledge_ingest import _pdf_bytes

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_pdf_bytes([text]))


def _declare(root: Path, *paths: str) -> None:
    import json

    (root / "manifesto.json").write_text(
        json.dumps({"documentos": [{"path": p} for p in paths]}), encoding="utf-8"
    )


class TestSafetyExitCodes:
    def test_an_lfs_pointer_fails_the_run(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.tests.test_knowledge_ingest import LFS_POINTER

        (cli_root / "livro.pdf").write_bytes(LFS_POINTER)
        _declare(cli_root, "livro.pdf")

        with pytest.raises(SystemExit) as exc:
            main()

        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert "[ingest] FALHOU livro.pdf: É um ponteiro do Git LFS" in out
        assert "`git lfs pull`" in out

    def test_a_scanned_book_alone_is_a_warning(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        _pdf(cli_root / "01-Bibliografia/digitalizado.pdf", "")
        _pdf(cli_root / "bom.pdf", "Texto legível.")
        _declare(cli_root, "01-Bibliografia/digitalizado.pdf")

        main()  # não levanta SystemExit

        out = capsys.readouterr().out
        assert (
            "[ingest] SEM TEXTO 01-Bibliografia/digitalizado.pdf (provavelmente digitalizado)"
            in out
        )
        assert "1 falharam (1 sem texto)" in out
        assert "FALHOU" not in out

    def test_a_broken_file_still_fails_next_to_a_scanned_one(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        _pdf(cli_root / "digitalizado.pdf", "")
        (cli_root / "quebrado.pdf").write_bytes(b"nao e um pdf")

        with pytest.raises(SystemExit) as exc:
            main()

        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert "SEM TEXTO" in out and "FALHOU" in out


class TestPublicLog:
    def test_undeclared_paths_are_redacted_and_declared_ones_are_not(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        (cli_root / "01-Bibliografia").mkdir()
        (cli_root / "01-Bibliografia/declarado.pdf").write_bytes(b"nao e um pdf 1")
        (cli_root / "01-Bibliografia/segredo.pdf").write_bytes(b"nao e um pdf 2")
        _declare(cli_root, "01-Bibliografia/declarado.pdf")

        with pytest.raises(SystemExit):
            main()

        out = capsys.readouterr().out
        assert "[ingest] FALHOU 01-Bibliografia/declarado.pdf:" in out
        assert "[ingest] FALHOU 01-Bibliografia/… sha256:" in out
        assert "segredo" not in out

    def test_an_undeclared_path_does_not_leak_through_the_failure_detail(self) -> None:
        from app.knowledge.ingest import format_report
        from app.knowledge.service import DocumentOutcome, IngestReport

        root = "/home/runner/work/Cérebro"
        report = IngestReport(root=root, failed=1)
        report.outcomes.append(
            DocumentOutcome(
                path="01-Bibliografia/segredo.pdf",
                action="falhou",
                checksum="ab" * 32,
                detail=(
                    "Não foi possível ler o PDF: [Errno 2] No such file or directory: "
                    f"'{root}/01-Bibliografia/segredo.pdf'"
                ),
            )
        )

        (line,) = [line for line in format_report(report) if "FALHOU" in line]

        assert "segredo" not in line
        assert "[Errno 2] No such file or directory: '01-Bibliografia/… sha256:" in line

    def test_copies_are_counted_per_top_level_folder(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        for name in ("a.pdf", "b.pdf"):
            _pdf(cli_root / "03-Fichas" / name, f"Ficha {name}.")
            _pdf(cli_root / "Fichas copia/sub" / name, f"Ficha {name}.")
        _pdf(cli_root / "avulsa.pdf", "Ficha a.pdf.")
        _declare(cli_root, "03-Fichas/a.pdf", "03-Fichas/b.pdf")

        main()

        out = capsys.readouterr().out
        assert "2 criados" in out
        assert "3 cópias idênticas ignoradas" in out
        assert (
            "[ingest] CÓPIAS em Fichas copia/: 2 idênticas a arquivos indexados em outro caminho."
            in out
        )
        assert (
            "[ingest] CÓPIAS em (raiz): 1 idênticas a arquivos indexados em outro caminho." in out
        )
        assert "Fichas copia/sub" not in out
        assert "avulsa" not in out


class TestArguments:
    def test_no_embed_never_calls_a_configured_client(
        self, cli_root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.knowledge.service import KnowledgeService

        built: list[int] = []

        class _Client:
            model = "fake-embed"
            dimensions = 0

            def embed(self, texts: list[str]) -> list[list[float]]:
                raise AssertionError("--no-embed chamou o servidor de embeddings")

        monkeypatch.setattr(KnowledgeService, "_embeddings_configured", lambda self: True)
        monkeypatch.setattr(
            KnowledgeService, "_embedding_client", lambda self: built.append(1) or _Client()
        )
        _pdf(cli_root / "doc.pdf", "conteúdo de teste")

        main(["--no-embed"])

        assert built == []
        out = capsys.readouterr().out
        assert "0 embedados" in out
        assert "--no-embed" in out and "app.knowledge.embed" in out

    def test_main_without_argv_ignores_the_interpreter_arguments(
        self, cli_root: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # pytest's own argv must not be parsed as ours.
        monkeypatch.setattr("sys.argv", ["pytest", "-q", "--qualquer-coisa"])
        _pdf(cli_root / "doc.pdf", "conteúdo de teste")

        main()

    def test_an_unknown_flag_is_refused(self, cli_root: Path) -> None:
        with pytest.raises(SystemExit) as exc:
            main(["--nao-existe"])
        assert exc.value.code == 2

    def test_each_document_is_committed_on_its_own(
        self, db_session, cli_root: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        commits: list[int] = []
        monkeypatch.setattr(db_session, "commit", lambda: commits.append(1) or db_session.flush())
        for name in ("a", "b", "c"):
            _pdf(cli_root / f"{name}.pdf", f"Documento {name}.")

        main()

        # Um por documento, mais o do fim da execução.
        assert len(commits) == 4


class TestTargetedArguments:
    """``--file``/``--path`` e ``--force`` ao lado das garantias do D-101."""

    LINKS = "## Links\n\n- MatWeb: https://matweb.com/\n"

    def test_only_the_named_file_is_read_and_the_summary_says_so(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.tests.test_knowledge_ingest import LFS_POINTER

        (cli_root / "Links.md").write_text(self.LINKS, encoding="utf-8")
        # Os PDFs de um checkout sem LFS: uma execução direcionada nem os abre.
        (cli_root / "livro.pdf").write_bytes(LFS_POINTER)
        _declare(cli_root, "Links.md")

        main(["--file", "Links.md", "--no-embed"])  # não levanta SystemExit

        out = capsys.readouterr().out
        assert (
            "[ingest] 1 criados, 0 atualizados, 0 inalterados, 0 falharam (0 sem texto), "
            "0 ignorados pela lista de remoção, 0 cópias idênticas ignoradas, "
        ) in out
        assert "livro" not in out and "FALHOU" not in out

    def test_path_is_an_alias_and_the_option_repeats(
        self, db_session, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.repositories.knowledge_repository import KnowledgeRepository

        _pdf(cli_root / "a.pdf", "Documento a.")
        _pdf(cli_root / "b.pdf", "Documento b.")
        _pdf(cli_root / "c.pdf", "Documento c.")

        main(["--path", "a.pdf", "--file", "c.pdf", "--no-embed"])

        assert "2 criados" in capsys.readouterr().out
        paths = [d.path for d in KnowledgeRepository(db_session).list_documents()]
        assert paths == ["a.pdf", "c.pdf"]

    def test_force_reextracts_and_a_targeted_pointer_still_fails(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.tests.test_knowledge_ingest import LFS_POINTER

        (cli_root / "Links.md").write_text(self.LINKS, encoding="utf-8")
        (cli_root / "livro.pdf").write_bytes(LFS_POINTER)
        _declare(cli_root, "Links.md", "livro.pdf")
        main(["--file", "Links.md", "--no-embed"])
        capsys.readouterr()

        main(["--file", "Links.md", "--force", "--no-embed"])
        assert "0 criados, 1 atualizados, 0 inalterados" in capsys.readouterr().out

        with pytest.raises(SystemExit) as exc:
            main(["--file", "livro.pdf", "--force", "--no-embed"])
        assert exc.value.code == 1
        assert "[ingest] FALHOU livro.pdf: É um ponteiro do Git LFS" in capsys.readouterr().out

    def test_a_name_outside_the_root_is_an_error_before_anything_is_written(
        self, db_session, cli_root: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.repositories.knowledge_repository import KnowledgeRepository

        _pdf(tmp_path / "fora.pdf", "fora do Cérebro")
        _pdf(cli_root / "dentro.pdf", "dentro")

        with pytest.raises(SystemExit) as exc:
            main(["--file", "dentro.pdf", "--file", "../fora.pdf"])

        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert "[ingest] ERRO: --file nº 2: Caminho fora de KNOWLEDGE_DIR." in out
        assert "fora.pdf" not in out
        assert KnowledgeRepository(db_session).count_documents() == 0

    @pytest.mark.parametrize(
        ("name", "reason"),
        [
            ("Trabalho do Fulano.pdf", "Arquivo não encontrado em KNOWLEDGE_DIR"),
            ("notas do grupo.md", "Markdown não declarado no manifesto"),
            ("pasta/README.md", "Arquivo operacional não pode ser ingerido"),
            ("planilha do aluno.xlsx", "Extensão não suportada para extração"),
        ],
    )
    def test_a_bad_name_is_reported_by_position_never_printed(
        self, cli_root: Path, capsys: pytest.CaptureFixture[str], name: str, reason: str
    ) -> None:
        # O log é público: um nome digitado de memória pode ser justamente o
        # que a lista de remoção existe para não publicar.
        (cli_root / "pasta").mkdir()
        for existing in ("notas do grupo.md", "pasta/README.md", "planilha do aluno.xlsx"):
            (cli_root / existing).write_text("x", encoding="utf-8")
        _pdf(cli_root / "dentro.pdf", "dentro")

        with pytest.raises(SystemExit) as exc:
            main(["--file", "dentro.pdf", "--file", name, "--no-embed"])

        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert out.strip() == f"[ingest] ERRO: --file nº 2: {reason}."
        stem = name.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        assert stem not in out


# --- erro de banco que escapa do ponto de salvamento: nem SQL nem parâmetros --
#
# A primeira `ingerir` em produção (06/10) morreu com o traceback do driver, e
# o log público do Actions guardou ~1000 trechos de um livro licenciado nos
# `[parameters: …]`. O ponto de salvamento por documento registra o que o
# banco recusa; o que passa dele — a conexão perdida, o commit por documento,
# a escrita fora do ponto de salvamento — chega ao `main` de cada CLI, que só
# pode imprimir o nome da classe.

SENTINEL = "TEXTO-SECRETO-DO-LIVRO-licenciado"
_LEAKS = (SENTINEL, "INSERT", "[parameters", "[SQL", "Traceback")


def _escaped_error(kind: str = "operational"):
    from sqlalchemy.exc import IntegrityError, OperationalError

    statement = "INSERT INTO knowledge_chunk (text) VALUES (%(text)s)"
    params = {"text": SENTINEL, "search_text": SENTINEL}
    if kind == "operational":
        return OperationalError(
            statement,
            params,
            Exception("server closed the connection"),
            connection_invalidated=True,
        )
    return IntegrityError(statement, params, Exception(f"duplicate key ({SENTINEL})"))


def _assert_no_leak(captured: pytest.CaptureResult[str]) -> None:
    for leak in _LEAKS:
        assert leak not in captured.out
        assert leak not in captured.err


class TestDatabaseErrorsNeverReachTheLog:
    def test_a_lost_connection_prints_the_class_name_only(
        self,
        cli_root: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        from app.repositories.knowledge_repository import KnowledgeRepository as Repo

        def lost(self, document_id, chunks):  # type: ignore[no-untyped-def]
            raise _escaped_error("operational")

        monkeypatch.setattr(Repo, "replace_chunks", lost)
        _pdf(cli_root / "livro.pdf", "texto do livro")

        with pytest.raises(SystemExit) as exc:
            main(["--no-embed"])

        assert exc.value.code == 1
        captured = capsys.readouterr()
        _assert_no_leak(captured)
        assert "[ingest] ERRO" in captured.out and "(OperationalError)" in captured.out

    def test_a_refused_commit_outside_the_savepoint_prints_the_class_name_only(
        self,
        db_session,
        cli_root: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        # O commit por documento roda fora do ponto de salvamento: o que ele
        # recusa não é registrado por documento e sobe até o `main`.
        def refused() -> None:
            raise _escaped_error("integrity")

        monkeypatch.setattr(db_session, "commit", refused)
        _pdf(cli_root / "livro.pdf", "texto do livro")

        with pytest.raises(SystemExit) as exc:
            main(["--no-embed"])

        assert exc.value.code == 1
        captured = capsys.readouterr()
        _assert_no_leak(captured)
        assert "(IntegrityError)" in captured.out

    def test_the_embed_cli_prints_the_class_name_only(
        self, db_session, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from app.knowledge import embed as embed_module

        def run(*_args, **_kwargs):  # type: ignore[no-untyped-def]
            raise _escaped_error("operational")

        monkeypatch.setattr(embed_module, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(embed_module, "run", run)

        with pytest.raises(SystemExit) as exc:
            embed_module.main([])

        assert exc.value.code == 1
        captured = capsys.readouterr()
        _assert_no_leak(captured)
        assert "[embed]" in captured.out and "(OperationalError)" in captured.out

    def test_the_prune_cli_prints_the_class_name_only(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        from app.knowledge import prune as prune_module

        def prune(*_args, **_kwargs):  # type: ignore[no-untyped-def]
            raise _escaped_error("integrity")

        listing = tmp_path / "removidos.txt"
        listing.write_text("pasta/\n", encoding="utf-8")
        monkeypatch.setattr(prune_module, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(prune_module, "prune", prune)

        with pytest.raises(SystemExit) as exc:
            prune_module.main(["--list", str(listing), "--apply", "--redact"])

        assert exc.value.code == 1
        captured = capsys.readouterr()
        _assert_no_leak(captured)
        assert "[prune]" in captured.out and "nada foi removido" in captured.out

    def test_the_app_engine_hides_bound_parameters(self) -> None:
        # Defesa em profundidade para toda outra porta (log da API, outros
        # workflows): o motor da aplicação não põe valores na mensagem de erro.
        from sqlalchemy import create_engine, text
        from sqlalchemy.exc import OperationalError

        from app.db.base import engine_kwargs

        engine = create_engine("sqlite://", **engine_kwargs("sqlite://"))
        try:
            with engine.connect() as conn, pytest.raises(OperationalError) as caught:
                conn.execute(text("SELECT * FROM nao_existe WHERE x = :p"), {"p": SENTINEL})
        finally:
            engine.dispose()
        assert SENTINEL not in str(caught.value)
        assert "hide_parameters" in str(caught.value)
