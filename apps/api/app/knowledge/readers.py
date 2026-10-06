"""Text extraction from reference documents.

Returns the same shape for every format — :class:`ExtractedText`, a list of
pages — so the chunker never learns what a PDF is. The Cérebro reads PDF and
the Markdown files its manifest declares (D-100: ``Links.md``); a notebook
(D-92) also takes DOCX and TXT — read from **bytes**, because an upload is never
written to disk.

``pypdf`` was chosen over ``pymupdf``: it is pure Python, small, and
permissively licensed, where pymupdf is AGPL and would put a copyleft term on a
project that has none. The trade is real and worth naming — pymupdf reads
two-column layouts and tables noticeably better, which is exactly the shape of a
textbook page. If extraction quality proves to be the bottleneck, this module is
the only thing that has to change.

A PDF of scanned images yields empty pages, and empty is the honest answer: no
OCR runs, so no text is invented to fill the gap. A page whose *bytes* cannot
be decoded is a different case, and who sent the file decides it (D-101,
:func:`read_pdf`): the curated Cérebro skips that page and says how many it
skipped, and why, by exception class — up to a fifth of the book, past which
the book fails; a student's upload fails whole, as it always did. Either way
the read is bounded as a whole, not only per stream: pypdf's decoded copies
are released between pages, and the document has a budget.

Every reader returns text a database can store (:func:`storable_text`): pypdf
hands back U+0000 for a glyph it cannot map, SQLite stores it and PostgreSQL
refuses the whole insert — which is how a production ingestion died on one
PDF that every test had accepted.
"""

from __future__ import annotations

import io
import re
import time
from collections import Counter
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

from app.domain.errors import ValidationError

#: Extensions the Cérebro ingests. A PDF is ingested wherever it sits; a
#: Markdown file only when the manifest declares it (see
#: :data:`MARKDOWN_EXTENSIONS` and ``KnowledgeService.discover``), because the
#: corpus folder also holds operational Markdown — its README — that is not
#: knowledge.
SUPPORTED_EXTENSIONS = {".pdf", ".md"}
#: The subset of :data:`SUPPORTED_EXTENSIONS` that needs a manifest entry.
MARKDOWN_EXTENSIONS = {".md"}

# ``[label](url)`` → ``label (url)``: the label is what a reader searches for,
# the address is what a citation has to hand back — both stay. The address may
# hold one level of balanced parentheses, as a Wikipedia article title does
# (``…/Aço_(liga)``); without that the link would be cut at the first ``)``.
_MD_LINK = re.compile(r"\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)")
# Leading ``#``s of a heading, ``>`` of a quote, ``-``/``*``/``+`` of a list item.
# A quote mark is ``>`` followed by a space or the end of the line, so a line
# that *starts* with a comparison (``>= 5 MPa``) keeps its operator.
_MD_LINE_MARK = re.compile(r"^\s{0,3}(?:#{1,6}\s+|>+(?:\s|$)|[-*+]\s+)")

# What no text column of PostgreSQL can hold: U+0000, refused outright ("text
# fields cannot contain NUL (0x00) bytes"), and a surrogate code point, which
# has no UTF-8 encoding and fails in the driver before the server sees it.
_UNSTORABLE = re.compile("[\x00\ud800-\udfff]")


def storable_text(text: str) -> str:
    """``text`` as a text column can store it, on any database this project uses.

    U+0000 is *removed* — it is not a character a reader sees, only the trace
    of a glyph the extractor could not map — and a lone surrogate becomes
    U+FFFD, the replacement character, so the gap stays visible. Nothing else
    changes: every other control character is legal in PostgreSQL ``text``, and
    rewriting it would edit the document's words.

    SQLite accepts U+0000, so the test suite never saw the failure; this is the
    one rule, reused by every reader, the chunker and the services that write
    a document, a passage or a notebook source.
    """
    if not _UNSTORABLE.search(text):
        return text
    return _UNSTORABLE.sub(lambda match: "" if match.group() == "\x00" else "\ufffd", text)


