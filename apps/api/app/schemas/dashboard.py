"""Response schemas for the catalogue panel.

Everything numeric here is counted or computed in the backend — including the
quartiles of every box (ADR 0004) and every percentage. The client draws what it
receives and formats it for pt-BR; it does not divide, average or round.

The vocabulary of the panel is deliberately three-valued where the rest of the
world is two-valued. A (material, property) slot is *filled*, *declared missing*
or *never recorded*, and collapsing the last two into "missing" would hide the
distinction the methodology exists to make: a value someone looked for and could
not find is evidence, and a value nobody has entered yet is a to-do list.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import PropertyCategory

# The four provenance states the interface already paints, plus the fifth thing
# that is not a provenance at all — a slot with no row behind it. It is reported
# separately rather than folded into "ausente" because no one declared it.
QualityBucket = Literal["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE", "NAO_REGISTRADO"]


class Coverage(BaseModel):
    """How a set of (material, property) slots is filled.

    ``slots`` is the denominator and is always ``filled + declared_missing +
    not_recorded``; it is sent rather than left for the client to add up so the
    figure and its data table cannot disagree about the total.
    """

    filled: int = Field(ge=0, description="Valores com número")
    declared_missing: int = Field(ge=0, description="Valores marcados explicitamente como ausentes")
    not_recorded: int = Field(ge=0, description="Pares material×propriedade sem nenhum registro")
    slots: int = Field(ge=0, description="Total de pares possíveis")
    # `None`, never 0.0: an empty catalogue has no coverage, and "0%" would read
    # as a verdict on data that does not exist.
    filled_pct: float | None = Field(
        default=None, description="Percentual preenchido; nulo se 0 pares"
    )


class ClassCoverageOut(BaseModel):
    """One material class, and how complete its rows are."""

    slug: str
    name: str
    materials: int
    coverage: Coverage


class PropertyCoverageOut(BaseModel):
    """One property definition, and how many materials actually carry it."""

    slug: str
    name: str
    category: PropertyCategory
    canonical_unit: str | None = None
    coverage: Coverage


class QualitySliceOut(BaseModel):
    """One slice of the provenance breakdown."""

    bucket: QualityBucket
    count: int = Field(ge=0)
    share_pct: float | None = None


class OverviewOut(BaseModel):
    """Everything the panel needs for its first screen."""

    materials: int
    demo_materials: int = Field(description="Quantos dos materiais ativos são de demonstração")
    classes: int
    properties: int
    coverage: Coverage
    by_quality: list[QualitySliceOut]
    by_class: list[ClassCoverageOut]
    by_property: list[PropertyCoverageOut]
    gaps: list[PropertyCoverageOut] = Field(
        description="As propriedades menos preenchidas, da pior para a melhor"
    )
    filters: FiltersOut | None = Field(default=None, description="Filtros aplicados (D-193)")


class BoxOut(BaseModel):
    """The five-number summary of one class.

    Os cinco números saem na **unidade de leitura** declarada em
    `DistributionOut.display_unit` (D-70) — a figura e a tabela que a acompanha
    (D-31) leem a mesma grandeza, então têm de ler na mesma unidade. Cada um é um
    valor absoluto e converte como tal; nenhum é diferença.
    """

    class_slug: str
    class_name: str
    count: int = Field(ge=1, description="Quantos materiais entraram nesta caixa")
    minimum: float
    q1: float
    median: float
    q3: float
    maximum: float


class DistributionOut(BaseModel):
    """How one property is distributed across the classes that have it."""

    property_slug: str
    property_name: str
    category: PropertyCategory
    canonical_unit: str | None = None
    #: A unidade em que os números das caixas estão (D-70). Pode diferir da
    #: canônica; o rótulo do eixo tem de nomear esta, não aquela.
    display_unit: str | None = None
    # Sent rather than guessed by the client: properties in this catalogue span
    # decades (density and Young's modulus are not on the same kind of axis),
    # and the definition already knows which of its own axes is honest.
    allows_log_scale: bool = True
    boxes: list[BoxOut]
    # Named, not dropped. A class that vanishes from the figure looks like a
    # class that does not exist; a class listed as having no data for this
    # property is the honest version of the same fact.
    classes_without_data: list[str] = Field(
        default_factory=list, description="Nomes das classes sem nenhum valor desta propriedade"
    )


# --- Painel rico (D-193) ----------------------------------------------------

DemoFilter = Literal["todos", "demo", "reais"]


class FiltersOut(BaseModel):
    """The filters a response was computed under, echoed back.

    Echoed so a CSV or a screenshot of the panel carries its own context, and so
    the client can tell a stale response (an older filter) from a fresh one.
    """

    class_slug: str | None = None
    subclass: str | None = None
    level: int = Field(ge=1, le=3, default=3)
    demo: DemoFilter = "todos"
    materials: int = Field(ge=0, description="Materiais que passam pelos filtros")


class TreemapCellOut(BaseModel):
    """One rectangle of the composition treemap, in the box's data coordinates."""

    key: str
    depth: Literal[0, 1] = Field(description="0 = classe, 1 = subclasse")
    class_slug: str
    class_name: str
    #: A subclasse (depth 1). ``None`` com ``depth=1`` = materiais sem subclasse.
    subclass: str | None = None
    count: int = Field(ge=0)
    share_pct: float | None = None
    x0: float
    y0: float
    x1: float
    y1: float


