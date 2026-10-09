"""Releases of the official catalogue and what changed between two of them (D-108, TM7).

Every number arrives already converted (reading unit, canonical, as written):
the client prints, it never converts. A side with no number carries ``null``
in its three views and a ``state`` that says why — "não cadastrado nesta
release" or "declarado ausente pela fonte" — never ``0`` (D-24).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.domain.release_diff import ChangeKind, RecordStatus, Universe, ValueState


class CatalogReleaseOut(BaseModel):
    slug: str
    name: str
    release: str | None
    #: The catalogue the release belongs to; ``null`` = not comparable.
    lineage: str | None
    license_label: str
    provenance: str | None
    source_sha256: str
    is_active: bool
    is_demo: bool
    created_at: datetime
    #: When the last committed import of this release finished (``null`` for a
    #: release written by the demo seed, which never runs the importer).
    imported_at: datetime | None
    bundle_sha256: str | None
    manifest_sha256: str | None
    #: Shared material records of the release (D-62: never a private one).
    material_count: int
    #: The release written just before this one in the same lineage — the
    #: natural base to compare it with. ``null`` for the first, or no lineage.
    previous_slug: str | None


class StatusCountOut(BaseModel):
    status: RecordStatus
    label: str
    count: int


class ClassCountOut(BaseModel):
    slug: str
    name: str
    count: int


class UniverseCountOut(BaseModel):
    universe: Universe
    label: str
    count: int


class NumbersOut(BaseModel):
    """One set of numbers of one side. ``value`` is the representative point
    (the single value, or the typical of a range)."""

    value: float | None
    min: float | None
    max: float | None
    typical: float | None
    uncertainty: float | None
    unit: str | None


class ReadingNumbersOut(NumbersOut):
    unit_label: str


class ValueSideOut(BaseModel):
    state: ValueState
    state_label: str
    #: As the source wrote it (original unit).
    original: NumbersOut | None
    canonical: NumbersOut | None
    #: In the reading unit (D-70) — what the screen prints.
    reading: ReadingNumbersOut | None
    conversion_method: str | None
    measurement_condition: str | None
    #: Discrete process attributes: the labels of this side (empty otherwise).
    labels: list[str] = []


class FieldChangeOut(BaseModel):
    #: ``nome``, ``classe``, ``subclasse``, ``descricao``, ``gruid``,
    #: ``propriedade:<slug>``, ``atributo:<slug>`` (process), ``modal:<campo>``,
    #: ``composicao:<elemento>`` or ``curva:<id externo>[:<aspecto>]``.
    field: str
    label: str
    kind: ChangeKind
    kind_label: str
    #: Record fields: the text of each side; ``null`` = "não informado".
    before_text: str | None = None
    after_text: str | None = None
    #: Property values: both sides, always present (a side with no row is the
    #: state ``nao_cadastrado``, not a missing object).
    property_slug: str | None = None
    before: ValueSideOut | None = None
    after: ValueSideOut | None = None
    reading_unit: str | None = None
    reading_unit_label: str | None = None
    canonical_unit: str | None = None


class RecordSideOut(BaseModel):
    #: Id in the record's own table (material, process or transport mode).
    record_id: int
    #: Same id when the record is a material (the screen links to it); else ``null``.
    material_id: int | None
    universe: Universe
    name: str
    class_slug: str
    class_name: str
    subclass: str | None
    external_gruid: str | None
    raw_record_sha256: str
    is_active: bool


class DiffItemOut(BaseModel):
    external_table: str
    external_record_id: str
    status: RecordStatus
    status_label: str
    universe: Universe
    universe_label: str
    #: ``null`` on the side where the record does not exist (new / removed).
    base: RecordSideOut | None
    target: RecordSideOut | None
    #: The source row's bytes changed; ``null`` when one side is absent.
    raw_record_changed: bool | None
    change_count: int
    changes: list[FieldChangeOut]


class DiffFiltersOut(BaseModel):
    tipo: RecordStatus | None
    classe: str | None
    universo: Universe | None = None


class ReleaseDiffOut(BaseModel):
    base: CatalogReleaseOut
    target: CatalogReleaseOut
    lineage: str
    is_demo: bool
    rule: str
    #: Over the whole diff, every status with its count, zero included.
    counts: list[StatusCountOut]
    total: int
    #: Records per class (either side), for the class filter.
    classes: list[ClassCountOut]
    #: Records per universe over the whole diff, zero included.
    universes: list[UniverseCountOut]
    filters: DiffFiltersOut
    filtered_total: int
    page: int
    page_size: int
    page_count: int
    items: list[DiffItemOut]
