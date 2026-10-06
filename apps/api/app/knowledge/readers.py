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
the read is bounded as a whole, not only per stream: every stream pypdf
decodes is charged to the document's budget *as it is decoded*
(:func:`_metered_decoding`), so one page cannot spend more than the whole
file may, and pypdf's decoded copies are released between pages.

Every reader returns text a database can store (:func:`storable_text`): pypdf
hands back U+0000 for a glyph it cannot map, SQLite stores it and PostgreSQL
refuses the whole insert — which is how a production ingestion died on one
PDF that every test had accepted.
"""

from __future__ import annotations

import functools
import io
import logging
import re
import threading
import time
import weakref
from collections import Counter
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

from app.domain.errors import ValidationError

_log = logging.getLogger(__name__)

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
#: Memory no longer adds up across pages (:func:`_release_decoded`), and every
#: stream decoded is charged to the document's budget as it is decoded
#: (:data:`CORPUS_MAX_DECODED_BYTES`, :data:`CORPUS_MAX_SECONDS`). Never used on
#: an upload (:func:`read_upload`).
CORPUS_MAX_STREAM_BYTES = 200_000_000

#: What one Cérebro document may decode in total, across every page, charged
#: at every stream decode (:func:`_metered_decoding`) — streams decoded again
#: after the cache was released count again, and a stream that hit the ceiling
#: counts as the ceiling. Past it the next decode is refused: the page being
#: read and the ones after it are skipped (and the share rule below decides
#: whether the book is still indexed). At the ~80 MB/s measured for raster
#: content, 16 GB is minutes of work; a real book is bounded by its file size
#: times a realistic compression ratio — the largest Cérebro file, 152 MB, at
#: 10:1 is 1.5 GB — so the budget only stops a bomb, or an over-ceiling stream
#: shared by every page (decoded again on every page, because pypdf caches no
#: failure: 80 pages at 200 MB).
CORPUS_MAX_DECODED_BYTES = 16_000_000_000

#: Wall-clock budget for one Cérebro document, checked before every stream
#: decode and between pages — never *during* one stream's parse: a page of
#: operators that pypdf takes an hour to parse is not interrupted halfway
#: (only a subprocess could do that; see :data:`CORPUS_MAX_STREAM_BYTES`), it
#: is stopped at its next decode or at the page's end. The whole first
#: production run — 121 documents, 13 270 passages — took 12 minutes; a book
#: that needs 15 for itself is not a book pypdf is reading well, and the job
#: (``timeout-minutes: 200``) has the other documents to get to.
CORPUS_MAX_SECONDS = 15 * 60

#: A Cérebro PDF fails — nothing new stored, an indexed version kept — when more
#: than this share of its pages cannot be read *and* at least
#: :data:`MIN_SKIPPED_PAGES_TO_FAIL` were, or half the document or more was
#: (:func:`_too_many_skipped`). A page or two of a textbook (a fold-out plate, a
#: broken figure) costs those pages; more than one page in five is a book the
#: base would answer about as if it had it whole while it has four fifths or
#: less, and a failure is what makes the next run try it again.
MAX_SKIPPED_PAGE_SHARE = 0.2
#: ...and the floor under that share: one bad page never fails a document of
#: three pages or more (1 of 4 is 25%, 1 of 3 is 33%). Two pages do, past the
#: share — 2 of 9 fails, 2 of 10 (exactly 20%) does not; from ten pages on the
#: floor never decides anything and the share alone does. A document of one or
#: two pages has no floor to stand on: half of it missing fails it.
MIN_SKIPPED_PAGES_TO_FAIL = 2

#: Per-stream ceiling for a student's upload (Cadernos, and a PDF fetched from
#: the web). The API runs on a 512 MB Fly VM, of which the application holds
#: ~130 MB after import and the Cérebro's resident index ~100 MB more. A stream
#: of operators costs ~35× its size while pypdf parses it (measured: 4 MB of
#: text operators, +140 MB and 8 s), so pypdf's own default of 75 MB let a
#: single page of a ~200 KB file ask for ~2.6 GB. 4 MB keeps one page inside
#: what is left; an ordinary page's content stream is tens of KB.
#:
#: The cost is real and accepted: a PDF with one page past it — a CAD drawing,
#: a map, a scatter plot of thousands of points exported as vectors — is
#: refused whole, and the refusal says how to get around it (export the PDF
#: again "flattened"/as images, print it to PDF, or send the text). Skipping
#: that page instead would put the parse of every *other* page of that size
#: back on the VM, and such a page carries little text; the limit stays.
UPLOAD_MAX_STREAM_BYTES = 4_000_000

#: What one upload may decode in total, charged at every stream decode
#: (:func:`_metered_decoding`) — so it bounds one page too, the last one
#: included, and not only the sum of pages. A 400-page text PDF decodes to
#: ~10 MB (content streams of tens of KB, fonts once); 32 MB leaves three times
#: that. What it holds on the VM: at most this plus one stream of decoded bytes
#: (the decode that crosses it finishes; the next one is refused), plus the
#: parse of what is being read (:data:`UPLOAD_MAX_PARSED_BYTES`) — ~35–58× a
#: stream of operators, ~225 MB at the per-stream ceiling (pypdf 6.19,
#: measured). That is *one read*: with the ~230 MB the application and the
#: index hold, ~455 MB of 512 — which is why only one upload PDF is read at a
#: time in the process (:data:`UPLOAD_PDF_SLOT_WAIT_SECONDS`); two at once
#: measured +428 MB, three +624 MB. Measured with the review's probe for PR
#: #100 (one page, 160 forms of 3.9 MB each, 0.66 MB of file): 639 MB of RSS
#: before; after, nine forms decoded and the ninth not parsed, 75 MB, 0.1 s
#: (D-101).
#: It does *not* bound CPU: a form decoded once and drawn again is parsed
#: again with no new decode (0.4 MB drawn 40 times: 23 s, from a 2 KB file) —
#: :data:`UPLOAD_MAX_SECONDS` does.
UPLOAD_MAX_DECODED_BYTES = 32_000_000

#: What an upload may have pypdf parse *at one time*: a page's content stream
#: plus every form XObject being parsed inside it — a form drawn from inside
#: another keeps the outer one's parsed operators alive while it is parsed.
#: The decoded budget above does not bound this: measured with pypdf 6.19, one
#: form of 3.9 MB of path operators costs +225 MB of RSS, and two of them, one
#: inside the other, +420 MB — past what the VM has left, from a 20 KB file
#: that decodes to 8 MB. Set to the per-stream ceiling, so nesting never costs
#: more than one stream at the ceiling already does; real forms (a logo, a
#: figure placed in a slide) are tens of KB. Past it the upload is refused
#: before the stream that would cross it is parsed.
UPLOAD_MAX_PARSED_BYTES = UPLOAD_MAX_STREAM_BYTES

#: Wall-clock budget for one upload, checked before every stream decode and
#: every time pypdf starts parsing a content stream — a page's, or a form's,
#: each time it is drawn — and between pages. The bytes budgets do not bound
#: CPU: a cached form is parsed again on every draw without a new decode
#: (pypdf 6.19 allows 5000 draws per page; 0.4 MB drawn 40 times took 23 s,
#: a 3.9 MB form drawn 4 times 26 s, from files of 2 to 8 KB), holding the
#: single worker's GIL and the upload slot. Measured after: 400 draws of
#: 0.4 MB refused at 30.3 s, 40 draws of 3.9 MB at 35.3 s. 30 s: a dense 400-page text PDF
#: (the page cap, 1.4 million characters) reads in 3 to 6 s on a development
#: machine, so the budget leaves ~5× for the VM's shared CPU; a file that
#: needs more is refused with the time said in seconds. The overshoot is at
#: most one stream's parse — ~6.5 s at the per-stream ceiling — because a
#: parse already started is not interrupted. The Cérebro keeps its 15
#: minutes (:data:`CORPUS_MAX_SECONDS`).
UPLOAD_MAX_SECONDS = 30.0

#: How long an upload waits for the process's only PDF slot before it is
#: refused with "try again" (:func:`read_upload`). The memory bounds above are
#: per read, and the API is one process on a 512 MB VM: two reads at the
#: per-stream ceiling at once measured +428 MB on top of the ~230 MB the
#: process holds, three +624 MB. One slot makes the per-read peak the
#: process's peak (three at once, measured after: 247 MB, served one after
#: the other in 18 s). 15 s
#: covers an ordinary upload ahead in the queue (seconds); one that holds the
#: slot longer is a heavy file, and the student behind it retries. Only uploads
#: take the slot — the Cérebro's ingestion runs on the Actions runner, in its
#: own process.
UPLOAD_PDF_SLOT_WAIT_SECONDS = 15.0
_UPLOAD_PDF_SLOT = threading.BoundedSemaphore(1)

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


class _DecodeBudgetSpent(BaseException):
    """Raised by the metered decoder to stop pypdf in the middle of a page.

    A ``BaseException`` on purpose: pypdf wraps a form XObject in ``except
    Exception`` ("Impossible to decode XFormObject") and would read on to the
    next form, and the next — which is exactly how one page used to decode
    160 forms. Nothing in pypdf catches a ``BaseException``; :func:`read_pdf`
    does, and only this one.
    """


@dataclass
class _DecodeMeter:
    """One read's budget, charged by every stream decode inside it."""

    max_bytes: int | None
    max_seconds: float | None
    #: What a stream that hit the per-stream ceiling is charged: pypdf produced
    #: that much before it gave up, and caches nothing for it.
    ceiling: int
    #: Bound on the content streams being parsed at one time (see
    #: :data:`UPLOAD_MAX_PARSED_BYTES`), or None.
    max_parsing: int | None = None
    #: Bytes of the content streams alive right now — a page's, and the forms
    #: it is inside of — each counted until pypdf lets it go.
    parsing: int = 0
    started: float = field(default_factory=lambda: _clock())
    decoded: int = 0
    #: Which budget is spent, said for a reader — or None while neither is.
    spent: str | None = None
    #: A decode is being charged (:func:`_metered`): no layer under it charges.
    decoding: bool = False
    #: Content streams this read has started to parse (the self-check reads it).
    parsed: int = 0

    def check_time(self) -> None:
        if (
            self.spent is None
            and self.max_seconds is not None
            and _clock() - self.started > self.max_seconds
        ):
            self.spent = f"a leitura passou de {_duration(self.max_seconds)}, o limite de um PDF"

    def before_decode(self) -> None:
        """Refuse a decode once a budget is spent (sticky: every later one too)."""
        self.check_time()
        if self.spent is not None:
            raise _DecodeBudgetSpent

    def start_parse(self, size: int) -> None:
        """A content stream of ``size`` bytes is about to be parsed: refuse it if
        a budget is spent — the clock included, because a form drawn again is
        parsed again with no decode — or if the ones already being parsed and
        it would pass ``max_parsing``."""
        self.parsed += 1
        self.check_time()
        if self.spent is not None:
            raise _DecodeBudgetSpent
        if self.max_parsing is not None and self.parsing + size > self.max_parsing:
            if self.spent is None:
                self.spent = (
                    "o conteúdo que uma página desenha de uma vez (desenhos dentro de "
                    f"desenhos) passa de {_mb(self.max_parsing)}, o limite de leitura de um PDF"
                )
            raise _DecodeBudgetSpent
        self.parsing += size

    def end_parse(self, size: int) -> None:
        self.parsing -= size

    def charge(self, size: int) -> None:
        self.decoded += size
        if self.spent is None and self.max_bytes is not None and self.decoded > self.max_bytes:
            self.spent = (
                f"o conteúdo das páginas já descomprime para mais de {_mb(self.max_bytes)}, "
                "o limite de leitura de um PDF"
            )


