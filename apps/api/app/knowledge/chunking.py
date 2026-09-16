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

Overlap exists because the seam is not always where the meaning is: a definition
introduced at the end of one chunk is often used at the start of the next, and a
few hundred characters of shared context costs little and saves that case.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.knowledge.readers import ExtractedText

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
_SPACES = re.compile(r"[ \t ]+")


@dataclass(frozen=True)
class Chunk:
    """One retrievable passage, with everything needed to cite it."""

    ordinal: int
    text: str
    page_start: int | None
    page_end: int | None
    heading: str | None

    @property
    def char_count(self) -> int:
        return len(self.text)


@dataclass(frozen=True)
class _Block:
    """One paragraph, tagged with the 1-based page it was found on."""

    text: str
    page: int


def normalise(text: str) -> str:
    """Undo the artefacts PDF extraction leaves in otherwise clean prose."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = _SOFT_WRAP.sub(" ", text)
    text = _SPACES.sub(" ", text)
    return text.strip()


def looks_like_heading(line: str) -> bool:
    """True when a line reads as a section title rather than prose."""
    stripped = line.strip()
    if not stripped or len(stripped) > 120 or _SENTENCE_END.search(stripped):
        return False
    if _NUMBERED_HEADING.match(stripped):
        return True
    letters = [c for c in stripped if c.isalpha()]
    if len(letters) < 3:
        return False
    # Written in capitals, and not merely an acronym that happens to be alone.
    return all(c.isupper() for c in letters) and len(stripped.split()) > 1


def _blocks(extracted: ExtractedText) -> list[_Block]:
    """Flatten pages into paragraphs that remember which page they came from."""
    blocks: list[_Block] = []
    for index, raw in enumerate(extracted.pages):
        page = index + 1  # 1-based, as a reader counts
        for paragraph in _BLANK_LINES.split(raw):
            cleaned = normalise(paragraph)
            if cleaned:
                blocks.append(_Block(text=cleaned, page=page))
    return blocks


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
    carried = ""

    def flush() -> None:
        nonlocal buffer, buffer_len, first_page, last_page, buffer_heading, carried
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
                )
            )
            carried = _tail(text, overlap_chars) if overlap_chars > 0 else ""

        buffer, buffer_len = [], 0
        first_page = last_page = None
        buffer_heading = None

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
        for piece in pieces:
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

    flush()
    return chunks
