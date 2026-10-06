"""status: o retrato do Cérebro no banco, para um log público.

O comando é o que o workflow "Base de conhecimento (Cérebro)" imprime depois de
cada ação. Estes testes confirmam o que ele promete: as contagens (documentos
por status, trechos, vetores por modelo e dimensão, cobertura da identidade
configurada), "indisponível no SQLite" no lugar do tamanho, o caminho inteiro só
para o que o manifesto declara, o erro de um documento não declarado omitido, as
cópias órfãs e os arquivos que saíram do disco listados — e saída 1 só quando o
banco não pode ser lido.
"""

from __future__ import annotations

import hashlib
import json
import unicodedata
from pathlib import Path

import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import settings
from app.knowledge import status as status_module
from app.knowledge.embeddings import pack_vector
from app.knowledge.service import skipped_pages_note
from app.knowledge.status import (
    Coverage,
    KnowledgeStatus,
    collect,
    copies_of,
    format_status,
    main,
)
from app.models.enums import IngestStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
from app.repositories.knowledge_status_repository import DatabaseSize, DocumentRow

MODEL = "modelo-teste"
SECRET_TEXT = "texto do trecho que nunca vai ao log"


def _document(
    db: Session,
    path: str,
    texts: list[str],
    *,
    checksum: str | None = None,
    status: IngestStatus = IngestStatus.EXTRAIDO,
    error: str | None = None,
) -> tuple[KnowledgeDocument, list[KnowledgeChunk]]:
    document = KnowledgeDocument(
        path=path,
        title=path,
        checksum=checksum if checksum is not None else hashlib.sha256(path.encode()).hexdigest(),
        status=status,
        error=error,
        chunk_count=len(texts),
    )
    db.add(document)
    db.flush()
    chunks = []
    for ordinal, text in enumerate(texts):
        chunk = KnowledgeChunk(
            document_id=document.id,
            ordinal=ordinal,
            text=text,
            char_count=len(text),
            search_text=text,
        )
        db.add(chunk)
        chunks.append(chunk)
    db.flush()
    return document, chunks


def _embed(db: Session, chunk_id: int, *, model: str = MODEL, dims: int = 4) -> None:
    db.add(
        KnowledgeEmbedding(
            chunk_id=chunk_id,
            model=model,
            dimensions=dims,
            vector=pack_vector([1.0] + [0.0] * (dims - 1)),
        )
    )
    db.flush()


def _root(tmp_path: Path, declared: list[str], files: list[str]) -> Path:
    root = tmp_path / "Cérebro"
    root.mkdir()
    (root / "manifesto.json").write_text(
        json.dumps({"documentos": [{"path": p} for p in declared]}), encoding="utf-8"
    )
    for name in files:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"%PDF")
    return root


def _lines(db: Session, **kwargs) -> list[str]:
    return format_status(collect(db, **kwargs))


def _find(lines: list[str], start: str) -> str:
    matches = [line for line in lines if line.startswith(start)]
    assert matches, f"nenhuma linha começa com {start!r}:\n" + "\n".join(lines)
    return matches[0]


