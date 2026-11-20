"""Contracts of a project and its parts (D-257)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.calculations.part_cost import MONETARY_UNIT
from app.schemas.part_cost import MONETARY_UNIT_NOTE

#: What a part is for in the assembly. A fixing (a nail, a screw) is a part like
#: any other — it has a material and a mass — and the role is what lets the
#: screen keep it apart from the structure.
PartRole = Literal["estrutural", "fixacao", "acabamento", "outro"]

#: What the sums say, in words, on every surface that prints them.
SCOPE_NOTE = (
    "As somas cobrem só a fase de material, pela massa da peça pronta: custo do material, "
    "energia incorporada e CO₂ da produção primária. Processo, refugo, transporte, uso e fim "
    "de vida são do Custo e do Eco Audit, que pedem um processo por peça."
)


def _clean(value: str | None) -> str | None:
    """Trimmed text, with "only spaces" stored as absence."""
    if value is None:
        return None
    return value.strip() or None


class AssemblyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("O nome do projeto não pode ficar em branco.")
        return value.strip()

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _clean(value)


class AssemblyPatch(BaseModel):
    """Only the fields sent are changed; ``description: null`` clears it."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("O nome do projeto não pode ficar em branco.")
        return value.strip() if value is not None else None

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _clean(value)


class PartLoadCaseIn(BaseModel):
    """The load a part has to carry (D-261): one of the solver's cases and one
    number per design variable, in that variable's canonical unit. Which
    variables, and that each is usable, is the service's check against the case."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=80)
    inputs: dict[str, float]

    @field_validator("inputs")
    @classmethod
    def _bounded_and_finite(cls, value: dict[str, float]) -> dict[str, float]:
        if not value:
            raise ValueError("Informe as variáveis do caso de carga.")
        if len(value) > 12:
            raise ValueError("Variáveis demais para um caso de carga.")
        for key, number in value.items():
            if number != number or number in (float("inf"), float("-inf")):
                raise ValueError(f"Valor inválido para {key}.")
        return value


class PartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    role: PartRole = "estrutural"
    quantity: int = Field(default=1, ge=1, le=100_000)
    #: Kilograms per part. The same bounds as an Eco Audit component (D-121).
    unit_mass: float | None = Field(default=None, gt=0, le=1.0e6)
    material_id: int | None = Field(default=None, gt=0)
    study_id: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=500)
    load_case: PartLoadCaseIn | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("O nome da peça não pode ficar em branco.")
        return value.strip()

    @field_validator("notes")
    @classmethod
    def _notes(cls, value: str | None) -> str | None:
        return _clean(value)


class PartPatch(BaseModel):
    """Only the fields sent are changed. A nullable field sent as ``null``
    (mass, material, study, notes) is cleared: "not chosen" is a state the
    reader can go back to."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: PartRole | None = None
    quantity: int | None = Field(default=None, ge=1, le=100_000)
    unit_mass: float | None = Field(default=None, gt=0, le=1.0e6)
    material_id: int | None = Field(default=None, gt=0)
    study_id: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0, le=10_000)
    #: Sent as ``null``, the part goes back to having no load case.
    load_case: PartLoadCaseIn | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("O nome da peça não pode ficar em branco.")
        return value.strip() if value is not None else None

    @field_validator("notes")
    @classmethod
    def _notes(cls, value: str | None) -> str | None:
        return _clean(value)


class FigureOut(BaseModel):
    """A number or the reason there is none (principle 3): never both."""

    value: float | None = None
    reason: str | None = None
    #: Data quality of the catalogued value used; absent for the declared mass.
    quality: str | None = None


class TotalOut(BaseModel):
    """The sum over every part, or its refusal with the parts that block it."""

    value: float | None = None
    #: Sum of the parts that have the datum. Equal to ``value`` when nothing is missing.
    known_sum: float
    known_parts: int
    missing_parts: list[str] = Field(default_factory=list)
    unit: str


