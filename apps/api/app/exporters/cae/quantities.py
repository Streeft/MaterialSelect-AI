"""What a CAE material card can carry, and in which consistent unit system (D-104).

Two tables, both argument and not data:

* :data:`QUANTITIES` maps each quantity a card can hold to the catalogue slug
  it is read from. Three of the six slugs (Poisson's ratio, thermal expansion,
  specific heat) are **not** defined by the demo or reference seed today: they
  are the contract with whoever curates the catalogue — the official bundle of
  D-102 or a curator creating the property — and until a definition with that
  slug exists, the quantity is simply "não cadastrado" on every card. No
  definition is seeded here on purpose: a property nobody has values for would
  sit at ~0 % on the dashboard and climb the gap ranking, the effect D-69
  refused for the battery quantities.

* :data:`UNIT_SYSTEMS` are the *consistent* unit systems a solver expects. A
  solver has no notion of units: it multiplies the numbers it is given, so a
  density in kg/m³ next to a modulus in MPa produces a wrong answer with no
  error. Every target unit is written as a product of named units with
  integer powers — the same terms produce the Pint string the conversion uses
  and the unit a MatML document declares, so the two cannot disagree. No
  numeric factor appears anywhere: every conversion goes through
  ``app.calculations.units`` (principle 4).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CaeQuantity:
    """One quantity a material card can carry."""

    key: str
    #: Catalogue slug the value is read from (``PropertyDefinition.slug``).
    slug: str
    #: Portuguese name, for comments and refusal messages.
    label: str


YOUNG = CaeQuantity("young", "modulo_young", "módulo de Young")
POISSON = CaeQuantity("poisson", "coef_poisson", "coeficiente de Poisson")
DENSITY = CaeQuantity("density", "densidade", "densidade")
CTE = CaeQuantity("cte", "coef_expansao_termica", "coeficiente de expansão térmica")
CONDUCTIVITY = CaeQuantity("conductivity", "condutividade_termica", "condutividade térmica")
SPECIFIC_HEAT = CaeQuantity("specific_heat", "calor_especifico", "calor específico")

#: In the order every card lists them.
QUANTITIES: tuple[CaeQuantity, ...] = (
    DENSITY,
    YOUNG,
    POISSON,
    CTE,
    CONDUCTIVITY,
    SPECIFIC_HEAT,
)


@dataclass(frozen=True)
class UnitTerm:
    """One named unit raised to an integer power."""

    #: The Pint name — what ``app.calculations.units`` converts to.
    pint: str
    #: The ASCII symbol written in a file (also MatML's ``Unit/Name``).
    symbol: str
    power: int = 1


@dataclass(frozen=True)
class UnitSystem:
    """A consistent unit system, as the user chose it."""

    key: str
    #: Portuguese, written in every file header.
    label: str
    #: Base units, in words, for the header line.
    base: str
    #: MAPDL ``/UNITS`` label. Record-keeping only: MAPDL never converts.
    mapdl_units: str
    #: quantity key -> unit terms; an empty tuple is dimensionless.
    terms: dict[str, tuple[UnitTerm, ...]]

    def pint_unit(self, key: str) -> str:
        """The Pint target unit for one quantity."""
        terms = self.terms[key]
        if not terms:
            return "dimensionless"
        return " * ".join(t.pint if t.power == 1 else f"{t.pint} ** {t.power}" for t in terms)

    def symbol(self, key: str) -> str:
        """The unit as written in a file, ASCII only (``kg*m^-3``)."""
        terms = self.terms[key]
        if not terms:
            return "adimensional"
        return "*".join(t.symbol if t.power == 1 else f"{t.symbol}^{t.power}" for t in terms)


_DIMENSIONLESS: tuple[UnitTerm, ...] = ()

SI_M = UnitSystem(
    key="m-kg-s",
    label="SI m-kg-s (m, kg, s, N, Pa, K)",
    base="comprimento m, massa kg, tempo s, força N, tensão Pa, temperatura K",
    mapdl_units="SI",
    terms={
        "density": (UnitTerm("kg", "kg"), UnitTerm("m", "m", -3)),
        "young": (UnitTerm("Pa", "Pa"),),
        "poisson": _DIMENSIONLESS,
        "cte": (UnitTerm("K", "K", -1),),
        "conductivity": (UnitTerm("W", "W"), UnitTerm("m", "m", -1), UnitTerm("K", "K", -1)),
        "specific_heat": (UnitTerm("J", "J"), UnitTerm("kg", "kg", -1), UnitTerm("K", "K", -1)),
    },
)

SI_MM = UnitSystem(
    key="mm-t-s",
    label="SI mm-t-s (mm, t, s, N, MPa, K)",
    base="comprimento mm, massa t (tonelada), tempo s, força N, tensão MPa, temperatura K",
    mapdl_units="MPA",
    terms={
        "density": (UnitTerm("tonne", "t"), UnitTerm("mm", "mm", -3)),
        "young": (UnitTerm("MPa", "MPa"),),
        "poisson": _DIMENSIONLESS,
        "cte": (UnitTerm("K", "K", -1),),
        # N*mm/s per mm per K: energy is mJ (N*mm), power mW.
        "conductivity": (UnitTerm("mW", "mW"), UnitTerm("mm", "mm", -1), UnitTerm("K", "K", -1)),
        "specific_heat": (
            UnitTerm("mJ", "mJ"),
            UnitTerm("tonne", "t", -1),
            UnitTerm("K", "K", -1),
        ),
    },
)

US_IN = UnitSystem(
    key="in-lbf-s",
    label="EUA in-lbf-s (in, lbf*s^2/in, s, lbf, psi, degF)",
    base=(
        "comprimento in, massa lbf*s^2/in, tempo s, força lbf, tensão psi, "
        "temperatura degF (diferenças)"
    ),
    mapdl_units="BIN",
    terms={
        "density": (UnitTerm("lbf", "lbf"), UnitTerm("s", "s", 2), UnitTerm("inch", "in", -4)),
        "young": (UnitTerm("psi", "psi"),),
        "poisson": _DIMENSIONLESS,
        "cte": (UnitTerm("delta_degF", "degF", -1),),
        # in*lbf/s per in per degF.
        "conductivity": (
            UnitTerm("lbf", "lbf"),
            UnitTerm("s", "s", -1),
            UnitTerm("delta_degF", "degF", -1),
        ),
        # in*lbf per (lbf*s^2/in) per degF.
        "specific_heat": (
            UnitTerm("inch", "in", 2),
            UnitTerm("s", "s", -2),
            UnitTerm("delta_degF", "degF", -1),
        ),
    },
)

UNIT_SYSTEMS: dict[str, UnitSystem] = {s.key: s for s in (SI_M, SI_MM, US_IN)}
