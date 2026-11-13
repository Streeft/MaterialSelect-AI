"""Splitting extracted text into retrievable passages.

Not a fixed-width slicer. A chunk that begins mid-sentence and ends mid-table
retrieves badly and reads worse, and — the part that matters for this project —
a property value separated from its unit and its material name is exactly the
kind of fragment that invites a wrong reading. So the split follows the
document's own seams: paragraphs first, sentences only when a single paragraph
is too long to stand alone, and never a hard cut at an arbitrary character.

Every chunk keeps three things a citation needs: the page range it came from,
the nearest heading above it, and its position in the document. Retrieval
without those is an answer nobody can check.

Each chunk also carries where its own text sits in the source (``char_start`` /
``char_end``, D-233): the half-open interval in the document as the notebook
stores it — pages stripped and joined by a blank line, empty pages left out — so
a citation can mark its passage by position instead of looking the words up.

Overlap exists because the seam is not always where the meaning is: a definition
introduced at the end of one chunk is often used at the start of the next, and a
few hundred characters of shared context costs little and saves that case.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.knowledge.readers import ExtractedText, storable_text

#: Aim for chunks around this size — big enough to carry an argument, small
#: enough that several fit in a prompt alongside the catalogue.
TARGET_CHARS = 1200
#: Never emit a chunk longer than this; a paragraph above it gets split.
MAX_CHARS = 2000
#: Trailing context repeated at the start of the next chunk.
OVERLAP_CHARS = 200
#: Below this, a passage is too small to retrieve well on its own — a stray
#: caption, a page number, the tail of a section. Such a fragment is *merged
#: into its predecessor*, never dropped: silently discarding text would make the
#: corpus quietly incomplete, and an index that lost content without saying so
#: is worse than one that keeps a little noise.
MIN_CHARS = 80

# A heading is short, does not end like a sentence, and either is numbered
# ("3.2 Seleção de materiais") or is written in title/caps style. Deliberately
# conservative: a missed heading costs a little context, a false one mislabels
# every chunk beneath it.
_NUMBERED_HEADING = re.compile(r"^\s*\d+(\.\d+)*\.?\s+\S")
_SENTENCE_END = re.compile(r"[.:;,]$")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-Þ])")
# PDF extraction leaves hyphenated line breaks ("resis-\ntência") and hard wraps
# inside what is logically one paragraph.
_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
_SOFT_WRAP = re.compile(r"(?<![\n.:;!?])\n(?!\n)")
_BLANK_LINES = re.compile(r"\n{2,}")
_SPACES = re.compile(r"[ \t ]+")


@dataclass(frozen=True)
class Chunk:
    """One retrievable passage, with everything needed to cite it."""

    ordinal: int
    text: str
    page_start: int | None
    page_end: int | None
    heading: str | None
    #: Where the passage's own text sits in the source's ``content`` — half-open,
    #: ``None`` for a chunk nobody placed. The overlap repeated from the previous
    #: passage is not inside it.
    char_start: int | None = None
    char_end: int | None = None

    @property
    def char_count(self) -> int:
        return len(self.text)


@dataclass(frozen=True)
class _Block:
    """One paragraph, tagged with the 1-based page it was found on.

    ``origin`` is where the raw paragraph starts in the source's ``content`` and
    ``index[i]`` is the offset, inside that raw paragraph, of the character ``text[i]``
    came from (see :func:`_normalise_with_map`).
    """

    text: str
    page: int
    origin: int = 0
    index: tuple[int, ...] = ()


def normalise(text: str) -> str:
    """Undo the artefacts PDF extraction leaves in otherwise clean prose.

    The first is the one a database refuses: whatever reader produced the
    pages — or none, for a pasted text — a passage and its heading leave here
    storable (:func:`~app.knowledge.readers.storable_text`), and so does the
    ``search_text`` folded from them.
    """
    text = storable_text(text).replace("\r\n", "\n").replace("\r", "\n")
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = _SOFT_WRAP.sub(" ", text)
    text = _SPACES.sub(" ", text)
    return text.strip()


def _resub(
    text: str,
    index: list[int],
    pattern: re.Pattern[str],
    replace: Callable[[re.Match[str]], list[tuple[str, int]]],
) -> tuple[str, list[int]]:
    """``pattern.sub`` that keeps ``index`` in step with the text.

    ``replace`` returns the characters that stand in for one match, each with the
    position **in ``text``** it came from, so the map follows the character and
    not the slot.
    """
    out: list[str] = []
    out_index: list[int] = []
    cursor = 0
    for match in pattern.finditer(text):
        out.append(text[cursor : match.start()])
        out_index.extend(index[cursor : match.start()])
        for char, source in replace(match):
            out.append(char)
            out_index.append(index[source])
        cursor = match.end()
    out.append(text[cursor:])
    out_index.extend(index[cursor:])
    return "".join(out), out_index


def _normalise_with_map(raw: str) -> tuple[str, list[int]]:
    """:func:`normalise` of ``raw`` plus, for each output character, where it came from.

    The text is exactly ``normalise(raw)`` (a test holds the two together); the list
    says, for ``text[i]``, the offset in ``raw`` of the character it is or — for a
    blank that stands for a run, or a ``\n`` turned into a space — of the first one.
    Same steps, same order as :func:`normalise`.
    """
    chars: list[str] = []
    index: list[int] = []
    position = 0
    while position < len(raw):
        char = raw[position]
        if char == "\r":
            chars.append("\n")
            index.append(position)
            if raw[position + 1 : position + 2] == "\n":
                position += 1
        else:
            kept = storable_text(char)
            if kept:
                chars.append(kept)
                index.append(position)
        position += 1
    text = "".join(chars)

    text, index = _resub(
        text,
        index,
        _HYPHEN_BREAK,
        lambda m: [(m.group(1), m.start(1)), (m.group(2), m.start(2))],
    )
    text, index = _resub(text, index, _SOFT_WRAP, lambda m: [(" ", m.start())])
    text, index = _resub(text, index, _SPACES, lambda m: [(" ", m.start())])

    lead = len(text) - len(text.lstrip())
    stripped = text.strip()
    return stripped, index[lead : lead + len(stripped)]


def looks_like_heading(line: str) -> bool:
    """True when a line reads as a section title rather than prose."""
    stripped = line.strip()
    if not stripped or len(stripped) > 120 or _SENTENCE_END.search(stripped):
        return False
    # A table row (DOCX or flattened) uses " | " between cells — never a
    # heading.  This guard closes the false-positive reported in D-97:
    # "1 | Aço | 200" was matching _NUMBERED_HEADING and being consumed as a
    # section title, mislabelling every chunk beneath it.
    if " | " in stripped:
        return False
    if _NUMBERED_HEADING.match(stripped):
        return True
    letters = [c for c in stripped if c.isalpha()]
    if len(letters) < 3:
        return False
    # Written in capitals, and not merely an acronym that happens to be alone.
    return all(c.isupper() for c in letters) and len(stripped.split()) > 1


def _blocks(extracted: ExtractedText) -> list[_Block]:
    """Flatten pages into paragraphs that remember which page they came from.

    Each paragraph also knows where it starts in the source's ``content``, which is
    the stripped, non-empty pages joined by ``"\n\n"`` — the text the notebook stores.
    """
    blocks: list[_Block] = []
    base = 0
    for page_index, raw_page in enumerate(extracted.pages):
        page = page_index + 1  # 1-based, as a reader counts
        stripped = raw_page.strip()
        origin = 0
        if stripped:
            origin = base - (len(raw_page) - len(raw_page.lstrip()))
            base += len(stripped) + 2
        segments: list[tuple[int, str]] = []
        cursor = 0
        for gap in _BLANK_LINES.finditer(raw_page):
            segments.append((cursor, raw_page[cursor : gap.start()]))
            cursor = gap.end()
        segments.append((cursor, raw_page[cursor:]))
        for offset, paragraph in segments:
            cleaned, index = _normalise_with_map(paragraph)
            if cleaned:
                blocks.append(
                    _Block(
                        text=cleaned,
                        page=page,
                        origin=origin + offset,
                        index=tuple(index),
                    )
                )
    return blocks


def _locate_pieces(text: str, pieces: list[str]) -> list[tuple[int, int]]:
    """Where each piece of a split paragraph sits in the paragraph's normalised text.

    The pieces are slices of ``text`` re-joined by single blanks, so they are found
    by their words with any whitespace between, scanning forward. A piece that cannot
    be found (it should not happen) is given the whole paragraph rather than a guess.
    """
    spans: list[tuple[int, int]] = []
    cursor = 0
    for piece in pieces:
        words = piece.split()
        match = (
            re.compile(r"\s+".join(re.escape(word) for word in words)).search(text, cursor)
            if words
            else None
        )
        if match is None:
            spans.append((0, len(text)))
        else:
            spans.append(match.span())
            cursor = match.end()
    return spans


def _split_long(text: str, target: int) -> list[str]:
    """Break an oversized paragraph at sentence boundaries.

    Every piece comes back no longer than ``target``. That bound is what lets
    the caller guarantee the hard ceiling: a piece plus the carried overlap must
    still fit under ``MAX_CHARS``, and it only does if pieces are capped at the
    target rather than at the ceiling itself.
    """
    sentences = _SENTENCE_SPLIT.split(text)
    parts: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if current and len(candidate) > target:
            parts.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        parts.append(current)

    # A single sentence longer than the target (a table flattened into one line,
    # typically) still has to be cut somewhere. Cutting on whitespace at least
    # keeps words whole.
    final: list[str] = []
    for part in parts:
        while len(part) > target:
            cut = part.rfind(" ", 0, target)
            if cut <= 0:
                cut = target
            final.append(part[:cut].strip())
            part = part[cut:].strip()
        if part:
            final.append(part)
    return final


def _tail(text: str, size: int) -> str:
    """The last ``size`` characters of ``text``, starting at a word boundary."""
    if len(text) <= size:
        return text
    tail = text[-size:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 else tail


def chunk_text(
    extracted: ExtractedText,
    target_chars: int = TARGET_CHARS,
    overlap_chars: int = OVERLAP_CHARS,
) -> list[Chunk]:
    """Split extracted text into citable passages.

    Paragraphs accumulate until the target size is reached; a paragraph too long
    to fit alone is split at sentence boundaries first. Headings are carried
    forward to whichever chunks follow them, and page range is tracked across
    every paragraph a chunk absorbed — so a passage spanning a page break says
    so instead of claiming one page or the other.
    """
    chunks: list[Chunk] = []
    heading: str | None = None

    buffer: list[str] = []
    buffer_len = 0
    first_page: int | None = None
    last_page: int | None = None
    buffer_heading: str | None = None
    #: Where the buffer's own pieces (not the carried overlap) start and end in the content.
    span_start: int | None = None
    span_end: int | None = None
    carried = ""

    def flush() -> None:
        nonlocal buffer, buffer_len, first_page, last_page, buffer_heading, carried
        nonlocal span_start, span_end
        if not buffer:
            return
        text = " ".join(buffer).strip()

        # A fragment too small to stand alone joins its predecessor — but only
        # one that belongs to the same section, and only if the result still
        # fits. Merging across a heading would file text under the wrong title,
        # which is a worse error than a short chunk.
        previous = chunks[-1] if chunks else None
        can_merge = (
            previous is not None
            and len(text) < MIN_CHARS
            and previous.heading == buffer_heading
            and len(previous.text) + len(text) + 1 <= MAX_CHARS
        )
        if can_merge and previous is not None:
            merged = f"{previous.text} {text}"
            chunks[-1] = Chunk(
                ordinal=previous.ordinal,
                text=merged,
                page_start=previous.page_start,
                page_end=last_page or previous.page_end,
                heading=previous.heading,
                char_start=previous.char_start,
                char_end=span_end if span_end is not None else previous.char_end,
            )
            carried = _tail(merged, overlap_chars) if overlap_chars > 0 else ""
        else:
            chunks.append(
                Chunk(
                    ordinal=len(chunks),
                    text=text,
                    page_start=first_page,
                    page_end=last_page,
                    heading=buffer_heading,
                    char_start=span_start,
                    char_end=span_end,
                )
            )
            carried = _tail(text, overlap_chars) if overlap_chars > 0 else ""

        buffer, buffer_len = [], 0
        first_page = last_page = None
        buffer_heading = None
        span_start = span_end = None

    for block in _blocks(extracted):
        if looks_like_heading(block.text):
            # A heading closes the passage above it: what follows is a new
            # subject, and letting it bleed across would mislabel both.
            flush()
            heading = block.text
            continue

        # Split at the *target*, not the ceiling: a piece must leave room for
        # the carried overlap and still fit under MAX_CHARS.
        pieces = (
            _split_long(block.text, target_chars)
            if len(block.text) > target_chars
            else [block.text]
        )
        spans = _locate_pieces(block.text, pieces) if len(pieces) > 1 else [(0, len(block.text))]
        for piece, (piece_start, piece_end) in zip(pieces, spans, strict=True):
            if buffer and buffer_len + len(piece) > target_chars:
                flush()
            if not buffer:
                buffer_heading = heading
                first_page = block.page
                if carried:
                    buffer.append(carried)
                    buffer_len += len(carried)
                    carried = ""
            buffer.append(piece)
            buffer_len += len(piece)
            last_page = block.page
            if block.index:
                if span_start is None:
                    span_start = block.origin + block.index[piece_start]
                span_end = block.origin + block.index[piece_end - 1] + 1

    flush()
    return chunks
