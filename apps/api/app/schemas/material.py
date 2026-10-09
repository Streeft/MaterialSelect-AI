"""Material request/response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import DataQuality, DesignationSystem
from app.schemas.process import ProcessOut
from app.schemas.property import PropertyGroup

# The three ways a property value can be provided on input.
ValueKind = Literal["scalar", "interval", "missing"]


class PropertyValueIn(BaseModel):
    """Payload for one property value attached to a material.

    ``kind`` selects the representation:
      * ``scalar``   -> ``value`` + ``unit`` required;
      * ``interval`` -> ``value_min``/``value_max`` + ``unit`` required
        (``value_typical`` optional, defaults to the mid-point);
      * ``missing``  -> no numeric fields; recorded as explicitly absent.

    The service performs unit conversion and dimensional validation; a missing
    value is never coerced to zero.
    """

    property_slug: str
    kind: ValueKind
    # allow_inf_nan=False: non-finite numbers (inf/NaN) must be rejected at the
    # boundary — they would corrupt normalized values and chart scaling.
    value: float | None = Field(default=None, allow_inf_nan=False)
    value_min: float | None = Field(default=None, allow_inf_nan=False)
    value_max: float | None = Field(default=None, allow_inf_nan=False)
    value_typical: float | None = Field(default=None, allow_inf_nan=False)
    unit: str | None = None
    uncertainty: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    measurement_condition: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=500)
    source_label: str | None = Field(default=None, max_length=160)
    data_quality: DataQuality = DataQuality.ESTIMADO


class MaterialCreate(BaseModel):
    """Payload to create a material together with its property values."""

    name: str = Field(min_length=1, max_length=200)
    class_id: int
    subclass: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    keywords: list[str] = Field(default_factory=list)
    # User-created data is not demonstration data by default.
    is_demo: bool = False
    # P1-4. Ownership is **declared, never inferred from who typed**. The same
    # person adds to the shared catalogue (D-42) and keeps records of their own,
    # and only they know which one a given form was. Defaulting to False also
    # keeps every client written before My Records doing exactly what it did.
    is_own_record: bool = False
    values: list[PropertyValueIn] = Field(default_factory=list)


class MaterialUpdate(BaseModel):
    """Partial update of a material's identity fields.

    All fields optional; only those provided are changed. Property values are
    replaced through a dedicated endpoint, not here.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    class_id: int | None = None
    subclass: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    keywords: list[str] | None = None
    is_active: bool | None = None


class DataQualitySummary(BaseModel):
    """How a material's recorded values break down by provenance.

    Counted here rather than in the interface because it is an aggregation over
    rows the catalogue list does not send, and because a count derived in the
    browser would be a second, divergent answer to a question the database
    already answers. ``missing`` is not a fourth quality: it is the number of
    properties explicitly recorded as having no value.
    """

    medido: int = 0
    importado: int = 0
    estimado: int = 0
    missing: int = 0


class DesignationBrief(BaseModel):
    """A designation as the catalogue list shows it: system and code (D-105)."""

    system: DesignationSystem
    #: How the system is written ("AISI/SAE", "Nome comercial").
    system_label: str
    #: As the source wrote it.
    code: str


class DesignationOut(DesignationBrief):
    """A designation on the sheet, with the source that states it (D-105).

    No ``equivalent_to``: a designation belongs to one record, and two records
    sharing a code are not thereby declared the same material (TM1).
    """

    region: str | None = None
    source_label: str
    citation: str | None = None
    is_demo: bool = False


#: What a composition row says: a number (range, bound or nominal), "the rest",
#: or "the source gave no value". The last two never carry a number.
CompositionState = Literal["faixa", "resto", "ausente"]


class CompositionEntryOut(BaseModel):
    """One element of the composition, with the whole trail (D-105).

    ``value_*`` are what the source wrote, in ``original_unit``; ``normalized_*``
    are mass percent (``canonical_unit`` = ``percent``). A bound the source did
    not state is ``None`` — "C ≤ 0,08" has no minimum, and it is not 0.
    """

    element: str
    element_name: str
    atomic_number: int
    state: CompositionState
    value_min: float | None = None
    value_max: float | None = None
    value_nominal: float | None = None
    original_unit: str | None = None
    normalized_min: float | None = None
    normalized_max: float | None = None
    normalized_nominal: float | None = None
    canonical_unit: str | None = None
    conversion_method: str | None = None
    notes: str | None = None
    data_quality: DataQuality
    source_label: str
    citation: str | None = None
    is_demo: bool = False


class CompositionEntryIn(BaseModel):
    """One element of a composition being written (TM2-a, D-105).

    ``state`` picks the shape, exactly as on output: ``faixa`` takes at least one
    of ``value_min``/``value_max``/``value_nominal`` plus ``unit`` (mass basis);
    ``resto`` and ``ausente`` take **no number** — the balance is declared, never
    computed, and absence is never 0. The source is required: a content nobody
    stated is not data.
    """

    element: str = Field(min_length=1, max_length=3)
    state: CompositionState = "faixa"
    value_min: float | None = Field(default=None, allow_inf_nan=False)
    value_max: float | None = Field(default=None, allow_inf_nan=False)
    value_nominal: float | None = Field(default=None, allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=40)
    source_label: str = Field(min_length=1, max_length=160)
    citation: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=500)
    data_quality: DataQuality = DataQuality.ESTIMADO


