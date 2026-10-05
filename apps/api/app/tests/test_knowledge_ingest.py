"""Ingestion: cataloguing, extraction, and the idempotency that makes it safe.

The property under test throughout is that running ingestion twice is not the
same as ingesting twice — a second run over an unchanged corpus must do nothing
and duplicate nothing, because "atualize o Cérebro" has to be a sentence someone
can say without checking whether they already did.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import settings
from app.domain.errors import ValidationError
from app.knowledge.service import LFS_POINTER_DETAIL, KnowledgeService, checksum_of
from app.models.enums import DocumentKind, IngestStatus, SourceAuthority
from app.repositories.knowledge_repository import KnowledgeRepository


def _pdf_bytes(pages: list[str]) -> bytes:
    """Build a minimal, valid PDF carrying ``pages`` of Latin-1 text.

    Written by hand rather than with a library: the project takes on no
    PDF-*writing* dependency, and a fixture that needs one would be a dependency
    smuggled in through the test suite.
    """
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    page_ids: list[int] = []
    content_ids: list[int] = []
    for text in pages:
        escaped = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("latin-1", "replace")
        content_ids.append(add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)))

    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages_id = len(pages) + 3  # reserved below, after page objects

    for content_id in content_ids:
        page_ids.append(
            add(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (pages_id, font_id, content_id)
            )
        )

    kids = b" ".join(b"%d 0 R" % pid for pid in page_ids)
    pages_id = add(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids)))
    # Patch the /Parent references now that the real Pages id is known.
    for pid in page_ids:
        objects[pid - 1] = objects[pid - 1].replace(
            b"/Parent %d 0 R" % (len(pages) + 3), b"/Parent %d 0 R" % pages_id
        )
    root_id = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"

    xref_at = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        root_id,
        xref_at,
    )
    return bytes(out)


@pytest.fixture
def corpus(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A knowledge root pointed at pytest's tmp dir, never the real Cérebro."""
    root = tmp_path / "cerebro"
    root.mkdir()
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    return root


def _write(root: Path, name: str, pages: list[str]) -> Path:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_pdf_bytes(pages))
    return path


class TestDisabledLayer:
    def test_disabled_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "knowledge_dir", "")
        assert settings.knowledge_enabled is False

    def test_disabled_layer_says_which_knob_to_turn(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "knowledge_dir", "")
        with pytest.raises(ValidationError, match="KNOWLEDGE_DIR"):
            KnowledgeService(db_session).root()

    def test_missing_directory_is_a_configuration_error(
        self, db_session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "knowledge_dir", str(tmp_path / "nao-existe"))
        with pytest.raises(ValidationError, match="não é um diretório"):
            KnowledgeService(db_session).root()


class TestDiscovery:
    def test_finds_supported_files_recursively(self, db_session, corpus: Path) -> None:
        _write(corpus, "raiz.pdf", ["conteúdo"])
        _write(corpus, "sub/pasta/fundo.pdf", ["conteúdo"])
        (corpus / "leiame.txt").write_text("não é suportado", encoding="utf-8")

        found = [p.name for p in KnowledgeService(db_session).discover()]
        assert found == ["raiz.pdf", "fundo.pdf"]

    def test_order_is_stable(self, db_session, corpus: Path) -> None:
        # An unstable walk order would renumber ordinals every run and make an
        # unchanged corpus look like a changed one.
        for name in ("c.pdf", "a.pdf", "b.pdf"):
            _write(corpus, name, ["x"])
        service = KnowledgeService(db_session)
        assert service.discover() == service.discover()
        assert [p.name for p in service.discover()] == ["a.pdf", "b.pdf", "c.pdf"]


class TestSymlinks:
    """N4: a descoberta não segue link simbólico para fora da raiz."""

    @staticmethod
    def _link(link: Path, target: Path) -> None:
        try:
            link.symlink_to(target)
        except (OSError, NotImplementedError):  # Windows sem privilégio
            pytest.skip("o sistema não cria link simbólico")

    def test_a_linked_file_outside_the_root_is_not_ingested(
        self, db_session, corpus: Path, tmp_path: Path
    ) -> None:
        outside = tmp_path / "fora"
        outside.mkdir()
        _write(outside, "segredo.pdf", ["fora do Cérebro"])
        (outside / "segredo.md").write_text("fora do Cérebro", encoding="utf-8")
        _write(corpus, "livro.pdf", ["conteúdo"])
        self._link(corpus / "atalho.pdf", outside / "segredo.pdf")
        self._link(corpus / "atalho.md", outside / "segredo.md")
        _declare(corpus, {"path": "atalho.md", "titulo": "Atalho", "tipo": "LINK"})

        found = [p.name for p in KnowledgeService(db_session).discover()]

        assert found == ["livro.pdf"]

    def test_a_link_inside_the_root_is_not_followed_either(self, db_session, corpus: Path) -> None:
        # Um link para outro arquivo do próprio corpus só duplicaria o
        # documento com outro caminho.
        _write(corpus, "livro.pdf", ["conteúdo"])
        self._link(corpus / "copia.pdf", corpus / "livro.pdf")

        assert [p.name for p in KnowledgeService(db_session).discover()] == ["livro.pdf"]

    def test_a_linked_folder_outside_the_root_is_not_walked(
        self, db_session, corpus: Path, tmp_path: Path
    ) -> None:
        outside = tmp_path / "fora"
        _write(outside, "segredo.pdf", ["fora do Cérebro"])
        self._link(corpus / "pasta", outside)

        assert KnowledgeService(db_session).discover() == []