@dataclass
class ExtractedText:
    """Text of one document, one string per page.

    ``pages`` is 0-indexed; page *numbers* shown to a reader are 1-based, and
    the conversion happens once, in the chunker.
    """

    pages: list[str] = field(default_factory=list)
    #: Pages whose bytes could not be decoded (:func:`read_pdf` with
    #: ``skip_unreadable_pages``). Each one is still in :attr:`pages`, as an
    #: empty string, so every other page keeps its number: page 40 of the book
    #: is still cited as page 40 when page 12 could not be read.
    skipped_pages: int = 0
    #: Why the skipped pages were skipped: exception class name → pages
    #: (:data:`BUDGET_REASON` for the pages a spent budget left out). Names
    #: only, never a message — a message may quote the page.
    skip_reasons: dict[str, int] = field(default_factory=dict)

    @property
    def page_count(self) -> int:
        return len(self.pages)

    @property
    def is_empty(self) -> bool:
        """True when no page yielded any text — a scan, or a broken file."""
        return not any(page.strip() for page in self.pages)


#: Ceiling, in bytes, on what one PDF stream may decode to when the Cérebro
#: reads its own books (D-101). pypdf's default is 75 MB per stream, a guard
#: against decompression bombs (``pypdf.Configuration``), and two Ashby books of
#: 152 and 103.5 MB hit it in production with 11.7 and 3.8 MB of compressed
#: input still undecoded after the 75 MB of output. 200 MB covers both unless
#: that remainder compresses more than ~10:1 (the larger one) — a scanned
#: raster rarely does — and a page past it is skipped and counted, not fatal.
#:
#: The bound is on *one* stream, and what it costs depends on what the stream
#: holds. Measured with pypdf 6.19: a raster drawn inline is parsed as one slice
#: of bytes, ~2× its size in memory and seconds of CPU (450 MB: 0.9 GB, 5.6 s);
#: a stream of text or path operators becomes one Python object per operand,
#: ~35–37× its size and superlinear time (4 MB: +140 MB, 8 s; 10 MB: 0.4 GB,
#: 34 s; 40 MB: 1.5 GB, 374 s). At 200 MB the raster case is cheap; the operator
#: case is the residual risk — ~7 GB and well over an hour for one page, inside
#: the 16 GB of the public repository's runner but not bounded by anything
#: here, because pypdf parses a page in one call (only a subprocess with
#: ``RLIMIT_AS`` would bound it). No book page has that shape. 500 MB, the
#: first choice, put that worst case at ~18 GB.
#:
#: Memory no longer adds up across pages (:func:`_release_decoded`), and the
#: document as a whole has its own budget (:data:`CORPUS_MAX_DECODED_BYTES`,
#: :data:`CORPUS_MAX_SECONDS`). Never used on an upload (:func:`read_upload`).
CORPUS_MAX_STREAM_BYTES = 200_000_000

#: What one Cérebro document may decode in total, across every page — streams
#: decoded again after the cache was released count again, and a page that hit
#: the stream ceiling counts as the ceiling. Past it, the remaining pages are
#: skipped (and the share rule below decides whether the book is still
#: indexed). At the ~80 MB/s measured for raster content, 16 GB is minutes of
#: work; a real book is bounded by its file size times a realistic compression
#: ratio — the largest Cérebro file, 152 MB, at 10:1 is 1.5 GB — so the budget
#: only stops a bomb, or an over-ceiling stream shared by every page (decoded
#: again on every page, because pypdf caches no failure: 80 pages at 200 MB).
CORPUS_MAX_DECODED_BYTES = 16_000_000_000

#: Wall-clock budget for one Cérebro document, checked between pages. The whole
#: first production run — 121 documents, 13 270 passages — took 12 minutes; a
#: book that needs 15 for itself is not a book pypdf is reading well, and the
#: job (``timeout-minutes: 200``) has the other documents to get to.
CORPUS_MAX_SECONDS = 15 * 60

#: A Cérebro PDF fails — nothing new stored, an indexed version kept — when more
#: than this share of its pages cannot be read *and* at least
#: :data:`MIN_SKIPPED_PAGES_TO_FAIL` were. A page or two of a textbook (a
#: fold-out plate, a broken figure) costs those pages; more than one page in
#: five is a book the base would answer about as if it had it whole while it has
#: four fifths or less, and a failure is what makes the next run try it again.
MAX_SKIPPED_PAGE_SHARE = 0.2
#: ...and the floor under that share, so a short document is not failed by the
#: arithmetic of one bad page (1 of 4 is 25%).
MIN_SKIPPED_PAGES_TO_FAIL = 3