# The read in progress in this context, or None: outside :func:`read_pdf` the
# metered decoder is pypdf's own, unchanged. A ``ContextVar`` and not a global,
# for the reason :func:`_pdf_limits` gives — a request served by another thread
# meanwhile has its own read, or none.
_meter: ContextVar[_DecodeMeter | None] = ContextVar("pdf_decode_meter", default=None)
_METERED = "_materialselect_metered"
_install_lock = threading.Lock()


def _metered(original: Callable[[object], bytes]) -> Callable[[object], bytes]:
    from pypdf.errors import LimitReachedError

    @functools.wraps(original)
    def decode_stream_data(stream: object) -> bytes:
        meter = _meter.get()
        if meter is None or meter.decoding:
            # Not in a read — or a second metered layer under the first (a
            # spy installed over the wrapper is wrapped in turn): one decode is
            # charged once.
            return original(stream)
        meter.before_decode()
        meter.decoding = True
        try:
            data = original(stream)
        except LimitReachedError:
            meter.charge(meter.ceiling)
            raise
        finally:
            meter.decoding = False
        meter.charge(len(data))
        return data

    setattr(decode_stream_data, _METERED, True)
    return decode_stream_data


def _metered_parse(original: Callable[..., None]) -> Callable[..., None]:
    @functools.wraps(original)
    def __init__(self: object, *args: object, **kwargs: object) -> None:
        original(self, *args, **kwargs)
        meter = _meter.get()
        if meter is None:
            return
        size = len(self.get_data())  # type: ignore[attr-defined]
        meter.start_parse(size)
        # Released when pypdf lets the stream go: at the end of the form (or
        # page) that parsed it — CPython frees it there, by reference count.
        weakref.finalize(self, meter.end_parse, size)

    setattr(__init__, _METERED, True)
    return __init__


