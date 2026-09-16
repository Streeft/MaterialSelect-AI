"""BatteryChemistry model: the cell catalogue the Battery Designer sizes against.

**Why this table exists at all.** The pack sizing in
``app/calculations/battery.py`` is *argument*: series/parallel counts, packaging
factors and levelized cost are algebra, and algebra is verified by review, which
is why it lives in code like ``units.py`` and the load cases of
[D-64](../../docs/DECISIONS.md). A chemistry's **specific energy is not
argument** — it is a measured number about a real substance. Writing 160 Wh/kg
for LFP into a Python literal would be exactly what principle 1 forbids: a
material property that came from nowhere the tool can name.

So the numbers are seeded data with a registered source, and the algebra reads
them. That is the same split [D-57](../../docs/DECISIONS.md) made for the
process family — "dado semeado, não schema".

**Why its own table rather than ``Material``.** A cell chemistry is not a
material in this catalogue's sense, and forcing it in would break two things
that work. Specific energy, cycle life and cost per kWh are properties no other
record can ever have, so every one of them would sit at ~0% coverage in the
indicator panel and climb to the top of the gap ranking — reporting as the
catalogue's biggest hole something that is not a hole at all. And the cells
would enter maps, selection studies and the comparison table as if they were
candidates alongside steel and epoxy.

This is the shape [D-66](../../docs/DECISIONS.md) already accepted for
``TransportMode``: a closed, seeded vocabulary in a table of its own, kept out
of the two universes on purpose.

**Why plain columns instead of the provenance rail.** Same trade-off
``TransportMode`` states, and for the same reason: the rail
(original value + original unit + normalised value + canonical unit +
conversion method) exists to survive **import** and **hand entry**, and this
vocabulary has neither in v1 — nine seeded rows written in canonical units by
the seed and by nothing else. The commitment that does survive is M1's: **every
row names its ``Source``**, so the licence and the citation of each figure are
registered like any other number in the system. The canonical unit of each
column is stated here and is not a free choice at the call site.

If a user-entry path ever appears, this graduates to the value-table shape of
``ProcessAttributeValue``. The trade-off is written down so that graduation is a
decision someone makes, not something discovered by a bug.
"""

from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BatteryChemistry(Base):
    """One electrochemical cell chemistry, with the figures the sizing reads."""

    __tablename__ = "battery_chemistry"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    #: Cathode/anode shorthand, e.g. ``LiFePO4``. Text, never parsed.
    formula: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # --- the figures the sizing reads, each in a stated canonical unit -------
    #: V, nominal cell voltage.
    nominal_voltage: Mapped[float] = mapped_column(Float, nullable=False)
    #: Wh/kg at cell level.
    specific_energy: Mapped[float] = mapped_column(Float, nullable=False)
    #: Wh/L at cell level.
    energy_density: Mapped[float] = mapped_column(Float, nullable=False)
    #: W/kg at cell level.
    specific_power: Mapped[float] = mapped_column(Float, nullable=False)
    #: Round-trip efficiency, 0–1. Dimensionless by construction.
    cycle_efficiency: Mapped[float] = mapped_column(Float, nullable=False)
    #: Cycles to 80% of initial capacity. A count, not a duration.
    cycle_life: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Cost per kWh **at cell level**, in the currency the source quotes.
    #: Money is in no unit system ([D-65](../../docs/DECISIONS.md)), so the
    #: currency is said in words by every surface that prints this, never
    #: inferred from a symbol.
    cell_cost_per_kwh: Mapped[float] = mapped_column(Float, nullable=False)

    # --- thermal envelope ----------------------------------------------------
    #: Ordinal label, not a number: BAIXA < MODERADA < MEDIA < ALTA < MUITO_ALTA.
    #: Kept as text because ranking chemistries by "safety" on an invented
    #: numeric scale would be a magnitude the sources never stated.
    thermal_safety: Mapped[str] = mapped_column(String(20), nullable=False)
    #: °C, onset of self-heating / thermal runaway.
    thermal_runaway_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    #: °C, operating window.
    operating_temp_min_c: Mapped[float] = mapped_column(Float, nullable=False)
    operating_temp_max_c: Mapped[float] = mapped_column(Float, nullable=False)

    #: C, continuous and 10 s pulse discharge rates.
    max_continuous_c_rate: Mapped[float] = mapped_column(Float, nullable=False)
    peak_c_rate: Mapped[float] = mapped_column(Float, nullable=False)

    # --- editorial text, outside principle 1 by construction -----------------
    #: Prose about a family, not a property value — the same standing the
    #: taxonomy's ``applications`` got in [D-61](../../docs/DECISIONS.md).
    advantages: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    limitations: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    typical_applications: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    #: Reading order in the picker; not a ranking of any kind.
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    #: A citação específica desta linha. O ``Source`` registra o **conjunto**
    #: compilado e a sua licença (M1); esta coluna guarda de onde veio *esta*
    #: química, porque as nove não saíram todas do mesmo lugar e achatá-las num
    #: rótulo único perderia a única informação que permite conferir um número.
    citation: Mapped[str | None] = mapped_column(String(400), nullable=True)

    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("source.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source: Mapped[Source | None] = relationship()  # noqa: F821