#: Per-stream ceiling for a student's upload (Cadernos, and a PDF fetched from
#: the web). The API runs on a 512 MB Fly VM, of which the application holds
#: ~130 MB after import and the Cérebro's resident index ~100 MB more. A stream
#: of operators costs ~35× its size while pypdf parses it (measured: 4 MB of
#: text operators, +140 MB and 8 s), so pypdf's own default of 75 MB let a
#: single page of a ~200 KB file ask for ~2.6 GB. 4 MB keeps one page inside
#: what is left; an ordinary page's content stream is tens of KB.
UPLOAD_MAX_STREAM_BYTES = 4_000_000

#: What one upload may decode in total. A 400-page text PDF decodes to ~10 MB
#: (content streams of tens of KB, fonts once); 32 MB leaves three times that,
#: and bounds the CPU a file can cost (~2 s per MB of operators, measured) to
#: about a minute.
UPLOAD_MAX_DECODED_BYTES = 32_000_000

#: Decoded copies pypdf may keep across pages (:func:`_release_decoded`): above
#: this, every one is dropped after the page. A font or a ``/ToUnicode`` map
#: shared by every page stays decoded under it, so it is not decoded again per
#: page; a 200 MB page stream never does.
_MAX_RETAINED_DECODED_BYTES = 16_000_000

# The pypdf limits that bound what *one decoded stream* may grow to, for each
# decoder text extraction can run, plus the concatenation of a page's content
# array. Image limits (JBIG2, the image buffer) stay at pypdf's default:
# extracting text never decodes an image XObject.
_STREAM_OUTPUT_LIMITS = (
    "zlib_maximum_output_length",
    "lzw_maximum_output_length",
    "run_length_maximum_output_length",
    "array_based_stream_maximum_output_length",
)

#: The reason counted for a page left out because the document's budget ran
#: out — named like an exception class, beside the ones pypdf raises.
BUDGET_REASON = "DocumentBudgetExceeded"

# A monotonic clock, a module attribute so a test can drive the time budget.
_clock = time.monotonic


@contextmanager
def _pdf_limits(max_stream_bytes: int | None) -> Iterator[None]:
    """pypdf's resource limits for the reads inside the block, then restored.

    ``None`` applies pypdf's own defaults — explicitly, so a read's limits
    never depend on what some other code set before it. pypdf keeps its
    configuration in a ``ContextVar`` (``pypdf.apply_configuration``, pypdf
    6.18+): the raised limit exists only in this thread's current context, is
    reset when the block exits — on an exception too — and a request served
    by another thread meanwhile still reads with its own. No module global
    is touched, so there is nothing to lock.
    """
    from pypdf import Configuration, apply_configuration

    configuration = Configuration()
    if max_stream_bytes is not None:
        if max_stream_bytes <= 0:
            # pypdf reads 0 as "no limit at all"; that is never what a caller
            # of this function means.
            raise ValueError("max_stream_bytes must be positive")
        configuration = configuration.with_overwrites(
            **{name: max_stream_bytes for name in _STREAM_OUTPUT_LIMITS}
        )
    with apply_configuration(configuration):
        yield


def _release_decoded(reader: object, counted: set[object]) -> int:
    """Bytes pypdf decoded since the last call; drops its decoded copies if many.

    pypdf caches every stream it decodes on the stream object
    (``EncodedStreamObject.decoded_self``), and every object it resolves in
    ``PdfReader.resolved_objects`` for the life of the reader — so, left alone,
    a book holds every page's decoded content until the last page is read, and
    memory grows with the *sum* of the streams, not the largest (measured: 8
    pages of 200 MB climbed to 1.6 GB of RSS; dropped per page, flat at 48 MB).

    Called after every page: counts the decoded copies not seen before (the
    document's budget), and when the copies still held pass
    :data:`_MAX_RETAINED_DECODED_BYTES` drops all of them, keeping the encoded
    bytes — which are the file's own, bounded by its size. A stream needed again
    is decoded again, and counted again.
    """
    from pypdf.generic import EncodedStreamObject

    fresh = 0
    held = 0
    streams = []
    for key, obj in getattr(reader, "resolved_objects", {}).items():
        if not isinstance(obj, EncodedStreamObject) or obj.decoded_self is None:
            continue
        size = len(obj.decoded_self.get_data())
        held += size
        streams.append(obj)
        if key not in counted:
            counted.add(key)
            fresh += size
    if held > _MAX_RETAINED_DECODED_BYTES:
        for obj in streams:
            obj.decoded_self = None
        counted.clear()
    return fresh


