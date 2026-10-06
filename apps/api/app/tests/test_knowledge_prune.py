"""prune: tira da base de conhecimento o que a lista de remoção nomeia (D-100).

A ingestão só acrescenta; apagar um arquivo do Cérebro deixa documento, trechos
e embeddings no banco, e a busca continua citando. Estes testes confirmam o que
`app.knowledge.prune` promete: simula por padrão, apaga só com `--apply`, casa
caminho exato e prefixo de pasta, não confunde NFC com NFD, leva trechos e
embeddings junto e não encosta em documento que a lista não nomeia.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.errors import ValidationError
from app.knowledge import prune as prune_module
from app.knowledge.prune import find_matches, format_report, main, prune
from app.knowledge.removal import load_from_root, parse_removal_list
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding

COURSE = "02-Material-de-Curso-ENG02016/"
TOPIC_NFC = unicodedata.normalize("NFC", "Tópico 2 - Materiais de engenharia.pdf")
TOPIC_NFD = unicodedata.normalize("NFD", TOPIC_NFC)


def _document(db: Session, path: str, *, chunks: int = 2, embedded: int = 1) -> KnowledgeDocument:
    document = KnowledgeDocument(path=path, title=path, checksum="0" * 64, chunk_count=chunks)
    db.add(document)
    db.flush()
    for ordinal in range(chunks):
        chunk = KnowledgeChunk(document_id=document.id, ordinal=ordinal, text=f"trecho {ordinal}")
        db.add(chunk)
        db.flush()
        if ordinal < embedded:
            db.add(
                KnowledgeEmbedding(
                    chunk_id=chunk.id, model="teste", dimensions=2, vector=b"\x00" * 8
                )
            )
    db.flush()
    return document


def _paths(db: Session) -> list[str]:
    return sorted(db.execute(select(KnowledgeDocument.path)).scalars())


def _count(db: Session, model: type) -> int:
    return db.execute(select(func.count()).select_from(model)).scalar_one()


@pytest.fixture
def base(db_session: Session) -> Session:
    """Uma base com material de curso, uma cópia avulsa e bibliografia que fica."""
    _document(db_session, COURSE + "Topicos-de-Aula/Tópico 1.pdf", chunks=3, embedded=3)
    _document(db_session, COURSE + "Trabalhos-Entregues/Trabalho 2/relatorio.pdf")
    _document(db_session, TOPIC_NFC, chunks=2, embedded=0)
    _document(db_session, "01-Bibliografia/Ashby.pdf", chunks=4, embedded=4)
    # Um vizinho de nome parecido: prefixo sem a barra não pode levá-lo junto.
    _document(db_session, "02-Material-de-Curso-ENG02016-bis/outro.pdf")
    return db_session


LIST = f"""
# comentário
{COURSE}