def _install_meters() -> None:
    """Put the meters in front of pypdf's decoder and parser, once per process.

    Every stream pypdf decodes — a page's content, a form XObject, a font
    program, a ``/ToUnicode`` map, an object or xref stream — goes through
    ``pypdf.filters.decode_stream_data``, which ``EncodedStreamObject.get_data``
    imports at call time (pypdf 6.18.0 to 6.19.0, read in their sources), so
    replacing the module attribute reaches all of them. The wrapper is
    installed once, under a lock, and never removed: removing it when one read
    ends would unmeter another read still running on another thread. Outside a
    read it only looks up an unset ``ContextVar`` and calls pypdf's function.
    Checked again at every read, so whatever replaced it (a test's spy) is
    wrapped in turn; a test proves that a decode inside a page is charged, so
    a pypdf that stopped calling it would fail the suite — and, in production,
    where the image is built without the tests, the first upload's self-check
    (:func:`_meters_work`) refuses every PDF upload instead of reading it
    unbounded; ``pyproject.toml`` also caps pypdf below 6.20.

    The same goes for ``ContentStream.__init__``, which every content stream
    text extraction parses goes through — a page's, and each form XObject's,
    every time it is drawn — so a read can check its clock at every parse (a
    form drawn again is parsed again with no decode) and an upload can bound
    what is parsed at one time (:data:`UPLOAD_MAX_PARSED_BYTES`).
    """
    import pypdf.filters
    from pypdf.generic import ContentStream

    if getattr(pypdf.filters.decode_stream_data, _METERED, False) and getattr(
        ContentStream.__init__, _METERED, False
    ):
        return
    with _install_lock:
        current = pypdf.filters.decode_stream_data
        if not getattr(current, _METERED, False):
            pypdf.filters.decode_stream_data = _metered(current)
        if not getattr(ContentStream.__init__, _METERED, False):
            ContentStream.__init__ = _metered_parse(ContentStream.__init__)  # type: ignore