def _unreadable(exc: BaseException, prefix: str = "") -> ValidationError:
    # pypdf's message may quote the file's own bytes, NUL included, and it
    # ends up in ``knowledge_document.error``.
    return ValidationError(f"Não foi possível ler o PDF: {prefix}{storable_text(str(exc))}")


#: Exception classes named one by one in a note; the rest are summed.
_SHOWN_REASONS = 4


def skip_reasons_text(reasons: dict[str, int]) -> str:
    """``LimitReachedError ×2, error ×1`` — exception class names and counts.

    Never a message: a parser's message may quote the page, and this goes to a
    public log. The most frequent first, then by name, so the text is stable.
    """
    ordered = sorted(reasons.items(), key=lambda item: (-item[1], item[0]))
    shown = [f"{name} ×{count}" for name, count in ordered[:_SHOWN_REASONS]]
    rest = sum(count for _, count in ordered[_SHOWN_REASONS:])
    if rest:
        # The stored note has a column's length to fit in.
        shown.append(f"outras ×{rest}")
    return ", ".join(shown)


def _too_many_skipped(skipped: int, count: int) -> bool:
    return skipped >= MIN_SKIPPED_PAGES_TO_FAIL and skipped > MAX_SKIPPED_PAGE_SHARE * count


def _mb(value: int) -> str:
    return f"{value / 1_000_000:.0f} MB"


def read_pdf(
    source: Path | io.BytesIO,
    *,
    max_stream_bytes: int | None = None,
    skip_unreadable_pages: bool = False,
    max_decoded_bytes: int | None = None,
    max_seconds: float | None = None,
    max_pages: int | None = None,
) -> ExtractedText:
    """Extract text from a PDF, page by page.

    Whatever the caller, pypdf's decoded copies are released between pages
    (:func:`_release_decoded`), so memory follows the largest page, not the
    sum of them. The rest is the caller's policy — the Cérebro's in
    :func:`extract_text`, a student's in :func:`read_upload`:

    * ``max_stream_bytes`` sets pypdf's per-stream decompression ceiling
      (default: pypdf's own, 75 MB) for the duration of this read.
    * ``max_decoded_bytes`` and ``max_seconds`` budget the whole document,
      checked after each page: everything pypdf decoded (a page that hit the
      stream ceiling counts as the ceiling), and the wall-clock time.
    * ``max_pages`` refuses a longer document right after opening it, before
      a single page is decoded.
    * ``skip_unreadable_pages`` turns a page that cannot be decoded — the
      ceiling, a zlib error, a malformed stream — into an empty page counted
      in :attr:`ExtractedText.skipped_pages` by exception class, and a spent
      budget into the remaining pages skipped. More than
      :data:`MAX_SKIPPED_PAGE_SHARE` of the pages (and at least
      :data:`MIN_SKIPPED_PAGES_TO_FAIL`) fails the document, as soon as that
      is certain — so a stream shared by every page that cannot be decoded is
      not decoded again for the whole book. Without the flag, the first bad
      page or a spent budget fails the read: an upload is all or nothing.

    Raises:
        ValidationError: the file cannot be opened or parsed at all, has more
            than ``max_pages`` pages, spends a budget or has a bad page with
            ``skip_unreadable_pages`` off, or — with it on — has too many
            pages left out, or *no* page that could be read. A file that opens
            but holds no text is *not* an error — it returns empty pages, and
            the caller records that as a document with nothing to index.
    """
    from pypdf import Configuration, PdfReader
    from pypdf.errors import LimitReachedError

    ceiling = max_stream_bytes or Configuration().zlib_maximum_output_length
    with _pdf_limits(max_stream_bytes):
        try:
            reader = PdfReader(source if isinstance(source, io.BytesIO) else str(source))
            count = len(reader.pages)
        except Exception as exc:  # pypdf raises many types for malformed files
            raise _unreadable(exc) from exc
        if max_pages is not None and count > max_pages:
            raise ValidationError(
                f"O arquivo tem {count} páginas; o limite por fonte é "
                f"{max_pages}. Divida o documento em partes."
            )

        started = _clock()
        counted: set[object] = set()
        decoded = _release_decoded(reader, counted)  # object and xref streams
        pages: list[str] = []
        reasons: Counter[str] = Counter()
        first_error: Exception | None = None
        for index in range(count):
            try:
                text = reader.pages[index].extract_text() or ""
            except Exception as exc:  # same: a bad page raises whatever it raises
                if isinstance(exc, LimitReachedError):
                    decoded += ceiling  # what pypdf produced before it gave up
                if not skip_unreadable_pages:
                    if isinstance(exc, LimitReachedError):
                        raise ValidationError(
                            f"Não foi possível ler o PDF: a página {index + 1} descomprime "
                            f"para mais de {_mb(ceiling)}, o limite de cada fluxo de "
                            "conteúdo do PDF. Envie o texto em outro formato ou um PDF sem "
                            "essa página."
                        ) from exc
                    raise _unreadable(exc) from exc
                reasons[type(exc).__name__] += 1
                first_error = first_error or exc
                text = ""  # the slot stays, so the next page keeps its number
            finally:
                decoded += _release_decoded(reader, counted)
            pages.append(storable_text(text))

            spent = _spent(decoded, max_decoded_bytes, started, max_seconds)
            remaining = count - index - 1
            if spent is not None and remaining:
                if not skip_unreadable_pages:
                    raise ValidationError(
                        f"O PDF é pesado demais para ler: até a página {index + 1} de {count}, "
                        f"{spent}. Divida o documento em partes ou cole o texto."
                    )
                reasons[BUDGET_REASON] += remaining
                pages.extend([""] * remaining)
            skipped = sum(reasons.values())
            if skip_unreadable_pages and _too_many_skipped(skipped, count):
                # Stopped as soon as it is certain: the rest is not decoded.
                read = len(pages)
                where = "" if read == count else f"até a página {read}; "
                raise ValidationError(
                    f"Não foi possível ler o PDF: {skipped} de {count} páginas não puderam "
                    f"ser lidas ({where}{skip_reasons_text(reasons)}) — mais que "
                    f"{MAX_SKIPPED_PAGE_SHARE:.0%} do documento."
                )
            if len(pages) == count:
                break

    skipped = sum(reasons.values())
    if first_error is not None and skipped == count:
        # Not a book with a bad page: nothing in it could be read.
        raise _unreadable(
            first_error, f"nenhuma das {count} páginas pôde ser lida; a primeira falhou com: "
        ) from first_error
    return ExtractedText(pages=pages, skipped_pages=skipped, skip_reasons=dict(reasons))


