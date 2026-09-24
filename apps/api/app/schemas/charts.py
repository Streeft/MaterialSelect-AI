"""Request/response schemas for property maps and material comparison.

Everything numeric in these payloads is computed in the backend, in canonical
units, by the ``domain``/``calculations`` layers — including the slope and the
endpoints of every index line. The client only draws what it receives.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import BetterDirection, DataQuality, PropertyCategory
from app.schemas.selection import IndexIn, NormalizationLiteral

ScaleLiteral = Literal["linear", "log"]
AxisLiteral = Literal["x", "y"]

# Guard rails: charts are read in one screen, and every extra series costs the
# reader clarity before it costs the server anything.
MAX_COMPARE_MATERIALS = 12
MAX_COMPARE_PROPERTIES = 12
MAX_INDEX_LEVELS = 10


# --- Property map ----------------------------------------------------------


class PropertyMapRequest(BaseModel):
    """Everything needed to draw one Ashby-style map of ``y`` against ``x``.

    Each axis is *either* a catalogued property (``x``/``y``, a slug) *or* a
    computed index (``x_index``/``y_index``) — never both, never neither.
    ``ChartService.property_map`` enforces that, not this schema, matching how
    every other cross-field rule in this service already lives there rather
    than in a Pydantic validator.
    """

    universe: Literal["material", "process"] = "material"
    x: str | None = Field(
        default=None, min_length=1, max_length=160, description="Slug da propriedade do eixo X"
    )
    y: str | None = Field(
        default=None, min_length=1, max_length=160, description="Slug da propriedade do eixo Y"
    )
    x_index: IndexIn | None = Field(
        default=None, description="Índice no eixo X, em vez de uma propriedade"
    )
    y_index: IndexIn | None = Field(
        default=None, description="Índice no eixo Y, em vez de uma propriedade"
    )
    # The scale is part of the *request* because the class envelopes are convex
    # hulls, and a hull computed in linear space is not the hull seen in log
    # space. Computing it for the scale actually displayed keeps the drawing
    # honest.
    scale: ScaleLiteral = "log"
    envelope_shape: Literal["hull", "ellipse"] = Field(
        default="hull",
        description=(
            "Forma do envelope de classe: fecho convexo (literal) ou elipse ajustada (suave)"
        ),
    )
    class_slugs: list[str] = Field(
        default_factory=list, description="Filtro por classe (vazio = todas)"
    )
    material_ids: list[int] | None = Field(
        default=None,
        description="Restringe o mapa a estes materiais (ex.: candidatos de uma seleção)",
    )
    process_ids: list[int] | None = Field(
        default=None,
        description=(
            "Restringe o mapa a estes processos (ex.: candidatos de uma seleção de processos)"
        ),
    )
    highlight_material_ids: list[int] = Field(default_factory=list)
    highlight_process_ids: list[int] = Field(default_factory=list)
    include_envelopes: bool = True
    index: IndexIn | None = Field(
        default=None,
        description="Índice a sobrepor como linha (incompatível com x_index/y_index)",
    )
    index_levels: list[float] = Field(
        default_factory=list, max_length=MAX_INDEX_LEVELS, description="Valores de M das linhas"
    )
    index_level_material_ids: list[int] = Field(
        default_factory=list,
        max_length=MAX_INDEX_LEVELS,
        description="Traça a linha que passa exatamente pelo índice destes materiais",
    )
    index_level_process_ids: list[int] = Field(
        default_factory=list,
        max_length=MAX_INDEX_LEVELS,
        description="Traça a linha que passa exatamente pelo índice destes processos",
    )


class MapAxisOut(BaseModel):
    """Metadata of one plotted axis — a catalogued property, or a computed index.

    ``property_slug``/``category`` only exist for a property axis; ``expression``
    only for an index axis. ``is_index`` is what a reader should branch on —
    this schema has no state for "a property genuinely has no category", so a
    null check on either field would be ambiguous with "this axis is an index".
    """

    is_index: bool = False
    property_slug: str | None = None
    property_name: str
    expression: str | None = None
    symbol: str | None = None
    unit: str
    category: PropertyCategory | None = None
    better_direction: BetterDirection
    allows_log_scale: bool
    min_value: float | None = None
    max_value: float | None = None


class MapBoxIn(BaseModel):
    """A Chart Stage region: one optional limit per side, in data coordinates.

    ``None`` is "no limit on this side", never ``0`` (D-60): ``0`` is a limit.
    """

    x_min: float | None = None
    x_max: float | None = None
    y_min: float | None = None
    y_max: float | None = None


class MapBoxRequest(BaseModel):
    """Convert a region between the map's reading units and canonical units (D-81).

    The map draws in each property's reading unit (D-70); the Chart Stage stores
    and compares in canonical units (D-60). A region crosses that border in both
    directions — drawn on the map, stored on the stage; loaded from the stage,
    drawn on the map — and the conversion lives here, beside the one the map
    itself uses, never in the client.

    ``x``/``y`` name the property on each axis; ``None`` is an index axis, whose
    coordinates are never converted.
    """

    universe: Literal["material", "process"] = "material"
    x: str | None = Field(default=None, description="Slug da propriedade no eixo X")
    y: str | None = Field(default=None, description="Slug da propriedade no eixo Y")
    box: MapBoxIn
    to: Literal["canonical", "display"] = Field(
        description="'canonical' converte uma região desenhada no mapa; "
        "'display' converte uma região guardada para desenhá-la."
    )


class MapBoxOut(BaseModel):
    """The converted region and the unit each axis is now expressed in.

    A unit is ``None`` for an index axis (its dimension is derived, D-35).
    """

    box: MapBoxIn
    x_unit: str | None = None
    y_unit: str | None = None


class MapPointOut(BaseModel):
    """One material or process on the map.

    ``x``/``y`` are the canonical representative values (for an interval, the
    typical). ``*_min``/``*_max`` are the interval bounds **converted to the
    canonical unit** so the interval rectangle lands where the point does, and
    ``*_uncertainty`` is converted as a difference (±5 °C is ±5 K).
    """

    material_id: int
    record_id: int | None = None
    material_name: str
    class_name: str
    class_slug: str
    is_demo: bool

    x: float
    y: float
    x_min: float | None = None
    x_max: float | None = None
    y_min: float | None = None
    y_max: float | None = None
    x_uncertainty: float | None = None
    y_uncertainty: float | None = None
    x_is_interval: bool = False
    y_is_interval: bool = False
    # None exactly when that axis is an index: a computed index has no single
    # provenance of its own to badge — it is derived from several properties,
    # each with its own quality, and attributing one to the whole would invent
    # a fact the catalogue never stated.
    x_quality: DataQuality | None = None
    y_quality: DataQuality | None = None

    index_value: float | None = None
    index_undefined_reason: str | None = None


class ClassEnvelopeOut(BaseModel):
    """Convex hull of one class, in data coordinates of the requested scale."""

    class_slug: str
    class_name: str
    point_count: int
    polygon: list[list[float]] = Field(
        description="Vértices [x, y]; 1 ou 2 pontos em casos degenerados"
    )


class ExcludedPointOut(BaseModel):
    """A material or process kept out of the map, and why — coverage is never silently hidden."""

    material_id: int
    record_id: int | None = None
    name: str
    reason: str


class IndexLevelOut(BaseModel):
    """One iso-index line: two endpoints plus the materials it separates.

    When the level was derived from a material's own index value, that material
    is named — the line then passes exactly through it, which is how the
    "slide the line until it isolates the winners" reading works.
    """

    value: float
    material_id: int | None = None
    material_name: str | None = None
    points: list[list[float]]
    superior_material_ids: list[int] = Field(
        default_factory=list,
        description="Materiais no lado favorável da linha, segundo o objetivo",
    )


class IndexOverlayOut(BaseModel):
    """The index drawn over the map.

    ``available`` is False when the index has no straight-line contour on these
    axes (it is not a power law, or it depends on a third property). The index
    *values* are still returned on each point in that case — only the line is
    withheld, with the reason stated.
    """

    name: str | None = None
    expression: str
    goal: str
    dimension: str
    available: bool
    unavailable_reason: str | None = None
    orientation: Literal["oblique", "vertical"] | None = None
    slope: float | None = None
    levels: list[IndexLevelOut] = Field(default_factory=list)
    defined_count: int = 0
    undefined_count: int = 0


class PropertyMapOut(BaseModel):
    """A complete, self-describing property map."""

    scale: ScaleLiteral
    x_axis: MapAxisOut
    y_axis: MapAxisOut
    points: list[MapPointOut]
    envelopes: list[ClassEnvelopeOut] = Field(default_factory=list)
    envelopes_alt: list[ClassEnvelopeOut] = Field(
        default_factory=list,
        description=(
            "Envelopes na escala oposta à requisitada, sobre os mesmos pontos já "
            "filtrados — permite ao cliente alternar linear/log sem uma segunda "
            "requisição. Pontos não positivos são excluídos apenas do cálculo do "
            "envelope logarítmico alternativo, nunca da lista principal de pontos."
        ),
    )
    excluded: list[ExcludedPointOut] = Field(default_factory=list)
    index: IndexOverlayOut | None = None
    considered_count: int = Field(description="Registros avaliados após o filtro de classe/ids")
    plotted_count: int
    notes: list[str] = Field(default_factory=list)


# --- Comparison ------------------------------------------------------------


#: Why a percentage difference is or is not a number, per cell (P2).
#:
#: Six states and not a nullable float, because every absence here has a
#: *different* reason and the reader needs the one that applies: a blank cell
#: where the reference has no value and a blank cell where the unit has no true
#: zero look identical and mean nothing alike (D-24).
DifferenceState = Literal[
    "calculada",  # a number is present
    "referencia",  # this row *is* the reference
    "sem_referencia",  # no reference was chosen
    "valor_ausente",  # this material has no value for the property
    "referencia_ausente",  # the reference has no value for the property
    "referencia_zero",  # the reference's value is zero: no ratio exists
    "escala_sem_zero",  # the unit has no true zero, so a ratio means nothing
]


class CompareRequest(BaseModel):
    """Compare a handful of materials over a handful of properties.

    ``reference_id`` (P2) is **a parameter of the question, not stored state**.
    "Compared against X" is something a reader asks, not a fact about the
    catalogue, so it travels in the request and — through the URL state the
    screen already keeps (B1) — in the link. A server-side "current reference"
    would make the same URL render two different tables for two people.
    """

    material_ids: list[int] = Field(min_length=1, max_length=MAX_COMPARE_MATERIALS)
    property_slugs: list[str] = Field(min_length=1, max_length=MAX_COMPARE_PROPERTIES)
    normalization: NormalizationLiteral = "minmax"
    reference_id: int | None = None


class CompareAxisOut(BaseModel):
    """One compared property, with the range observed across the compared set."""

    property_slug: str
    property_name: str
    symbol: str | None = None
    unit: str
    category: PropertyCategory
    better_direction: BetterDirection
    allows_log_scale: bool
    min_value: float | None = None
    max_value: float | None = None
    present_count: int
    missing_material_ids: list[int] = Field(default_factory=list)


class CompareCellOut(BaseModel):
    """One (material, property) cell.

    ``normalized`` is ``None`` whenever ``value`` is ``None``: a missing value
    has no position on a radar or heatmap and must be drawn as a gap, never as
    zero.
    """

    property_slug: str
    is_missing: bool
    value: float | None = None
    normalized: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    original_value: float | None = None
    original_unit: str | None = None
    conversion_method: str | None = None
    uncertainty: float | None = None
    data_quality: DataQuality | None = None
    source_label: str | None = None
    measurement_condition: str | None = None
    #: Percentage difference from the reference, in canonical units (P2).
    #: ``None`` whenever ``difference_state`` is anything but ``"calculada"`` —
    #: and the state, never a dash, is what the screen renders in that case.
    #:
    #: **Sempre canônica, e nunca na unidade de leitura** (D-70). Uma razão só
    #: significa algo em escala de razão (`units.is_ratio_scale`), e
    #: `temp_max_servico` é canônica em kelvin: lida em °C, "o dobro da
    #: temperatura" viraria uma afirmação falsa com toda a autoridade de um
    #: número calculado. Trocar a unidade de leitura não move esta coluna.
    difference_pct: float | None = None
    difference_state: DifferenceState = "sem_referencia"

    # --- a mesma medida, lida noutra unidade (D-70) ------------------------
    display_unit: str | None = None
    display_value: float | None = None
    display_min: float | None = None
    display_max: float | None = None
    display_uncertainty: float | None = None


class CompareMaterialOut(BaseModel):
    material_id: int
    name: str
    class_name: str
    class_slug: str
    is_demo: bool
    cells: list[CompareCellOut]
    complete: bool = Field(
        description="True quando o material tem valor para todas as propriedades"
    )


class CompareOut(BaseModel):
    normalization: str
    properties: list[CompareAxisOut]
    materials: list[CompareMaterialOut]
    notes: list[str] = Field(default_factory=list)