@contextmanager
def _metered_decoding(meter: _DecodeMeter) -> Iterator[_DecodeMeter]:
    """Charge every stream pypdf decodes inside the block to ``meter``.

    The decode that crosses a budget finishes — its bytes are already
    produced — but nothing is parsed after it: the next decode, or the parse
    of the stream it produced, raises :class:`_DecodeBudgetSpent`, inside the
    page if that is where pypdf is: the budget holds per decode, not per
    page, so a page cannot hold more than the document may (one page with 160
    forms of 3.9 MB each held 639 MB before; see :data:`UPLOAD_MAX_DECODED_BYTES`).
    The meter is reset when the block exits, on an exception too.
    """
    _install_meters()
    token = _meter.set(meter)
    try:
        yield meter
    finally:
        _meter.reset(token)


def _release_decoded(reader: object) -> None:
    """Drop pypdf's decoded copies when it holds many of them.

    pypdf caches every stream it decodes on the stream object
    (``EncodedStreamObject.decoded_self``), and every object it resolves in
    ``PdfReader.resolved_objects`` for the life of the reader — so, left alone,
    a book holds every page's decoded content until the last page is read, and
    memory grows with the *sum* of the streams, not the largest (measured: 8
    pages of 200 MB climbed to 1.6 GB of RSS; dropped per page, flat at 48 MB).

    Called after every page: when the copies still held pass
    :data:`_MAX_RETAINED_DECODED_BYTES`, drops all of them, keeping the encoded
    bytes — which are the file's own, bounded by its size. A stream needed
    again is decoded again, and charged again (:func:`_metered_decoding`).
    """
    from pypdf.generic import EncodedStreamObject

    held = 0
    streams = []
    for obj in getattr(reader, "resolved_objects", {}).values():
        if not isinstance(obj, EncodedStreamObject) or obj.decoded_self is None:
            continue
        held += len(obj.decoded_self.get_data())
        streams.append(obj)
    if held > _MAX_RETAINED_DECODED_BYTES:
        for obj in streams:
            obj.decoded_self = None


