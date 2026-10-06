"""pypdf's decompression ceiling: raised for the Cérebro, never for an upload (D-101).

A production ``ingerir`` failed two Ashby textbooks with ``Limit reached while
decompressing`` — pypdf's guard against decompression bombs (75 MB per decoded
stream by default). The guard is right for a student's upload and wrong for
the curated corpus, so the rule is split by who sent the bytes:

* ``extract_text`` (the Cérebro) reads with :data:`CORPUS_MAX_STREAM_BYTES` and
  skips a page it still cannot decode, counting it by exception class — up to
  a fifth of the book, past which the book fails;
* ``read_upload`` (the Cadernos) reads with a ceiling *below* pypdf's default,
  sized for the API's VM, and fails on the first bad page, as before.

Both are bounded as a whole and not only per stream (the reviews of PR #98
and PR #100): pypdf's decoded copies are released between pages; the
document has a decoded-bytes budget (and the Cérebro's a time budget) charged
at every stream decode, inside a page too; an upload also bounds what pypdf
parses at one time (nested forms), and its page count is refused before any
page is decoded.

The ceiling lives in pypdf's ``ContextVar`` configuration, so these tests also
prove that it is gone after the read — on an exception too — and that another
thread never sees it. No network, no file outside ``tmp_path``.
"""

from __future__ import annotations

import io
import threading
import tracemalloc
import zlib
from pathlib import Path

import pypdf
import pytest

from app.domain.errors import ValidationError
from app.knowledge import readers
from app.knowledge.ingest import format_report, main
from app.knowledge.readers import (
    BUDGET_REASON,
    CORPUS_MAX_STREAM_BYTES,
    UPLOAD_MAX_STREAM_BYTES,
    extract_text,
    read_pdf,
    read_upload,
)
from app.knowledge.service import KnowledgeService, skipped_pages_in
from app.models.enums import IngestStatus
from app.repositories.knowledge_repository import KnowledgeRepository
from app.tests.test_knowledge_ingest import _pdf_bytes

#: pypdf's own ceiling — read from pypdf, not copied, so the tests follow it.
DEFAULT_CEILING = pypdf.Configuration().zlib_maximum_output_length
#: What a read that stops at a stream ceiling says (fail-fast), in Portuguese:
#: pypdf's own message ("Limit reached while decompressing") is no longer
#: shown to anyone.
LIMIT_MESSAGE = "descomprime para mais de"


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


def _inline_zeros(decoded_bytes: int, label: str) -> bytes:
    """A content stream: ``label`` as text, then an inline image of zeros."""
    width = 1_000
    height = max(1, decoded_bytes // width)
    return (
        b"BT /F1 12 Tf 72 720 Td (%s) Tj ET\nq BI /W %d /H %d /CS /G /BPC 8 ID "
        % (
            label.encode(),
            width,
            height,
        )
        + b"\x00" * (width * height)
        + b"\nEI Q\n"
    )


def _pages_pdf(sizes: list[int], *, shared: bool = False) -> bytes:
    """A PDF with one Flate content stream per page, each decoding to ~``sizes[i]``.

    Page *i* says ``Pagina i+1``. With ``shared``, every page draws the *same*
    stream object (the first size), as a book does with a background or a
    shared form — the case of a stream decoded again on every page.
    """
    count = len(sizes)
    streams = [sizes[0]] if shared else sizes
    first_stream = 4 + count
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [%s] /Count %d >>"
        % (b" ".join(b"%d 0 R" % (4 + i) for i in range(count)), count),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for index in range(count):
        content = first_stream if shared else first_stream + index
        objects.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % content
        )
    for index, size in enumerate(streams):
        data = zlib.compress(_inline_zeros(size, f"Pagina {index + 1}"), 9)
        objects.append(
            b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(data) + data + b"\nendstream"
        )
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


