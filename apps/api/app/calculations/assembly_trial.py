"""The trial of a project (D-260): does each part hold against what was asked of it?

A part is tried against the **requirements of its own selection study** — the
limits and stages the reader wrote there — with the material chosen for it.
This module only *counts verdicts*: it never reads a property and never compares
a number. Each requirement arrives already judged by the selection engine
(``app.domain.filters``), the one place that decides whether a material meets a
limit, so a trial and a selection run cannot disagree about a material.

Three verdicts, and the third is not a softer form of the first (principle 3):

* ``passa``    — the material meets the requirement;
* ``falha``    — it holds a datum and the datum is outside the limit;
* ``sem_dado`` — it holds no datum the requirement could read. Absence is never
  a pass: a part with one ``sem_dado`` is not approved, it is *not tried*.

A project is "Solucionado" only when it has parts and **every** part passes
every requirement (author's decision, 20/11/2026). A part without a material,
without a study or whose study asks nothing is not approved either — there was
nothing to try it against, and the page says which.
"""

from __future__ import annotations

from dataclasses import dataclass

PASS = "passa"
FAIL = "falha"
NO_DATA = "sem_dado"
VERDICTS = (PASS, FAIL, NO_DATA)

#: Why a part could not be tried at all.
NO_MATERIAL = "sem_material"
MATERIAL_GONE = "material_indisponivel"
NO_STUDY = "sem_estudo"
NO_REQUIREMENTS = "sem_requisitos"

VERDICT_LABELS = {PASS: "Passa", FAIL: "Não passa", NO_DATA: "Sem dado"}

STATUS_LABELS = {
    PASS: "Passa em todos os requisitos",
    FAIL: "Não passa",
    NO_DATA: "Falta dado para ensaiar",
    NO_MATERIAL: "Sem material",
    MATERIAL_GONE: "Material indisponível",
    NO_STUDY: "Sem requisitos",
    NO_REQUIREMENTS: "Sem requisitos",
}

STATUS_REASONS = {
    NO_MATERIAL: "Escolha um material para a peça.",
    MATERIAL_GONE: "O material escolhido não está mais disponível no catálogo. Escolha outro.",
    NO_STUDY: "A peça não tem um estudo da Seleção: não há requisito contra o qual ensaiar.",
    NO_REQUIREMENTS: "O estudo da peça não tem nenhum limite nem estágio ligado.",
}


@dataclass(frozen=True)
class Requirement:
    """One thing the study asks, and how the chosen material answered it."""

    label: str
    verdict: str


@dataclass(frozen=True)
class PartTrial:
    name: str
    status: str
    requirements: tuple[Requirement, ...] = ()

    @property
    def passed(self) -> bool:
        return self.status == PASS


@dataclass(frozen=True)
class AssemblyTrial:
    parts: tuple[PartTrial, ...]
    solved: bool
    #: Parts that pass, parts that fail, and parts that could not be approved
    #: for any other reason (no data, no material, nothing to try against).
    passed: int
    failed: int
    pending: int


def try_part(
    name: str,
    *,
    has_material: bool,
    material_readable: bool,
    has_study: bool,
    requirements: list[Requirement] | None,
) -> PartTrial:
    """One part's status. The order is the order in which the reader can act:
    without a material nothing else can be said."""
    if not has_material:
        return PartTrial(name, NO_MATERIAL)
    if not material_readable:
        return PartTrial(name, MATERIAL_GONE)
    if not has_study or requirements is None:
        return PartTrial(name, NO_STUDY)
    if not requirements:
        return PartTrial(name, NO_REQUIREMENTS)
    for requirement in requirements:
        if requirement.verdict not in VERDICTS:
            raise ValueError(f"Veredito desconhecido: {requirement.verdict}")
    verdicts = {requirement.verdict for requirement in requirements}
    # A failure is known and outranks an absence: the part does not hold.
    status = FAIL if FAIL in verdicts else NO_DATA if NO_DATA in verdicts else PASS
    return PartTrial(name, status, tuple(requirements))


def try_assembly(parts: list[PartTrial]) -> AssemblyTrial:
    passed = sum(1 for part in parts if part.status == PASS)
    failed = sum(1 for part in parts if part.status == FAIL)
    return AssemblyTrial(
        parts=tuple(parts),
        # An empty project solves nothing.
        solved=bool(parts) and passed == len(parts),
        passed=passed,
        failed=failed,
        pending=len(parts) - passed - failed,
    )
