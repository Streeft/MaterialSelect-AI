"""LS-DYNA keyword file: ``*MAT_ELASTIC`` (material type 1) with a title.

Written from the public keyword description of ``*MAT_ELASTIC``/``*MAT_001``:
one card of 10-column fields ``MID, RO, E, PR, DA, DB, K`` (K unused), with the
``_TITLE`` option adding an 80-column title line before it. ``$`` opens a
comment line; the deck is framed by ``*KEYWORD`` and ``*END``.

**RO, E and PR are all required.** PR defaults to 0 when blank and a blank RO
leaves an explicit analysis without mass, so a card missing any of the three is
refused (D-104). DA and DB (damping factors) are model parameters, left blank.
Expansion, conductivity and specific heat are not part of ``*MAT_ELASTIC``
(they belong to thermal material keywords this file does not write).
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.quantities import CONDUCTIVITY, CTE, DENSITY, POISSON, SPECIFIC_HEAT, YOUNG
from app.exporters.cae.text import ascii_fold, comment_block, fixed_real

LABEL = "LS-DYNA (*MAT_ELASTIC)"
FIELD_WIDTH = 10
TITLE_MAX = 80

FIELDS = {DENSITY.key: "RO", YOUNG.key: "E", POISSON.key: "PR"}
_THERMAL = "fora do *MAT_ELASTIC; pertence a um material termico, nao exportado"
OUTSIDE = {CTE.key: _THERMAL, CONDUCTIVITY.key: _THERMAL, SPECIFIC_HEAT.key: _THERMAL}
REQUIRED = (DENSITY, YOUNG, POISSON)
SUPPORTED = (DENSITY, YOUNG, POISSON)


def _title(name: str) -> str:
    # A title line that began with "$" would be read as a comment and "*" as a
    # keyword: either shifts every card after it.
    title = ascii_fold(name).lstrip("$* ")
    return (title or "MATERIAL")[:TITLE_MAX].rstrip()


def _field(card: CaeCard, quantity) -> str:
    value = card.get(quantity)
    if not value.present:
        return " " * FIELD_WIDTH
    assert value.value is not None
    return fixed_real(value.value, FIELD_WIDTH).rjust(FIELD_WIDTH)


def render(card: CaeCard) -> str:
    out = ["*KEYWORD"]
    out += comment_block("$ ", header_lines(card, LABEL, FIELDS, OUTSIDE))
    out += comment_block(
        "$ ",
        [
            "",
            "MID = 1: troque se o numero ja estiver em uso no seu modelo.",
            "DA e DB (amortecimento) em branco: parametros do modelo.",
        ],
    )
    out.append("*MAT_ELASTIC_TITLE")
    out.append(_title(card.name))
    out.append("$#     mid        ro         e        pr        da        db  not used")
    out.append(
        "1".rjust(FIELD_WIDTH) + _field(card, DENSITY) + _field(card, YOUNG) + _field(card, POISSON)
    )
    out.append("*END")
    return "\n".join(line.rstrip() for line in out) + "\n"