#: What a student reads when pypdf cannot open the file at all. pypdf's own
#: message is English and may quote the file's bytes; neither belongs in a
#: refusal, nor in ``knowledge_document.error`` (a public log prints it).
_CANNOT_OPEN = (
    "Não foi possível abrir o PDF: o arquivo está corrompido, protegido ou usa um recurso "
    "que o leitor não reconhece. Exporte-o de novo (no leitor de PDF, Imprimir → Salvar como "
    "PDF) ou envie o texto em outro formato."
)
#: ...and when its structure passes one of pypdf's limits (the page tree, the
#: outline, an object stream past the ceiling) before a page is read.
_TOO_BIG_TO_OPEN = (
    "Não foi possível abrir o PDF: a estrutura do arquivo passa dos limites de leitura "
    "(páginas, objetos ou fluxos grandes demais). Divida o documento em partes, exporte-o de "
    "novo como um PDF mais simples ou envie o texto em outro formato."
)


def _unreadable_page(index: int, exc: BaseException) -> ValidationError:
    """One page that cannot be read, in Portuguese, without pypdf's text."""
    return ValidationError(
        f"Não foi possível ler o PDF: a página {index + 1} está corrompida ou usa um recurso "
        f"que o leitor não reconhece ({type(exc).__name__}). Exporte o PDF de novo ou envie o "
        "texto em outro formato."
    )


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
    """More than a fifth of the pages, and two of them or half the document.

    Monotone in ``skipped``, so :func:`read_pdf` can stop at the first page
    that makes it true: the pages still unread cannot make it false again.
    """
    if skipped <= MAX_SKIPPED_PAGE_SHARE * count:
        return False
    return skipped >= MIN_SKIPPED_PAGES_TO_FAIL or 2 * skipped >= count


