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

**Elastoplastic card** (``mapdl-plastic``, D-119): multilinear isotropic
hardening through the plasticity table, ``TB,PLAS,MAT,NTEMP,NPTS,MISO``, with
one ``TBPT,DEFI,plastic strain,true stress`` per point, the first at plastic
strain zero. The public help calls this the preferred access to MISO and keeps
the stand-alone ``TB,MISO`` (total strain, first point on the elastic line) as
archived; the plastic-strain table is the one the conversion produces, so no
total strain is rebuilt for it. ``NTEMP = 1`` and no ``TBTEMP``: one series,
one temperature, declared in the comments. At most :data:`PLASTIC_MAX_POINTS`
points — the per-temperature ceiling the public help gives for ``TB,MISO``,
kept as the conservative bound; a longer table is refused, never thinned.
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
PLASTIC_LABEL = "Ansys MAPDL (comandos MP e TB,PLAS MISO)"
PLASTIC_MAX_POINTS = 100

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
PLASTIC_REQUIRED = (YOUNG, POISSON)
SUPPORTED = (DENSITY, YOUNG, POISSON, CTE, CONDUCTIVITY, SPECIFIC_HEAT)


def _comment(lines: list[str]) -> list[str]:
    # "$" separates commands on a MAPDL line; never leave one in a comment.
    return comment_block("! ", [line.replace("$", "S") for line in lines])


def render(card: CaeCard) -> str:
    format_label = PLASTIC_LABEL if card.plastic is not None else LABEL
    out = _comment(header_lines(card, format_label, FIELDS))
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
    if card.plastic is not None:
        rows = card.plastic.rows
        out += _comment(["Encruamento isotropico multilinear: eps_p, tensao verdadeira"])
        out.append(f"TB,PLAS,MATID,1,{len(rows)},MISO")
        for row in rows:
            out.append(f"TBPT,DEFI,{real(row.plastic_strain)},{real(row.stress)}")
    return "\n".join(out) + "\n"
