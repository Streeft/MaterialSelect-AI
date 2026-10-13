"""Nastran bulk data: one ``MAT1`` entry in large-field format.

Written from the public bulk-data description of ``MAT1``: fields ``MID, E, G,
NU, RHO, A, TREF, GE`` (then ``ST, SC, SS, MCSID`` on a continuation). The
large-field form (``MAT1*``, 16-column fields, continuation line starting with
``*``) is used because the 8-column small field would cut a converted value to
four or five significant digits. ``$`` opens a comment line.

* **E and NU are required.** When one of E, G, NU is blank the solver computes
  it from ``E = 2(1+NU)G``; when two are blank it sets them to 0.0. Writing E
  alone would therefore become ``NU = 0`` inside the solver — the zero this
  project refuses — so such a card is refused (D-104). G is always left blank
  and computed by the solver from E and NU: the catalogue holds no shear
  modulus, and writing a computed one would put a derived number where a
  reader expects a catalogued one.
* **RHO and A blank are declared**, because the solver reads them as 0.0: the
  comment says what that means for the analysis.
* Conductivity and specific heat belong to ``MAT4``, written by ``nastran_thermal.py``; TREF and GE are model parameters, not material data.
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.quantities import CONDUCTIVITY, CTE, DENSITY, POISSON, SPECIFIC_HEAT, YOUNG
from app.exporters.cae.text import comment_block, fixed_real

LABEL = "Nastran (MAT1, campo largo)"
FIELD_WIDTH = 16

FIELDS = {
    YOUNG.key: "MAT1 E",
    POISSON.key: "MAT1 NU",
    DENSITY.key: "MAT1 RHO",
    CTE.key: "MAT1 A",
}
OUTSIDE = {
    CONDUCTIVITY.key: "pertence ao MAT4 (formato nastran-thermal), nao exportado aqui",
    SPECIFIC_HEAT.key: "pertence ao MAT4 (formato nastran-thermal), nao exportado aqui",
}
REQUIRED = (YOUNG, POISSON)
SUPPORTED = (YOUNG, POISSON, DENSITY, CTE)


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
        "G em branco: o solver o calcula de E e NU.",
        "TREF e GE em branco: parametros do modelo, nao do material (o solver assume 0,0).",
    ]
    if not card.get(DENSITY).present:
        notes.append(
            "RHO em branco: o solver assume 0,0 (massa nula). Nao use este cartao "
            "em analise dinamica ou com carga inercial sem cadastrar a densidade."
        )
    if not card.get(CTE).present:
        notes.append("A em branco: o solver assume 0,0 (sem deformacao termica).")
    out += comment_block("$ ", notes)
    blank = " " * FIELD_WIDTH
    out.append(
        "MAT1*".ljust(8)
        + "1".rjust(FIELD_WIDTH)
        + _field(card, YOUNG)
        + blank
        + _field(card, POISSON)
    )
    out.append("*".ljust(8) + _field(card, DENSITY) + _field(card, CTE) + blank + blank)
    return "\n".join(line.rstrip() for line in out) + "\n"