def _forms_pdf(
    forms: int, form_bytes: int, *, operators: bool = False, nested: bool = False
) -> bytes:
    """One page drawing ``forms`` *distinct* form XObjects, each Flate-compressed.

    The shape of the review's probe for PR #100 (I1): every form decodes to
    ~``form_bytes`` — an inline image of zeros, or with ``operators`` a run of
    path operators, which pypdf parses into one Python object per operand —
    and compresses ~1000:1, so the file stays small while one page asks for
    ``forms × form_bytes``. Each form says ``Forma i`` as text. pypdf caches
    every decoded form on its stream object until the page ends, which is why
    a budget checked between pages never saw them. With ``nested`` the page
    draws only the first form, and each form draws the next one *after* its
    own text — so pypdf has the outer form parsed while it parses the inner.
    """
    font = 3
    first_form = 6
    drawn = 1 if nested else forms
    names = b" ".join(b"/X%d %d 0 R" % (i, first_form + i) for i in range(drawn))
    content = b" ".join(b"/X%d Do" % i for i in range(drawn))
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 %d 0 R >> /XObject << %s >> >> /Contents 5 0 R >>"
        % (font, names),
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
    ]
    for index in range(forms):
        label = b"BT /F1 12 Tf 72 720 Td (Forma %d) Tj ET\n" % index
        if operators:
            step = b"0 0 m 1 1 l S\n"
            body = label + step * max(1, form_bytes // len(step))
        else:
            width = 1_000
            height = max(1, form_bytes // width)
            body = (
                label
                + b"q BI /W %d /H %d /CS /G /BPC 8 ID " % (width, height)
                + b"\x00" * (width * height)
                + b"\nEI Q\n"
            )
        inner = b""
        if nested and index + 1 < forms:
            body += b"/Y Do\n"
            inner = b" /XObject << /Y %d 0 R >>" % (first_form + index + 1)
        data = zlib.compress(body, 9)
        objects.append(
            b"<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] "
            b"/Resources << /Font << /F1 %d 0 R >>%s >> /Length %d /Filter /FlateDecode >>"
            b"\nstream\n" % (font, inner, len(data)) + data + b"\nendstream"
        )
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


MB = 1_000_000


@pytest.fixture(scope="module")
def past_default() -> bytes:
    """A real stream past pypdf's real default ceiling (built once: ~0.5 s)."""
    return _heavy_pdf(DEFAULT_CEILING + 5_000_000)


def _ceiling() -> int:
    return pypdf.get_configuration().zlib_maximum_output_length


class TestCeiling:
    def test_the_ceilings_are_where_the_decision_put_them(self) -> None:
        # The corpus raises pypdf's default, to 200 MB and no further: an
        # operator stream costs ~35× its size to parse (D-101). An upload
        # lowers it, for the API's 512 MB VM.
        assert DEFAULT_CEILING < CORPUS_MAX_STREAM_BYTES <= 200_000_000
        assert UPLOAD_MAX_STREAM_BYTES < DEFAULT_CEILING

    def test_an_upload_fails_past_its_own_ceiling(self, past_default: bytes) -> None:
        with pytest.raises(ValidationError, match=LIMIT_MESSAGE) as exc:
            read_upload("livro.pdf", past_default)
        message = str(exc.value)
        assert message.startswith("Não foi possível ler o PDF: a página 1 descomprime para mais")
        assert f"{UPLOAD_MAX_STREAM_BYTES // MB} MB" in message
        assert "Limit reached" not in message

    def test_an_upload_under_pypdfs_default_but_over_its_ceiling_fails(self) -> None:
        with pytest.raises(ValidationError, match=LIMIT_MESSAGE):
            read_upload("livro.pdf", _pages_pdf([UPLOAD_MAX_STREAM_BYTES + MB]))
        assert "Pagina 1" in read_upload("livro.pdf", _pages_pdf([MB])).pages[0]

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
        # skipped — bounded, counted — and the rest of the book is read. Three
        # pages: in a two-page document, one page is half of it (M1).
        monkeypatch.setattr(readers, "CORPUS_MAX_STREAM_BYTES", 2_000_000)
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pages_pdf([3_000_000, 1_000, 1_000]))

        extracted = extract_text(path)

        assert extracted.pages[0] == ""
        assert "Pagina 2" in extracted.pages[1] and "Pagina 3" in extracted.pages[2]
        assert extracted.skipped_pages == 1
        assert extracted.skip_reasons == {"LimitReachedError": 1}

    def test_the_ceiling_is_the_one_asked_for(self, tmp_path: Path) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(_heavy_pdf(3_000_000))

        with pytest.raises(ValidationError, match=f"{LIMIT_MESSAGE} 2 MB"):
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
        with pytest.raises(ValidationError) as exc:
            read_upload("livro.pdf", _pdf_bytes(self.PAGES))
        # Portuguese, the page number and the class — never the parser's text
        # (M2 of the review of PR #100).
        assert str(exc.value).startswith(
            "Não foi possível ler o PDF: a página 2 está corrompida ou usa um recurso"
        )
        assert "(error)" in str(exc.value)
        assert "invalid stored block" not in str(exc.value)

    def test_a_one_page_document_unreadable_is_a_failure(
        self, one_bad_page: None, tmp_path: Path
    ) -> None:
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pdf_bytes(["QUEBRADA um"]))
        with pytest.raises(ValidationError, match=r"a única página não pôde ser lida \(error ×1\)"):
            extract_text(path)

    def test_a_scan_with_a_bad_page_is_still_a_scan(
        self, one_bad_page: None, tmp_path: Path
    ) -> None:
        # One page could not be decoded and the others have no text: that is a
        # book without extractable text (SEM TEXTO), not a broken file.
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pdf_bytes(["QUEBRADA", "", ""]))

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
        assert "(error ×1)" in (document.error or "")  # zlib.error, by class name
        assert skipped_pages_in(document.error) == (1, 3)
        # What the numbering guarantees (M3 of the review): page 3 is still
        # cited as page 3, and no passage begins or ends on the skipped page —
        # it has no text. A passage may still *span* it (the chunker joins
        # paragraphs across pages, as it does across a blank scanned page), and
        # is then cited as 1–3, never as 1–2 or 2–3.
        chunks = KnowledgeRepository(db_session).list_chunks(document.id)
        assert not any(c.page_start == 2 or c.page_end == 2 for c in chunks)
        for chunk in chunks:
            if chunk.page_start < 2 < chunk.page_end:
                assert (chunk.page_start, chunk.page_end) == (1, 3)
        last = next(c for c in chunks if "OMEGA" in c.text)
        assert last.page_end == 3

        lines = format_report(report)
        (line,) = [x for x in lines if "PÁGINAS IGNORADAS" in x]
        # A GitHub annotation, so the run's summary shows it.
        assert line.startswith("::warning::[ingest] PÁGINAS IGNORADAS ")
        assert ": 1 de 3 não puderam ser lidas" in line
        assert "(error ×1)" in line and "forcar" in line
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
        (corpus / "livro.pdf").write_bytes(_pdf_bytes(["Legível.", "QUEBRADA", "Legível."]))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        main()  # no SystemExit

        out = capsys.readouterr().out
        assert "PÁGINAS IGNORADAS" in out and "FALHOU" not in out

    def test_an_undeclared_book_is_named_redacted(
        self, db_session, corpus: Path, one_bad_page: None
    ) -> None:
        (corpus / "segredo.pdf").write_bytes(_pdf_bytes(["Legível.", "QUEBRADA", "Legível."]))

        report = KnowledgeService(db_session).ingest()

        (line,) = [x for x in format_report(report) if "PÁGINAS IGNORADAS" in x]
        assert "segredo" not in line