class TestRemovalList:
    """D-100: o que está em removidos.txt não volta ao RAG pela ingestão."""

    def test_listed_files_are_skipped_and_said_so(self, db_session, corpus: Path) -> None:
        _write(corpus, "01-Bibliografia/livro.pdf", ["O módulo de Young mede a rigidez."])
        _write(corpus, "02-Curso/Topicos/aula.pdf", ["Slide do professor."])
        _write(corpus, "Tópico 1.pdf", ["Cópia avulsa."])
        (corpus / "removidos.txt").write_text(
            "# material de curso\n02-Curso/\nTópico 1.pdf\n", encoding="utf-8"
        )

        report = KnowledgeService(db_session).ingest()

        assert (report.created, report.skipped) == (1, 2)
        skipped = sorted(o.path for o in report.outcomes if o.action == "ignorado")
        assert skipped == ["02-Curso/Topicos/aula.pdf", "Tópico 1.pdf"]
        assert all(
            "removidos.txt" in (o.detail or "") for o in report.outcomes if o.action == "ignorado"
        )
        repo = KnowledgeRepository(db_session)
        assert repo.get_by_path("02-Curso/Topicos/aula.pdf") is None
        assert repo.get_by_path("Tópico 1.pdf") is None
        assert repo.get_by_path("01-Bibliografia/livro.pdf") is not None

    def test_without_a_list_nothing_is_skipped(self, db_session, corpus: Path) -> None:
        _write(corpus, "02-Curso/aula.pdf", ["texto"])
        report = KnowledgeService(db_session).ingest()
        assert (report.created, report.skipped) == (1, 0)

    def test_a_listed_checksum_is_skipped_under_any_path(self, db_session, corpus: Path) -> None:
        # O banco foi povoado do disco do autor, não da árvore do git: uma
        # cópia numa pasta local de triagem tem outro caminho e os mesmos bytes.
        copy = _write(corpus, "_Duplicados-Para-Revisao/renomeado.pdf", ["Slide do professor."])
        _write(corpus, "01-Bibliografia/livro.pdf", ["O módulo de Young mede a rigidez."])
        (corpus / "removidos.txt").write_text(
            f"02-Curso/\nsha256:{checksum_of(copy).upper()}\n", encoding="utf-8"
        )

        report = KnowledgeService(db_session).ingest()

        assert (report.created, report.skipped) == (1, 1)
        (outcome,) = [o for o in report.outcomes if o.action == "ignorado"]
        assert outcome.path == "_Duplicados-Para-Revisao/renomeado.pdf"
        assert "conteúdo (sha256)" in (outcome.detail or "")
        repo = KnowledgeRepository(db_session)
        assert repo.get_by_path("_Duplicados-Para-Revisao/renomeado.pdf") is None

    def test_a_skipped_file_already_in_the_base_says_to_prune(
        self, db_session, corpus: Path
    ) -> None:
        _write(corpus, "02-Curso/aula.pdf", ["Slide do professor."])
        KnowledgeService(db_session).ingest()  # antes da lista existir
        (corpus / "removidos.txt").write_text("02-Curso/\n", encoding="utf-8")

        report = KnowledgeService(db_session).ingest()

        (outcome,) = report.outcomes
        assert outcome.action == "ignorado"
        assert "app.knowledge.prune" in (outcome.detail or "")

    def test_a_folder_written_without_its_slash_is_warned(self, db_session, corpus: Path) -> None:
        _write(corpus, "02-Curso/aula.pdf", ["Slide do professor."])
        (corpus / "removidos.txt").write_text("02-Curso\n", encoding="utf-8")

        report = KnowledgeService(db_session).ingest()

        assert report.skipped == 0
        assert len(report.removal_list_warnings) == 1
        assert '"02-Curso"' in report.removal_list_warnings[0]

    def test_a_bom_does_not_hide_the_first_entry(self, db_session, corpus: Path) -> None:
        _write(corpus, "02-Curso/aula.pdf", ["Slide do professor."])
        (corpus / "removidos.txt").write_bytes("02-Curso/\n".encode("utf-8-sig"))

        assert KnowledgeService(db_session).ingest().skipped == 1

    def test_cli_names_each_skipped_file_and_why(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch, capsys
    ) -> None:
        from app.knowledge import ingest as ingest_module

        _write(corpus, "02-Curso/aula.pdf", ["Slide do professor."])
        (corpus / "removidos.txt").write_text("02-Curso/\n", encoding="utf-8")
        monkeypatch.setattr(db_session, "commit", db_session.flush)
        monkeypatch.setattr(db_session, "close", lambda: None)
        monkeypatch.setattr(ingest_module, "SessionLocal", lambda: db_session)

        ingest_module.main()

        out = capsys.readouterr().out
        assert "1 ignorados pela lista de remoção" in out
        # O log do Actions é público: o que a lista tirou do RAG é nomeado pela
        # pasta e pelo começo do sha256, nunca pelo nome do arquivo.
        assert "[ingest] IGNORADO 02-Curso/… sha256:" in out
        assert ": Na lista de remoção" in out
        assert "aula.pdf" not in out


def _declare(root: Path, *entries: dict) -> None:
    (root / "manifesto.json").write_text(
        json.dumps({"documentos": list(entries)}), encoding="utf-8"
    )


LINKS_MD = """## Links

https://www.youtube.com/watch?v=g1BpNasM-os
https://ansys.synopsys.com/products/materials/granta-edupack
O EduPack inclui um banco de dados de materiais e informações de processo.
- [MatWeb](https://matweb.com/)
"""


class TestMarkdown:
    """D-100: o Cérebro indexa o Markdown que o manifesto declara, e só ele."""

    LINKS = {"path": "Links.md", "titulo": "Links indicados", "tipo": "LINK"}

    def test_declared_markdown_is_ingested_with_its_urls(self, db_session, corpus: Path) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)

        report = KnowledgeService(db_session).ingest()

        assert report.created == 1
        repo = KnowledgeRepository(db_session)
        document = repo.get_by_path("Links.md")
        assert document is not None
        assert document.status == IngestStatus.EXTRAIDO
        assert document.kind == DocumentKind.LINK
        assert document.chunk_count >= 1
        text = " ".join(c.text for c in repo.list_chunks(document.id))
        assert "https://www.youtube.com/watch?v=g1BpNasM-os" in text
        assert "O EduPack inclui um banco de dados de materiais" in text
        # A marcação sai, o rótulo e o endereço do link ficam.
        assert "MatWeb (https://matweb.com/)" in text
        assert "##" not in text

    def test_a_url_with_parentheses_is_kept_whole(self) -> None:
        from app.knowledge.readers import read_markdown

        text = read_markdown(
            b"- [A\xc3\xa7o](https://pt.wikipedia.org/wiki/A%C3%A7o_(liga)) e mais\n"
        ).pages[0]

        assert text == "Aço (https://pt.wikipedia.org/wiki/A%C3%A7o_(liga)) e mais"

    def test_a_line_starting_with_a_comparison_keeps_it(self) -> None:
        from app.knowledge.readers import read_markdown

        text = read_markdown(b">= 5 MPa\n> citado\n>\n").pages[0]

        assert text.split("\n\n") == [">= 5 MPa", "citado"]

    def test_undeclared_markdown_is_not_ingested(self, db_session, corpus: Path) -> None:
        (corpus / "notas.md").write_text("rascunho do autor", encoding="utf-8")
        _write(corpus, "livro.pdf", ["conteúdo"])

        report = KnowledgeService(db_session).ingest()

        assert [o.path for o in report.outcomes] == ["livro.pdf"]

    def test_readme_is_never_ingested_even_if_declared(self, db_session, corpus: Path) -> None:
        (corpus / "README.md").write_text("# Cérebro\n\nComo a pasta funciona.", encoding="utf-8")
        (corpus / "sub").mkdir()
        (corpus / "sub" / "readme.md").write_text("outro", encoding="utf-8")
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(
            corpus,
            self.LINKS,
            {"path": "README.md", "titulo": "Leia-me"},
            {"path": "sub/readme.md", "titulo": "Leia-me"},
        )
        (corpus / "removidos.txt").write_text("# nada\n", encoding="utf-8")

        paths = [p.relative_to(corpus).as_posix() for p in KnowledgeService(db_session).discover()]

        assert paths == ["Links.md"]

    def test_operational_files_are_not_candidates(self, db_session, corpus: Path) -> None:
        # removidos.txt e manifesto.json nem são .md; a exclusão é explícita
        # mesmo assim, para que uma extensão nova um dia não os traga junto.
        from app.knowledge.service import OPERATIONAL_FILES

        assert {"readme.md", "manifesto.json", "removidos.txt"} <= OPERATIONAL_FILES

    def test_a_listed_markdown_is_skipped(self, db_session, corpus: Path) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)
        (corpus / "removidos.txt").write_text("Links.md\n", encoding="utf-8")

        report = KnowledgeService(db_session).ingest()

        assert (report.created, report.skipped) == (0, 1)
        assert KnowledgeRepository(db_session).get_by_path("Links.md") is None

    def test_reingesting_markdown_is_idempotent(self, db_session, corpus: Path) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)
        service = KnowledgeService(db_session)
        first = service.ingest()

        second = service.ingest()

        assert (first.created, second.created, second.unchanged) == (1, 0, 1)
        assert KnowledgeRepository(db_session).count_documents() == 1