def _spent(
    decoded: int, max_decoded_bytes: int | None, started: float, max_seconds: float | None
) -> str | None:
    """Which document budget is spent, said for a reader — or None."""
    if max_decoded_bytes is not None and decoded > max_decoded_bytes:
        return (
            f"o conteúdo das páginas já descomprime para mais de {_mb(max_decoded_bytes)}, "
            "o limite de leitura de um PDF"
        )
    if max_seconds is not None and _clock() - started > max_seconds:
        return f"a leitura passou de {max_seconds / 60:.0f} min, o limite de um PDF"
    return None


def read_markdown(data: bytes) -> ExtractedText:
    """A Markdown file as one page of plain text, one paragraph per line.

    The markup that is only layout goes (heading hashes, list bullets, quote
    marks); every word and every URL stays, verbatim. Each non-blank line
    becomes its own paragraph because a Markdown list of links is
    line-oriented: joined by the chunker's soft-wrap rule, a description would
    run into the next address and the chunker could only cut the result at an
    arbitrary space.
    """
    lines = []
    for raw in decode_text(data).splitlines():
        line = _MD_LINE_MARK.sub("", raw)
        line = _MD_LINK.sub(r"\1 (\2)", line).strip()
        if line:
            lines.append(line)
    return ExtractedText(pages=["\n\n".join(lines)])


def extract_text(path: Path) -> ExtractedText:
    """Dispatch to the reader for ``path``'s extension.

    For the Cérebro's own files only — curated, declared, read from the
    repository by the operator's tooling — and so a PDF is read with the
    corpus ceiling, the corpus budgets and page-level tolerance
    (:data:`CORPUS_MAX_STREAM_BYTES`, :data:`CORPUS_MAX_DECODED_BYTES`,
    :data:`CORPUS_MAX_SECONDS`, :data:`MAX_SKIPPED_PAGE_SHARE`; D-101). Bytes
    someone sent go through :func:`read_upload`.
    """
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return read_pdf(
            path,
            max_stream_bytes=CORPUS_MAX_STREAM_BYTES,
            skip_unreadable_pages=True,
            max_decoded_bytes=CORPUS_MAX_DECODED_BYTES,
            max_seconds=CORPUS_MAX_SECONDS,
        )
    if suffix in MARKDOWN_EXTENSIONS:
        return read_markdown(path.read_bytes())
    raise ValidationError(f"Formato não suportado para extração: {suffix or path.name}")


