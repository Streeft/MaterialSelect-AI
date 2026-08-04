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
    """Everything needed to draw one Ashby-style map of ``y`` against ``x``."""

    x: str = Field(min_length=1, max_length=160, description="Slug da propriedade do eixo X")
    y: str = Field(min_length=1, max_length=160, description="Slug da propriedade do eixo Y")
    # The scale is part of the *request* because the class envelopes are convex
    # hulls, and a hull computed in linear space is not the hull seen in log
    # space. Computing it for the scale actually displayed keeps the drawing
    # honest.
    scale: ScaleLiteral = "log"
    class_slugs: list[str] = Field(
        default_factory=list, description="Filtro por classe (vazio = todas)"
    )
    material_ids: list[int] | None = Field(
        default=None,
        description="Restringe o mapa a estes materiais (ex.: candidatos de uma seleção)",
    )
    highlight_material_ids: list[int] = Field(default_factory=list)
    include_envelopes: bool = True
    index: IndexIn | None = Field(default=None, description="Índice a sobrepor como linha")
    index_levels: list[float] = Field(
        default_factory=list, max_length=MAX_INDEX_LEVELS, description="Valores de M das linhas"
    )
    index_level_material_ids: list[int] = Field(
        default_factory=list,
        max_length=MAX_INDEX_LEVELS,
        description="Traça a linha que passa exatamente pelo índice destes materiais",
    )


class MapAxisOut(BaseModel):
    """Metadata of one plotted axis."""

    property_slug: str
    property_name: str
    symbol: str | None = None
    unit: str
    category: PropertyCategory
    better_direction: BetterDirection
    allows_log_scale: bool
    min_value: float | None = None
    max_value: float | None = None


class MapPointOut(BaseModel):
    """One material on the map.

    ``x``/``y`` are the canonical representative values (for an interval, the
    typical). ``*_min``/``*_max`` are the interval bounds **converted to the
    canonical unit** so the interval rectangle lands where the point does, and
    ``*_uncertainty`` is converted as a difference (±5 °C is ±5 K).
    """

    material_id: int
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
    x_quality: DataQuality
    y_quality: DataQuality

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
    """A material kept out of the map, and why — coverage is never silently hidden."""

    material_id: int
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
        default_factory=list, description="Materiais no lado favorável da linha, segundo o objetivo"
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
    excluded: list[ExcludedPointOut] = Field(default_factory=list)
    index: IndexOverlayOut | None = None
    considered_count: int = Field(description="Materiais avaliados após o filtro de classe/ids")
    plotted_count: int
    notes: list[str] = Field(default_factory=list)


# --- Comparison ------------------------------------------------------------


class CompareRequest(BaseModel):
    """Compare a handful of materials over a handful of properties."""

    material_ids: list[int] = Field(min_length=1, max_length=MAX_COMPARE_MATERIALS)
    property_slugs: list[str] = Field(min_length=1, max_length=MAX_COMPARE_PROPERTIES)
    normalization: NormalizationLiteral = "minmax"


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