class TestVersionedCerebro:
    """O Links.md e o manifesto reais: o Links.md entra, o README não."""

    CEREBRO = Path(__file__).resolve().parents[4] / "Cérebro"

    def test_links_md_is_ingested_and_readme_is_not(self, db_session, corpus: Path) -> None:
        for name in ("Links.md", "README.md", "manifesto.json", "removidos.txt"):
            (corpus / name).write_bytes((self.CEREBRO / name).read_bytes())

        report = KnowledgeService(db_session).ingest()

        assert [(o.path, o.action) for o in report.outcomes] == [("Links.md", "criado")]
        document = KnowledgeRepository(db_session).get_by_path("Links.md")
        assert document is not None
        assert document.title == "Links indicados na disciplina ENG02016"
        assert document.kind == DocumentKind.LINK
        assert document.chunk_count >= 1


class TestIngest:
    def test_catalogues_and_extracts(self, db_session, corpus: Path) -> None:
        _write(corpus, "aula.pdf", ["O módulo de Young mede a rigidez do material."])

        report = KnowledgeService(db_session).ingest()

        assert report.created == 1
        assert report.total_chunks >= 1
        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        assert document is not None
        assert document.status == IngestStatus.EXTRAIDO
        assert document.page_count == 1
        assert "Young" in KnowledgeRepository(db_session).list_chunks(document.id)[0].text

    def test_chunks_keep_their_page_locator(self, db_session, corpus: Path) -> None:
        # Without this the citation chain (resposta -> trecho -> página) breaks
        # at its last link, and nothing the AI says can be checked.
        _write(corpus, "livro.pdf", ["Primeira página do capítulo.", "Segunda página."])
        KnowledgeService(db_session).ingest()

        repo = KnowledgeRepository(db_session)
        document = repo.get_by_path("livro.pdf")
        assert document is not None
        assert all(c.page_start is not None for c in repo.list_chunks(document.id))

    def test_path_is_relative_and_posix(self, db_session, corpus: Path) -> None:
        # Stored as POSIX so a manifest written on Windows matches a database
        # populated on CI.
        _write(corpus, "sub/pasta/doc.pdf", ["conteúdo técnico"])
        KnowledgeService(db_session).ingest()
        assert KnowledgeRepository(db_session).get_by_path("sub/pasta/doc.pdf") is not None

    def test_search_text_is_populated_for_lexical_retrieval(self, db_session, corpus: Path) -> None:
        # Sem isto a busca léxica (BM25) não tem o que comparar: toda consulta
        # voltaria vazia mesmo com o texto certo indexado.
        _write(corpus, "aula.pdf", ["O módulo de Young mede a rigidez do material."])
        KnowledgeService(db_session).ingest()

        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        assert document is not None
        chunk = KnowledgeRepository(db_session).list_chunks(document.id)[0]
        assert chunk.search_text != ""
        assert "modulo" in chunk.search_text  # dobrado: sem acento
        assert "young" in chunk.search_text


class TestIdempotency:
    def test_second_run_changes_nothing(self, db_session, corpus: Path) -> None:
        _write(corpus, "aula.pdf", ["Conteúdo estável sobre seleção de materiais."])
        service = KnowledgeService(db_session)

        first = service.ingest()
        repo = KnowledgeRepository(db_session)
        documents_after_first = repo.count_documents()
        chunks_after_first = repo.count_chunks()

        second = service.ingest()

        assert first.created == 1
        assert second.created == 0
        assert second.unchanged == 1
        assert repo.count_documents() == documents_after_first
        assert repo.count_chunks() == chunks_after_first

    def test_changed_file_replaces_its_chunks(self, db_session, corpus: Path) -> None:
        path = _write(corpus, "aula.pdf", ["Versão original curta."])
        service = KnowledgeService(db_session)
        service.ingest()
        repo = KnowledgeRepository(db_session)
        before = repo.count_chunks()

        path.write_bytes(_pdf_bytes(["Versão revisada, com texto bem diferente do anterior."]))
        report = service.ingest()

        document = repo.get_by_path("aula.pdf")
        assert document is not None
        assert report.updated == 1
        # Replaced, not appended: the old text must not linger in the index.
        assert repo.count_chunks() == document.chunk_count
        assert "original" not in " ".join(c.text for c in repo.list_chunks(document.id))
        assert before >= 1

    def test_force_reextracts_unchanged_file(self, db_session, corpus: Path) -> None:
        # For when the chunker changed rather than the corpus.
        _write(corpus, "aula.pdf", ["Conteúdo estável."])
        service = KnowledgeService(db_session)
        service.ingest()
        assert service.ingest(force=True).updated == 1

    def test_checksum_tracks_content(self, corpus: Path) -> None:
        first = _write(corpus, "a.pdf", ["mesmo conteúdo"])
        second = _write(corpus, "b.pdf", ["mesmo conteúdo"])
        third = _write(corpus, "c.pdf", ["outro conteúdo"])
        assert checksum_of(first) == checksum_of(second)
        assert checksum_of(first) != checksum_of(third)