class PartMaterialOut(BaseModel):
    id: int
    name: str
    class_name: str


class PartStudyOut(BaseModel):
    id: int
    name: str


class PartLoadCaseOut(BaseModel):
    """The part's declared load case, named as the solver names it."""

    key: str
    label: str
    inputs: dict[str, float]
    #: The case is no longer in the solver's catalogue: it cannot be tried.
    unavailable: bool = False


class PartOut(BaseModel):
    id: int
    position: int
    name: str
    role: PartRole
    quantity: int
    unit_mass: float | None = None
    #: The chosen material, when it can be read. ``None`` with
    #: ``material_unavailable`` false means none was chosen.
    material: PartMaterialOut | None = None
    #: A material was chosen and can no longer be read by this reader.
    material_unavailable: bool = False
    study: PartStudyOut | None = None
    load_case: PartLoadCaseOut | None = None
    notes: str | None = None
    mass: FigureOut
    material_cost: FigureOut
    embodied_energy: FigureOut
    carbon: FigureOut


class AssemblyTotalsOut(BaseModel):
    mass: TotalOut
    material_cost: TotalOut
    embodied_energy: TotalOut
    carbon: TotalOut


class AssemblyBriefOut(BaseModel):
    """A project in the list: enough to recognise it and see how far along it is."""

    id: int
    name: str
    description: str | None = None
    part_count: int
    #: Parts with a material chosen.
    chosen_count: int
    updated_at: datetime


class AssemblyOut(AssemblyBriefOut):
    created_at: datetime
    parts: list[PartOut]
    totals: AssemblyTotalsOut
    scope_note: str = SCOPE_NOTE
    #: Why a cost is printed without a currency symbol (D-65), in the estimator's own words.
    monetary_unit_note: str = MONETARY_UNIT_NOTE


#: The unit each total is printed in. Money and CO₂ are named in words: neither
#: is a unit the catalogue's unit system knows (D-65).
TOTAL_UNITS: dict[str, str] = {
    "mass": "kg",
    "material_cost": MONETARY_UNIT,
    "embodied_energy": "MJ",
    "carbon": "kg de CO₂",
}


# --- the trial (D-260) --------------------------------------------------------


class TrialRequirementOut(BaseModel):
    """One requirement of the part's study and how its material answered."""

    label: str
    #: ``passa`` | ``falha`` | ``sem_dado`` — and the same thing in words.
    verdict: Literal["passa", "falha", "sem_dado"]
    verdict_label: str
    #: ``limite`` (a limit of the study) or ``carga`` (the part's load case, D-261).
    kind: Literal["limite", "carga"] = "limite"
    #: For a load case: the minimum mass the solver answers for the material and
    #: the mass declared for one part, in ``unit``. ``None`` is "not known".
    required_value: float | None = None
    declared_value: float | None = None
    unit: str | None = None
    #: Why the verdict is "sem dado", in words.
    detail: str | None = None


class PartTrialOut(BaseModel):
    part_id: int
    name: str
    #: ``passa`` | ``falha`` | ``sem_dado`` | ``sem_material`` |
    #: ``material_indisponivel`` | ``sem_estudo`` | ``sem_requisitos``.
    status: str
    status_label: str
    #: What the reader can do about a part that could not be tried; ``None``
    #: when it was tried.
    reason: str | None = None
    material_name: str | None = None
    study: PartStudyOut | None = None
    requirements: list[TrialRequirementOut] = []


class AssemblyTrialOut(BaseModel):
    """The trial of the whole project, answered from the catalogue as it stands.

    Nothing here is stored: asking again after a correction in the catalogue,
    in a study or in a part answers again."""

    assembly_id: int
    #: True only when the project has parts and every one passes everything.
    solved: bool
    verdict_label: str
    #: One sentence saying what is missing, or that nothing is.
    summary: str
    part_count: int
    passed_count: int
    failed_count: int
    pending_count: int
    parts: list[PartTrialOut]
    method_note: str
