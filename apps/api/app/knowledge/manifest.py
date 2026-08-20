"""Human-declared provenance for the knowledge base.

Why a file a person edits, rather than rules that read a filename: deciding that
a document is an *official* source is a judgement about the world, and the
filename is not evidence. A heuristic that scored "Callister" as authoritative
would be right often enough to be trusted and wrong silently the rest of the
time — the precise failure mode the project's first principle exists to prevent.

So provenance is declared. A document nobody has described is catalogued and
indexed all the same, but with ``NAO_VERIFICADA`` authority and no author, which
is what "nobody has said yet" honestly looks like. Retrieval can then prefer the
sources someone vouched for.

The manifest lives at ``<knowledge_dir>/manifesto.json`` and is optional; its
absence is a valid state, not an error.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.domain.errors import ValidationError
from app.models.enums import DocumentKind, SourceAuthority

MANIFEST_FILENAME = "manifesto.json"


@dataclass(frozen=True)
class DeclaredProvenance:
    """What a human said about one document."""

    title: str | None = None
    kind: DocumentKind = DocumentKind.OUTRO
    authority: SourceAuthority = SourceAuthority.NAO_VERIFICADA
    author: str | None = None
    reference: str | None = None
    source_url: str | None = None
    licence_note: str | None = None
    is_versioned: bool = True


def _enum_or_default(
    raw: object, enum_type: type, default: object, path: str, field: str
) -> object:
    """Read an enum member by name, failing loudly on an unknown value.

    A typo in the manifest silently falling back to the default would be the
    worst outcome: the document would look merely undeclared rather than
    misdeclared, and nobody would go looking.
    """
    if raw is None:
        return default
    text = str(raw).strip().upper()
    try:
        return enum_type[text]
    except KeyError as exc:
        valid = ", ".join(member.name for member in enum_type)
        raise ValidationError(
            f"{MANIFEST_FILENAME}: '{field}' inválido em '{path}': {raw!r}. Use um de: {valid}."
        ) from exc


def _text(raw: object) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def load_manifest(root: Path) -> dict[str, DeclaredProvenance]:
    """Read declared provenance, keyed by path relative to ``root``.

    Returns an empty mapping when no manifest exists.

    Raises:
        ValidationError: the file exists but is not readable as the expected
            shape. A malformed manifest stops ingestion rather than being
            skipped — running with provenance a human *believes* is applied but
            silently is not would undermine the whole point of declaring it.
    """
    manifest_path = root / MANIFEST_FILENAME
    if not manifest_path.is_file():
        return {}

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValidationError(f"{MANIFEST_FILENAME} não pôde ser lido: {exc}") from exc

    entries = payload.get("documentos") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise ValidationError(f"{MANIFEST_FILENAME} precisa ter uma lista em 'documentos'.")

    declared: dict[str, DeclaredProvenance] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValidationError(
                f"{MANIFEST_FILENAME}: cada item de 'documentos' deve ser objeto."
            )
        path = _text(entry.get("path"))
        if not path:
            raise ValidationError(f"{MANIFEST_FILENAME}: item sem 'path'.")
        # Normalise to the POSIX form the catalogue stores, so a manifest
        # written on Windows matches a database populated on CI.
        key = path.replace("\\", "/")
        if key in declared:
            raise ValidationError(f"{MANIFEST_FILENAME}: 'path' repetido: {key}")

        declared[key] = DeclaredProvenance(
            title=_text(entry.get("titulo")),
            kind=_enum_or_default(  # type: ignore[arg-type]
                entry.get("tipo"), DocumentKind, DocumentKind.OUTRO, key, "tipo"
            ),
            authority=_enum_or_default(  # type: ignore[arg-type]
                entry.get("autoridade"),
                SourceAuthority,
                SourceAuthority.NAO_VERIFICADA,
                key,
                "autoridade",
            ),
            author=_text(entry.get("autor")),
            reference=_text(entry.get("referencia")),
            source_url=_text(entry.get("url")),
            licence_note=_text(entry.get("licenca")),
            is_versioned=bool(entry.get("versionado", True)),
        )
    return declared