class CompositionReplaceIn(BaseModel):
    """The whole composition of a material; what is not listed is removed."""

    entries: list[CompositionEntryIn] = Field(default_factory=list, max_length=118)


class DesignationIn(BaseModel):
    """One designation being written: a code in a closed vocabulary of systems."""

    system: DesignationSystem
    code: str = Field(min_length=1, max_length=120)
    region: str | None = Field(default=None, max_length=80)
    source_label: str = Field(min_length=1, max_length=160)
    citation: str | None = Field(default=None, max_length=500)


class DesignationsReplaceIn(BaseModel):
    """All designations of a material; what is not listed is removed."""

    designations: list[DesignationIn] = Field(default_factory=list, max_length=60)


class MaterialListItem(BaseModel):
    """Compact material representation for the catalogue list."""

    id: int
    name: str
    class_name: str
    # The slug, not only the display name: the catalogue filters and the chart
    # palette key on it, and a class can be renamed without becoming another
    # class.
    class_slug: str
    subclass: str | None = None
    is_demo: bool
    # P1-4: a boolean and not ``owner_id``, which would put another person's
    # user id on the wire for nothing. A reader only ever sees shared rows and
    # their own, so "has an owner" and "is mine" are the same fact here — and
    # the boolean is the one of the two that cannot identify anybody.
    is_own_record: bool = False
    keywords: list[str] = []
    quality: DataQualitySummary = Field(default_factory=DataQualitySummary)
    # D-105: the codes, so a card can show (and highlight) the one a reader
    # searched for. Empty means none registered, not "has no designation".
    designations: list[DesignationBrief] = []
    # TM6: contagem de propriedades com referência bibliográfica (source_id não nulo e não ausente)
    reference_count: int = 0


class MaterialDetail(BaseModel):
    """Full material sheet: identity plus properties grouped by category."""

    id: int
    name: str
    class_id: int
    class_name: str
    # Same reason as on the list item: the class's colour and marker are keyed
    # by slug, and a sheet that keyed them by id would paint the same class
    # differently from the catalogue and the map.
    class_slug: str
    subclass: str | None = None
    description: str | None = None
    is_demo: bool
    is_active: bool = True
    # Same boolean, same reason, as on the list item.
    is_own_record: bool = False
    # TM2-a: the record came from the licensed official catalogue (D-102) and its
    # composition and designations are not edited from the sheet.
    is_official: bool = False
    keywords: list[str] = []
    property_groups: list[PropertyGroup]
    # P0-2: the processes this material can be made with — the datasheet half of
    # the material↔process join. In the sheet's own payload and not behind a
    # second endpoint, because it is part of reading the sheet, not an optional
    # extra the interface has to remember to ask for.
    processes: list[ProcessOut] = []
    # D-105 (TM2). Both always present; an empty list is the state "none
    # registered", which the sheet writes out — never a 0 % composition.
    designations: list[DesignationOut] = []
    composition: list[CompositionEntryOut] = []


class UndeterminedBreakdown(BaseModel):
    """Why a composition condition could not be decided, material by material."""

    sem_composicao: int = 0
    elemento_nao_declarado: int = 0
    declarado_ausente: int = 0
    resto_sem_numero: int = 0


class CompositionConditionOut(BaseModel):
    """How one ``comp:`` condition came out over the whole visible catalogue.

    Counted independently of the rest of the query, so the reader can see what
    each condition did on its own.
    """

    label: str
    element: str
    element_name: str
    satisfied: int
    not_satisfied: int
    undetermined: int
    undetermined_by_reason: UndeterminedBreakdown


class CompositionSearchOut(BaseModel):
    """What a search with ``comp:`` states besides its rows (D-105).

    ``rule`` says which rule ran (reach), in words — the D-59 obligation that a
    comparison rule reach the reader. ``undetermined`` is how many materials
    were left out because the answer depended on absent data: they did not
    fail the condition, the catalogue cannot say.
    """

    rule: str
    conditions: list[CompositionConditionOut]
    undetermined: int
    without_composition: int


class MaterialSearchOut(BaseModel):
    """The catalogue search, with what it knows besides the rows (D-105)."""

    items: list[MaterialListItem]
    total: int
    #: Present only when the query asked about composition.
    composition: CompositionSearchOut | None = None


class ChartPoint(BaseModel):
    """One material's coordinates on the X-Y property map."""

    material_id: int
    material_name: str
    class_name: str
    x: float
    y: float


class ChartData(BaseModel):
    """Data for a two-property scatter map (canonical/normalised values).

    Only materials that have a non-missing normalised value for *both* axes are
    included; the excluded ones are reported so the UI can be honest about
    coverage.
    """

    x_property_slug: str
    x_property_name: str
    x_unit: str
    y_property_slug: str
    y_property_name: str
    y_unit: str
    points: list[ChartPoint]
    excluded_material_ids: list[int] = []