def _duration(seconds: float) -> str:
    """``30 s``, ``15 min`` — a budget as a reader says it, never ``0 min``."""
    if seconds < 60:
        return f"{seconds:.0f} s"
    return f"{seconds / 60:.0f} min"


def _mb(value: int) -> str:
    """``4 MB``, ``2,5 MB`` — pt-BR decimal comma, one decimal only when needed."""
    if value % 1_000_000 == 0:
        return f"{value // 1_000_000} MB"
    return f"{value / 1_000_000:.1f} MB".replace(".", ",")


def read_pdf(
    source: Path | io.BytesIO,
    *,
    max_stream_bytes: int | None = None,
    skip_unreadable_pages: bool = False,
    max_decoded_bytes: int | None = None,
    max_seconds: float | None = None,
    max_pages: int | None = None,
    max_parsed_bytes: int | None = None,
) -> ExtractedText:
    """Extract text from a PDF, page by page.

    Whatever the caller, pypdf's decoded copies are released between pages
    (:func:`_release_decoded`), so they do not pile up from page to page. The
    rest is the caller's policy — the Cérebro's in :func:`extract_text`, a
    student's in :func:`read_upload`:

    * ``max_stream_bytes`` sets pypdf's per-stream decompression ceiling
      (default: pypdf's own, 75 MB) for the duration of this read.
    * ``max_decoded_bytes`` and ``max_seconds`` budget the whole document,
      charged at every stream decode (:func:`_metered_decoding`), inside a
      page as much as between pages: everything pypdf decoded (a stream that
      hit the ceiling counts as the ceiling), and the wall-clock time — also
      checked between pages, and never in the middle of one stream's parse.
    * ``max_parsed_bytes`` bounds the content streams parsed at one time — a
      page's and the forms nested in it (:data:`UPLOAD_MAX_PARSED_BYTES`).
    * ``max_pages`` refuses a longer document right after opening it, before
      a single page is decoded.
    * ``skip_unreadable_pages`` turns a page that cannot be decoded — the
      ceiling, a zlib error, a malformed stream — into an empty page counted
      in :attr:`ExtractedText.skipped_pages` by exception class, and a spent
      budget into the page in progress and the remaining ones skipped. Too many
      pages left out (:func:`_too_many_skipped`) fails the document, as soon as
      that is certain — so a stream shared by every page that cannot be
      decoded is not decoded again for the whole book. Without the flag, the
      first bad page or a spent budget fails the read — on the last page too:
      an upload is all or nothing.

    Raises:
        ValidationError: the file cannot be opened or parsed at all, has more
            than ``max_pages`` pages, spends a budget or has a bad page with
            ``skip_unreadable_pages`` off, or — with it on — has too many
            pages left out. Every message is Portuguese and never quotes
            pypdf's. A file that opens but holds no text is *not* an error —
            it returns empty pages, and the caller records that as a document
            with nothing to index.
    """
    from pypdf import Configuration, PdfReader
    from pypdf.errors import LimitReachedError

    meter = _DecodeMeter(
        max_bytes=max_decoded_bytes,
        max_seconds=max_seconds,
        ceiling=max_stream_bytes or Configuration().zlib_maximum_output_length,
        max_parsing=max_parsed_bytes,
    )

    def heavy(where: str) -> ValidationError:
        return ValidationError(
            f"O PDF é pesado demais para ler: {where}, {meter.spent}. Divida o documento em "
            "partes, exporte-o de novo como um PDF mais simples ou cole o texto."
        )

    with _pdf_limits(max_stream_bytes), _metered_decoding(meter):
        try:
            reader = PdfReader(source if isinstance(source, io.BytesIO) else str(source))
            count = len(reader.pages)
        except _DecodeBudgetSpent:
            raise heavy("antes da primeira página") from None
        except LimitReachedError as exc:
            raise ValidationError(_TOO_BIG_TO_OPEN) from exc
        except Exception as exc:  # pypdf raises many types for malformed files
            raise ValidationError(_CANNOT_OPEN) from exc
        if max_pages is not None and count > max_pages:
            raise ValidationError(
                f"O arquivo tem {count} páginas; o limite por fonte é "
                f"{max_pages}. Divida o documento em partes."
            )

        _release_decoded(reader)  # object and xref streams
        pages: list[str] = []
        reasons: Counter[str] = Counter()
        for index in range(count):
            aborted = False
            try:
                text = reader.pages[index].extract_text() or ""
            except _DecodeBudgetSpent:
                aborted = True  # stopped mid-page: what it read is incomplete
                text = ""
            except Exception as exc:  # same: a bad page raises whatever it raises
                if not skip_unreadable_pages:
                    if isinstance(exc, LimitReachedError):
                        raise ValidationError(
                            f"Não foi possível ler o PDF: a página {index + 1} descomprime "
                            f"para mais de {_mb(meter.ceiling)}, o limite de cada fluxo de "
                            "conteúdo do PDF — um desenho vetorial denso (CAD, mapa, gráfico "
                            "com milhares de pontos) costuma ser a causa. Exporte o PDF de "
                            'novo "achatado" ou como imagem (no leitor de PDF, Imprimir → '
                            "Salvar como PDF), envie um PDF sem essa página ou o texto em "
                            "outro formato."
                        ) from exc
                    raise _unreadable_page(index, exc) from exc
                reasons[type(exc).__name__] += 1
                text = ""  # the slot stays, so the next page keeps its number
            finally:
                _release_decoded(reader)

            remaining = count - index - 1
            if remaining:
                meter.check_time()
            if meter.spent is not None:
                if not skip_unreadable_pages:
                    raise heavy(f"até a página {index + 1} de {count}")
                if aborted:
                    reasons[BUDGET_REASON] += 1
                    text = ""
                reasons[BUDGET_REASON] += remaining
                pages.append(storable_text(text))
                pages.extend([""] * remaining)
            else:
                pages.append(storable_text(text))
            skipped = sum(reasons.values())
            if skip_unreadable_pages and _too_many_skipped(skipped, count):
                # Stopped as soon as it is certain: the rest is not decoded.
                if skipped == count:
                    # Not a book with bad pages: nothing in it could be read.
                    none = (
                        "a única página não pôde ser lida"
                        if count == 1
                        else f"nenhuma das {count} páginas pôde ser lida"
                    )
                    raise ValidationError(
                        f"Não foi possível ler o PDF: {none} ({skip_reasons_text(reasons)})."
                    )
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
    return ExtractedText(pages=pages, skipped_pages=skipped, skip_reasons=dict(reasons))


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


