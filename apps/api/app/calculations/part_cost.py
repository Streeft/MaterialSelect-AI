"""Part Cost Estimator: what one part costs to make, term by term (P3).

The tool could already say which material makes the lightest beam (D-64). It
could not say what the beam costs, and cost is the constraint that decides most
real selections. This module closes that, and it does it by joining the two
universes the P0-2 built: the **material** supplies the mass and the cost per
kilogram, the **process** supplies the tooling, the rate and the capital.

The model is the standard part-cost equation of the public methodology
(Ashby, *Materials Selection in Mechanical Design*, process-selection chapter),
and it is a **sum of three terms that behave differently with batch size** —
which is the whole lesson, not an implementation detail::

    C = m·Cm/(1 − f)  +  C_t/n  +  Ċ_oh/ṅ  +  C_c/(ṅ · t_wo · L)
        └── material ──┘  └ tooling ┘  └──────── time ─────────┘

* the **material** term does not move with ``n`` at all: it is the floor no
  batch size can get under;
* the **tooling** term falls as ``1/n``: it is the entire reason die casting is
  absurd for ten parts and the cheapest thing there is for a hundred thousand;
* the **time** terms are per-part constants set by how fast the shop runs.

So the estimator returns the **terms, not only the total** — a total alone
would be an oracle, and the crossover between two processes as ``n`` grows is
the answer a reader actually came for.

**The one place this tool cannot derive a unit, and says so.** Everywhere else
a number carries a dimension Pint multiplied out — that is what makes D-64's
"2,4 kg" auditable. Currency is not in any unit system: ``custo_massa`` is
catalogued as dimensionless on purpose, because pretending money is a physical
quantity would put it in a system it does not belong to. The answer here is
therefore in **unspecified monetary units**, and every surface that renders it
has to say that rather than print a currency symbol the catalogue never
recorded. Writing "R$" on a number whose currency nobody declared would be
inventing data, which is principle 1 wearing a different hat.

Absence is handled as everywhere (principle 3): a process missing an attribute
the model needs is **excluded and named**, never given a zero — a zero tooling
cost would make the most capital-intensive process look free.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: Attribute slugs the model reads from a process, and what each one is.
TOOLING_COST = "custo-ferramental"
PRODUCTION_RATE = "taxa-producao"
CAPITAL_COST = "custo-capital"
OVERHEAD_RATE = "custo-hora-operacao"
SCRAP_FRACTION = "fracao-refugo"

#: Every process attribute the estimate needs. A process lacking any of them
#: cannot be costed, and is reported rather than guessed at.
REQUIRED_PROCESS_ATTRIBUTES = (
    TOOLING_COST,
    PRODUCTION_RATE,
    CAPITAL_COST,
    OVERHEAD_RATE,
    SCRAP_FRACTION,
)

#: The material property that carries cost per unit mass.
MATERIAL_COST_SLUG = "custo_massa"

#: What a money answer is denominated in, written once for every surface that
#: has to name it — this estimator, and the cost objective of the solver, which
#: divides by an index built on the same dimensionless ``custo_massa``.
MONETARY_UNIT = "unidade monetária não especificada"

#: Standard batch sizes sampled for the cost vs batch size curve: 1, 2, 5 per decade.
DEFAULT_CURVE_BATCH_SIZES: tuple[float, ...] = (
    1.0,
    2.0,
    5.0,
    10.0,
    20.0,
    50.0,
    100.0,
    200.0,
    500.0,
    1_000.0,
    2_000.0,
    5_000.0,
    10_000.0,
    20_000.0,
    50_000.0,
    100_000.0,
    200_000.0,
    500_000.0,
    1_000_000.0,
)


class PartCostError(ValueError):
    """The brief cannot be costed — bad inputs, not missing data."""


@dataclass(frozen=True)
class ShopAssumptions:
    """What the shop floor assumes, as opposed to what a process *is*.

    Capital write-off time and load factor are not facts about a process the way
    its tooling cost is: two shops running the same press amortise it over
    different horizons and keep it busy different fractions of the year. They
    are therefore inputs with visible values, the same treatment D-64 gave the
    beam's support constant — a constant that changes the answer has to be
    something the reader can see was chosen.
    """

    #: Years over which the equipment is written off.
    write_off_years: float
    #: Fraction of available time the equipment actually runs (0 < L ≤ 1).
    load_factor: float

    def __post_init__(self) -> None:
        if not self.write_off_years > 0:
            raise PartCostError("O tempo de amortização precisa ser maior que zero.")
        if not 0 < self.load_factor <= 1:
            raise PartCostError("O fator de carga fica entre 0 (exclusivo) e 1.")


@dataclass(frozen=True)
class CostTerms:
    """One estimate, decomposed. The sum is ``total``; the parts are the point."""

    material: float
    tooling: float
    overhead: float
    capital: float

    @property
    def total(self) -> float:
        return self.material + self.tooling + self.overhead + self.capital

    @property
    def batch_sensitive(self) -> float:
        """The share that a larger batch can still remove: the tooling term."""
        return self.tooling


@dataclass(frozen=True)
class CostCurvePoint:
    """One point of the unit cost vs batch size (n) curve (Ashby/ADR 0004)."""

    batch_size: float
    cost: float


@dataclass(frozen=True)
class CostedProcess:
    """One process priced for this part, at this batch size."""

    process_id: int
    process_slug: str
    process_name: str
    rank: int
    terms: CostTerms
    curve: list[CostCurvePoint] = field(default_factory=list)


@dataclass(frozen=True)
class UncostedProcess:
    """A process that could not be priced, and what it lacked."""

    process_id: int
    process_slug: str
    process_name: str
    missing_keys: list[str]
    reason: str


#: Wall-clock hours in a year. Written once because two modules need the same
#: year: this estimator turns it into machine time with a load factor, and the
#: eco audit turns it into service time with a duty cycle. A year that differed
#: between them would be a difference nobody could see in either answer.
HOURS_PER_YEAR = 8760.0


def _hours_per_year(write_off_years: float) -> float:
    """Available hours in the write-off horizon, before the load factor.

    8760 is a year of wall-clock hours, not of shifts: the load factor is what
    turns it into running time, and keeping the two separate is what lets a
    reader change one without silently changing the other.
    """
    return HOURS_PER_YEAR * write_off_years


def curve_batch_sizes(current_batch: float = 1.0) -> list[float]:
    """Span of batch sizes for drawing the C(n) curve.

    Covers 1 to 10⁶ in 1, 2, 5 steps per decade (the standard log spacing),
    and inserts the user-requested ``current_batch`` in sorted order if not already
    present. If ``current_batch`` exceeds 10⁶, decades are extended to cover it.
    """
    batches = set(DEFAULT_CURVE_BATCH_SIZES)
    if current_batch > 0:
        batches.add(float(current_batch))

    max_batch = max(batches)
    if max_batch > 1_000_000.0:
        highest_decade = 10 ** len(str(int(max_batch)))
        for decade_mult in (10_000_000.0, 100_000_000.0, 1_000_000_000.0):
            for mult in (1.0, 2.0, 5.0):
                val = mult * (decade_mult / 10.0)
                if val <= highest_decade * 2.0:
                    batches.add(val)

    return sorted(batches)


def cost_curve(
    *,
    base_cost: float,
    tooling_cost: float,
    batch_sizes: list[float] | None = None,
    current_batch: float = 1.0,
) -> list[CostCurvePoint]:
    """Calculate unit cost points across batch sizes: C(n) = C_base + C_t / n.

    The curve asymptotes to ``base_cost`` (material + overhead + capital) as
    ``n -> infinity``, and climbs as ``1/n`` for small batches.
    """
    sizes = batch_sizes if batch_sizes is not None else curve_batch_sizes(current_batch)
    return [
        CostCurvePoint(
            batch_size=n,
            cost=base_cost + (tooling_cost / n if n > 0 else 0.0),
        )
        for n in sizes
        if n >= 1.0
    ]


def cost_terms(
    *,
    part_mass: float,
    material_cost_per_mass: float,
    tooling_cost: float,
    production_rate: float,
    capital_cost: float,
    overhead_rate: float,
    scrap_fraction: float,
    batch_size: float,
    assumptions: ShopAssumptions,
) -> CostTerms:
    """The four terms of one estimate.

    Args:
        part_mass: finished part mass, kg — from the Solver, or measured.
        material_cost_per_mass: catalogued ``custo_massa``, monetary units / kg.
        tooling_cost: dedicated tooling for this part, monetary units.
        production_rate: parts per hour.
        capital_cost: equipment cost, monetary units.
        overhead_rate: shop overhead, monetary units per hour.
        scrap_fraction: fraction of material lost, 0 ≤ f < 1.
        batch_size: parts in the run.
        assumptions: write-off horizon and load factor.

    Raises:
        PartCostError: on an input that makes the equation meaningless — a
            non-positive mass, rate or batch, or a scrap fraction at or above 1
            (which says every gram is lost and the part is never made).
    """
    if not part_mass > 0:
        raise PartCostError("A massa da peça precisa ser maior que zero.")
    if not batch_size >= 1:
        raise PartCostError("O lote precisa ter ao menos uma peça.")
    if not production_rate > 0:
        raise PartCostError("A taxa de produção precisa ser maior que zero.")
    if not 0 <= scrap_fraction < 1:
        raise PartCostError("A fração de refugo fica entre 0 e 1 (exclusivo).")
    if material_cost_per_mass < 0 or tooling_cost < 0 or capital_cost < 0 or overhead_rate < 0:
        raise PartCostError("Custo negativo não existe.")

    return CostTerms(
        material=part_mass * material_cost_per_mass / (1.0 - scrap_fraction),
        tooling=tooling_cost / batch_size,
        overhead=overhead_rate / production_rate,
        capital=capital_cost
        / (
            production_rate * _hours_per_year(assumptions.write_off_years) * assumptions.load_factor
        ),
    )
