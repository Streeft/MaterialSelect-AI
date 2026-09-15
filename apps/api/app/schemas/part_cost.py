"""Contracts for the Part Cost Estimator (P3)."""

from __future__ import annotations

from pydantic import BaseModel, Field

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


class CostedProcessOut(BaseModel):
    process_id: int
    process_slug: str
    process_name: str
    class_name: str
    rank: int
    terms: CostTermsOut


class UncostedProcessOut(BaseModel):
    process_id: int
    process_slug: str
    process_name: str
    missing_slugs: list[str]
    missing_labels: list[str]
    reason: str


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