class TestFailureIsPerDocument:
    def test_broken_file_does_not_stop_the_run(self, db_session, corpus: Path) -> None:
        (corpus / "quebrado.pdf").write_bytes(b"%PDF-1.4\nnao e um pdf de verdade")
        _write(corpus, "bom.pdf", ["Documento perfeitamente legível."])

        report = KnowledgeService(db_session).ingest()

        assert report.failed == 1
        assert report.created == 1
        repo = KnowledgeRepository(db_session)
        broken = repo.get_by_path("quebrado.pdf")
        assert broken is not None
        assert broken.status == IngestStatus.FALHOU
        assert broken.error  # says why, in words the operator can act on

    def test_scanned_pdf_is_recorded_not_silently_empty(self, db_session, corpus: Path) -> None:
        # A book scanned as images is a real, common case. It stays catalogued
        # and says why it contributes nothing, instead of looking indexed.
        _write(corpus, "digitalizado.pdf", ["", ""])
        report = KnowledgeService(db_session).ingest()

        document = KnowledgeRepository(db_session).get_by_path("digitalizado.pdf")
        assert report.failed == 1
        assert document is not None
        assert document.chunk_count == 0
        assert "digitalizado" in (document.error or "")

    def test_oversized_document_is_refused_with_its_size(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "knowledge_max_document_bytes", 10)
        _write(corpus, "grande.pdf", ["conteúdo qualquer"])
        report = KnowledgeService(db_session).ingest()
        assert report.failed == 1
        assert "limite" in (report.outcomes[0].detail or "")


