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

The elastoplastic formats (D-119, TM5-b) live in :data:`PLASTIC_FORMATS`: they
also require the hardening table of one stress–strain series, built by
``app.domain.plasticity`` and converted by ``card.with_plastic``. A plastic
format without a table is refused like any other missing requirement.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.exporters.cae import (
    abaqus,
    lsdyna,
    lsdyna_plastic,
    lsdyna_thermal,
    mapdl,
    matml,
    nastran,
    nastran_thermal,
)
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
    #: D-119: the format writes a plastic hardening table and requires one.
    plastic: bool = False
    #: Most points the format's table admits; a longer one is refused, never thinned.
    plastic_max_points: int | None = None


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
        CaeFormat(
            "nastran-thermal",
            nastran_thermal.LABEL,
            "-nastran-termico.bdf",
            _DECK,
            nastran_thermal.REQUIRED,
            nastran_thermal.SUPPORTED,
            nastran_thermal.render,
        ),
        CaeFormat(
            "lsdyna-thermal",
            lsdyna_thermal.LABEL,
            "-lsdyna-termico.k",
            _DECK,
            lsdyna_thermal.REQUIRED,
            lsdyna_thermal.SUPPORTED,
            lsdyna_thermal.render,
        ),
    )
}


PLASTIC_FORMATS: dict[str, CaeFormat] = {
    f.key: f
    for f in (
        CaeFormat(
            "mapdl-plastic",
            mapdl.PLASTIC_LABEL,
            "-mapdl-plastico.inp",
            _DECK,
            mapdl.PLASTIC_REQUIRED,
            mapdl.SUPPORTED,
            mapdl.render,
            plastic=True,
            plastic_max_points=mapdl.PLASTIC_MAX_POINTS,
        ),
        CaeFormat(
            "abaqus-plastic",
            abaqus.PLASTIC_LABEL,
            "-abaqus-plastico.inp",
            _DECK,
            abaqus.PLASTIC_REQUIRED,
            abaqus.SUPPORTED,
            abaqus.render,
            plastic=True,
        ),
        CaeFormat(
            "nastran-plastic",
            nastran.PLASTIC_LABEL,
            "-nastran-plastico.bdf",
            _DECK,
            nastran.PLASTIC_REQUIRED,
            nastran.SUPPORTED,
            nastran.render,
            plastic=True,
        ),
        CaeFormat(
            "lsdyna-plastic",
            lsdyna_plastic.LABEL,
            "-lsdyna-plastico.k",
            _DECK,
            lsdyna_plastic.PLASTIC_REQUIRED,
            lsdyna_plastic.SUPPORTED,
            lsdyna_plastic.render,
            plastic=True,
        ),
    )
}

#: Every format the route admits, elastic and thermal first.
ALL_FORMATS: dict[str, CaeFormat] = {**CAE_FORMATS, **PLASTIC_FORMATS}


def refusal_reason(card: CaeCard, fmt: CaeFormat) -> str | None:
    """Why ``card`` cannot be written as ``fmt``, in Portuguese; None when it can."""
    if fmt.plastic and card.plastic is None:
        return (
            f"Não é possível gerar o cartão {fmt.label} de “{card.name}”: falta a curva "
            "plástica. O formato exige uma série tensão–deformação convertida, e o arquivo "
            "não é gerado sem ela."
        )
    if (
        fmt.plastic_max_points is not None
        and card.plastic is not None
        and len(card.plastic.rows) > fmt.plastic_max_points
    ):
        return (
            f"Não é possível gerar o cartão {fmt.label} de “{card.name}”: a tabela plástica "
            f"tem {len(card.plastic.rows)} pontos, e o formato admite até "
            f"{fmt.plastic_max_points}. Os pontos não são reamostrados nem descartados para "
            "caber."
        )
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
