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

**Elastoplastic card** (``nastran-plastic``, D-119): ``MAT1`` plus ``MATS1``
(``MID, TID, TYPE, H, YF, HR, LIMIT1, LIMIT2``) with ``TYPE = PLASTIC``, von
Mises yield (``YF = 1``), isotropic hardening (``HR = 1``), ``H`` blank because
the table is given, and ``LIMIT1`` the initial yield stress. The table is a
``TABLES1`` of stress against **total** strain, by the classic public rule for
``TYPE = PLASTIC``: first point at the origin, second at the initial yield
point, and the slope between them equal to the ``MAT1`` E. The conversion
gives exactly that: the yield row is anchored at plastic strain zero, so its
total strain is ``sigma_y/E`` with the same E written in ``MAT1``. ``IT`` (the
newer field that would switch the table to plastic strain) is left blank,
which keeps the classic total-strain reading.
"""

from __future__ import annotations

from app.exporters.cae.card import CaeCard
from app.exporters.cae.deck import header_lines
from app.exporters.cae.quantities import CONDUCTIVITY, CTE, DENSITY, POISSON, SPECIFIC_HEAT, YOUNG
from app.exporters.cae.text import comment_block, fixed_real

LABEL = "Nastran (MAT1, campo largo)"
PLASTIC_LABEL = "Nastran (MAT1, MATS1 e TABLES1, campo largo)"
FIELD_WIDTH = 16
#: ``MATS1`` table id; separate numbering from ``MID``.
TABLE_ID = 1

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
PLASTIC_REQUIRED = (YOUNG, POISSON)
SUPPORTED = (YOUNG, POISSON, DENSITY, CTE)


def _field(card: CaeCard, quantity) -> str:
    value = card.get(quantity)
    if not value.present:
        return " " * FIELD_WIDTH
    assert value.value is not None
    return fixed_real(value.value, FIELD_WIDTH).rjust(FIELD_WIDTH)


def _number(value: float) -> str:
    return fixed_real(value, FIELD_WIDTH).rjust(FIELD_WIDTH)


def _plastic(card: CaeCard) -> list[str]:
    plastic = card.plastic
    assert plastic is not None
    out = comment_block(
        "$ ",
        [
            "",
            f"MATS1: TYPE=PLASTIC, YF=1 (von Mises), HR=1 (isotropico), H em branco "
            f"(tabela {TABLE_ID} dada), LIMIT1 = tensao de escoamento.",
            "TABLES1: tensao verdadeira x deformacao verdadeira TOTAL (eps_p + sigma_t/E); "
            "origem, depois o escoamento, com inclinacao igual ao E do MAT1.",
        ],
    )
    blank = " " * FIELD_WIDTH
    out.append(
        "MATS1*".ljust(8)
        + "1".rjust(FIELD_WIDTH)
        + str(TABLE_ID).rjust(FIELD_WIDTH)
        + "PLASTIC".rjust(FIELD_WIDTH)
        + blank
    )
    out.append(
        "*".ljust(8)
        + "1".rjust(FIELD_WIDTH)
        + "1".rjust(FIELD_WIDTH)
        + _number(plastic.yield_stress)
        + blank
    )
    fields = [_number(0.0), _number(0.0)]
    for row in plastic.rows:
        fields += [_number(row.total_strain), _number(row.stress)]
    fields.append("ENDT".rjust(FIELD_WIDTH))
    out.append("TABLES1*".ljust(8) + str(TABLE_ID).rjust(FIELD_WIDTH))
    for start in range(0, len(fields), 4):
        out.append("*".ljust(8) + "".join(fields[start : start + 4]))
    return out


def render(card: CaeCard) -> str:
    label = PLASTIC_LABEL if card.plastic is not None else LABEL
    out = comment_block("$ ", header_lines(card, label, FIELDS, OUTSIDE))
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
    if card.plastic is not None:
        out += _plastic(card)
    return "\n".join(line.rstrip() for line in out) + "\n"
