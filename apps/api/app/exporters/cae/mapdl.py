"""Ansys MAPDL: ``MP`` commands for one linear, isotropic material.

Written from the public description of the MAPDL command reference: ``MP,Lab,
MAT,C0`` defines a constant property; ``EX`` (Young's modulus), ``PRXY`` (major
Poisson's ratio), ``DENS`` (density), ``ALPX`` (secant thermal expansion),
``KXX`` (conductivity) and ``C`` (specific heat). ``!`` opens a comment and
``/UNITS`` only records the system — MAPDL never converts.

Two decisions that look like omissions:

* **No ``MPTEMP``/``MPDATA``.** Those tables carry temperature-dependent
  data, and the catalogue's numeric model holds one representative value per
  property. Curves preserved by D-102 in supplemental values are not used in
  any calculation, and this file is one.
* **Young's modulus *and* Poisson's ratio are required.** Without ``PRXY``
  MAPDL silently uses 0.3 — a value nobody registered — so a card without it
  is refused (D-104) rather than written.
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.quantities import (
    CONDUCTIVITY,
    CTE,
    DENSITY,
    POISSON,
    SPECIFIC_HEAT,
    YOUNG,
)
from app.exporters.cae.text import comment_block, real

LABEL = "Ansys MAPDL (comandos MP)"

#: quantity key -> MP label, in the order written.
FIELDS = {
    DENSITY.key: "DENS",
    YOUNG.key: "EX",
    POISSON.key: "PRXY",
    CTE.key: "ALPX",
    CONDUCTIVITY.key: "KXX",
    SPECIFIC_HEAT.key: "C",
}
REQUIRED = (YOUNG, POISSON)
SUPPORTED = (DENSITY, YOUNG, POISSON, CTE, CONDUCTIVITY, SPECIFIC_HEAT)


def _comment(lines: list[str]) -> list[str]:
    # "$" separates commands on a MAPDL line; never leave one in a comment.
    return comment_block("! ", [line.replace("$", "S") for line in lines])


def render(card: CaeCard) -> str:
    out = _comment(header_lines(card, LABEL, FIELDS))
    out += _comment(
        [
            "",
            "Troque MATID se o numero 1 ja estiver em uso no seu modelo.",
            "ALPX e o coeficiente secante; a temperatura de referencia (TREF ou "
            "MP,REFT) e parametro do modelo, nao do material, e nao e definida aqui.",
        ]
    )
    out.append(f"/UNITS,{card.system.mapdl_units}")
    out.append("MATID=1")
    for quantity in SUPPORTED:
        value = card.get(quantity)
        label = FIELDS[quantity.key]
        if value.present:
            assert value.value is not None
            out.append(f"MP,{label},MATID,{real(value.value)}")
        else:
            out += _comment([f"MP,{label} omitido: {value.omitted_reason}"])
    return "\n".join(out) + "\n"
