"""The knowledge base's removal list: what left the Cérebro and must not return.

``Cérebro/removidos.txt`` (D-100) is the single source of truth for documents
taken out of the knowledge base. Three consumers read it and none keeps a copy
of its own: the prune CLI (:mod:`app.knowledge.prune`) deletes the matching rows
from a database, the ingestion skips matching files even if they reappear on
disk, and the git history purge converts it for ``git filter-repo``.

The format is deliberately small, because it is edited by hand and read by a
shell script too:

* one path per line, relative to ``KNOWLEDGE_DIR``, POSIX separators — the same
  shape :class:`app.models.knowledge.KnowledgeDocument` stores in ``path``;
* a line ending in ``/`` is a folder prefix and matches everything under it;
  any other line matches that exact path and nothing else — ``Tópico 1.pdf``
  must not take ``Tópico 1.pdf.bak`` or ``Tópico 10.pdf`` with it;
* blank lines and lines starting with ``#`` are ignored. There are no inline
  comments, because ``#`` is a legal character in a file name.

Matching normalises both sides to Unicode NFC. A path ingested on macOS may
have been stored decomposed (NFD), and "Tópico" in NFD and in NFC are different
strings that print identically — a list that silently failed to match them
would report "nothing to remove" while the text stayed in the RAG.

Pure module: no database, no filesystem beyond reading the list, no ``pypdf``.
The prune CLI runs in the admin workflow, which installs neither the
``knowledge`` extra nor the corpus.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from pathlib import Path

from app.domain.errors import ValidationError

#: File name of the removal list inside the knowledge root.
REMOVAL_LIST_FILENAME = "removidos.txt"


def normalise(path: str) -> str:
    """The form every comparison uses: NFC, so NFD and NFC spellings agree."""
    return unicodedata.normalize("NFC", path)


@dataclass(frozen=True)
class RemovalList:
    """Parsed removal list: exact paths and folder prefixes, both NFC."""

    exact: frozenset[str]
    prefixes: tuple[str, ...]

    @property
    def entries(self) -> tuple[str, ...]:
        """Every entry, prefixes first, in a stable order for reporting."""
        return self.prefixes + tuple(sorted(self.exact))

    @property
    def is_empty(self) -> bool:
        return not self.exact and not self.prefixes

    def entry_matches(self, entry: str, path: str) -> bool:
        """Whether one entry of this list matches ``path``."""
        candidate = normalise(path)
        if entry.endswith("/"):
            return candidate.startswith(entry)
        return candidate == entry

    def matches(self, path: str) -> bool:
        """Whether ``path`` (relative to the knowledge root) is on the list."""
        candidate = normalise(path)
        return candidate in self.exact or any(candidate.startswith(p) for p in self.prefixes)


def parse_removal_list(text: str) -> RemovalList:
    """Parse the list's text.

    Raises:
        ValidationError: an entry is absolute or climbs out of the root. Both
            would mean the list was written against a different base than the
            one ``knowledge_document.path`` uses, and matching it anyway would
            silently match nothing.
    """
    exact: set[str] = set()
    prefixes: list[str] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        segments = line.rstrip("/").split("/")
        if line.startswith("/") or "\\" in line or any(s in {"", ".", ".."} for s in segments):
            raise ValidationError(
                f"Linha {number} da lista de remoção não é um caminho relativo à raiz "
                f"do Cérebro, com barra normal: {line!r}"
            )
        entry = normalise(line)
        if entry.endswith("/"):
            if entry not in prefixes:
                prefixes.append(entry)
        else:
            exact.add(entry)
    return RemovalList(exact=frozenset(exact), prefixes=tuple(prefixes))


def load_removal_list(path: Path) -> RemovalList:
    """Read and parse a removal list file (UTF-8)."""
    return parse_removal_list(path.read_text(encoding="utf-8"))


def load_from_root(root: Path) -> RemovalList:
    """The list inside a knowledge root, or an empty one when there is none."""
    candidate = root / REMOVAL_LIST_FILENAME
    if not candidate.is_file():
        return RemovalList(exact=frozenset(), prefixes=())
    return load_removal_list(candidate)