class TestManifest:
    def test_undeclared_document_is_not_verified(self, db_session, corpus: Path) -> None:
        # "Nobody has said" is a state, not a guess. Inferring authority from a
        # filename would be right often enough to be trusted and wrong silently.
        _write(corpus, "misterioso.pdf", ["conteúdo sem procedência declarada"])
        KnowledgeService(db_session).ingest()

        document = KnowledgeRepository(db_session).get_by_path("misterioso.pdf")
        assert document is not None
        assert document.authority == SourceAuthority.NAO_VERIFICADA
        assert document.author is None
        assert document.title == "misterioso"

    def test_declared_provenance_is_applied(self, db_session, corpus: Path) -> None:
        _write(corpus, "ashby.pdf", ["Índices de desempenho."])
        (corpus / "manifesto.json").write_text(
            json.dumps(
                {
                    "documentos": [
                        {
                            "path": "ashby.pdf",
                            "titulo": "Seleção de Materiais no Projeto Mecânico",
                            "tipo": "LIVRO",
                            "autoridade": "CIENTIFICA",
                            "autor": "Michael F. Ashby",
                            "licenca": "Obra comercial — não redistribuída",
                            "versionado": False,
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        KnowledgeService(db_session).ingest()

        document = KnowledgeRepository(db_session).get_by_path("ashby.pdf")
        assert document is not None
        assert document.title == "Seleção de Materiais no Projeto Mecânico"
        assert document.kind == DocumentKind.LIVRO
        assert document.authority == SourceAuthority.CIENTIFICA
        assert document.author == "Michael F. Ashby"
        assert document.is_versioned is False

    def test_typo_in_manifest_fails_loudly(self, db_session, corpus: Path) -> None:
        # Falling back to the default would make a misdeclared document look
        # merely undeclared, and nobody would go looking for the typo.
        _write(corpus, "doc.pdf", ["conteúdo"])
        (corpus / "manifesto.json").write_text(
            json.dumps({"documentos": [{"path": "doc.pdf", "autoridade": "MUITO_BOA"}]}),
            encoding="utf-8",
        )
        with pytest.raises(ValidationError, match="autoridade"):
            KnowledgeService(db_session).ingest()

    def test_malformed_manifest_stops_the_run(self, db_session, corpus: Path) -> None:
        _write(corpus, "doc.pdf", ["conteúdo"])
        (corpus / "manifesto.json").write_text("{ isto não é json", encoding="utf-8")
        with pytest.raises(ValidationError, match="manifesto.json"):
            KnowledgeService(db_session).ingest()

    def test_provenance_updates_without_reextraction(self, db_session, corpus: Path) -> None:
        # Editing the manifest must take effect on the next run even though the
        # file's bytes did not change.
        _write(corpus, "doc.pdf", ["conteúdo"])
        service = KnowledgeService(db_session)
        service.ingest()

        (corpus / "manifesto.json").write_text(
            json.dumps(
                {"documentos": [{"path": "doc.pdf", "titulo": "Título correto", "tipo": "SLIDE"}]}
            ),
            encoding="utf-8",
        )
        report = service.ingest()

        document = KnowledgeRepository(db_session).get_by_path("doc.pdf")
        assert report.unchanged == 1  # no re-extraction
        assert document is not None
        assert document.title == "Título correto"
        assert document.kind == DocumentKind.SLIDE


class _FakeEmbeddingClient:
    """Determinístico, sem rede: cada texto vira um vetor de tamanho fixo."""

    def __init__(
        self,
        model: str = "fake-embed",
        calls: list[list[str]] | None = None,
        dimensions: int = 0,
    ) -> None:
        self.model = model
        self.calls = calls if calls is not None else []
        # 0 = "não envia dimensions", como o EmbeddingClient real; o vetor
        # devolvido tem 3 posições nesse caso, e ``dimensions`` quando > 0.
        self.dimensions = dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        size = self.dimensions or 3
        return [[1.0] + [0.0] * (size - 1) for _ in texts]


class TestEmbeddingSync:
    def test_new_document_gets_embeddings_when_configured(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["Conteúdo técnico sobre seleção de materiais."])
        service = KnowledgeService(db_session)
        fake = _FakeEmbeddingClient()
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)

        report = service.ingest()

        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        chunk = KnowledgeRepository(db_session).list_chunks(document.id)[0]
        assert chunk.embedding is not None
        assert chunk.embedding.model == "fake-embed"
        assert report.embedded_chunks >= 1

    def test_embeddings_are_never_generated_when_unconfigured(
        self, db_session, corpus: Path
    ) -> None:
        # Padrão do produto: sem KNOWLEDGE_EMBEDDING_* a ingestão continua
        # léxica-somente, sem tentar nenhuma chamada de rede.
        _write(corpus, "aula.pdf", ["conteúdo"])
        report = KnowledgeService(db_session).ingest()
        assert report.embedded_chunks == 0
        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        chunk = KnowledgeRepository(db_session).list_chunks(document.id)[0]
        assert chunk.embedding is None

    def test_unchanged_document_already_embedded_is_not_re_embedded(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["conteúdo estável"])
        service = KnowledgeService(db_session)
        calls: list[list[str]] = []
        fake = _FakeEmbeddingClient(calls=calls)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)

        service.ingest()
        calls.clear()
        second = service.ingest()  # documento inalterado, já embedado

        assert second.embedded_chunks == 0
        assert calls == []

    def test_previously_unconfigured_document_gets_embedded_once_turned_on(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Corpus já ingerido sem embeddings; ligar a configuração depois não
        # deve exigir --force para o backfill acontecer.
        _write(corpus, "aula.pdf", ["conteúdo"])
        service = KnowledgeService(db_session)
        service.ingest()  # sem embeddings configurados ainda

        fake = _FakeEmbeddingClient()
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)
        report = service.ingest()  # force=False

        assert report.unchanged == 1  # não reextraiu o texto
        assert report.embedded_chunks >= 1  # mas embedou

    def test_embedding_failure_is_recorded_not_raised(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.knowledge.embeddings import EmbeddingUnavailableError

        class _FailingClient:
            def embed(self, texts: list[str]) -> list[list[float]]:
                raise EmbeddingUnavailableError("servidor fora do ar")

        _write(corpus, "aula.pdf", ["conteúdo"])
        service = KnowledgeService(db_session)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FailingClient())

        report = service.ingest()  # não levanta

        assert report.embeddings_skipped_reason == "servidor fora do ar"
        assert report.failed == 0  # a extração léxica continua tendo sucesso

    def test_other_dimension_of_the_same_model_is_re_embedded(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Trocar KNOWLEDGE_EMBEDDING_DIMENSIONS com o mesmo modelo deixa vetores
        # de outro tamanho que a busca não compara; sem isto eles nunca seriam
        # refeitos, porque o modelo "confere".
        _write(corpus, "aula.pdf", ["conteúdo estável"])
        service = KnowledgeService(db_session)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient())
        service.ingest()  # 3 dimensões, sem pedir nenhuma
        repo = KnowledgeRepository(db_session)
        document = repo.get_by_path("aula.pdf")
        assert repo.list_chunks(document.id)[0].embedding.dimensions == 3

        calls: list[list[str]] = []
        smaller = _FakeEmbeddingClient(calls=calls, dimensions=2)
        monkeypatch.setattr(service, "_embedding_client", lambda: smaller)
        report = service.ingest()

        assert report.unchanged == 1
        assert report.embedded_chunks == document.chunk_count
        assert len(calls) == 1
        chunk = repo.list_chunks(document.id)[0]
        db_session.refresh(chunk.embedding)
        assert (chunk.embedding.model, chunk.embedding.dimensions) == ("fake-embed", 2)

        calls.clear()
        assert service.ingest().embedded_chunks == 0  # agora confere: nada a refazer
        assert calls == []

    def test_dimension_zero_accepts_any_stored_size(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["conteúdo estável"])
        service = KnowledgeService(db_session)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(
            service, "_embedding_client", lambda: _FakeEmbeddingClient(dimensions=2)
        )
        service.ingest()

        calls: list[list[str]] = []
        monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient(calls=calls))
        assert service.ingest().embedded_chunks == 0
        assert calls == []

    def test_no_embed_never_builds_a_configured_client(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["conteúdo técnico"])
        service = KnowledgeService(db_session)
        built: list[object] = []
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(
            service, "_embedding_client", lambda: built.append(1) or _FakeEmbeddingClient()
        )

        report = service.ingest(embed=False)

        assert (report.created, report.embedded_chunks, built) == (1, 0, [])
        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        assert KnowledgeRepository(db_session).list_chunks(document.id)[0].embedding is None


# --- segurança da ingestão (D-101) ------------------------------------------

#: Um ponteiro do Git LFS como o checkout sem `git lfs pull` o deixa no disco.
LFS_POINTER = (
    b"version https://git-lfs.github.com/spec/v1\n"
    b"oid sha256:" + b"a" * 64 + b"\n"
    b"size 104857600\n"
)


def _snapshot(db_session, path: str) -> dict:
    """Tudo o que uma falha não pode mexer num documento já indexado."""
    from app.models.knowledge import KnowledgeEmbedding

    repo = KnowledgeRepository(db_session)
    document = repo.get_by_path(path)
    assert document is not None
    db_session.refresh(document)
    return {
        "checksum": document.checksum,
        "status": document.status,
        "byte_size": document.byte_size,
        "page_count": document.page_count,
        "chunk_count": document.chunk_count,
        "texts": [c.text for c in repo.list_chunks(document.id)],
        "embeddings": db_session.query(KnowledgeEmbedding).count(),
    }


def _embedding_service(db_session, monkeypatch: pytest.MonkeyPatch) -> KnowledgeService:
    service = KnowledgeService(db_session)
    monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
    monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient())
    return service


class TestLfsPointer:
    def test_detects_a_pointer_and_nothing_else(self, corpus: Path) -> None:
        from app.knowledge.service import is_lfs_pointer

        pointer = corpus / "livro.pdf"
        pointer.write_bytes(LFS_POINTER)
        real = _write(corpus, "real.pdf", ["conteúdo"])
        # O prefixo sozinho num arquivo grande não é ponteiro: o spec cabe em
        # poucas linhas.
        big = corpus / "grande.pdf"
        big.write_bytes(LFS_POINTER + b" " * 2048)

        assert is_lfs_pointer(pointer)
        assert not is_lfs_pointer(real)
        assert not is_lfs_pointer(big)

    def test_a_new_pointer_creates_no_row(self, db_session, corpus: Path) -> None:
        (corpus / "livro.pdf").write_bytes(LFS_POINTER)

        report = KnowledgeService(db_session).ingest()

        (outcome,) = report.outcomes
        assert (outcome.action, report.failed) == ("falhou", 1)
        assert "`git lfs pull`" in (outcome.detail or "")
        assert "ponteiro do Git LFS" in (outcome.detail or "")
        assert KnowledgeRepository(db_session).count_documents() == 0

    def test_a_pointer_over_an_indexed_document_changes_nothing(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # O defeito que isto fecha: a falha era gravada por cima da linha boa
        # (FALHOU, checksum do ponteiro), e um checkout sem LFS esvaziava a base.
        path = _write(corpus, "livro.pdf", ["O módulo de Young mede a rigidez."])
        service = _embedding_service(db_session, monkeypatch)
        service.ingest()
        before = _snapshot(db_session, "livro.pdf")
        assert before["embeddings"] >= 1

        path.write_bytes(LFS_POINTER)
        report = service.ingest()

        assert [o.action for o in report.outcomes] == ["falhou"]
        assert _snapshot(db_session, "livro.pdf") == before
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document.error is None

    def test_identical_pointers_are_each_a_failure_not_a_copy(
        self, db_session, corpus: Path
    ) -> None:
        # Dois ponteiros do mesmo objeto têm os mesmos bytes sem serem o arquivo.
        (corpus / "a.pdf").write_bytes(LFS_POINTER)
        (corpus / "b.pdf").write_bytes(LFS_POINTER)

        report = KnowledgeService(db_session).ingest()

        assert (report.failed, report.duplicates) == (2, 0)


class TestKeepsThePreviousVersion:
    """Uma versão nova ilegível não custa a versão anterior, que era legível."""

    def test_unreadable_new_version_keeps_the_old_passages(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = _write(corpus, "livro.pdf", ["Versão boa, com texto extraível."])
        service = _embedding_service(db_session, monkeypatch)
        service.ingest()
        before = _snapshot(db_session, "livro.pdf")

        path.write_bytes(b"%PDF-1.4\nnao e um pdf de verdade")
        new_digest = checksum_of(path)
        report = service.ingest()

        (outcome,) = report.outcomes
        assert outcome.action == "falhou"
        assert outcome.kept_previous and not outcome.empty_text
        assert _snapshot(db_session, "livro.pdf") == before
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document.status == IngestStatus.EXTRAIDO
        assert document.error.startswith(
            f"A versão nova (sha256 {new_digest[:12]}) não pôde ser lida: "
        )
        assert document.error.endswith("Os trechos da versão anterior continuam na base.")
        assert len(document.error) <= 500

    def test_scanned_new_version_keeps_the_old_passages(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = _write(corpus, "livro.pdf", ["Versão boa, com texto extraível."])
        service = _embedding_service(db_session, monkeypatch)
        service.ingest()
        before = _snapshot(db_session, "livro.pdf")

        path.write_bytes(_pdf_bytes(["", ""]))
        (outcome,) = service.ingest().outcomes

        assert (outcome.action, outcome.empty_text, outcome.kept_previous) == (
            "falhou",
            True,
            True,
        )
        assert _snapshot(db_session, "livro.pdf") == before
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert "digitalizado" in document.error
        assert "versão anterior continuam na base" in document.error

    def test_the_next_readable_version_replaces_normally(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.models.knowledge import KnowledgeEmbedding

        path = _write(corpus, "livro.pdf", ["Versão original do capítulo."])
        calls: list[list[str]] = []
        service = KnowledgeService(db_session)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient(calls=calls))
        service.ingest()
        path.write_bytes(b"%PDF-1.4\nquebrado")
        service.ingest()

        # O checksum antigo ficou: a próxima execução tenta o arquivo de novo.
        path.write_bytes(_pdf_bytes(["Versão revisada, com outro texto."]))
        calls.clear()
        report = service.ingest()

        assert report.updated == 1
        repo = KnowledgeRepository(db_session)
        document = repo.get_by_path("livro.pdf")
        assert document.status == IngestStatus.EXTRAIDO
        assert document.error is None
        assert document.checksum == checksum_of(path)
        chunks = repo.list_chunks(document.id)
        text = " ".join(c.text for c in chunks)
        assert "revisada" in text and "original" not in text
        # Cada trecho novo ganhou vetor novo — nenhum herdou o do trecho antigo
        # pelo id que o SQLite reusa — e não sobra vetor órfão.
        assert calls == [[c.text for c in chunks]]
        assert report.embedded_chunks == len(chunks)
        assert repo.pending_chunk_ids("fake-embed", 0) == []
        assert db_session.query(KnowledgeEmbedding).count() == len(chunks)

    def test_a_previously_failed_document_is_recorded_as_before(
        self, db_session, corpus: Path
    ) -> None:
        path = corpus / "quebrado.pdf"
        path.write_bytes(b"%PDF-1.4\nprimeira versao quebrada")
        service = KnowledgeService(db_session)
        service.ingest()

        path.write_bytes(_pdf_bytes(["", ""]))
        (outcome,) = service.ingest().outcomes

        document = KnowledgeRepository(db_session).get_by_path("quebrado.pdf")
        assert (outcome.action, outcome.empty_text, outcome.kept_previous) == (
            "falhou",
            True,
            False,
        )
        assert document.status == IngestStatus.FALHOU
        assert document.chunk_count == 0
        assert document.checksum == checksum_of(path)

    def test_new_scanned_document_is_flagged(self, db_session, corpus: Path) -> None:
        _write(corpus, "digitalizado.pdf", ["", ""])
        (outcome,) = KnowledgeService(db_session).ingest().outcomes

        document = KnowledgeRepository(db_session).get_by_path("digitalizado.pdf")
        assert (outcome.action, outcome.empty_text, outcome.kept_previous) == (
            "falhou",
            True,
            False,
        )
        assert (document.status, document.chunk_count) == (IngestStatus.FALHOU, 0)

    def test_a_broken_new_document_is_not_flagged_as_scanned(
        self, db_session, corpus: Path
    ) -> None:
        (corpus / "quebrado.pdf").write_bytes(b"%PDF-1.4\nnao e um pdf")
        (outcome,) = KnowledgeService(db_session).ingest().outcomes
        assert (outcome.action, outcome.empty_text) == ("falhou", False)


class TestDuplicates:
    """O corpus tem pastas inteiras em duplicata: cada conteúdo entra uma vez."""

    SAME = ["O módulo de Young mede a rigidez."]

    def test_the_declared_path_wins_even_when_it_sorts_later(
        self, db_session, corpus: Path
    ) -> None:
        _write(corpus, "Aaa copia/livro.pdf", self.SAME)
        _write(corpus, "01-Bibliografia/livro.pdf", self.SAME)
        _write(corpus, "zz/livro.pdf", self.SAME)
        _declare(corpus, {"path": "zz/livro.pdf", "titulo": "Livro"})

        report = KnowledgeService(db_session).ingest()

        assert (report.created, report.skipped, report.duplicates) == (1, 2, 2)
        repo = KnowledgeRepository(db_session)
        assert [d.path for d in repo.list_documents()] == ["zz/livro.pdf"]
        copies = [o for o in report.outcomes if o.action == "ignorado"]
        assert {o.path for o in copies} == {"Aaa copia/livro.pdf", "01-Bibliografia/livro.pdf"}
        for outcome in copies:
            assert outcome.duplicate_of == "zz/livro.pdf"
            assert outcome.detail == ("Cópia byte a byte de zz/livro.pdf; indexada uma vez só.")

    def test_without_a_declaration_the_first_in_order_wins(self, db_session, corpus: Path) -> None:
        _write(corpus, "b/livro.pdf", self.SAME)
        _write(corpus, "a/livro.pdf", self.SAME)
        _write(corpus, "c/outro.pdf", ["Outro conteúdo."])

        report = KnowledgeService(db_session).ingest()

        assert (report.created, report.duplicates) == (2, 1)
        repo = KnowledgeRepository(db_session)
        assert [d.path for d in repo.list_documents()] == ["a/livro.pdf", "c/outro.pdf"]
        (copy,) = [o for o in report.outcomes if o.action == "ignorado"]
        assert (copy.path, copy.duplicate_of) == ("b/livro.pdf", "a/livro.pdf")

    def test_the_copy_is_embedded_once(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "a/livro.pdf", self.SAME)
        _write(corpus, "b/livro.pdf", self.SAME)
        service = KnowledgeService(db_session)
        calls: list[list[str]] = []
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient(calls=calls))

        report = service.ingest()

        assert len(calls) == 1
        assert report.embedded_chunks == report.total_chunks

    def test_the_removal_list_is_checked_first(self, db_session, corpus: Path) -> None:
        # Um arquivo na lista de remoção não é "a cópia indexada" de ninguém:
        # a cópia fora da lista entra, e o da lista sai pela lista.
        _write(corpus, "02-Curso/aula.pdf", self.SAME)
        _write(corpus, "livro.pdf", self.SAME)
        (corpus / "removidos.txt").write_text("02-Curso/\n", encoding="utf-8")

        report = KnowledgeService(db_session).ingest()

        assert (report.created, report.skipped, report.duplicates) == (1, 1, 0)
        removed = next(o for o in report.outcomes if o.path == "02-Curso/aula.pdf")
        assert "removidos.txt" in (removed.detail or "")
        assert removed.duplicate_of is None
        assert KnowledgeRepository(db_session).get_by_path("livro.pdf") is not None

    def test_the_indexed_copy_keeps_its_place_over_a_new_one(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "b/livro.pdf", self.SAME)
        service = KnowledgeService(db_session)
        calls: list[list[str]] = []
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient(calls=calls))
        service.ingest()
        _write(corpus, "a/livro.pdf", self.SAME)  # passa a ser a primeira na ordem
        calls.clear()

        report = service.ingest()

        # Sem declaração, a cópia já indexada fica: nada é extraído nem
        # vetorizado de novo, e nenhuma linha vira órfã.
        assert (report.created, report.duplicates) == (0, 1)
        assert calls == []
        copy = next(o for o in report.outcomes if o.path == "a/livro.pdf")
        assert (copy.action, copy.duplicate_of, copy.still_in_base) == (
            "ignorado",
            "b/livro.pdf",
            False,
        )
        kept = next(o for o in report.outcomes if o.path == "b/livro.pdf")
        assert kept.action == "inalterado"
        assert [d.path for d in KnowledgeRepository(db_session).list_documents()] == ["b/livro.pdf"]

    def test_a_copy_already_in_the_base_says_so(self, db_session, corpus: Path) -> None:
        _write(corpus, "b/livro.pdf", self.SAME)
        service = KnowledgeService(db_session)
        service.ingest()
        _write(corpus, "a/livro.pdf", self.SAME)
        _declare(corpus, {"path": "a/livro.pdf", "titulo": "Livro"})  # a declarada vence

        report = service.ingest()

        copy = next(o for o in report.outcomes if o.path == "b/livro.pdf")
        assert copy.action == "ignorado" and copy.still_in_base
        assert "ainda está na base; `status` lista esses órfãos" in (copy.detail or "")
        # Ingestão só acrescenta: a linha antiga fica, e é dita.
        assert KnowledgeRepository(db_session).get_by_path("b/livro.pdf") is not None


class TestPerDocumentCallback:
    def test_called_once_per_file_whatever_happened_to_it(self, db_session, corpus: Path) -> None:
        _write(corpus, "a.pdf", ["primeiro"])
        _write(corpus, "b.pdf", ["primeiro"])  # cópia
        _write(corpus, "02-Curso/c.pdf", ["removido"])
        (corpus / "d.pdf").write_bytes(LFS_POINTER)
        (corpus / "removidos.txt").write_text("02-Curso/\n", encoding="utf-8")
        seen: list[int] = []
        service = KnowledgeService(db_session)

        report = service.ingest(on_document=lambda: seen.append(len(seen)))

        assert len(seen) == len(report.outcomes) == 4


class TestTargetedIngest:
    """Ingestão direcionada de arquivos específicos (--file/--path)."""

    LINKS = {"path": "Links.md", "titulo": "Links indicados", "tipo": "LINK"}

    def test_targeted_ingest_only_processes_specified_file(self, db_session, corpus: Path) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)
        _write(corpus, "livro.pdf", ["conteúdo não solicitado"])

        service = KnowledgeService(db_session)
        report = service.ingest(paths=["Links.md"])

        assert report.created == 1
        repo = KnowledgeRepository(db_session)
        assert repo.get_by_path("Links.md") is not None
        assert repo.get_by_path("livro.pdf") is None

    def test_targeted_ingest_is_idempotent(self, db_session, corpus: Path) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)
        service = KnowledgeService(db_session)

        first = service.ingest(paths=["Links.md"])
        second = service.ingest(paths=["Links.md"])

        assert (first.created, second.created, second.unchanged) == (1, 0, 1)

    def test_targeted_ingest_rejects_path_outside_root(
        self, db_session, corpus: Path, tmp_path: Path
    ) -> None:
        outside = tmp_path / "fora.pdf"
        outside.write_bytes(_pdf_bytes(["fora"]))
        service = KnowledgeService(db_session)

        with pytest.raises(ValidationError, match="fora de KNOWLEDGE_DIR"):
            service.ingest(paths=[str(outside)])

    def test_targeted_ingest_rejects_missing_file(self, db_session, corpus: Path) -> None:
        service = KnowledgeService(db_session)
        with pytest.raises(ValidationError, match="Arquivo não encontrado"):
            service.ingest(paths=["fantasma.pdf"])

    def test_targeted_ingest_rejects_unsupported_extension(self, db_session, corpus: Path) -> None:
        (corpus / "codigo.py").write_text("print(1)", encoding="utf-8")
        service = KnowledgeService(db_session)

        with pytest.raises(ValidationError, match="Extensão não suportada"):
            service.ingest(paths=["codigo.py"])

    def test_targeted_ingest_rejects_operational_file(self, db_session, corpus: Path) -> None:
        (corpus / "README.md").write_text("# Readme", encoding="utf-8")
        service = KnowledgeService(db_session)

        with pytest.raises(ValidationError, match="Arquivo operacional"):
            service.ingest(paths=["README.md"])

    def test_targeted_ingest_rejects_undeclared_markdown(self, db_session, corpus: Path) -> None:
        (corpus / "notas.md").write_text("notas", encoding="utf-8")
        service = KnowledgeService(db_session)

        with pytest.raises(ValidationError, match="não declarado"):
            service.ingest(paths=["notas.md"])

    # --- a ingestão direcionada com as garantias do D-101 -----------------

    def test_a_targeted_pointer_is_refused_without_touching_the_row(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = _write(corpus, "livro.pdf", ["O módulo de Young mede a rigidez."])
        service = _embedding_service(db_session, monkeypatch)
        service.ingest()
        before = _snapshot(db_session, "livro.pdf")

        path.write_bytes(LFS_POINTER)
        report = service.ingest(paths=["livro.pdf"])

        (outcome,) = report.outcomes
        assert (outcome.action, outcome.detail) == ("falhou", LFS_POINTER_DETAIL)
        assert _snapshot(db_session, "livro.pdf") == before

    def test_force_does_not_let_a_pointer_through(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = _write(corpus, "livro.pdf", ["O módulo de Young mede a rigidez."])
        service = _embedding_service(db_session, monkeypatch)
        service.ingest()
        before = _snapshot(db_session, "livro.pdf")

        path.write_bytes(LFS_POINTER)
        for report in (service.ingest(force=True), service.ingest(True, paths=["livro.pdf"])):
            assert [o.action for o in report.outcomes] == ["falhou"]
        assert _snapshot(db_session, "livro.pdf") == before

    def test_force_and_a_name_do_not_bring_back_a_removed_file(
        self, db_session, corpus: Path
    ) -> None:
        _write(corpus, "02-Curso/aula.pdf", ["material de curso"])
        (corpus / "removidos.txt").write_text("02-Curso/\n", encoding="utf-8")

        report = KnowledgeService(db_session).ingest(force=True, paths=["02-Curso/aula.pdf"])

        (outcome,) = report.outcomes
        assert outcome.action == "ignorado"
        assert "lista de remoção" in (outcome.detail or "")
        assert KnowledgeRepository(db_session).count_documents() == 0

    def test_a_named_file_is_ingested_even_with_an_unnamed_copy_elsewhere(
        self, db_session, corpus: Path
    ) -> None:
        # Pedido pelo nome, o arquivo entra: a cópia em outro caminho não foi
        # nomeada, então não está na execução para disputar quem é indexado.
        _write(corpus, "a/livro.pdf", ["O módulo de Young mede a rigidez."])
        _write(corpus, "b/livro.pdf", ["O módulo de Young mede a rigidez."])

        report = KnowledgeService(db_session).ingest(paths=["b/livro.pdf"])

        assert (report.created, report.duplicates) == (1, 0)
        paths = [d.path for d in KnowledgeRepository(db_session).list_documents()]
        assert paths == ["b/livro.pdf"]

    def test_two_named_identical_files_are_indexed_once(self, db_session, corpus: Path) -> None:
        _write(corpus, "a/livro.pdf", ["O módulo de Young mede a rigidez."])
        _write(corpus, "b/livro.pdf", ["O módulo de Young mede a rigidez."])

        report = KnowledgeService(db_session).ingest(paths=["b/livro.pdf", "a/livro.pdf"])

        assert (report.created, report.duplicates) == (1, 1)
        (copy,) = [o for o in report.outcomes if o.duplicate_of]
        assert (copy.path, copy.duplicate_of) == ("b/livro.pdf", "a/livro.pdf")

    def test_force_reextracts_a_named_unchanged_file(self, db_session, corpus: Path) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)
        service = KnowledgeService(db_session)
        service.ingest(paths=["Links.md"])

        report = service.ingest(force=True, paths=["Links.md"])

        assert [o.action for o in report.outcomes] == ["atualizado"]

    def test_a_targeted_run_reports_each_file_and_honours_no_embed(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        (corpus / "Links.md").write_text(LINKS_MD, encoding="utf-8")
        _declare(corpus, self.LINKS)
        service = KnowledgeService(db_session)

        def no_client() -> None:
            raise AssertionError("embed=False não constrói cliente")

        monkeypatch.setattr(service, "_embedding_client", no_client)
        seen: list[int] = []

        report = service.ingest(paths=["Links.md"], embed=False, on_document=lambda: seen.append(1))

        assert (report.created, len(seen)) == (1, 1)
        assert report.outcomes[0].declared is True

    def test_dot_dot_that_stays_inside_the_root_is_the_same_file(
        self, db_session, corpus: Path
    ) -> None:
        _write(corpus, "pasta/livro.pdf", ["conteúdo"])
        service = KnowledgeService(db_session)

        assert service.resolve_targets(["outra/../pasta/livro.pdf"]) == [corpus / "pasta/livro.pdf"]

    def test_dot_dot_out_of_the_root_is_refused(
        self, db_session, corpus: Path, tmp_path: Path
    ) -> None:
        _write(tmp_path, "fora.pdf", ["fora"])

        with pytest.raises(ValidationError, match="fora de KNOWLEDGE_DIR"):
            KnowledgeService(db_session).ingest(paths=["../fora.pdf"])

    def test_a_linked_file_is_refused_even_inside_the_root(self, db_session, corpus: Path) -> None:
        _write(corpus, "livro.pdf", ["conteúdo"])
        TestSymlinks._link(corpus / "atalho.pdf", corpus / "livro.pdf")

        with pytest.raises(ValidationError, match="Link simbólico"):
            KnowledgeService(db_session).ingest(paths=["atalho.pdf"])

    def test_a_file_under_a_linked_folder_is_refused(
        self, db_session, corpus: Path, tmp_path: Path
    ) -> None:
        _write(corpus, "real/livro.pdf", ["conteúdo"])
        TestSymlinks._link(corpus / "pasta", corpus / "real")
        outside = tmp_path / "fora"
        _write(outside, "segredo.pdf", ["fora do Cérebro"])
        TestSymlinks._link(corpus / "externa", outside)
        service = KnowledgeService(db_session)

        with pytest.raises(ValidationError, match="Link simbólico"):
            service.ingest(paths=["pasta/livro.pdf"])
        with pytest.raises(ValidationError, match="fora de KNOWLEDGE_DIR"):
            service.ingest(paths=["externa/segredo.pdf"])
        assert KnowledgeRepository(db_session).count_documents() == 0

    def test_one_bad_name_refuses_the_whole_run(self, db_session, corpus: Path) -> None:
        _write(corpus, "livro.pdf", ["conteúdo"])

        with pytest.raises(ValidationError, match="não encontrado"):
            KnowledgeService(db_session).ingest(paths=["livro.pdf", "fantasma.pdf"])
        assert KnowledgeRepository(db_session).count_documents() == 0
