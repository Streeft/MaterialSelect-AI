"""Nastran bulk data: one ``MAT4`` entry (isotropic thermal material), large field.

Written from the public bulk-data description of ``MAT4``: fields ``MID, K,
CP, RHO, H, MU, HGEN, REFENH`` (then ``TCH, TDELTA, QLAT`` on a continuation).
Large-field form (``MAT4*``, 16-column fields) like the ``MAT1*`` of
``nastran.py``: four fields on the first line, four on the ``*`` line.

* **K and CP are required** (D-104, TM5-d). A blank K leaves the entry without
  its defining property, and a blank CP makes a transient analysis carry no
  heat capacity; the catalogue, not the solver, must supply both, so a card
  missing either is refused.
* **RHO blank is declared**: the solver reads it as 1.0, which is not the
  material's density and matters in a transient analysis.
* H, MU, HGEN and REFENH are convection, viscosity and heat-generation
  parameters of the model, left blank.
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.quantities import CONDUCTIVITY, CTE, DENSITY, POISSON, SPECIFIC_HEAT, YOUNG
from app.exporters.cae.text import comment_block, fixed_real

LABEL = "Nastran (MAT4, termico, campo largo)"
FIELD_WIDTH = 16

FIELDS = {
    CONDUCTIVITY.key: "MAT4 K",
    SPECIFIC_HEAT.key: "MAT4 CP",
    DENSITY.key: "MAT4 RHO",
}
_STRUCTURAL = "pertence ao MAT1, nao exportado neste cartao termico"
OUTSIDE = {YOUNG.key: _STRUCTURAL, POISSON.key: _STRUCTURAL, CTE.key: _STRUCTURAL}
REQUIRED = (CONDUCTIVITY, SPECIFIC_HEAT)
SUPPORTED = (CONDUCTIVITY, SPECIFIC_HEAT, DENSITY)


def _field(card: CaeCard, quantity) -> str:
    value = card.get(quantity)
    if not value.present:
        return " " * FIELD_WIDTH
    assert value.value is not None
    return fixed_real(value.value, FIELD_WIDTH).rjust(FIELD_WIDTH)


def render(card: CaeCard) -> str:
    out = comment_block("$ ", header_lines(card, LABEL, FIELDS, OUTSIDE))
    notes = [
        "",
        "MID = 1: troque se o numero ja estiver em uso no seu modelo.",
        "H, MU, HGEN e REFENH em branco: parametros do modelo, nao do material.",
    ]
    if not card.get(DENSITY).present:
        notes.append(
            "RHO em branco: o solver assume 1,0, que NAO e a densidade deste material. "
            "Nao use este cartao em analise transitoria sem cadastrar a densidade."
        )
    out += comment_block("$ ", notes)
    blank = " " * FIELD_WIDTH
    out.append(
        "MAT4*".ljust(8)
        + "1".rjust(FIELD_WIDTH)
        + _field(card, CONDUCTIVITY)
        + _field(card, SPECIFIC_HEAT)
        + _field(card, DENSITY)
    )
    out.append("*".ljust(8) + blank + blank + blank + blank)
    return "\n".join(line.rstrip() for line in out) + "\n"