{TOPIC_NFC}
"""


class TestParsing:
    def test_comments_and_blank_lines_are_ignored(self) -> None:
        removal = parse_removal_list(LIST)
        assert removal.prefixes == (COURSE,)
        assert removal.exact == frozenset({TOPIC_NFC})

    def test_prefix_matches_only_under_the_folder(self) -> None:
        removal = parse_removal_list(COURSE)
        assert removal.matches(COURSE + "a/b.pdf")
        assert not removal.matches("02-Material-de-Curso-ENG02016-bis/outro.pdf")

    def test_exact_line_matches_only_that_path(self) -> None:
        removal = parse_removal_list("Tópico 1.pdf")
        assert removal.matches("Tópico 1.pdf")
        assert not removal.matches("Tópico 10.pdf")
        assert not removal.matches("pasta/Tópico 1.pdf")

    def test_nfd_path_matches_nfc_entry_and_back(self) -> None:
        assert parse_removal_list(TOPIC_NFC).matches(TOPIC_NFD)
        assert parse_removal_list(TOPIC_NFD).matches(TOPIC_NFC)

    @pytest.mark.parametrize("line", ["/Cérebro/a.pdf", "..\\a.pdf", "../a.pdf", "a/../b.pdf"])
    def test_absolute_or_escaping_entries_are_refused(self, line: str) -> None:
        with pytest.raises(ValidationError, match="relativo"):
            parse_removal_list(line)

    def test_empty_text_is_an_empty_list(self) -> None:
        removal = parse_removal_list("# só comentário\n\n")
        assert removal.is_empty
        assert not removal.matches("qualquer.pdf")

    def test_missing_file_in_root_is_an_empty_list(self, tmp_path: Path) -> None:
        assert load_from_root(tmp_path).is_empty


class TestDryRun:
    def test_reports_matches_and_deletes_nothing(self, base: Session) -> None:
        before = (_paths(base), _count(base, KnowledgeChunk), _count(base, KnowledgeEmbedding))

        report = prune(base, parse_removal_list(LIST), apply=False)

        assert not report.applied
        assert [m.path for m in report.matched] == sorted(
            [
                COURSE + "Topicos-de-Aula/Tópico 1.pdf",
                COURSE + "Trabalhos-Entregues/Trabalho 2/relatorio.pdf",
                TOPIC_NFC,
            ]
        )
        assert (report.documents, report.chunks, report.embeddings) == (3, 7, 4)
        after = (_paths(base), _count(base, KnowledgeChunk), _count(base, KnowledgeEmbedding))
        assert after == before

    def test_output_says_nothing_was_deleted(self, base: Session) -> None:
        lines = format_report(prune(base, parse_removal_list(LIST), apply=False))
        assert any("seria removido" in line for line in lines)
        assert any(line.startswith("[prune] SIMULAÇÃO: 3 documentos, 7 trechos") for line in lines)


class TestApply:
    def test_deletes_documents_chunks_and_embeddings(self, base: Session) -> None:
        report = prune(base, parse_removal_list(LIST), apply=True)
        base.flush()

        assert report.applied
        assert (report.documents, report.chunks, report.embeddings) == (3, 7, 4)
        assert _paths(base) == [
            "01-Bibliografia/Ashby.pdf",
            "02-Material-de-Curso-ENG02016-bis/outro.pdf",
        ]
        # Nenhum órfão: só os trechos e vetores dos dois que ficaram.
        assert _count(base, KnowledgeChunk) == 4 + 2
        assert _count(base, KnowledgeEmbedding) == 4 + 1

    def test_unrelated_documents_keep_their_chunks_and_vectors(self, base: Session) -> None:
        ashby = base.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.path == "01-Bibliografia/Ashby.pdf")
        ).scalar_one()
        prune(base, parse_removal_list(LIST), apply=True)
        base.flush()

        chunks = base.execute(
            select(KnowledgeChunk).where(KnowledgeChunk.document_id == ashby.id)
        ).scalars()
        assert [c.ordinal for c in chunks] == [0, 1, 2, 3]

    def test_nfd_stored_path_is_deleted_by_nfc_entry(self, db_session: Session) -> None:
        _document(db_session, TOPIC_NFD)
        report = prune(db_session, parse_removal_list(TOPIC_NFC), apply=True)
        db_session.flush()
        assert report.documents == 1
        assert _paths(db_session) == []

    def test_second_run_finds_nothing(self, base: Session) -> None:
        removal = parse_removal_list(LIST)
        prune(base, removal, apply=True)
        base.flush()
        again = prune(base, removal, apply=True)
        assert again.documents == 0
        assert again.unmatched_entries == [COURSE, TOPIC_NFC]

    def test_output_states_the_totals_deleted(self, base: Session) -> None:
        lines = format_report(prune(base, parse_removal_list(LIST), apply=True))
        assert "[prune] REMOVIDOS: 3 documentos, 7 trechos, 4 embeddings." in lines
        assert "[prune] a base tinha 5 documentos; ficam 2." in lines


class TestEmptyAndUnmatched:
    def test_empty_list_matches_nothing_even_with_apply(self, base: Session) -> None:
        report = prune(base, parse_removal_list(""), apply=True)
        assert report.documents == 0
        assert len(_paths(base)) == 5

    def test_unmatched_entries_are_named(self, base: Session) -> None:
        report = find_matches(base, parse_removal_list(LIST + "\nnao-existe.pdf\n"))
        assert report.unmatched_entries == ["nao-existe.pdf"]

    def test_nothing_matched_shows_where_the_stored_paths_start(self, base: Session) -> None:
        lines = format_report(find_matches(base, parse_removal_list("Cérebro/")))
        hint = next(line for line in lines if "por pasta de primeiro nível" in line)
        assert "01-Bibliografia (1)" in hint
        assert "02-Material-de-Curso-ENG02016 (2)" in hint

    def test_every_run_lists_what_stays_and_the_histogram(self, base: Session) -> None:
        # I1: a lista que casou *alguma* coisa não pode esconder o resto. O que
        # fica é impresso sempre, caminho a caminho, e agrupado por pasta.
        lines = format_report(find_matches(base, parse_removal_list(LIST)))
        assert "[prune] ficaria: 01-Bibliografia/Ashby.pdf" in lines
        assert "[prune] ficaria: 02-Material-de-Curso-ENG02016-bis/outro.pdf" in lines
        assert not any(line.startswith("[prune] ficaria: " + COURSE) for line in lines)
        hint = next(line for line in lines if "por pasta de primeiro nível" in line)
        assert "01-Bibliografia (1)" in hint
        assert "02-Material-de-Curso-ENG02016-bis (1)" in hint

    def test_applied_run_says_fica(self, base: Session) -> None:
        lines = format_report(prune(base, parse_removal_list(LIST), apply=True))
        assert "[prune] fica: 01-Bibliografia/Ashby.pdf" in lines

    def test_folder_written_without_slash_is_warned(self, base: Session) -> None:
        report = find_matches(base, parse_removal_list("02-Material-de-Curso-ENG02016"))
        assert report.documents == 0
        assert report.folder_like_entries == {"02-Material-de-Curso-ENG02016": 2}
        lines = format_report(report)
        assert any(
            "ATENÇÃO" in line and '"02-Material-de-Curso-ENG02016/"' in line for line in lines
        )


DIGEST = "ab" * 32


class TestChecksum:
    """I1: casar pelo conteúdo, qualquer que seja o caminho gravado."""

    def test_checksum_matches_under_an_unrelated_path(self, db_session: Session) -> None:
        stray = _document(db_session, "_Duplicados-Para-Revisao/aula (1).pdf")
        stray.checksum = DIGEST
        _document(db_session, "01-Bibliografia/Ashby.pdf")
        db_session.flush()

        report = prune(db_session, parse_removal_list(f"{COURSE}\nsha256:{DIGEST}\n"), apply=True)
        db_session.flush()

        assert [(m.path, m.reason) for m in report.matched] == [
            ("_Duplicados-Para-Revisao/aula (1).pdf", "conteúdo (sha256)")
        ]
        assert (report.checksum_entries, report.checksums_matched) == (1, 1)
        assert _paths(db_session) == ["01-Bibliografia/Ashby.pdf"]
        lines = format_report(report)
        assert any("casou por conteúdo (sha256)" in line for line in lines)
        assert "[prune] conteúdo: 1 de 1 entradas sha256 casaram algum documento." in lines

    def test_path_match_is_reported_as_path(self, base: Session) -> None:
        report = find_matches(base, parse_removal_list(LIST))
        assert {m.reason for m in report.matched} == {"caminho"}

    def test_checksum_is_case_insensitive(self) -> None:
        removal = parse_removal_list(f"sha256:{DIGEST.upper()}")
        assert removal.matches_checksum(DIGEST)
        assert removal.matches_checksum(DIGEST.upper())
        assert not removal.matches_checksum("")
        assert not removal.matches_checksum(None)

    @pytest.mark.parametrize("line", ["sha256:abc", "sha256:" + "g" * 64, "sha256:"])
    def test_malformed_checksum_is_refused(self, line: str) -> None:
        with pytest.raises(ValidationError, match="64 dígitos"):
            parse_removal_list(line)

    def test_a_list_of_only_checksums_is_not_empty(self) -> None:
        removal = parse_removal_list(f"sha256:{DIGEST}")
        assert not removal.is_empty
        assert removal.entries == ()


STUDENT_FILE = "F.A.2B-ALUNA-ALUNO.pdf"
REDACT_LIST = f"""
{COURSE}
{TOPIC_NFC}
"""


@pytest.fixture
def named_base(db_session: Session) -> Session:
    """Uma base cujos nomes de arquivo o log público não pode repetir."""
    work = _document(db_session, COURSE + "Trabalhos-Entregues/Trabalho 2/" + STUDENT_FILE)
    work.checksum = "1a2b3c4d" + "e" * 56
    _document(db_session, COURSE + "Topicos-de-Aula/Tópico 1.pdf", chunks=3, embedded=3)
    root_copy = _document(db_session, TOPIC_NFC, chunks=2, embedded=0)
    root_copy.checksum = ""  # uma linha de falha de leitura não tem checksum
    _document(db_session, "01-Bibliografia/Ashby.pdf", chunks=4, embedded=4)
    _document(db_session, "Links.md", chunks=1, embedded=0)
    db_session.flush()
    return db_session


class TestRedact:
    """N1: o log do Actions é público; `--redact` não imprime nome de arquivo."""

    FILE_NAMES = (STUDENT_FILE, "Trabalho 2", "Tópico 1.pdf", TOPIC_NFC, "Ashby.pdf", "Links.md")

    def _lines(self, db: Session, *, apply: bool) -> list[str]:
        report = prune(db, parse_removal_list(REDACT_LIST), apply=apply)
        return format_report(report, redact_paths=True)

    @pytest.mark.parametrize("apply", [False, True])
    def test_no_file_name_is_printed(self, named_base: Session, apply: bool) -> None:
        out = "\n".join(self._lines(named_base, apply=apply))
        for name in self.FILE_NAMES:
            assert name not in out
        assert "ALUNA" not in out

    def test_counts_and_totals_are_kept(self, named_base: Session) -> None:
        lines = self._lines(named_base, apply=True)
        assert (
            f"[prune] removido: {COURSE}… sha256:1a2b3c4d "
            "(2 trechos, 1 embeddings; casou por caminho)"
        ) in lines
        assert (
            "[prune] removido: (raiz)/… sem checksum (2 trechos, 0 embeddings; casou por caminho)"
            in lines
        )
        assert "[prune] REMOVIDOS: 3 documentos, 7 trechos, 4 embeddings." in lines
        assert "[prune] a base tinha 5 documentos; ficam 2." in lines
        assert f"[prune] fica: 01-Bibliografia/… sha256:{'0' * 8}" in lines
        assert f"[prune] fica: (raiz)/… sha256:{'0' * 8}" in lines

    def test_histogram_counts_root_files_under_a_placeholder(self, named_base: Session) -> None:
        lines = self._lines(named_base, apply=False)
        hint = next(line for line in lines if "por pasta de primeiro nível" in line)
        assert "01-Bibliografia (1)" in hint
        assert "(raiz) (1)" in hint

    def test_without_the_flag_paths_are_full(self, named_base: Session) -> None:
        report = find_matches(named_base, parse_removal_list(REDACT_LIST))
        out = "\n".join(format_report(report))
        assert STUDENT_FILE in out
        assert "[prune] ficaria: Links.md" in out.splitlines()

    def test_cli_flag(
        self,
        named_base: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        listing = tmp_path / "removidos.txt"
        listing.write_text(REDACT_LIST, encoding="utf-8")

        out = TestCLI()._run(
            named_base, monkeypatch, capsys, ["--list", str(listing), "--apply", "--redact"]
        )

        assert "REMOVIDOS: 3 documentos, 7 trechos, 4 embeddings." in out
        for name in self.FILE_NAMES:
            assert name not in out
        assert _paths(named_base) == ["01-Bibliografia/Ashby.pdf", "Links.md"]

    def test_both_workflow_actions_redact(self) -> None:
        workflow = Path(__file__).resolve().parents[4] / ".github" / "workflows" / "admin-banco.yml"
        calls = [
            line.strip()
            for line in workflow.read_text(encoding="utf-8").splitlines()
            if "python -m app.knowledge.prune" in line
        ]
        assert len(calls) == 2
        assert all(call.endswith("--redact") for call in calls)


class TestEncoding:
    def test_bom_does_not_glue_to_the_first_entry(self, tmp_path: Path) -> None:
        listing = tmp_path / "removidos.txt"
        listing.write_bytes(f"{COURSE}\n".encode("utf-8-sig"))
        from app.knowledge.removal import load_removal_list

        assert load_removal_list(listing).prefixes == (COURSE,)

    def test_bom_in_text_is_stripped_too(self) -> None:
        assert parse_removal_list("\ufeff" + COURSE).prefixes == (COURSE,)


class TestCLI:
    def _run(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
        argv: list[str],
    ) -> str:
        # O CLI commita ou desfaz a própria sessão; aqui ela é a do teste, e o
        # rollback/commit não pode encerrar a transação externa do conftest.
        monkeypatch.setattr(db_session, "commit", db_session.flush)
        monkeypatch.setattr(db_session, "rollback", lambda: None)
        monkeypatch.setattr(prune_module, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(db_session, "close", lambda: None)
        main(argv)
        return capsys.readouterr().out

    def test_default_is_a_dry_run(
        self,
        base: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        listing = tmp_path / "removidos.txt"
        listing.write_text(LIST, encoding="utf-8")

        out = self._run(base, monkeypatch, capsys, ["--list", str(listing)])

        assert "SIMULAÇÃO: 3 documentos" in out
        assert len(_paths(base)) == 5

    def test_apply_deletes(
        self,
        base: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        listing = tmp_path / "removidos.txt"
        listing.write_text(LIST, encoding="utf-8")

        out = self._run(base, monkeypatch, capsys, ["--list", str(listing), "--apply"])

        assert "REMOVIDOS: 3 documentos, 7 trechos, 4 embeddings." in out
        assert len(_paths(base)) == 2

    def test_empty_list_does_nothing(
        self,
        base: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        listing = tmp_path / "removidos.txt"
        listing.write_text("# nada\n", encoding="utf-8")

        out = self._run(base, monkeypatch, capsys, ["--list", str(listing), "--apply"])

        assert "nada a fazer" in out
        assert len(_paths(base)) == 5

    def test_missing_list_is_an_error(self, tmp_path: Path) -> None:
        with pytest.raises(SystemExit) as exc:
            main(["--list", str(tmp_path / "nao-existe.txt")])
        assert exc.value.code != 0

    def test_missing_tables_say_to_migrate(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        # M6: um banco sem as tabelas do Cérebro não pode estourar com o
        # ProgrammingError cru; o operador precisa ler "rode migrar".
        from sqlalchemy import create_engine

        engine = create_engine("sqlite://")
        listing = tmp_path / "removidos.txt"
        listing.write_text(LIST, encoding="utf-8")
        monkeypatch.setattr(prune_module, "SessionLocal", lambda: Session(engine))

        with pytest.raises(SystemExit) as exc:
            main(["--list", str(listing)])

        assert exc.value.code == 1
        assert "migrar" in capsys.readouterr().out
        engine.dispose()


class TestRepositoryList:
    """A lista versionada no repositório casa o que ela diz casar."""

    LIST_PATH = Path(__file__).resolve().parents[4] / "Cérebro" / "removidos.txt"

    def test_versioned_list_parses_and_names_the_course_folders(self) -> None:
        removal = parse_removal_list(self.LIST_PATH.read_text(encoding="utf-8"))
        assert "02-Material-de-Curso-ENG02016/" in removal.prefixes
        assert unicodedata.normalize("NFC", "⚙Seleção de Materiais/") in removal.prefixes
        assert removal.matches(
            "02-Material-de-Curso-ENG02016/Topicos-de-Aula/Topico 5 - Seleção de processos "
            "na seleção de materiais.pdf"
        )
        assert not removal.matches("01-Bibliografia/Materiais e Design.pdf")
        assert not removal.matches("05-Artigos-Cientificos/qualquer.pdf")

    def test_versioned_list_carries_the_content_of_every_removed_file(self) -> None:
        removal = parse_removal_list(self.LIST_PATH.read_text(encoding="utf-8"))
        # 71 arquivos, 34 conteúdos distintos: as cópias idênticas coincidem.
        # Mais 1: a edição duplicada do Ashby em português (D-101).
        assert len(removal.checksums) == 35
        # O Tópico 1 sem "atualizado" só existia na raiz; o conteúdo dele
        # também está na lista, e não só o nome.
        assert removal.matches_checksum(
            "aefa5f437f5f88a918c08d5d891df67ffc606c305771666c670e2642fe9dff61"
        )

    def test_links_md_is_not_on_the_list(self) -> None:
        # D-100: o autor revisou o Links.md e decidiu mantê-lo e indexá-lo.
        removal = parse_removal_list(self.LIST_PATH.read_text(encoding="utf-8"))
        assert not removal.matches("Links.md")

    def test_the_duplicate_ashby_leaves_the_base_and_stays_in_history(self) -> None:
        # D-101: fica o scan de 2012; o sem data sai do RAG, pelo caminho e pelo
        # conteúdo (o oid do ponteiro LFS), mas não é material a apagar do
        # histórico — o autor quer o arquivo lá.
        removal = parse_removal_list(self.LIST_PATH.read_text(encoding="utf-8"))
        assert removal.matches(ASHBY_REMOVED)
        assert removal.matches_checksum(ASHBY_REMOVED_OID)
        assert ASHBY_REMOVED in removal.history_kept
        assert ASHBY_REMOVED not in removal.history_purge_entries
        # A cópia byte a byte da raiz saiu junto, pelo mesmo tipo de linha.
        assert removal.matches(ASHBY_ROOT_COPY)
        assert ASHBY_ROOT_COPY in removal.history_kept
        assert ASHBY_ROOT_COPY not in removal.history_purge_entries
        assert not removal.matches(ASHBY_KEPT)
        assert not removal.matches(
            "01-Bibliografia/Extratos-de-Capitulos/Selecao_de_Materiais_no_Projeto_Mecanico"
            " - Capítulo 3 Materiais de Engenharia e suas propriedades.pdf"
        )
        # A limpeza do histórico continua levando exatamente o que o D-100 tirou.
        assert len(removal.history_purge_entries) == 14
        assert set(removal.history_purge_entries) == set(removal.entries) - {
            ASHBY_REMOVED,
            ASHBY_ROOT_COPY,
        }


ASHBY_REMOVED = "01-Bibliografia/Selecao_de_Materiais_no_Projeto_Mecanico.pdf"
ASHBY_ROOT_COPY = "Selecao_de_Materiais_no_Projeto_Mecanico.pdf"
ASHBY_REMOVED_OID = "27882628ad20ab3e90dbf61f86d47990f6f94190229fad925fb7935acbea5b69"
ASHBY_KEPT = unicodedata.normalize(
    "NFC",
    "01-Bibliografia/Michael Ashby (Auth.)-Seleção De Materiais No Projeto Mecânico (2012).pdf",
)


class TestKeptInHistory:
    """`mantido-no-historico:` sai do banco e da ingestão, mas não do histórico."""

    def test_is_a_path_entry_for_matching(self) -> None:
        removal = parse_removal_list(
            f"mantido-no-historico:{ASHBY_REMOVED}\nmantido-no-historico: Duplicados/\n"
        )
        assert removal.matches(ASHBY_REMOVED)
        assert removal.matches("Duplicados/a.pdf")
        assert not removal.matches("01-Bibliografia/outro.pdf")
        assert removal.history_kept == frozenset({ASHBY_REMOVED, "Duplicados/"})
        assert removal.history_purge_entries == ()
        # Os relatórios do prune continuam vendo a entrada.
        assert set(removal.entries) == {ASHBY_REMOVED, "Duplicados/"}

    def test_plain_lines_are_still_purged(self) -> None:
        removal = parse_removal_list(f"{COURSE}\nmantido-no-historico:{TOPIC_NFD}\n")
        assert removal.history_purge_entries == (COURSE,)
        assert removal.matches(TOPIC_NFC)  # NFC dos dois lados, como toda linha

    def test_a_path_written_both_ways_is_purged(self) -> None:
        removal = parse_removal_list(f"mantido-no-historico:{TOPIC_NFC}\n{TOPIC_NFC}\n")
        assert removal.history_kept == frozenset()
        assert removal.history_purge_entries == (TOPIC_NFC,)

    @pytest.mark.parametrize(
        "line",
        ["mantido-no-historico:", "mantido-no-historico:/a.pdf", "mantido-no-historico:../a"],
    )
    def test_the_path_is_validated_like_any_other(self, line: str) -> None:
        with pytest.raises(ValidationError, match="relativo"):
            parse_removal_list(line)

    def test_prune_lists_and_deletes_it_by_path_and_by_content(self, db_session: Session) -> None:
        # A primeira `ingerir` deixou uma linha FALHOU para o livro; a cópia na
        # raiz casa pelo conteúdo, e uma linha sem checksum, pelo caminho.
        failed = _document(db_session, ASHBY_REMOVED, chunks=0, embedded=0)
        failed.checksum = ""
        copy = _document(db_session, "Selecao_de_Materiais_no_Projeto_Mecanico.pdf")
        copy.checksum = ASHBY_REMOVED_OID
        _document(db_session, ASHBY_KEPT, chunks=3, embedded=3)
        db_session.flush()
        removal = parse_removal_list(
            f"mantido-no-historico:{ASHBY_REMOVED}\nsha256:{ASHBY_REMOVED_OID}\n"
        )

        report = prune(db_session, removal, apply=False)
        assert {(m.path, m.reason) for m in report.matched} == {
            (ASHBY_REMOVED, "caminho"),
            ("Selecao_de_Materiais_no_Projeto_Mecanico.pdf", "conteúdo (sha256)"),
        }
        lines = format_report(report)
        assert any(ASHBY_REMOVED in line and "seria removido" in line for line in lines)
        assert report.unmatched_entries == []

        prune(db_session, removal, apply=True)
        db_session.flush()
        assert _paths(db_session) == [ASHBY_KEPT]


def _history_purge_script() -> str:
    """O bloco do passo 4 do docs/17, que converte a lista para o filter-repo."""
    guide = Path(__file__).resolve().parents[4] / "docs" / "17-limpeza-historico-cerebro.md"
    blocks = re.findall(r"```bash\n(.*?)```", guide.read_text(encoding="utf-8"), re.S)
    (script,) = [b for b in blocks if "> caminhos-para-remover.txt" in b]
    return script


@pytest.mark.skipif(
    any(shutil.which(tool) is None for tool in ("bash", "sed", "grep", "tr")),
    reason="o passo 4 do docs/17 é um pipeline de shell",
)
class TestHistoryPurgeConversion:
    """O shell do docs/17 produz exatamente `history_purge_entries` da lista real."""

    def test_guide_pipeline_matches_the_reader(self, tmp_path: Path) -> None:
        listing = TestRepositoryList.LIST_PATH
        # `git show HEAD:…` lê a lista do clone espelho; aqui, a da árvore.
        script = 'git() { cat "$LISTA"; }\n' + _history_purge_script()
        subprocess.run(
            ["bash", "-c", script],
            cwd=tmp_path,
            env={"LISTA": str(listing), "PATH": os.environ["PATH"], "LC_ALL": "C.UTF-8"},
            check=True,
            capture_output=True,
        )
        produced = (tmp_path / "caminhos-para-remover.txt").read_text(encoding="utf-8").splitlines()

        removal = parse_removal_list(listing.read_text(encoding="utf-8"))
        expected = {"Cérebro/" + entry for entry in removal.history_purge_entries}
        assert {unicodedata.normalize("NFC", p) for p in produced} == {
            unicodedata.normalize("NFC", p) for p in expected
        }
        assert len(produced) == len(expected) == 14
        assert not any("Selecao_de_Materiais_no_Projeto_Mecanico" in p for p in produced)
        assert not any(":" in p for p in produced)
