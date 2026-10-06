"""pypdf's decompression ceiling: raised for the Cérebro, never for an upload (D-101).

A production ``ingerir`` failed two Ashby textbooks with ``Limit reached while
decompressing`` — pypdf's guard against decompression bombs (75 MB per decoded
stream by default). The guard is right for a student's upload and wrong for
the curated corpus, so the rule is split by who sent the bytes:

* ``extract_text`` (the Cérebro) reads with :data:`CORPUS_MAX_STREAM_BYTES` and
  skips a page it still cannot decode, counting it;
* ``read_upload`` (the Cadernos) keeps pypdf's default and fails on the first
  bad page, as before.

The raised ceiling lives in pypdf's ``ContextVar`` configuration, so these
tests also prove that it is gone after the read — on an exception too — and
that another thread never sees it. No network, no file outside ``tmp_path``.
"""

from __future__ import annotations

import threading
import zlib
from pathlib import Path

import pypdf
import pytest

from app.domain.errors import ValidationError
from app.knowledge import readers
from app.knowledge.ingest import format_report, main
from app.knowledge.readers import (
    CORPUS_MAX_STREAM_BYTES,
    extract_text,
    read_pdf,
    read_upload,
)
from app.knowledge.service import KnowledgeService
from app.models.enums import IngestStatus
from app.repositories.knowledge_repository import KnowledgeRepository
from app.tests.test_knowledge_ingest import _pdf_bytes

#: pypdf's own ceiling — read from pypdf, not copied, so the tests follow it.
DEFAULT_CEILING = pypdf.Configuration().zlib_maximum_output_length
LIMIT_MESSAGE = "Limit reached while decompressing"


def _heavy_pdf(decoded_bytes: int) -> bytes:
    """A two-page PDF whose first page decodes to about ``decoded_bytes``.

    Page 1's content stream is text followed by an unfiltered inline image of
    zeros, Flate-compressed — ~1000:1, so the file stays at a few dozen KB
    while the stream decodes past the ceiling. Page 2 is an ordinary page. An
    inline image with ``/W``, ``/H`` and ``/BPC`` is read by pypdf as one slice
    of bytes, so parsing it costs a copy and not a scan.
    """
    width = 10_000
    height = decoded_bytes // width + 1
    head = b"BT /F1 12 Tf 72 720 Td (Pagina pesada) Tj ET\nq BI /W %d /H %d /CS /G /BPC 8 ID " % (
        width,
        height,
    )
    compressor = zlib.compressobj(9)
    parts = [compressor.compress(head)]
    block = b"\x00" * 1_000_000
    remaining = width * height
    while remaining:
        step = min(remaining, len(block))
        parts.append(compressor.compress(block[:step]))
        remaining -= step
    parts.append(compressor.compress(b"\nEI Q\n"))
    parts.append(compressor.flush())
    heavy = b"".join(parts)
    light = b"BT /F1 12 Tf 72 720 Td (Pagina leve) Tj ET"

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(heavy) + heavy + b"\nendstream",
        b"<< /Length %d >>\nstream\n" % len(light) + light + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref_at,
    )
    return bytes(out)


@pytest.fixture(scope="module")
def past_default() -> bytes:
    """A real stream past pypdf's real default ceiling (built once: ~0.5 s)."""
    return _heavy_pdf(DEFAULT_CEILING + 5_000_000)


def _ceiling() -> int:
    return pypdf.get_configuration().zlib_maximum_output_length


