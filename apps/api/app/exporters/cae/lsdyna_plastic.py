"""LS-DYNA keyword file: ``*MAT_PIECEWISE_LINEAR_PLASTICITY`` (type 24) with a title (D-119).

Written from the public keyword description of ``*MAT_024``: card 1 holds
``MID, RO, E, PR, SIGY, ETAN, FAIL, TDEL``; card 2 ``C, P, LCSS, LCSR, VP``;
cards 3 and 4 the eight ``EPS``/``ES`` pairs, all in 10-column fields. With
``LCSS`` set, the hardening is read from that load curve — effective plastic
strain on the abscissa, yield stress (true) on the ordinate, first point at
plastic strain zero — and the ``EPS``/``ES`` pairs and ``ETAN`` are not used,
so they stay blank. The curve is a ``*DEFINE_CURVE`` (card ``LCID, SIDR, SFA,
SFO, OFFA, OFFO, DATTYP``, then one 20+20-column card per point); a load
curve is used instead of the eight pairs so that no point has to be dropped.

* **RO, E and PR are required**, as in ``*MAT_ELASTIC`` (D-104).
* ``SIGY`` is written with the yield stress of the table (the first ordinate):
  the public descriptions differ on whether it is read when ``LCSS`` is set,
  and the value is the same either way.
* ``C``, ``P`` (Cowper–Symonds), ``LCSR`` and ``VP`` are left blank: the
  catalogue holds no rate dependence, and the card says so. ``FAIL`` and
  ``TDEL`` are model choices, left blank.
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.lsdyna import FIELD_WIDTH, _title
from app.exporters.cae.quantities import CONDUCTIVITY, CTE, DENSITY, POISSON, SPECIFIC_HEAT, YOUNG
from app.exporters.cae.text import comment_block, fixed_real

LABEL = "LS-DYNA (*MAT_PIECEWISE_LINEAR_PLASTICITY)"
CURVE_FIELD_WIDTH = 20
#: The ``*DEFINE_CURVE`` id that ``LCSS`` points to.
CURVE_ID = 1

FIELDS = {DENSITY.key: "RO", YOUNG.key: "E", POISSON.key: "PR"}
_THERMAL = (
    "fora do *MAT_024; pertence a um material termico, nao exportado (formato lsdyna-thermal)"
)
OUTSIDE = {CTE.key: _THERMAL, CONDUCTIVITY.key: _THERMAL, SPECIFIC_HEAT.key: _THERMAL}
REQUIRED = (DENSITY, YOUNG, POISSON)
PLASTIC_REQUIRED = REQUIRED
SUPPORTED = (DENSITY, YOUNG, POISSON)


def _field(value: float | None, width: int = FIELD_WIDTH) -> str:
    if value is None:
        return " " * width
    return fixed_real(value, width).rjust(width)


def render(card: CaeCard) -> str:
    plastic = card.plastic
    # Refused upstream without a table; the guard keeps a direct caller from
    # writing a *MAT_024 with no hardening at all.
    assert plastic is not None, "cartao plastico sem tabela"
    out = ["*KEYWORD"]
    out += comment_block("$ ", header_lines(card, LABEL, FIELDS, OUTSIDE))
    out += comment_block(
        "$ ",
        [
            "",
            "MID = 1 e LCID = 1: troque se os numeros ja estiverem em uso no seu modelo.",
            "ETAN, EPS1-EPS8 e ES1-ES8 em branco: o encruamento vem da curva LCSS.",
            "C, P, LCSR e VP em branco: sem dependencia da taxa (o catalogo nao a tem).",
            "FAIL e TDEL em branco: criterio de falha e parametro do modelo.",
        ],
    )
    out.append("*MAT_PIECEWISE_LINEAR_PLASTICITY_TITLE")
    out.append(_title(card.name))
    out.append("$#     mid        ro         e        pr      sigy      etan      fail      tdel")
    out.append(
        "1".rjust(FIELD_WIDTH)
        + _field(card.get(DENSITY).value)
        + _field(card.get(YOUNG).value)
        + _field(card.get(POISSON).value)
        + _field(plastic.yield_stress)
    )
    out.append("$#       c         p      lcss      lcsr        vp")
    out.append(" " * (2 * FIELD_WIDTH) + str(CURVE_ID).rjust(FIELD_WIDTH))
    out.append("$#    eps1      eps2      eps3      eps4      eps5      eps6      eps7      eps8")
    out.append("")
    out.append("$#     es1       es2       es3       es4       es5       es6       es7       es8")
    out.append("")
    out += comment_block(
        "$ ",
        ["Curva LCSS: deformacao plastica efetiva x tensao verdadeira de escoamento"],
    )
    out.append("*DEFINE_CURVE")
    out.append("$#    lcid      sidr       sfa       sfo      offa      offo    dattyp")
    out.append(str(CURVE_ID).rjust(FIELD_WIDTH))
    out.append("$#                a1                  o1")
    for row in plastic.rows:
        out.append(
            _field(row.plastic_strain, CURVE_FIELD_WIDTH) + _field(row.stress, CURVE_FIELD_WIDTH)
        )
    out.append("*END")
    return "\n".join(line.rstrip() for line in out) + "\n"
