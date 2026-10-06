"""The knowledge base's removal list: what left the Cérebro and must not return.

``Cérebro/removidos.txt`` (D-100) is the single source of truth for documents
taken out of the knowledge base. Three consumers read it and none keeps a copy
of its own: the prune CLI (:mod:`app.knowledge.prune`) deletes the matching rows
from a database, the ingestion skips matching files even if they reappear on
disk, and the git history purge converts its path lines — minus the ones marked
``mantido-no-historico:`` — for ``git filter-repo``.

The format is deliberately small, because it is edited by hand and read by a
shell script too:

* one path per line, relative to ``KNOWLEDGE_DIR``, POSIX separators — the same
  shape :class:`app.models.knowledge.KnowledgeDocument` stores in ``path``;
* a line ending in ``/`` is a folder prefix and matches everything under it;
  any other line matches that exact path and nothing else — ``Tópico 1.pdf``
  must not take ``Tópico 1.pdf.bak`` or ``Tópico 10.pdf`` with it;
* a line ``sha256:<64 hex digits>`` matches **by content**: any document whose
  bytes hash to that digest, whatever path it was stored under. A path says
  where a file sat on the disk that ingested it, and that disk is not the git
  tree — a copy in a local triage folder has another path and the same bytes.
  ``knowledge_document.checksum`` is the SHA-256 of the file's bytes, which for
  a file kept in Git LFS is exactly the pointer's ``oid sha256:``;
* a line ``mantido-no-historico:<path>`` is a path entry like any other for
  the database and the ingestion — exact or folder prefix, NFC — and is left
  out of the git history purge. Not everything that leaves the knowledge base
  left it for the reason the purge exists (D-100: material that must not stay
  published); a duplicate edition of a book (D-101) leaves the RAG and stays
  in the history, where the owner wants it. The purge reads only
  :attr:`RemovalList.history_purge_entries`, and docs/17's shell conversion
  drops these lines as it drops the ``sha256:`` ones;
* blank lines and lines starting with ``#`` are ignored. There are no inline
  comments, because ``#`` is a legal character in a file name.

A path that literally starts with ``sha256:`` or ``mantido-no-historico:``
cannot be listed; a colon is not a legal file-name character on Windows, where
the corpus is curated, so nothing real is lost.

Matching normalises both sides to Unicode NFC. A path ingested on macOS may
have been stored decomposed (NFD), and "Tópico" in NFD and in NFC are different
strings that print identically — a list that silently failed to match them
would report "nothing to remove" while the text stayed in the RAG.

Pure module: no database, no filesystem beyond reading the list, no ``pypdf``.
The prune CLI runs in the admin workflow, which installs neither the
``knowledge`` extra nor the corpus.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from app.domain.errors import ValidationError

#: File name of the removal list inside the knowledge root.
REMOVAL_LIST_FILENAME = "removidos.txt"

#: Prefix of a content entry: ``sha256:`` followed by the lowercase hex digest.
CHECKSUM_PREFIX = "sha256:"
#: Prefix of a path entry that leaves the knowledge base but not the git
#: history: the database and the ingestion match it like any path line, and
#: the history purge (docs/17, step 4) leaves it out.
HISTORY_KEPT_PREFIX = "mantido-no-historico:"
_HEX_DIGEST = re.compile(r"[0-9a-f]{64}")


def normalise(path: str) -> str:
    """The form every comparison uses: NFC, so NFD and NFC spellings agree."""
    return unicodedata.normalize("NFC", path)


@dataclass(frozen=True)
class RemovalList:
    """Parsed removal list: exact paths and folder prefixes (NFC), and digests."""

    exact: frozenset[str]
    prefixes: tuple[str, ...]
    #: SHA-256 hex digests (lowercase) of removed files' bytes.
    checksums: frozenset[str] = field(default_factory=frozenset)
    #: Path entries (also in ``exact`` or ``prefixes``) written with
    #: ``mantido-no-historico:``: matched here, never purged from git history.
    history_kept: frozenset[str] = field(default_factory=frozenset)

    @property
    def entries(self) -> tuple[str, ...]:
        """Every *path* entry, prefixes first, in a stable order for reporting.

        Content entries are left out on purpose: they are dozens of digests,
        and a report that listed each unmatched one would bury the path lines
        an operator actually reads.
        """
        return self.prefixes + tuple(sorted(self.exact))

    @property
    def history_purge_entries(self) -> tuple[str, ...]:
        """The path entries the git history purge removes, in report order.

        Every path entry but the ``mantido-no-historico:`` ones; content
        entries never reach it, since ``git filter-repo`` removes by path.
        docs/17 converts the file with a shell pipeline that must produce
        exactly these (with ``Cérebro/`` in front), and a test holds it to
        that.
        """
        return tuple(e for e in self.entries if e not in self.history_kept)

    @property
    def is_empty(self) -> bool:
        return not self.exact and not self.prefixes and not self.checksums

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

    def matches_checksum(self, checksum: str | None) -> bool:
        """Whether a file's SHA-256 digest is on the list."""
        return bool(checksum) and checksum.strip().lower() in self.checksums

    def match_reason(self, path: str, checksum: str | None) -> str | None:
        """Why a document is on the list — by path, by content — or ``None``."""
        if self.matches(path):
            return "caminho"
        if self.matches_checksum(checksum):
            return "conteúdo (sha256)"
        return None

    def folder_like_exact_entries(self, paths: Iterable[str]) -> dict[str, int]:
        """Exact entries that are really folders written without their ``/``.

        ``⚙Seleção de Materiais`` without the slash matches nothing here, while
        ``git filter-repo`` reads the same literal as the whole folder — the
        consumers of one list would disagree about it. Returns each such entry
        with how many ``paths`` sit under it, so the caller can say so instead
        of reporting a quiet "sem correspondência".
        """
        stored = [normalise(p) for p in paths]
        found: dict[str, int] = {}
        for entry in sorted(self.exact):
            if entry in stored:
                continue
            below = sum(1 for p in stored if p.startswith(entry + "/"))
            if below:
                found[entry] = below
        return found


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
    checksums: set[str] = set()
    history_kept: set[str] = set()
    purged: set[str] = set()
    # A byte-order mark (PowerShell 5.1's ``Set-Content -Encoding UTF8`` writes
    # one) would glue itself to the first entry and make it match nothing.
    text = text.removeprefix("\ufeff")
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(CHECKSUM_PREFIX):
            digest = line[len(CHECKSUM_PREFIX) :].strip().lower()
            if not _HEX_DIGEST.fullmatch(digest):
                raise ValidationError(
                    f"Linha {number} da lista de remoção: {CHECKSUM_PREFIX} precisa de "
                    f"64 dígitos hexadecimais (o SHA-256 do arquivo): {line!r}"
                )
            checksums.add(digest)
            continue
        kept_in_history = line.startswith(HISTORY_KEPT_PREFIX)
        if kept_in_history:
            line = line[len(HISTORY_KEPT_PREFIX) :].strip()
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
        (history_kept if kept_in_history else purged).add(entry)
    # A path written both ways is purged: the plain line is the stronger
    # statement, and keeping it in history would quietly undo it.
    return RemovalList(
        exact=frozenset(exact),
        prefixes=tuple(prefixes),
        checksums=frozenset(checksums),
        history_kept=frozenset(history_kept - purged),
    )


def load_removal_list(path: Path) -> RemovalList:
    """Read and parse a removal list file (UTF-8, with or without a BOM)."""
    return parse_removal_list(path.read_text(encoding="utf-8-sig"))


def load_from_root(root: Path) -> RemovalList:
    """The list inside a knowledge root, or an empty one when there is none."""
    candidate = root / REMOVAL_LIST_FILENAME
    if not candidate.is_file():
        return RemovalList(exact=frozenset(), prefixes=())
    return load_removal_list(candidate)