#: Why every PDF upload is refused when :func:`_meters_work` says no.
_METERS_OFF = (
    "A leitura de PDF está suspensa neste servidor: uma verificação interna de segurança "
    "falhou. Envie o texto em DOCX, TXT ou Markdown e avise quem mantém a ferramenta."
)
_meters_verified: bool | None = None
_self_check_lock = threading.Lock()


def _self_check_pdf() -> bytes:
    """A one-page PDF whose Flate content stream draws one Flate form."""
    import zlib

    page = zlib.compress(b"BT /F1 12 Tf 72 720 Td (ok) Tj ET /X0 Do")
    form = zlib.compress(b"BT /F1 12 Tf 72 700 Td (forma) Tj ET")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font "
        b"<< /F1 6 0 R >> /XObject << /X0 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(page) + page + b"\nendstream",
        b"<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font "
        b"<< /F1 6 0 R >> >> /Length %d /Filter /FlateDecode >>\nstream\n" % len(form)
        + form
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


def _check_meters() -> bool:
    """Read :func:`_self_check_pdf` under a meter and see the meter move.

    The meters wrap two pypdf internals (:func:`_install_meters`), checked in
    the sources of 6.18 and 6.19 and pinned below 6.20 in ``pyproject.toml``.
    If a pypdf ever stopped going through them, every upload bound would
    silently stop holding — the deploy builds the image without running the
    tests — so the first upload of a process checks that both a decode and a
    parse reach the meter. Never raises: a failure is a ``False`` and a log line.
    """
    try:
        from pypdf import PdfReader, __version__

        meter = _DecodeMeter(
            max_bytes=None,
            max_seconds=None,
            ceiling=UPLOAD_MAX_STREAM_BYTES,
            max_parsing=UPLOAD_MAX_PARSED_BYTES,
        )
        with _pdf_limits(UPLOAD_MAX_STREAM_BYTES), _metered_decoding(meter):
            text = PdfReader(io.BytesIO(_self_check_pdf())).pages[0].extract_text() or ""
        # The page's stream and the form's: two decodes, two parses.
        ok = meter.decoded > 0 and meter.parsed >= 2 and "forma" in text
        version = __version__
    except Exception as exc:  # whatever pypdf does, the answer is "not verified"
        ok, version = False, f"? ({type(exc).__name__})"
    if not ok:
        _log.error(
            "readers: os medidores de leitura de PDF não foram alcançados (pypdf %s); "
            "todo upload de PDF será recusado até isso ser corrigido (D-101).",
            version,
        )
    return ok


