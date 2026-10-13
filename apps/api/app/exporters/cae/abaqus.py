"""Abaqus input file: a ``*MATERIAL`` block with its property options.

Written from the public Abaqus keyword reference: ``**`` opens a comment line;
``*MATERIAL, NAME=`` takes a label of at most 80 characters; ``*ELASTIC,
TYPE=ISOTROPIC`` reads ``E, nu`` on its data line; ``*DENSITY``,
``*EXPANSION, TYPE=ISO``, ``*CONDUCTIVITY, TYPE=ISO`` and ``*SPECIFIC HEAT``
read one value each. Abaqus has no units: the system is declared in comments.

``*ELASTIC`` needs both numbers on one data line, and a blank field there is
read as zero — so a material without Poisson's ratio is refused (D-104).
``*EXPANSION`` is written without ``ZERO``: for a constant coefficient the
reference temperature does not change the thermal strain, and it is a model
choice the catalogue does not hold.

**Elastoplastic card** (``abaqus-plastic``, D-119): the same block plus
``*PLASTIC``, whose data lines read ``yield stress, plastic strain`` — true
stress against true plastic strain, the first line at plastic strain zero (the
public Abaqus documentation of the option). No temperature column: the card
holds one series, at one temperature, declared in the comments.
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
from app.exporters.cae.text import comment_block, real, solver_label

LABEL = "Abaqus (.inp, *MATERIAL)"
PLASTIC_LABEL = "Abaqus (.inp, *MATERIAL com *ELASTIC e *PLASTIC)"
NAME_MAX = 80

FIELDS = {
    DENSITY.key: "*DENSITY",
    YOUNG.key: "*ELASTIC (E)",
    POISSON.key: "*ELASTIC (nu)",
    CTE.key: "*EXPANSION",
    CONDUCTIVITY.key: "*CONDUCTIVITY",
    SPECIFIC_HEAT.key: "*SPECIFIC HEAT",
}
REQUIRED = (YOUNG, POISSON)
#: The plastic card also requires the hardening table (``CaeFormat.plastic``).
PLASTIC_REQUIRED = (YOUNG, POISSON)
SUPPORTED = (DENSITY, YOUNG, POISSON, CTE, CONDUCTIVITY, SPECIFIC_HEAT)

_SINGLE = (
    (DENSITY, "*DENSITY"),
    (CTE, "*EXPANSION, TYPE=ISO"),
    (CONDUCTIVITY, "*CONDUCTIVITY, TYPE=ISO"),
    (SPECIFIC_HEAT, "*SPECIFIC HEAT"),
)


def render(card: CaeCard) -> str:
    label = PLASTIC_LABEL if card.plastic is not None else LABEL
    out = comment_block("** ", header_lines(card, label, FIELDS))
    out.append(f"*MATERIAL, NAME={solver_label(card.name, NAME_MAX)}")
    young, poisson = card.get(YOUNG), card.get(POISSON)
    # Refused upstream when either is missing; the guard keeps a direct caller
    # from ever printing a half data line.
    if young.present and poisson.present:
        assert young.value is not None and poisson.value is not None
        out.append("*ELASTIC, TYPE=ISOTROPIC")
        out.append(f"{real(young.value)}, {real(poisson.value)}")
    for quantity, keyword in _SINGLE:
        value = card.get(quantity)
        if value.present:
            assert value.value is not None
            out.append(keyword)
            out.append(real(value.value))
        else:
            out += comment_block("** ", [f"{keyword} omitido: {value.omitted_reason}"])
    if card.plastic is not None:
        out += comment_block("** ", ["Tensao verdadeira, deformacao plastica verdadeira"])
        out.append("*PLASTIC")
        for row in card.plastic.rows:
            out.append(f"{real(row.stress)}, {real(row.plastic_strain)}")
    return "\n".join(out) + "\n"
