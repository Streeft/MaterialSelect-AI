"""Material cards for CAE solvers and for MatML (D-104, TM5).

One renderer per format, each written from the format's **public**
documentation — never from files or templates of any commercial materials
database. Every renderer reads a :class:`~app.exporters.cae.card.CaeCard`,
whose values were already converted into the unit system the user chose; none
of them converts, and none decides what is missing.

The registry below is the only place that knows which formats exist, which
quantities each can carry and which it **requires**: a card missing a required
quantity is refused (``ExportRefusedError``, HTTP 422) instead of written with
a blank the solver would fill with its own default.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.exporters.cae import abaqus, lsdyna, mapdl, matml, nastran
from app.exporters.cae.card import CaeCard
from app.exporters.cae.quantities import CaeQuantity


@dataclass(frozen=True)
class CaeFormat:
    key: str
    label: str
    #: Appended to the file stem, so two formats sharing ``.inp`` never collide.
    suffix: str
    media_type: str
    required: tuple[CaeQuantity, ...]
    supported: tuple[CaeQuantity, ...]
    render: Callable[[CaeCard], str]


_DECK = "text/plain; charset=utf-8"

CAE_FORMATS: dict[str, CaeFormat] = {
    f.key: f
    for f in (
        CaeFormat(
            "mapdl",
            mapdl.LABEL,
            "-mapdl.inp",
            _DECK,
            mapdl.REQUIRED,
            mapdl.SUPPORTED,
            mapdl.render,
        ),
        CaeFormat(
            "matml",
            matml.LABEL,
            "-matml.xml",
            "application/xml; charset=utf-8",
            matml.REQUIRED,
            matml.SUPPORTED,
            matml.render,
        ),
        CaeFormat(
            "abaqus",
            abaqus.LABEL,
            "-abaqus.inp",
            _DECK,
            abaqus.REQUIRED,
            abaqus.SUPPORTED,
            abaqus.render,
        ),
        CaeFormat(
            "nastran",
            nastran.LABEL,
            "-nastran.bdf",
            _DECK,
            nastran.REQUIRED,
            nastran.SUPPORTED,
            nastran.render,
        ),
        CaeFormat(
            "lsdyna",
            lsdyna.LABEL,
            "-lsdyna.k",
            _DECK,
            lsdyna.REQUIRED,
            lsdyna.SUPPORTED,
            lsdyna.render,
        ),
    )
}


def refusal_reason(card: CaeCard, fmt: CaeFormat) -> str | None:
    """Why ``card`` cannot be written as ``fmt``, in Portuguese; None when it can."""
    missing = [q for q in fmt.required if not card.get(q).present]
    if missing:
        names = ", ".join(q.label for q in missing)
        required = ", ".join(q.label for q in fmt.required)
        return (
            f"Não é possível gerar o cartão {fmt.label} de “{card.name}”: falta "
            f"{names} no cadastro deste material. O formato exige {required}, e o "
            "arquivo não é gerado incompleto — um campo em branco seria preenchido "
            "pelo padrão do solver, nunca pelo catálogo."
        )
    if not any(card.get(q).present for q in fmt.supported):
        return (
            f"Não é possível gerar o cartão {fmt.label} de “{card.name}”: nenhuma das "
            "propriedades que o formato carrega está cadastrada para este material."
        )
    return None
