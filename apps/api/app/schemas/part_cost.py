"""Contracts for the Part Cost Estimator (P3)."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.calculations.part_cost import MONETARY_UNIT

#: What the answer is denominated in. Money is not a physical quantity, and this
#: catalogue never recorded a currency — so every surface says this instead of
#: printing a symbol nobody declared. See ``app.calculations.part_cost``.
MONETARY_UNIT_NOTE = (
    f"Os valores estão em {MONETARY_UNIT}: o catálogo registra "
    "custo por massa sem declarar moeda, e imprimir um símbolo aqui seria inventar "
    "o que ninguém informou."
)

#: Defaults for the shop-floor assumptions, both visible and both overridable.
#: Five years is a common write-off horizon for production equipment and 0,5 a
#: common load factor; neither is a fact about any process, which is why they are
#: inputs rather than constants (D-64's treatment of the support constant).
DEFAULT_WRITE_OFF_YEARS = 5.0
DEFAULT_LOAD_FACTOR = 0.5
#: The batch the screen starts from. A starting point, not a recommendation: the
#: reader still states the part mass, which is what decides anything.
DEFAULT_BATCH_SIZE = 1000.0


class CostRequest(BaseModel):
    material_id: int
    #: Finished part mass, kg — from the Solver, or measured.
    part_mass: float = Field(gt=0, le=1e6)
    batch_size: float = Field(ge=1, le=1e9)
    write_off_years: float = Field(default=DEFAULT_WRITE_OFF_YEARS, gt=0, le=100)
    load_factor: float = Field(default=DEFAULT_LOAD_FACTOR, gt=0, le=1)


class CostTermsOut(BaseModel):
    """One estimate, decomposed. The sum is the total; the parts are the point."""

    material: float
    tooling: float
    overhead: float
    capital: float
    total: float
    #: The share a larger batch could still remove — the tooling term.
    batch_sensitive: float


class CostCurvePointOut(BaseModel):
    """One coordinate pair on the cost vs batch size curve (ADR 0004)."""

    batch_size: float
    cost: float


class CostedProcessOut(BaseModel):
    process_id: int
    process_slug: str
    process_name: str
    class_name: str
    rank: int
    terms: CostTermsOut
    curve: list[CostCurvePointOut] = Field(default_factory=list)


class UncostedProcessOut(BaseModel):
    process_id: int
    process_slug: str
    process_name: str
    missing_slugs: list[str]
    missing_labels: list[str]
    reason: str


class CostDomainOut(BaseModel):
    """Log-log extents of the C(n) figure, computed on the server (ADR 0004)."""

    x: tuple[float, float]
    y: tuple[float, float]
    #: Sorted batch sizes of the curves plus the current one (rows of the table).
    batch_sizes: list[float]


class CostResultOut(BaseModel):
    material_id: int
    material_name: str
    part_mass: float
    batch_size: float
    write_off_years: float
    load_factor: float
    #: The catalogued ``custo_massa`` this estimate used.
    material_cost_per_mass: float
    monetary_unit_note: str = MONETARY_UNIT_NOTE
    costed: list[CostedProcessOut]
    uncosted: list[UncostedProcessOut]
    domain: CostDomainOut | None = None


class ProcessChoiceIn(BaseModel):
    """The process a reader picked for one compared material (D-251)."""

    material_id: int = Field(gt=0)
    process_id: int = Field(gt=0)


class CostCurvesRequest(BaseModel):
    """The materials of a comparison, priced with one part, batch and premises.

    ``process_choices`` fixes the process of some materials: their curve is that
    process's own cost × batch curve (its own tooling, rate and capital), not the
    cheapest of all. A material without a choice keeps the lower envelope.
    """

    material_ids: list[int] = Field(min_length=1, max_length=5)
    process_choices: list[ProcessChoiceIn] = Field(default_factory=list, max_length=5)
    part_mass: float = Field(gt=0, le=1e6)
    batch_size: float = Field(ge=1, le=1e9)
    write_off_years: float = Field(default=DEFAULT_WRITE_OFF_YEARS, gt=0, le=100)
    load_factor: float = Field(default=DEFAULT_LOAD_FACTOR, gt=0, le=1)

    @model_validator(mode="after")
    def _choices_name_compared_materials_once(self) -> CostCurvesRequest:
        chosen = [choice.material_id for choice in self.process_choices]
        if len(set(chosen)) != len(chosen):
            raise ValueError("Escolha um só processo por material.")
        if not set(chosen) <= set(self.material_ids):
            raise ValueError("O processo escolhido é de um material que não está na comparação.")
        return self


class MaterialCurvePointOut(BaseModel):
    """The cheapest way of making the part at one batch size (D-234)."""

    batch_size: float
    cost: float
    process_id: int
    process_slug: str
    process_name: str


class ProcessOptionOut(BaseModel):
    """A process that can price the material: what the reader may choose (D-251)."""

    process_id: int
    process_slug: str
    process_name: str


class MaterialCostCurveOut(BaseModel):
    """One material's cost × batch curve: the lower envelope of its processes.

    ``points`` is empty, and ``reason`` says why in words, when the material
    could not be priced (no cost per mass, no process with the economic data, or
    not visible to the reader). ``current`` is the point of ``points`` at the
    batch the reader asked for — the marker on the figure.
    """

    material_id: int
    material_name: str | None = None
    points: list[MaterialCurvePointOut] = Field(default_factory=list)
    current: MaterialCurvePointOut | None = None
    reason: str | None = None
    #: The process the curve was fixed to (D-251); ``None`` is the lower envelope.
    chosen_process_id: int | None = None
    #: Every process that could price this material, for the reader's choice.
    process_options: list[ProcessOptionOut] = Field(default_factory=list)


class CostCurvesOut(BaseModel):
    """Every compared material's curve, framed by one log-log domain (ADR 0004)."""

    batch_size: float
    curves: list[MaterialCostCurveOut]
    domain: CostDomainOut | None = None
    monetary_unit_note: str = MONETARY_UNIT_NOTE
