"""Enumerations shared across the domain model.

These are stored as strings in the database so they remain human-readable and
portable between SQLite (development) and PostgreSQL (production).
"""

from __future__ import annotations

import enum


class PropertyCategory(str, enum.Enum):
    """Category used to group properties on the material detail sheet."""

    FISICA = "FISICA"
    MECANICA = "MECANICA"
    TERMICA = "TERMICA"
    ELETRICA = "ELETRICA"
    AMBIENTAL = "AMBIENTAL"
    ECONOMICA = "ECONOMICA"


class BetterDirection(str, enum.Enum):
    """Whether a higher or lower value of a property is desirable.

    Used later by ranking / performance-index features to know the optimisation
    direction. ``NEUTRAL`` means neither direction is inherently better.
    """

    HIGHER = "HIGHER"
    LOWER = "LOWER"
    NEUTRAL = "NEUTRAL"


class DataQuality(str, enum.Enum):
    """Provenance / confidence level of a stored property value.

    The distinction is required by the methodology: measured data must never be
    silently mixed with estimated or imported data.
    """

    MEDIDO = "MEDIDO"
    IMPORTADO = "IMPORTADO"
    ESTIMADO = "ESTIMADO"


class AuditAction(str, enum.Enum):
    """What happened to an entity, in an ``AuditEvent`` row (M2)."""

    CRIADO = "CRIADO"
    ATUALIZADO = "ATUALIZADO"
    EXCLUIDO = "EXCLUIDO"


class AuditEntityType(str, enum.Enum):
    """Which kind of entity an ``AuditEvent`` describes.

    Scoped to what a person edits by hand through the catalogue/selection
    services. Materials created in bulk by the importer (``ImportService``
    builds ``Material`` rows directly, bypassing ``MaterialService``'s public
    mutation methods) are not covered — the job's own ``ImportJob`` row is
    that flow's audit trail.
    """

    MATERIAL = "material"
    MATERIAL_CLASS = "material_class"
    PROPERTY_DEFINITION = "property_definition"
    PERFORMANCE_INDEX = "performance_index"
    SELECTION_STUDY = "selection_study"
class SourceAuthority(str, enum.Enum):
    """How much weight a knowledge-base document's claims carry.

    Ordered from most to least authoritative, so retrieval can prefer A over D
    when two documents disagree. ``NAO_VERIFICADA`` is the honest default for
    anything whose provenance was never established — it is a state, not a
    guess, and the same reasoning that keeps a missing property value NULL
    keeps this from defaulting to something flattering.
    """

    OFICIAL = "OFICIAL"  # A — norma, órgão normativo, fabricante, documentação oficial
    CIENTIFICA = "CIENTIFICA"  # B — artigo revisado por pares, livro-texto de referência
    TECNICA = "TECNICA"  # C — material didático de universidade, sociedade técnica
    SECUNDARIA = "SECUNDARIA"  # D — divulgação, blog técnico, vídeo
    NAO_VERIFICADA = "NAO_VERIFICADA"  # E — procedência não estabelecida


class DocumentKind(str, enum.Enum):
    """What sort of document a knowledge-base entry is."""

    LIVRO = "LIVRO"
    SLIDE = "SLIDE"
    ARTIGO = "ARTIGO"
    FICHA = "FICHA"  # ficha descritiva de material (ex.: Granta EduPack)
    EXERCICIO = "EXERCICIO"
    NORMA = "NORMA"
    VIDEO = "VIDEO"
    LINK = "LINK"
    OUTRO = "OUTRO"


class IngestStatus(str, enum.Enum):
    """Lifecycle of one document in the knowledge base.

    PENDENTE  -> catalogado, texto ainda não extraído;
    EXTRAIDO  -> texto extraído e dividido em trechos;
    FALHOU    -> extração tentada e malsucedida (o motivo fica em ``error``);
    IGNORADO  -> deliberadamente fora da indexação.
    """

    PENDENTE = "PENDENTE"
    EXTRAIDO = "EXTRAIDO"
    FALHOU = "FALHOU"
    IGNORADO = "IGNORADO"


class ImportStatus(str, enum.Enum):
    """Lifecycle of an import job.

    PENDENTE  -> file uploaded, awaiting mapping/validation;
    VALIDADO  -> mapping applied, per-row report produced, nothing written;
    IMPORTADO -> valid rows committed to the catalogue;
    CANCELADO -> abandoned before commit;
    REVERTIDO -> committed materials were rolled back (removed).
    """

    PENDENTE = "PENDENTE"
    VALIDADO = "VALIDADO"
    IMPORTADO = "IMPORTADO"
    CANCELADO = "CANCELADO"
    REVERTIDO = "REVERTIDO"