class TestCounts:
    def test_documents_chunks_and_vectors_by_identity(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "01-Bibliografia/a.pdf", ["abc", "defgh", "ij"])
        _document(db_session, "01-Bibliografia/b.pdf", [], status=IngestStatus.FALHOU)
        _embed(db_session, chunks[0].id, dims=4)
        _embed(db_session, chunks[1].id, dims=4)
        _embed(db_session, chunks[2].id, model="outro", dims=8)

        lines = _lines(db_session, model=MODEL, dimensions=4)

        assert _find(lines, "[status] documentos:") == (
            "[status] documentos: 2 (1 extraídos, 1 falharam, 0 pendentes, 0 ignorados)."
        )
        assert _find(lines, "[status] trechos:") == (
            "[status] trechos: 3, com 10 caracteres (média de 3 por trecho)."
        )
        assert _find(lines, "[status] vetores gravados:") == (
            "[status] vetores gravados: 3 — modelo-teste com 4 dimensões: 2; "
            "outro com 8 dimensões: 1."
        )
        assert _find(lines, "[status] cobertura") == (
            "[status] cobertura de modelo-teste (4 dimensões): 2 de 3 trechos com vetor; "
            "faltam 1 (33,3%)."
        )

    def test_another_size_of_the_same_model_is_pending(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "a.pdf", ["x", "y"])
        _embed(db_session, chunks[0].id, dims=4)
        _embed(db_session, chunks[1].id, dims=3072)

        status = collect(db_session, model=MODEL, dimensions=4)

        assert status.coverage == Coverage(MODEL, 4, 2, 1, 1)

    def test_dimension_zero_accepts_any_size_of_the_model(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "a.pdf", ["x", "y"])
        _embed(db_session, chunks[0].id, dims=4)
        _embed(db_session, chunks[1].id, dims=3072)

        lines = _lines(db_session, model=MODEL, dimensions=0)

        assert "(dimensão nativa do modelo): 2 de 2 trechos com vetor; faltam 0 (0,0%)" in (
            _find(lines, "[status] cobertura")
        )

    def test_without_a_model_pending_is_not_computed(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", ["x"])

        status = collect(db_session, model="", dimensions=0)

        assert status.coverage is None
        assert "pendências não calculadas" in _find(format_status(status), "[status] cobertura")

    def test_a_vector_without_its_chunk_is_not_counted(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", ["x"])
        # SQLite in the tests does not enforce the foreign key: an orphan row
        # like the ones a bulk delete leaves behind there.
        _embed(db_session, 999_999)

        status = collect(db_session, model=MODEL, dimensions=4)

        assert status.vector_groups == []
        assert _find(format_status(status), "[status] vetores gravados:") == (
            "[status] vetores gravados: 0."
        )

    def test_an_empty_base(self, db_session: Session) -> None:
        lines = _lines(db_session, model=MODEL, dimensions=768)

        assert _find(lines, "[status] documentos:").startswith("[status] documentos: 0 (")
        assert "faltam 0 (0,0%)" in _find(lines, "[status] cobertura")
        assert "[status] cadernos: 0 vetores." in lines


class TestNotebooks:
    def _status(self, coverage: Coverage | None) -> KnowledgeStatus:
        from app.repositories.knowledge_status_repository import VectorGroup

        return KnowledgeStatus(
            dialect="sqlite",
            documents=[],
            chunks=0,
            characters=0,
            vector_groups=[],
            notebook_groups=[VectorGroup(MODEL, 768, 5), VectorGroup(MODEL, 3072, 2)],
            coverage=coverage,
            size=None,
        )

    def test_vectors_of_another_size_are_called_out(self) -> None:
        line = _find(
            format_status(self._status(Coverage(MODEL, 768, 0, 0, 0))), "[status] cadernos:"
        )

        assert line.startswith(
            "[status] cadernos: 7 vetores — modelo-teste com 768 dimensões: 5; "
            "modelo-teste com 3072 dimensões: 2. 2 de outra identidade"
        )

    def test_nothing_is_called_out_without_an_identity(self) -> None:
        line = _find(format_status(self._status(None)), "[status] cadernos:")

        assert line.endswith("modelo-teste com 3072 dimensões: 2.")


class TestSize:
    def test_sqlite_says_it_cannot_tell(self, db_session: Session) -> None:
        lines = _lines(db_session, model="", dimensions=0)

        assert "[status] tamanho do banco: indisponível no SQLite." in lines

    def _status(self, size: DatabaseSize) -> KnowledgeStatus:
        return KnowledgeStatus(
            dialect="postgresql",
            documents=[],
            chunks=0,
            characters=0,
            vector_groups=[],
            notebook_groups=[],
            coverage=None,
            size=size,
        )

    def test_postgres_sizes_in_megabytes(self) -> None:
        mib = 1024 * 1024
        size = DatabaseSize(
            total_bytes=int(96.5 * mib),
            tables={"knowledge_chunk": 40 * mib, "knowledge_embedding": int(55.25 * mib)},
        )

        lines = format_status(self._status(size))

        line = _find(lines, "[status] tamanho do banco:")
        assert line.startswith("[status] tamanho do banco: 96,5 MB (referência: 0,5 GB")
        assert "knowledge_chunk 40,0 MB, knowledge_embedding 55,2 MB" in line
        assert not any(line.startswith("::warning::") for line in lines)

    def test_near_the_free_plan_warns(self) -> None:
        size = DatabaseSize(total_bytes=450 * 1024 * 1024, tables={})

        lines = format_status(self._status(size))

        assert any(line.startswith("::warning::[status] o banco ocupa 450,0 MB") for line in lines)


class TestPublicLog:
    def test_only_declared_paths_are_printed_whole(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        root = _root(
            tmp_path,
            declared=["01-Bibliografia/Callister.pdf", "Links.md"],
            files=["01-Bibliografia/Callister.pdf", "Links.md", "02-Curso/Trabalho do Aluno.pdf"],
        )
        _document(db_session, "01-Bibliografia/Callister.pdf", [SECRET_TEXT])
        _document(db_session, "Links.md", [SECRET_TEXT])
        undeclared, _ = _document(db_session, "02-Curso/Trabalho do Aluno.pdf", [SECRET_TEXT])

        lines = _lines(db_session, model="", dimensions=0, root=root)
        out = "\n".join(lines)

        assert "Trabalho do Aluno" not in out
        assert f"02-Curso/… sha256:{undeclared.checksum[:8]}" in out
        assert _find(lines, "[status] fora do manifesto:") == (
            "[status] fora do manifesto: 1 documentos na base (declarados: 2) — "
            "por pasta: 02-Curso (1)."
        )
        assert SECRET_TEXT not in out

    def test_an_nfd_manifest_path_still_counts_as_declared(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        name = "01-Bibliografia/Seleção.pdf"
        root = _root(tmp_path, declared=[unicodedata.normalize("NFD", name)], files=[name])
        _document(db_session, name, ["x"])

        lines = _lines(db_session, model="", dimensions=0, root=root)

        assert "[status] fora do manifesto: 0 (declarados: 1)." in lines

    def test_without_knowledge_dir_everything_is_redacted(self, db_session: Session) -> None:
        document, _ = _document(db_session, "01-Bibliografia/Callister.pdf", ["x"])

        lines = _lines(db_session, model="", dimensions=0, root=None)
        out = "\n".join(lines)

        assert "Callister" not in out
        assert f"01-Bibliografia/… sha256:{document.checksum[:8]}" in out
        assert any("KNOWLEDGE_DIR não definido" in line for line in lines)
        assert any("não conferidos" in line for line in lines)

    def test_an_unreadable_manifest_redacts_instead_of_failing(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        root = tmp_path / "Cérebro"
        root.mkdir()
        (root / "manifesto.json").write_text("{não é json", encoding="utf-8")
        _document(db_session, "01-Bibliografia/Callister.pdf", ["x"])

        lines = _lines(db_session, model="", dimensions=0, root=root)

        assert "Callister" not in "\n".join(lines)
        assert any(line.startswith("[status] manifesto: manifesto ilegível") for line in lines)

    def test_a_failed_document_shows_its_reason_only_when_declared(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        root = _root(tmp_path, declared=["01-Bibliografia/Livro.pdf"], files=[])
        _document(
            db_session,
            "01-Bibliografia/Livro.pdf",
            [],
            status=IngestStatus.FALHOU,
            error="PDF corrompido.",
        )
        _document(
            db_session,
            "02-Curso/Nome do Aluno.pdf",
            [],
            checksum="ab" * 32,
            status=IngestStatus.FALHOU,
            error="[Errno 2] No such file: '/x/02-Curso/Nome do Aluno.pdf'",
        )

        lines = _lines(db_session, model="", dimensions=0, root=root)
        out = "\n".join(lines)

        assert "[status] FALHOU 01-Bibliografia/Livro.pdf: PDF corrompido." in lines
        assert "Nome do Aluno" not in out
        assert (
            "[status] FALHOU 02-Curso/… sha256:abababab: motivo omitido (documento fora do "
            "manifesto: o texto do erro pode citar o caminho)."
        ) in lines

    def test_a_kept_previous_version_is_reported(self, db_session: Session, tmp_path: Path) -> None:
        root = _root(tmp_path, declared=["01-Bibliografia/Livro.pdf"], files=[])
        _document(
            db_session,
            "01-Bibliografia/Livro.pdf",
            ["a", "b"],
            error="A versão nova (sha256 0123456789ab) não pôde ser lida: vazio.",
        )

        lines = _lines(db_session, model="", dimensions=0, root=root)

        assert (
            "[status] VERSÃO ANTERIOR 01-Bibliografia/Livro.pdf (2 trechos mantidos): "
            "A versão nova (sha256 0123456789ab) não pôde ser lida: vazio."
        ) in lines

    def test_skipped_pages_have_their_own_label_and_count(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        # D-101: a book indexed with pages left out is not a "previous
        # version" — there is no other version. Its label says what it is.
        root = _root(tmp_path, declared=["01-Bibliografia/Livro.pdf"], files=[])
        note = skipped_pages_note(7, 400, {"LimitReachedError": 5, "error": 2})
        _document(db_session, "01-Bibliografia/Livro.pdf", ["a", "b"], error=note)
        _document(
            db_session,
            "02-Outros/segredo.pdf",
            ["c"],
            error=skipped_pages_note(2, 10, {"error": 2}),
        )

        lines = _lines(db_session, model="", dimensions=0, root=root)

        assert (
            f"[status] PÁGINAS IGNORADAS 01-Bibliografia/Livro.pdf (7 de 400 páginas de fora, "
            f"2 trechos): {note}"
        ) in lines
        # An undeclared document still has its counts printed — they quote
        # nothing — and its stored reason withheld.
        line = _find(lines, "[status] PÁGINAS IGNORADAS 02-Outros/")
        assert "(2 de 10 páginas de fora, 1 trechos)" in line and "segredo" not in line
        assert (
            "[status] páginas ignoradas: 2 documentos indexados com páginas de fora "
            "(9 páginas no total). Reextraia com `ingerir` + `arquivos` + `forcar` depois "
            "de corrigir a causa."
        ) in lines
        assert not any("VERSÃO ANTERIOR" in x for x in lines)

    def test_a_truncation_is_a_notice_not_a_previous_version(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        root = _root(tmp_path, declared=["a.pdf"], files=[])
        _document(
            db_session, "a.pdf", ["a"], error="Truncado em 2000 trechos; o documento rende mais."
        )

        lines = _lines(db_session, model="", dimensions=0, root=root)

        assert (
            "[status] AVISO a.pdf (1 trechos): Truncado em 2000 trechos; o documento rende mais."
            in lines
        )
        assert (
            "[status] páginas ignoradas: 0 documentos indexados com páginas de fora (0 páginas no total)."
            in lines
        )

    def test_a_kept_previous_version_with_skipped_pages_is_still_a_previous_version(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        # The kept note carries the old version's skipped-pages sentence, and
        # the count still reaches the summary.
        root = _root(tmp_path, declared=["a.pdf"], files=[])
        _document(
            db_session,
            "a.pdf",
            ["a"],
            error=(
                "A versão nova (sha256 0123456789ab) não pôde ser lida: x. Os trechos da "
                "versão anterior continuam na base. " + skipped_pages_note(3, 300, {"error": 3})
            ),
        )

        lines = _lines(db_session, model="", dimensions=0, root=root)

        assert _find(lines, "[status] VERSÃO ANTERIOR a.pdf (1 trechos mantidos)")
        assert _find(lines, "[status] páginas ignoradas: 1 documentos").startswith(
            "[status] páginas ignoradas: 1 documentos indexados com páginas de fora (3 páginas"
        )

    def test_a_long_error_is_cut(self, db_session: Session, tmp_path: Path) -> None:
        root = _root(tmp_path, declared=["a.pdf"], files=[])
        _document(db_session, "a.pdf", [], status=IngestStatus.FALHOU, error="x" * 400)

        line = _find(_lines(db_session, model="", dimensions=0, root=root), "[status] FALHOU")

        assert line.endswith("x…")
        assert len(line) < len("[status] FALHOU a.pdf: ") + 301


class TestOrphans:
    def test_a_copy_is_listed_against_the_declared_row(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        digest = "cd" * 32
        root = _root(
            tmp_path,
            declared=["03-Fichas/aco.pdf"],
            files=["03-Fichas/aco.pdf", "Fichas copia/aco.pdf"],
        )
        _document(db_session, "03-Fichas/aco.pdf", ["x"], checksum=digest)
        _document(db_session, "Fichas copia/aco.pdf", ["x"], checksum=digest)
        _document(db_session, "outro.pdf", ["y"], checksum="ef" * 32)

        status = collect(db_session, model="", dimensions=0, root=root)
        lines = format_status(status)

        assert [(o.path, k.path) for o, k in copies_of(status)] == [
            ("Fichas copia/aco.pdf", "03-Fichas/aco.pdf")
        ]
        assert _find(lines, "[status] cópias na base:").startswith("[status] cópias na base: 1 ")
        assert (
            "[status] ÓRFÃO Fichas copia/… sha256:cdcdcdcd: mesmo conteúdo de 03-Fichas/aco.pdf"
        ) in lines

    def test_without_a_declared_copy_the_first_sorted_is_kept(self) -> None:
        rows = [
            DocumentRow("b/x.pdf", "11" * 32, "EXTRAIDO", None, 1),
            DocumentRow("a/x.pdf", "11" * 32, "EXTRAIDO", None, 1),
            DocumentRow("c/sem.pdf", "", "FALHOU", "e", 0),
            DocumentRow("d/sem.pdf", "", "FALHOU", "e", 0),
        ]
        status = KnowledgeStatus(
            dialect="sqlite",
            documents=rows,
            chunks=0,
            characters=0,
            vector_groups=[],
            notebook_groups=[],
            coverage=None,
            size=None,
        )

        assert [(o.path, k.path) for o, k in copies_of(status)] == [("b/x.pdf", "a/x.pdf")]

    def test_without_a_declared_copy_the_extracted_one_is_kept(self) -> None:
        rows = [
            DocumentRow("a/x.pdf", "22" * 32, "FALHOU", "e", 0),
            DocumentRow("b/x.pdf", "22" * 32, "EXTRAIDO", None, 3),
        ]
        status = KnowledgeStatus(
            dialect="sqlite",
            documents=rows,
            chunks=0,
            characters=0,
            vector_groups=[],
            notebook_groups=[],
            coverage=None,
            size=None,
        )

        assert [(o.path, k.path) for o, k in copies_of(status)] == [("a/x.pdf", "b/x.pdf")]

    def test_a_row_whose_file_left_the_tree_is_listed(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        present_nfd = unicodedata.normalize("NFD", "01-Bibliografia/Seleção.pdf")
        root = _root(tmp_path, declared=[], files=["01-Bibliografia/Seleção.pdf"])
        _document(db_session, present_nfd, ["x"])
        gone, _ = _document(db_session, "02-Curso/apagado.pdf", ["y"])

        status = collect(db_session, model="", dimensions=0, root=root)
        lines = format_status(status)

        assert [row.path for row in status.missing_on_disk or []] == ["02-Curso/apagado.pdf"]
        assert _find(lines, "[status] fora do repositório:").startswith(
            "[status] fora do repositório: 1 documentos"
        )
        assert f"[status]   sem arquivo: 02-Curso/… sha256:{gone.checksum[:8]}" in lines

    def test_long_lists_are_capped(self, db_session: Session) -> None:
        for i in range(status_module.MAX_LISTED + 3):
            _document(db_session, f"pasta/{i:03}.pdf", [])

        lines = _lines(db_session, model="", dimensions=0)

        assert "[status]   … e mais 3 fora do manifesto." in lines


class TestCLI:
    @pytest.fixture(autouse=True)
    def _session(self, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(status_module, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(settings, "knowledge_dir", "")
        monkeypatch.setattr(settings, "knowledge_embedding_model", "")
        monkeypatch.setattr(settings, "knowledge_embedding_dimensions", 0)

    def test_prints_the_snapshot_with_the_identity_given(
        self, db_session: Session, capsys: pytest.CaptureFixture[str]
    ) -> None:
        _, chunks = _document(db_session, "a.pdf", ["x", "y"])
        _embed(db_session, chunks[0].id, model="gemini-embedding-001", dims=768)

        main(["--model", "gemini-embedding-001", "--dimensions", "768"])

        out = capsys.readouterr().out
        assert (
            "[status] cobertura de gemini-embedding-001 (768 dimensões): 1 de 2 trechos com "
            "vetor; faltam 1 (50,0%)."
        ) in out

    def test_defaults_to_the_configured_identity(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setattr(settings, "knowledge_embedding_model", "gemini-embedding-001")
        monkeypatch.setattr(settings, "knowledge_embedding_dimensions", 768)

        main()

        assert "cobertura de gemini-embedding-001 (768 dimensões)" in capsys.readouterr().out

    def test_ignores_the_test_runner_argv(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.setattr("sys.argv", ["pytest", "-k", "coisa"])

        main()

        assert "[status] documentos:" in capsys.readouterr().out

    def test_negative_dimensions_is_a_usage_error(self) -> None:
        with pytest.raises(SystemExit) as exit_info:
            main(["--dimensions", "-1"])
        assert exit_info.value.code == 2

    def test_missing_tables_exit_1(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.setattr(status_module, "knowledge_tables_present", lambda db: False)

        with pytest.raises(SystemExit) as exit_info:
            main()

        assert exit_info.value.code == 1
        assert "ação `migrar`" in capsys.readouterr().out

    def test_an_unreachable_database_exits_1_without_its_address(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        def unreachable(db: Session) -> bool:
            raise OperationalError(
                "SELECT 1", {}, Exception('connection to "ep-segredo.neon.tech" failed')
            )

        monkeypatch.setattr(status_module, "knowledge_tables_present", unreachable)

        with pytest.raises(SystemExit) as exit_info:
            main()

        out = capsys.readouterr().out
        assert exit_info.value.code == 1
        assert "::error::[status] não consegui ler o banco (OperationalError)" in out
        assert "ep-segredo" not in out
