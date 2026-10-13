"""LS-DYNA keyword file: ``*MAT_THERMAL_ISOTROPIC`` with a title (TM5-d).

Written from the public keyword description: card 1 holds ``TMID, TRO, TGRLC,
TGMULT, TLAT, HLAT`` and card 2 ``HC, TC`` (specific heat, conductivity), in
10-column fields; the ``_TITLE`` option adds an 80-column title line. ``$``
opens a comment line; the deck is framed by ``*KEYWORD`` and ``*END``.

**HC and TC are required** (D-104): a blank would be read as 0.0, the zero
this project refuses. TRO (thermal density) blank is declared: the solver
then falls back to its own default instead of the catalogue. TGRLC, TGMULT,
TLAT and HLAT (phase change) are model parameters, left blank.
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.lsdyna import FIELD_WIDTH, _title
from app.exporters.cae.quantities import CONDUCTIVITY, CTE, DENSITY, POISSON, SPECIFIC_HEAT, YOUNG
from app.exporters.cae.text import comment_block, fixed_real

LABEL = "LS-DYNA (*MAT_THERMAL_ISOTROPIC)"

FIELDS = {DENSITY.key: "TRO", SPECIFIC_HEAT.key: "HC", CONDUCTIVITY.key: "TC"}
_MECHANICAL = "pertence ao material mecanico (*MAT_ELASTIC), nao exportado neste cartao termico"
OUTSIDE = {YOUNG.key: _MECHANICAL, POISSON.key: _MECHANICAL, CTE.key: _MECHANICAL}
REQUIRED = (SPECIFIC_HEAT, CONDUCTIVITY)
SUPPORTED = (DENSITY, SPECIFIC_HEAT, CONDUCTIVITY)


def _field(card: CaeCard, quantity) -> str:
    value = card.get(quantity)
    if not value.present:
        return " " * FIELD_WIDTH
    assert value.value is not None
    return fixed_real(value.value, FIELD_WIDTH).rjust(FIELD_WIDTH)


def render(card: CaeCard) -> str:
    out = ["*KEYWORD"]
    out += comment_block("$ ", header_lines(card, LABEL, FIELDS, OUTSIDE))
    notes = [
        "",
        "TMID = 1: troque se o numero ja estiver em uso no seu modelo.",
        "TGRLC, TGMULT, TLAT e HLAT em branco: mudanca de fase e parametro do modelo.",
    ]
    if not card.get(DENSITY).present:
        notes.append(
            "TRO em branco: o solver usa o padrao dele, nao a densidade deste material. "
            "Cadastre a densidade antes de usar em analise transitoria."
        )
    out += comment_block("$ ", notes)
    out.append("*MAT_THERMAL_ISOTROPIC_TITLE")
    out.append(_title(card.name))
    out.append("$#    tmid       tro     tgrlc    tgmult      tlat      hlat")
    out.append("1".rjust(FIELD_WIDTH) + _field(card, DENSITY))
    out.append("$#      hc        tc")
    out.append(_field(card, SPECIFIC_HEAT) + _field(card, CONDUCTIVITY))
    out.append("*END")
    return "\n".join(line.rstrip() for line in out) + "\n"
