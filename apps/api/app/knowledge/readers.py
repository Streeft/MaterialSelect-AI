"""Text extraction from reference documents.

Returns the same shape for every format — :class:`ExtractedText`, a list of
pages — so the chunker never learns what a PDF is. Today only PDF is
implemented, because that is what the corpus is; a reader for another format
adds a branch in :func:`extract_text` and nothing else.

``pypdf`` was chosen over ``pymupdf``: it is pure Python, small, and
permissively licensed, where pymupdf is AGPL and would put a copyleft term on a
project that has none. The trade is real and worth naming — pymupdf reads
two-column layouts and tables noticeably better, which is exactly the shape of a
textbook page. If extraction quality proves to be the bottleneck, this module is
the only thing that has to change.

Nothing here raises on a page it cannot read. A PDF of scanned images yields
empty pages, and empty is the honest answer: no OCR runs, so no text is
invented to fill the gap.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from app.domain.errors import ValidationError

SUPPORTED_EXTENSIONS = {".pdf"}


@dataclass
class ExtractedText:
    """Text of one document, one string per page.

    ``pages`` is 0-indexed; page *numbers* shown to a reader are 1-based, and
    the conversion happens once, in the chunker.
    """

    pages: list[str] = field(default_factory=list)

    @property
    def page_count(self) -> int:
        return len(self.pages)

    @property
    def is_empty(self) -> bool:
        """True when no page yielded any text — a scan, or a broken file."""
        return not any(page.strip() for page in self.pages)


def read_pdf(path: Path) -> ExtractedText:
    """Extract text from a PDF, page by page.

    Raises:
        ValidationError: the file cannot be opened or parsed at all. A file that
            opens but holds no text is *not* an error — it returns empty pages,
            and the caller records that as a document with nothing to index.
    """
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - exercised by the extra being absent
        raise ValidationError(
            "Extração de PDF requer o extra 'knowledge': pip install -e \".[knowledge]\"."
        ) from exc

    try:
        reader = PdfReader(str(path))
        pages = [(page.extract_text() or "") for page in reader.pages]
    except Exception as exc:  # pypdf raises many types for malformed files
        raise ValidationError(f"Não foi possível ler o PDF: {exc}") from exc

    return ExtractedText(pages=pages)


def extract_text(path: Path) -> ExtractedText:
    """Dispatch to the reader for ``path``'s extension."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return read_pdf(path)
    raise ValidationError(f"Formato não suportado para extração: {suffix or path.name}")