# --- uploads (D-92) --------------------------------------------------------

#: What a notebook accepts, by extension. The content is checked too: an
#: extension is a claim the uploader makes, the first bytes are a fact.
UPLOAD_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}

_PDF_MAGIC = b"%PDF-"
_ZIP_MAGIC = b"PK\x03\x04"  # a DOCX is a zip container


def read_upload(filename: str, data: bytes, *, max_pages: int | None = None) -> ExtractedText:
    """Extract text from an uploaded file's bytes.

    The extension picks the reader, and the first bytes must agree with it: a
    ``.pdf`` that is not a PDF is refused with that said, rather than handed to
    a parser that would fail with a stack of pypdf internals.

    A PDF is read with :data:`UPLOAD_MAX_STREAM_BYTES` per stream and
    :data:`UPLOAD_MAX_DECODED_BYTES` for the whole file, and its page count is
    checked before any page is decoded (D-101): the API's VM has 512 MB, and a
    15 MB file can otherwise ask for gigabytes.

    Raises:
        ValidationError: unsupported type, content that contradicts the
            extension, an unreadable file, more pages than ``max_pages``, or a
            PDF that decodes past either bound — each said in Portuguese.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in UPLOAD_EXTENSIONS:
        raise ValidationError(
            f"Formato não aceito: {suffix or filename}. Envie PDF, DOCX, TXT ou Markdown."
        )
    if suffix == ".pdf":
        if not data.startswith(_PDF_MAGIC):
            raise ValidationError("O arquivo tem extensão .pdf, mas o conteúdo não é um PDF.")
        # These bytes are a student's, not the curated corpus (D-101): a small
        # per-stream ceiling and a budget for the whole file, sized for the
        # API's VM, the page count refused before any page is decoded, and
        # fail-fast on a bad page.
        return read_pdf(
            io.BytesIO(data),
            max_stream_bytes=UPLOAD_MAX_STREAM_BYTES,
            max_decoded_bytes=UPLOAD_MAX_DECODED_BYTES,
            max_pages=max_pages,
        )
    if suffix == ".docx":
        if not data.startswith(_ZIP_MAGIC):
            raise ValidationError("O arquivo tem extensão .docx, mas o conteúdo não é um DOCX.")
        extracted = _read_docx(data)
    else:
        extracted = ExtractedText(pages=[decode_text(data)])

    if max_pages is not None and extracted.page_count > max_pages:
        raise ValidationError(
            f"O arquivo tem {extracted.page_count} páginas; o limite por fonte é "
            f"{max_pages}. Divida o documento em partes."
        )
    return extracted


def decode_text(data: bytes) -> str:
    """Bytes of a plain-text file as text, whatever its encoding.

    A file with a NUL byte is binary under a text extension, and decoding it
    anyway would index garbage that no answer could ever cite honestly. Only
    the first 4 KiB are sniffed, so a stray NUL further down is removed rather
    than refused (:func:`storable_text`).
    """
    if b"\x00" in data[:4096]:
        raise ValidationError("O arquivo não parece ser texto: contém bytes binários.")
    try:
        return storable_text(data.decode("utf-8-sig"))
    except UnicodeDecodeError:
        pass
    from charset_normalizer import from_bytes

    best = from_bytes(data).best()
    if best is None:
        raise ValidationError("Não foi possível identificar a codificação do texto.")
    return storable_text(str(best))


def _read_docx(data: bytes) -> ExtractedText:
    """A DOCX as one page: Word has no fixed pages, only a flow of paragraphs.

    Headings stay on their own line, so the chunker still recognises them, and
    tables are read row by row with cells separated by " | " — a value kept on
    the same line as its row label is a value that can still be cited.
    """
    from docx import Document

    try:
        document = Document(io.BytesIO(data))
    except Exception as exc:  # python-docx raises several types for a bad zip
        raise ValidationError(f"Não foi possível ler o DOCX: {storable_text(str(exc))}") from exc

    lines = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        lines.append("")
        for row in table.rows:
            lines.append(" | ".join(cell.text.strip() for cell in row.cells))
    text = "\n\n".join(line for line in lines if line.strip())
    return ExtractedText(pages=[storable_text(text)])