class CompositionOut(BaseModel):
    """Materials per class and subclass, with the treemap already laid out."""

    filters: FiltersOut
    width: float = Field(description="Largura da caixa em que as células foram dispostas")
    height: float
    cells: list[TreemapCellOut]


class ProcessFamilyOut(BaseModel):
    slug: str
    name: str
    root_slug: str
    root_name: str
    processes: int = Field(ge=0, description="Processos ativos desta família")
    materials: int = Field(ge=0, description="Materiais distintos ligados a algum deles")


class ProcessUseOut(BaseModel):
    slug: str
    name: str
    family_slug: str
    family_name: str
    materials: int = Field(ge=0)
    share_pct: float | None = Field(default=None, description="Dos materiais filtrados")


class ProcessClassUseOut(BaseModel):
    """How many distinct processes reach the materials of one class."""

    class_slug: str
    class_name: str
    materials: int = Field(ge=0)
    processes: int = Field(ge=0)


class ProcessPanelOut(BaseModel):
    filters: FiltersOut
    processes: int = Field(ge=0)
    families: list[ProcessFamilyOut]
    by_process: list[ProcessUseOut]
    by_material_class: list[ProcessClassUseOut]
    materials_with_process: int = Field(ge=0)
    materials_without_process: int = Field(ge=0)


class SourceQualityOut(BaseModel):
    """One source and the provenance of the values it backs."""

    key: str = Field(description="Id da fonte, ou 'sem-fonte'")
    label: str | None = Field(default=None, description="Nulo = valores sem fonte")
    is_demo: bool = False
    license_label: str | None = None
    materials: int = Field(ge=0)
    values: int = Field(ge=0, description="Valores com número")
    medido: int = Field(ge=0)
    importado: int = Field(ge=0)
    estimado: int = Field(ge=0)
    declared_missing: int = Field(ge=0)
    share_pct: float | None = Field(default=None, description="Dos valores com número")


class SourcesOut(BaseModel):
    filters: FiltersOut
    values: int = Field(ge=0)
    sources: list[SourceQualityOut]


class HistogramBinOut(BaseModel):
    lower: float
    upper: float
    count: int = Field(ge=0)


class PropertyStatsOut(BaseModel):
    """One property, whole-catalogue: histogram, summary and gaps (D-193)."""

    filters: FiltersOut
    property_slug: str
    property_name: str
    symbol_latex: str | None = None
    category: PropertyCategory
    display_unit: str | None = None
    better_direction: str
    allows_log_scale: bool
    log_bins: bool = Field(description="Faixas iguais em log10")
    count: int = Field(ge=0, description="Materiais com número")
    declared_missing: int = Field(ge=0)
    not_recorded: int = Field(ge=0)
    coverage_pct: float | None = None
    # Nulos quando count = 0: não há mínimo de nada (D-24).
    minimum: float | None = None
    q1: float | None = None
    median: float | None = None
    q3: float | None = None
    maximum: float | None = None
    mean: float | None = None
    bins: list[HistogramBinOut]


class RankedMaterialOut(BaseModel):
    rank: int = Field(ge=1)
    material_id: int
    name: str
    class_slug: str
    class_name: str
    subclass: str | None = None
    is_demo: bool
    value: float


class TopOut(BaseModel):
    """The N best (or worst) materials by one property or performance index."""

    filters: FiltersOut
    kind: Literal["property", "index"]
    slug: str
    label: str
    expression: str | None = None
    unit: str | None = None
    order: Literal["melhor", "pior"]
    direction: Literal["maior", "menor"] = Field(description="O que 'melhor' quis dizer")
    ranked: int = Field(ge=0, description="Materiais com valor")
    without_value: int = Field(ge=0, description="Materiais filtrados sem valor")
    items: list[RankedMaterialOut]


class CorrelationPropertyOut(BaseModel):
    slug: str
    name: str
    symbol_latex: str | None = None
    count: int = Field(ge=0)


class CorrelationCellOut(BaseModel):
    x: str
    y: str
    #: ρ de Spearman; nulo com poucos pares ou sem variância — nunca 0.
    rho: float | None = None
    pairs: int = Field(ge=0)


class CorrelationOut(BaseModel):
    filters: FiltersOut
    method: Literal["spearman"] = "spearman"
    min_pairs: int
    properties: list[CorrelationPropertyOut]
    cells: list[CorrelationCellOut]


class MonthCountOut(BaseModel):
    month: str = Field(description="AAAA-MM")
    studies: int = Field(ge=0)
    charts: int = Field(ge=0)
    notebooks: int = Field(ge=0)


class AuditEventOut(BaseModel):
    entity_type: str
    entity_id: int
    entity_label: str
    action: str
    created_at: str


class AIDayOut(BaseModel):
    day: str
    requests: int = Field(ge=0)
    artifacts: int = Field(ge=0)
    fetches: int = Field(ge=0)


class AIUsageOut(BaseModel):
    """Only the caller's own counters — never anybody else's."""

    today: AIDayOut
    ai_daily_limit: int
    notebook_daily_limit: int
    fetch_daily_limit: int
    days: list[AIDayOut]


class ActivityOut(BaseModel):
    studies: int = Field(ge=0)
    charts: int = Field(ge=0)
    notebooks: int = Field(ge=0)
    own_materials: int = Field(ge=0)
    months: list[MonthCountOut]
    actions: dict[str, int]
    recent: list[AuditEventOut]
    ai: AIUsageOut


OverviewOut.model_rebuild()