def _held(reader: pypdf.PdfReader) -> int:
    """Decoded bytes pypdf still holds on ``reader``'s cached streams."""
    from pypdf.generic import EncodedStreamObject

    return sum(
        len(obj.decoded_self.get_data())
        for obj in reader.resolved_objects.values()
        if isinstance(obj, EncodedStreamObject) and obj.decoded_self is not None
    )


@pytest.fixture
def held_after_each_page(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """What pypdf holds decoded after every release — one entry per call."""
    seen: list[int] = []
    original = readers._release_decoded

    def spy(reader):
        original(reader)
        seen.append(_held(reader))

    monkeypatch.setattr(readers, "_release_decoded", spy)
    return seen


@pytest.fixture
def decodes(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Every stream pypdf decodes, by decoded size, in order."""
    import pypdf.filters

    seen: list[int] = []
    original = pypdf.filters.decode_stream_data

    def spy(stream):
        data = original(stream)
        seen.append(len(data))
        return data

    monkeypatch.setattr(pypdf.filters, "decode_stream_data", spy)
    return seen


class TestMemoryAcrossPages:
    """I1/I3 of the review: decoded streams used to pile up until the last page."""

    def test_decoded_copies_are_dropped_between_pages(
        self, held_after_each_page: list[int], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(readers, "_MAX_RETAINED_DECODED_BYTES", MB)
        data = _pages_pdf([2 * MB] * 6)

        extracted = read_pdf(io.BytesIO(data), max_stream_bytes=4 * MB)

        assert [f"Pagina {i}" in extracted.pages[i - 1] for i in range(1, 7)] == [True] * 6
        # One call after opening, one after each page — and pypdf never holds
        # more than the cap once a page is done. Before the fix it held every
        # page: 12 MB at the end.
        assert len(held_after_each_page) == 7
        assert max(held_after_each_page) <= MB

    def test_peak_memory_follows_the_largest_page_not_the_sum(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(readers, "_MAX_RETAINED_DECODED_BYTES", MB)
        data = _pages_pdf([3 * MB] * 8)  # 24 MB decoded in all

        tracemalloc.start()
        try:
            read_pdf(io.BytesIO(data), max_stream_bytes=4 * MB)
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()

        # A page costs its stream plus pypdf's copies while it parses (~3×);
        # holding every page would put the peak past the 24 MB sum.
        assert peak < 16 * MB

    def test_a_small_shared_stream_is_decoded_once(self, decodes: list[int]) -> None:
        # M2: what the cache is for — a stream every page draws (a font, a
        # background) stays decoded while the copies held are under the cap.
        extracted = read_pdf(io.BytesIO(_pages_pdf([100_000] * 5, shared=True)))

        assert extracted.page_count == 5 and extracted.skipped_pages == 0
        assert len([size for size in decodes if size >= 100_000]) == 1

    def test_a_large_shared_stream_is_decoded_again_and_counted_again(
        self, decodes: list[int], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Over the cap it is dropped after every page, so every page decodes
        # it again — and the budget sees every one of those decodes.
        monkeypatch.setattr(readers, "_MAX_RETAINED_DECODED_BYTES", MB)
        data = _pages_pdf([2 * MB] * 5, shared=True)

        assert read_pdf(io.BytesIO(data), max_stream_bytes=4 * MB).page_count == 5
        assert len([size for size in decodes if size >= 2 * MB]) == 5
        with pytest.raises(ValidationError, match="até a página 3 de 5"):
            read_pdf(io.BytesIO(data), max_stream_bytes=4 * MB, max_decoded_bytes=5 * MB)


class TestDocumentBudget:
    def test_a_spent_decoded_budget_skips_the_rest_and_fails_a_long_tail(self) -> None:
        # 10 pages of 1 MB, 2.5 MB of budget: spent after page 3, the other 7
        # pages are left out — more than a fifth of the book, so it fails, and
        # says why by class name.
        data = _pages_pdf([MB] * 10)
        with pytest.raises(ValidationError) as exc:
            read_pdf(io.BytesIO(data), skip_unreadable_pages=True, max_decoded_bytes=2_500_000)
        assert f"7 de 10 páginas não puderam ser lidas ({BUDGET_REASON} ×7)" in str(exc.value)

    def test_a_budget_spent_on_the_last_pages_still_indexes_the_book(self) -> None:
        data = _pages_pdf([MB] * 10)

        extracted = read_pdf(
            io.BytesIO(data), skip_unreadable_pages=True, max_decoded_bytes=8_500_000
        )

        assert extracted.skipped_pages == 1
        assert extracted.skip_reasons == {BUDGET_REASON: 1}
        assert "Pagina 9" in extracted.pages[8] and extracted.pages[9] == ""

    def test_the_time_budget(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # A clock that moves 10 s per page read: 25 s of budget is spent after
        # the third page, and checked before the fourth.
        now = [0.0]
        monkeypatch.setattr(readers, "_clock", lambda: now[0])
        original = pypdf.PageObject.extract_text

        def slow(self, *args, **kwargs):
            text = original(self, *args, **kwargs)
            now[0] += 10
            return text

        monkeypatch.setattr(pypdf.PageObject, "extract_text", slow)
        data = _pages_pdf([1_000] * 20)

        with pytest.raises(ValidationError, match=f"{BUDGET_REASON} ×17"):
            read_pdf(io.BytesIO(data), skip_unreadable_pages=True, max_seconds=25)

    def test_the_time_budget_is_checked_at_every_decode_inside_a_page(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # M5 of the review of PR #100: a page of many forms is stopped at its
        # next decode once the clock is past the budget, not at the page's end.
        # The clock moves 10 s per decode; 25 s are spent at the third form.
        import pypdf.filters

        now = [0.0]
        monkeypatch.setattr(readers, "_clock", lambda: now[0])
        decoded: list[int] = []
        original = pypdf.filters.decode_stream_data

        def slow(stream):
            data = original(stream)
            decoded.append(len(data))
            now[0] += 10
            return data

        monkeypatch.setattr(pypdf.filters, "decode_stream_data", slow)

        with pytest.raises(ValidationError) as exc:
            read_pdf(io.BytesIO(_forms_pdf(forms=20, form_bytes=10_000)), max_seconds=25)
        assert "a leitura passou de" in str(exc.value)
        assert "até a página 1 de 1" in str(exc.value)
        # Three forms decoded (0 → 30 s); the fourth is refused before it is
        # decoded, and the other 16 are never reached.
        assert len(decoded) == 3

    def test_the_cerebro_reads_with_its_budgets(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(readers, "CORPUS_MAX_DECODED_BYTES", 2_500_000)
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pages_pdf([MB] * 10))
        with pytest.raises(ValidationError, match=BUDGET_REASON):
            extract_text(path)

        monkeypatch.setattr(readers, "CORPUS_MAX_DECODED_BYTES", 10**12)
        ticks = iter(range(0, 10**6, 1_000))
        monkeypatch.setattr(readers, "_clock", lambda: next(ticks))
        monkeypatch.setattr(readers, "CORPUS_MAX_SECONDS", 2_500)
        with pytest.raises(ValidationError, match=BUDGET_REASON):
            extract_text(path)

    def test_a_shared_stream_past_the_ceiling_stops_the_book_early(
        self, decodes: list[int]
    ) -> None:
        # M2: pypdf caches no failure, so a stream every page draws that cannot
        # be decoded is tried again on every page. The share rule stops the
        # book as soon as the failure is certain — here at the fifth page of
        # twenty — instead of decompressing it twenty times.
        data = _pages_pdf([3 * MB] * 20, shared=True)

        with pytest.raises(ValidationError) as exc:
            read_pdf(io.BytesIO(data), max_stream_bytes=2 * MB, skip_unreadable_pages=True)

        assert (
            "5 de 20 páginas não puderam ser lidas (até a página 5; LimitReachedError ×5)"
        ) in str(exc.value)

    def test_a_page_past_the_ceiling_costs_the_ceiling(self) -> None:
        # pypdf caches nothing for a stream it gave up on, so the budget
        # charges that page the ceiling it decoded before giving up: with a
        # budget just under the ceiling the rest of the book is left out, just
        # over it the rest is read.
        data = _pages_pdf([3 * MB] + [1_000] * 9)

        def read(budget: int):
            return read_pdf(
                io.BytesIO(data),
                max_stream_bytes=2 * MB,
                skip_unreadable_pages=True,
                max_decoded_bytes=budget,
            )

        with pytest.raises(ValidationError, match=f"{BUDGET_REASON} ×9, LimitReachedError ×1"):
            read(2 * MB - 1)
        extracted = read(2 * MB + 100_000)
        assert extracted.skip_reasons == {"LimitReachedError": 1}
        assert "Pagina 10" in extracted.pages[9]


class TestSkippedShare:
    """More than a fifth of the pages left out fails the book — two pages or more
    of them, or half the document (I2 of the review of PR #98, M1 of PR #100)."""

    @pytest.mark.parametrize(
        ("pages", "bad", "fails"),
        [
            (10, 2, False),  # exactly 20%: from ten pages on, the share decides
            (10, 3, True),
            (20, 4, False),  # exactly 20% is still indexed
            (20, 5, True),
            (2, 2, True),  # every page
            # M1 of the review of PR #100: the old floor of 3 let these in.
            (3, 2, True),  # 67%
            (4, 2, True),  # 50%
            (9, 2, True),  # 22%
            (2, 1, True),  # half of a two-page document
            (1, 1, True),  # the only page
            # One bad page never fails a document of three pages or more.
            (3, 1, False),
            (4, 1, False),
            (5, 1, False),
        ],
    )
    def test_the_threshold(
        self, one_bad_page: None, tmp_path: Path, pages: int, bad: int, fails: bool
    ) -> None:
        texts = ["QUEBRADA" if i < bad else f"Página {i} legível." for i in range(pages)]
        path = tmp_path / "livro.pdf"
        path.write_bytes(_pdf_bytes(texts))

        if fails:
            with pytest.raises(ValidationError, match="Não foi possível ler o PDF: "):
                extract_text(path)
        else:
            assert extract_text(path).skipped_pages == bad

    def test_an_upload_has_no_threshold_one_bad_page_fails_it(self, one_bad_page: None) -> None:
        with pytest.raises(ValidationError):
            read_upload("x.pdf", _pdf_bytes(["ok"] * 9 + ["QUEBRADA"]))


class TestUploadBounds:
    """I3: a student's upload, bounded as a whole on the API's 512 MB VM."""

    def test_the_page_cap_is_checked_before_any_page_is_decoded(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def never(self, *args, **kwargs):
            raise AssertionError("a page was extracted before the page count was checked")

        monkeypatch.setattr(pypdf.PageObject, "extract_text", never)

        with pytest.raises(ValidationError, match="tem 3 páginas; o limite por fonte é 2"):
            read_upload("x.pdf", _pdf_bytes(["a", "b", "c"]), max_pages=2)

    def test_the_decoded_budget_fails_the_upload(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Five pages of 1 MB, each under the per-stream ceiling, but 2.5 MB in
        # all: before the fix every page was read and held.
        monkeypatch.setattr(readers, "UPLOAD_MAX_DECODED_BYTES", 2_500_000)

        with pytest.raises(ValidationError) as exc:
            read_upload("x.pdf", _pages_pdf([MB] * 5))

        assert str(exc.value) == (
            "O PDF é pesado demais para ler: até a página 3 de 5, o conteúdo das páginas já "
            "descomprime para mais de 2,5 MB, o limite de leitura de um PDF. Divida o documento "
            "em partes, exporte-o de novo como um PDF mais simples ou cole o texto."
        )

    def test_an_ordinary_upload_is_untouched(self) -> None:
        extracted = read_upload("x.pdf", _pdf_bytes([f"Página {i}." for i in range(50)]))
        assert extracted.page_count == 50 and extracted.skipped_pages == 0


class TestBudgetInsideAPage:
    """I1 of the review of PR #100: the budget is charged per decode, not per page.

    The review's probe was one page drawing 160 distinct forms of 3.9 MB each
    (0.66 MB of file): pypdf decodes and caches every form inside one
    ``extract_text`` call, so a budget checked between pages — and never after
    the last one — let it hold 639 MB on a 512 MB VM. These are that file
    scaled down, with the limits scaled down with it.
    """

    def test_one_page_of_many_forms_is_refused_mid_page(
        self, decodes: list[int], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(readers, "UPLOAD_MAX_DECODED_BYTES", 5 * MB)
        data = _forms_pdf(forms=20, form_bytes=MB)

        with pytest.raises(ValidationError) as exc:
            read_upload("x.pdf", data)

        assert str(exc.value).startswith(
            "O PDF é pesado demais para ler: até a página 1 de 1, o conteúdo das páginas já "
            "descomprime para mais de 5 MB"
        )
        # Five forms decoded (each is a little over 1 MB, so the fifth crosses
        # 5 MB and finishes), the sixth refused before it is decoded; the other
        # 14 never reached. Before the fix all 20 were decoded and the read
        # succeeded.
        assert len([size for size in decodes if size >= MB]) == 5

    def test_what_a_refused_page_held_stays_near_the_budget(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(readers, "UPLOAD_MAX_DECODED_BYTES", 5 * MB)
        data = _forms_pdf(forms=20, form_bytes=MB)

        tracemalloc.start()
        try:
            with pytest.raises(ValidationError):
                read_upload("x.pdf", data)
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()

        # The budget, one stream past it, and that stream's parse; the 20 MB
        # the page asks for in all would put the peak far above.
        assert peak < 12 * MB

    def test_the_last_page_is_held_to_the_budget_too(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # The old check ran only when pages remained, so a one-page file was
        # never checked at all. A page that finishes past the budget, as the
        # last one, still refuses the upload: it is all or nothing.
        monkeypatch.setattr(readers, "UPLOAD_MAX_DECODED_BYTES", 2_500_000)
        with pytest.raises(ValidationError, match="até a página 3 de 3"):
            read_upload("x.pdf", _pages_pdf([MB] * 3))
        with pytest.raises(ValidationError, match="até a página 1 de 1"):
            read_upload("x.pdf", _pages_pdf([3 * MB]))

    def test_the_corpus_skips_a_page_stopped_mid_way(self) -> None:
        # The page in progress is incomplete, so it counts as left out by the
        # budget, with every page after it.
        data = _forms_pdf(forms=20, form_bytes=MB)
        with pytest.raises(ValidationError) as exc:
            read_pdf(io.BytesIO(data), skip_unreadable_pages=True, max_decoded_bytes=5 * MB)
        assert str(exc.value) == (
            "Não foi possível ler o PDF: a única página não pôde ser lida " f"({BUDGET_REASON} ×1)."
        )

    def test_under_the_budget_every_form_is_read(self) -> None:
        extracted = read_upload("x.pdf", _forms_pdf(forms=20, form_bytes=100_000))
        assert all(f"Forma {i}" in extracted.pages[0] for i in range(20))

    def test_the_meter_exists_only_inside_a_read(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import pypdf.filters

        seen: dict[str, object] = {}
        original = pypdf.filters.decode_stream_data

        def spy(stream):
            seen.setdefault("inside", readers._meter.get())
            # A thread started now has a context of its own: no meter there.
            worker = threading.Thread(target=lambda: seen.update(thread=readers._meter.get()))
            worker.start()
            worker.join()
            return original(stream)

        monkeypatch.setattr(pypdf.filters, "decode_stream_data", spy)
        monkeypatch.setattr(readers, "UPLOAD_MAX_DECODED_BYTES", 2 * MB)

        with pytest.raises(ValidationError):
            read_upload("x.pdf", _forms_pdf(forms=5, form_bytes=MB))

        assert seen["inside"] is not None and seen["thread"] is None
        assert readers._meter.get() is None  # reset on the way out, by the exception too
        # Outside a read, a decode is pypdf's own: nothing charged, nothing refused.
        reader = pypdf.PdfReader(io.BytesIO(_forms_pdf(forms=5, form_bytes=MB)))
        assert "Forma 4" in reader.pages[0].extract_text()


class TestParsedAtOneTime:
    """Forms inside forms: what pypdf parses at one time, bounded for uploads.

    The decoded budget bounds bytes, not the parse: pypdf turns a stream of
    operators into one Python object per operand (~58× its size, measured), and
    keeps an outer form's parse alive while it parses the one inside it.
    """

    def test_nested_forms_past_the_bound_are_refused(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(readers, "UPLOAD_MAX_PARSED_BYTES", 500_000)
        data = _forms_pdf(forms=3, form_bytes=300_000, nested=True)

        with pytest.raises(ValidationError) as exc:
            read_upload("x.pdf", data)

        assert "desenhos dentro de desenhos" in str(exc.value)
        assert "passa de 0,5 MB" in str(exc.value)
        assert "até a página 1 de 1" in str(exc.value)

    def test_the_same_forms_side_by_side_are_read(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Each form is let go before the next one is parsed: the bound is on
        # what is alive at once, not on the sum.
        monkeypatch.setattr(readers, "UPLOAD_MAX_PARSED_BYTES", 500_000)
        extracted = read_upload("x.pdf", _forms_pdf(forms=5, form_bytes=300_000))
        assert all(f"Forma {i}" in extracted.pages[0] for i in range(5))

    def test_the_corpus_has_no_such_bound(self) -> None:
        extracted = read_pdf(
            io.BytesIO(_forms_pdf(forms=3, form_bytes=300_000, nested=True)),
            skip_unreadable_pages=True,
        )
        assert "Forma 2" in extracted.pages[0]

    def test_an_ordinary_nested_figure_is_read(self) -> None:
        extracted = read_upload("x.pdf", _forms_pdf(forms=4, form_bytes=20_000, nested=True))
        assert "Forma 3" in extracted.pages[0]


class TestOpeningMessages:
    """M2 of the review of PR #100: pypdf's English never reaches a refusal."""

    def test_a_corrupt_file(self) -> None:
        with pytest.raises(ValidationError) as exc:
            read_upload("x.pdf", b"%PDF-1.4\nisto nao e um pdf")
        assert str(exc.value).startswith("Não foi possível abrir o PDF: o arquivo está")
        assert "Imprimir → Salvar como PDF" in str(exc.value)

    def test_a_structure_past_pypdfs_limits(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from pypdf.errors import LimitReachedError

        def refuse(*_args, **_kwargs):
            raise LimitReachedError("Maximum page tree entry limit reached: 100001 > 100000.")

        monkeypatch.setattr(pypdf, "PdfReader", refuse)
        with pytest.raises(ValidationError) as exc:
            read_upload("x.pdf", _pdf_bytes(["a"]))
        message = str(exc.value)
        assert message.startswith("Não foi possível abrir o PDF: a estrutura do arquivo passa")
        assert "Maximum" not in message and "100001" not in message

    def test_the_stream_ceiling_says_how_to_get_around_it(self) -> None:
        with pytest.raises(ValidationError) as exc:
            read_upload("livro.pdf", _pages_pdf([UPLOAD_MAX_STREAM_BYTES + MB]))
        message = str(exc.value)
        assert "desenho vetorial denso" in message
        assert '"achatado"' in message and "Imprimir → Salvar como PDF" in message


class TestThresholdInIngestion:
    @pytest.fixture
    def corpus(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
        from app.config import settings

        root = tmp_path / "cerebro"
        root.mkdir()
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        return root

    BAD_BOOK = ["Legível."] * 6 + ["QUEBRADA"] * 4

    def test_a_new_book_past_the_threshold_fails_and_stores_nothing(
        self,
        db_session,
        corpus: Path,
        one_bad_page: None,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        (corpus / "livro.pdf").write_bytes(_pdf_bytes(self.BAD_BOOK))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        with pytest.raises(SystemExit) as exc:
            main()

        assert exc.value.code == 1
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document is not None and document.status == IngestStatus.FALHOU
        assert document.chunk_count == 0
        assert KnowledgeRepository(db_session).list_chunks(document.id) == []
        out = capsys.readouterr().out
        # Certain at the third bad page (3 ≥ 3, and 3 > 20% of 10): page 10
        # is never decoded.
        assert "[ingest] FALHOU " in out
        assert "3 de 10 páginas não puderam ser lidas (até a página 9; error ×3)" in out
        assert "Legível" not in out

    def test_an_indexed_book_keeps_its_passages(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = corpus / "livro.pdf"
        path.write_bytes(_pdf_bytes(["Primeira versão inteira, ALFA."] * 10))
        KnowledgeService(db_session).ingest()
        before = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert before is not None
        kept = before.chunk_count

        original = pypdf.PageObject.extract_text

        def extract(self, *args, **kwargs):
            text = original(self, *args, **kwargs)
            if "QUEBRADA" in text:
                raise zlib.error("invalid stored block lengths")
            return text

        monkeypatch.setattr(pypdf.PageObject, "extract_text", extract)
        path.write_bytes(_pdf_bytes(self.BAD_BOOK))
        report = KnowledgeService(db_session).ingest()

        (outcome,) = report.outcomes
        assert outcome.action == "falhou" and outcome.kept_previous
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document is not None and document.status == IngestStatus.EXTRAIDO
        assert document.chunk_count == kept
        assert (document.error or "").startswith("A versão nova (sha256 ")

    def test_a_failed_forced_reread_of_the_same_bytes_is_not_a_new_version(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # M3 of the review of PR #100: ``forcar`` re-reads unchanged bytes, the
        # re-read fails — the note must not speak of "a versão nova", because
        # it stays on the row for as long as the file is unchanged.
        path = corpus / "livro.pdf"
        path.write_bytes(_pdf_bytes(["Primeira versão inteira, ALFA."] * 10))
        KnowledgeService(db_session).ingest()
        kept = KnowledgeRepository(db_session).get_by_path("livro.pdf").chunk_count

        def broken(self, *args, **kwargs):
            raise zlib.error("invalid stored block lengths")

        with monkeypatch.context() as patch:
            patch.setattr(pypdf.PageObject, "extract_text", broken)
            report = KnowledgeService(db_session).ingest(force=True)
        (outcome,) = report.outcomes
        assert outcome.action == "falhou" and outcome.kept_previous

        # The next ordinary run finds the bytes unchanged and keeps the note.
        (again,) = KnowledgeService(db_session).ingest().outcomes
        assert again.action == "inalterado"
        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document is not None and document.status == IngestStatus.EXTRAIDO
        assert document.chunk_count == kept
        error = document.error or ""
        assert error.startswith("A releitura forçada (sha256 ")
        assert "versão nova" not in error and "versão anterior" not in error

    def test_a_partial_book_keeps_saying_so_when_a_new_version_fails(
        self, db_session, corpus: Path, one_bad_page: None
    ) -> None:
        path = corpus / "livro.pdf"
        path.write_bytes(_pdf_bytes(["Legível."] * 9 + ["QUEBRADA"]))
        KnowledgeService(db_session).ingest()

        path.write_bytes(b"%PDF-1.4\nquebrado")
        KnowledgeService(db_session).ingest()

        document = KnowledgeRepository(db_session).get_by_path("livro.pdf")
        assert document is not None
        assert (document.error or "").startswith("A versão nova (sha256 ")
        assert skipped_pages_in(document.error) == (1, 10)
        assert len(document.error or "") <= 500