class TestCeiling:
    def test_the_corpus_ceiling_is_a_raise_and_a_bound(self) -> None:
        assert DEFAULT_CEILING < CORPUS_MAX_STREAM_BYTES <= 1_000_000_000

    def test_an_upload_still_fails_past_pypdfs_default(self, past_default: bytes) -> None:
        with pytest.raises(ValidationError, match=LIMIT_MESSAGE) as exc:
            read_upload("livro.pdf", past_default)
        assert str(exc.value).startswith("Não foi possível ler o PDF: ")

    def test_the_default_read_fails_as_before(self, past_default: bytes, tmp_path: Path) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(past_default)
        with pytest.raises(ValidationError, match=LIMIT_MESSAGE):
            read_pdf(path)

    def test_the_corpus_reads_the_same_file(self, past_default: bytes, tmp_path: Path) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(past_default)

        extracted = extract_text(path)

        assert "Pagina pesada" in extracted.pages[0]
        assert "Pagina leve" in extracted.pages[1]
        assert extracted.skipped_pages == 0

    def test_the_corpus_ceiling_still_stops_a_bigger_stream(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The same rule at a smaller scale: past the corpus ceiling the page is
        # skipped — bounded, counted — and the rest of the book is read.
        monkeypatch.setattr(readers, "CORPUS_MAX_STREAM_BYTES", 2_000_000)
        path = tmp_path / "livro.pdf"
        path.write_bytes(_heavy_pdf(3_000_000))

        extracted = extract_text(path)

        assert extracted.pages[0] == ""
        assert "Pagina leve" in extracted.pages[1]
        assert extracted.skipped_pages == 1

    def test_the_ceiling_is_the_one_asked_for(self, tmp_path: Path) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(_heavy_pdf(3_000_000))

        with pytest.raises(ValidationError, match=LIMIT_MESSAGE):
            read_pdf(path, max_stream_bytes=2_000_000)
        assert "Pagina pesada" in read_pdf(path, max_stream_bytes=4_000_000).pages[0]

    @pytest.mark.parametrize("bad", [0, -1])
    def test_zero_never_means_no_limit(self, bad: int, tmp_path: Path) -> None:
        # pypdf reads 0 as "unlimited"; a caller of read_pdf never means that.
        path = tmp_path / "doc.pdf"
        path.write_bytes(_pdf_bytes(["texto"]))
        with pytest.raises(ValueError):
            read_pdf(path, max_stream_bytes=bad)


class TestScope:
    def test_restored_after_a_corpus_read(self, past_default: bytes, tmp_path: Path) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(past_default)

        extract_text(path)

        assert _ceiling() == DEFAULT_CEILING
        with pytest.raises(ValidationError, match=LIMIT_MESSAGE):
            read_upload("livro.pdf", past_default)

    def test_restored_when_the_read_raises(self, tmp_path: Path) -> None:
        with pytest.raises(RuntimeError):
            with readers._pdf_limits(CORPUS_MAX_STREAM_BYTES):
                assert _ceiling() == CORPUS_MAX_STREAM_BYTES
                raise RuntimeError("falha no meio da leitura")
        assert _ceiling() == DEFAULT_CEILING

        # And through read_pdf itself: a raised ceiling, then a broken file.
        broken = tmp_path / "quebrado.pdf"
        broken.write_bytes(b"%PDF-1.4\nnao e um pdf de verdade")
        with pytest.raises(ValidationError):
            read_pdf(broken, max_stream_bytes=CORPUS_MAX_STREAM_BYTES)
        assert _ceiling() == DEFAULT_CEILING

    def test_another_thread_never_sees_the_raised_ceiling(self, past_default: bytes) -> None:
        # Thread A holds the corpus ceiling open while this thread serves an
        # upload: the upload must still be refused at pypdf's default.
        inside = threading.Event()
        release = threading.Event()
        seen: dict[str, int] = {}

        def corpus_reader() -> None:
            with readers._pdf_limits(CORPUS_MAX_STREAM_BYTES):
                seen["corpus"] = _ceiling()
                inside.set()
                release.wait(timeout=30)

        worker = threading.Thread(target=corpus_reader)
        worker.start()
        try:
            assert inside.wait(timeout=30)
            seen["upload"] = _ceiling()
            with pytest.raises(ValidationError, match=LIMIT_MESSAGE):
                read_upload("livro.pdf", past_default)
        finally:
            release.set()
            worker.join(timeout=30)

        assert seen == {"corpus": CORPUS_MAX_STREAM_BYTES, "upload": DEFAULT_CEILING}


@pytest.fixture
def one_bad_page(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make every page whose text says ``QUEBRADA`` fail to decode."""
    original = pypdf.PageObject.extract_text

    def extract(self, *args, **kwargs):
        text = original(self, *args, **kwargs)
        if "QUEBRADA" in text:
            raise zlib.error("Error -3 while decompressing data: invalid stored block lengths")
        return text

    monkeypatch.setattr(pypdf.PageObject, "extract_text", extract)


class TestUnreadablePage:
    PAGES = ["Primeira página legível.", "QUEBRADA", "Terceira página legível."]

    def test_the_corpus_skips_it_and_keeps_the_numbering(
        self, one_bad_page: None, tmp_path: Path
    ) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pdf_bytes(self.PAGES))

        extracted = extract_text(path)

        assert extracted.page_count == 3
        assert extracted.skipped_pages == 1
        assert extracted.pages[1] == ""
        assert "Terceira" in extracted.pages[2]

    def test_an_upload_still_fails_on_it(self, one_bad_page: None) -> None:
        with pytest.raises(ValidationError, match="invalid stored block lengths"):
            read_upload("livro.pdf", _pdf_bytes(self.PAGES))

    def test_every_page_unreadable_is_a_failure(self, one_bad_page: None, tmp_path: Path) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pdf_bytes(["QUEBRADA um", "QUEBRADA dois"]))
        with pytest.raises(ValidationError, match="nenhuma das 2 páginas"):
            extract_text(path)

    def test_a_scan_with_a_bad_page_is_still_a_scan(
        self, one_bad_page: None, tmp_path: Path
    ) -> None:
        # One page could not be decoded and the other has no text: that is a
        # book without extractable text (SEM TEXTO), not a broken file.
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pdf_bytes(["QUEBRADA", ""]))

        extracted = extract_text(path)

        assert extracted.is_empty
        assert extracted.skipped_pages == 1


class TestIngestion:
    @pytest.fixture
    def corpus(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
        from app.config import settings

        root = tmp_path / "cerebro"
        root.mkdir()
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        return root

    def test_the_book_is_indexed_and_the_skip_is_said(
        self, db_session, corpus: Path, one_bad_page: None
    ) -> None:
        long = "Texto suficiente para formar um trecho próprio sobre seleção de materiais. "
        (corpus / "livro.pdf").write_bytes(
            _pdf_bytes([long * 12 + "ALFA", "QUEBRADA", long * 12 + "OMEGA"])
        )

        report = KnowledgeService(db_session).ingest()

        assert report.failed == 0 and report.created == 1
        (outcome,) = report.outcomes
        assert outcome.skipped_pages == 1 and outcome.page_count == 3
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document is not None
        assert document.status == IngestStatus.EXTRAIDO
        assert document.page_count == 3
        assert "1 de 3 páginas" in (document.error or "")
        chunks = KnowledgeRepository(db_session).list_chunks(document.id)
        assert not any(c.page_start == 2 or c.page_end == 2 for c in chunks)
        last = next(c for c in chunks if "OMEGA" in c.text)
        assert last.page_end == 3

        lines = format_report(report)
        assert any(
            line.startswith("[ingest] PÁGINAS IGNORADAS ") and "1 de 3 não puderam" in line
            for line in lines
        )
        # Counts only: nothing a page held reaches the log.
        assert not any("ALFA" in line or "OMEGA" in line for line in lines)

    def test_the_run_does_not_exit_1(
        self,
        db_session,
        corpus: Path,
        one_bad_page: None,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        (corpus / "livro.pdf").write_bytes(_pdf_bytes(["Legível.", "QUEBRADA"]))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        main()  # no SystemExit

        out = capsys.readouterr().out
        assert "PÁGINAS IGNORADAS" in out and "FALHOU" not in out

    def test_an_undeclared_book_is_named_redacted(
        self, db_session, corpus: Path, one_bad_page: None
    ) -> None:
        (corpus / "segredo.pdf").write_bytes(_pdf_bytes(["Legível.", "QUEBRADA"]))

        report = KnowledgeService(db_session).ingest()

        (line,) = [x for x in format_report(report) if "PÁGINAS IGNORADAS" in x]
        assert "segredo" not in line