def _meters_work() -> bool:
    """Whether the upload bounds are really enforced — checked once per process."""
    global _meters_verified
    if _meters_verified is None:
        with _self_check_lock:
            if _meters_verified is None:
                _meters_verified = _check_meters()
    return _meters_verified


def read_upload(filename: str, data: bytes, *, max_pages: int | None = None) -> ExtractedText:
    """Extract text from an uploaded file's bytes.

    The extension picks the reader, and the first bytes must agree with it: a
    ``.pdf`` that is not a PDF is refused with that said, rather than handed to
    a parser that would fail with a stack of pypdf internals.

    A PDF is read with :data:`UPLOAD_MAX_STREAM_BYTES` per stream,
    :data:`UPLOAD_MAX_DECODED_BYTES` for the whole file — charged at every
    stream decode, so a single page is held to it too —,
    :data:`UPLOAD_MAX_PARSED_BYTES` parsed at one time and
    :data:`UPLOAD_MAX_SECONDS` of clock, and its page count is checked before
    any page is decoded (D-101): the API's VM has 512 MB, and a file of less
    than 1 MB can otherwise ask for gigabytes or hours. Those bounds hold per
    read, so only one PDF is read at a time in the process (the slot waits
    :data:`UPLOAD_PDF_SLOT_WAIT_SECONDS`, then refuses); and nothing is read
    if the meters that enforce them are not reached (:func:`_meters_work`).

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
        if not _meters_work():
            raise ValidationError(_METERS_OFF)
        # One PDF at a time in the process: the bounds below are per read.
        if not _UPLOAD_PDF_SLOT.acquire(timeout=UPLOAD_PDF_SLOT_WAIT_SECONDS):
            raise ValidationError(
                "Outro PDF está sendo lido agora no servidor; tente enviar de novo em " "instantes."
            )
        try:
            # These bytes are a student's, not the curated corpus (D-101): a
            # small per-stream ceiling, budgets for the whole file charged at
            # every decode and every parse, sized for the API's VM, the page
            # count refused before any page is decoded, and fail-fast on a bad
            # page.
            return read_pdf(
                io.BytesIO(data),
                max_stream_bytes=UPLOAD_MAX_STREAM_BYTES,
                max_decoded_bytes=UPLOAD_MAX_DECODED_BYTES,
                max_parsed_bytes=UPLOAD_MAX_PARSED_BYTES,
                max_seconds=UPLOAD_MAX_SECONDS,
                max_pages=max_pages,
            )
        finally:
            _UPLOAD_PDF_SLOT.release()
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
