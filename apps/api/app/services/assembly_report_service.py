"""The report of a project (D-263): what was designed, what it adds up to and how it tried.

A **laudo do projeto** is the project page and its trial written as a document
someone else can read without the tool: the parts and their materials, the sums
with what blocks them, each requirement and its verdict, the numbers of every
declared load case, and the notes that say how to read all of it.

It computes nothing. Every figure, reason, verdict and sentence is the one
``AssemblyService`` already answers for the screen (``get_assembly`` and
``trial``), laid out as a format-agnostic ``Report`` — so the page, the trial and
the document cannot disagree, and the same tables serve HTML, CSV, XLSX and DOCX.

Two rules shape the tables:

* **An absent figure is written as its reason**, never as a blank or a zero
  (principle 3): the cell carries the server's own sentence.
* **Nothing is stored.** The document is answered from the catalogue, the
  studies and the parts as they stand, and says so, with its date. It is not
  the issued, versioned laudo of a study (D-241): no seal, no code, no QR.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.calculations.load_cases import by_key as load_case_by_key
from app.exporters.cells import format_number
from app.exporters.laudo import long_date
from app.exporters.report import Report, Sheet, standard_notices
from app.models.user import User
from app.repositories.chart_repository import ChartRepository
from app.schemas.assembly import AssemblyOut, AssemblyTrialOut, FigureOut, TotalOut
from app.services.assembly_service import AssemblyService

ROLE_LABELS = {
    "estrutural": "Estrutural",
    "fixacao": "Fixação",
    "acabamento": "Acabamento",
    "outro": "Outro",
}

#: The four sums, in reading order: (field on the part, key of the total, label).
_QUANTITIES = (
    ("mass", "mass", "Massa"),
    ("material_cost", "material_cost", "Custo do material"),
    ("embodied_energy", "embodied_energy", "Energia incorporada"),
    ("carbon", "carbon", "CO₂ da produção"),
)

KIND_LABELS = {"limite": "Limite do estudo", "carga": "Caso de carga"}

NOT_STORED_NOTICE = (
    "Este laudo não é guardado: responde com o catálogo, os estudos e as peças como estavam na "
    "data acima. Gerado de novo depois de uma correção, traz os números corrigidos. Não é um "
    "laudo emitido (sem selo, código de verificação nem assinatura)."
)

NOT_INFORMED = "não informado"
NONE_DECLARED = "nenhum"


class AssemblyReportService:
    def __init__(self, db: Session, project_id: int, user: User) -> None:
        self._assemblies = AssemblyService(db, project_id, user.id, user=user)
        self._materials = ChartRepository(db, user.id)

    def report(self, assembly_id: int, today: date | None = None) -> Report:
        """The project and its trial as one document. ``today`` only dates it."""
        project = self._assemblies.get_assembly(assembly_id)
        trial = self._assemblies.trial(assembly_id)
        when = today or date.today()
        return Report(
            title=f"Laudo do projeto {project.name}",
            subtitle=f"{trial.verdict_label}. {trial.summary} Gerado em {long_date(when)}.",
            notices=[
                *standard_notices(includes_own_records=self._has_own_records(project)),
                project.scope_note,
                project.monetary_unit_note,
                trial.method_note,
                NOT_STORED_NOTICE,
            ],
            sheets=[
                self._summary(project, trial, when),
                self._parts(project),
                self._figures(project),
                self._totals(project),
                self._trial(trial),
                self._load_cases(project),
            ],
        )

    # --- tables ---------------------------------------------------------------

    @staticmethod
    def _summary(project: AssemblyOut, trial: AssemblyTrialOut, when: date) -> Sheet:
        return Sheet(
            name="Resumo",
            header=["Item", "Valor"],
            rows=[
                ["Projeto", project.name],
                ["Descrição", project.description or NOT_INFORMED],
                ["Data do laudo", long_date(when)],
                ["Peças", project.part_count],
                ["Peças com material", project.chosen_count],
                ["Resultado do ensaio", trial.verdict_label],
                ["Resumo do ensaio", trial.summary],
                ["Peças que passam", trial.passed_count],
                ["Peças que não passam", trial.failed_count],
                ["Peças que não puderam ser aprovadas", trial.pending_count],
            ],
        )

    @staticmethod
    def _figure(figure: FigureOut) -> object:
        """The number, or the server's own reason for its absence."""
        return figure.value if figure.value is not None else (figure.reason or "ausente")

    @staticmethod
    def _parts(project: AssemblyOut) -> Sheet:
        """What each part is. Its numbers are the next table: together they are
        too wide for a printed page, and a column cut off is a figure lost."""
        rows = []
        for part in project.parts:
            if part.material is not None:
                material, material_class = part.material.name, part.material.class_name
            elif part.material_unavailable:
                material, material_class = "indisponível no catálogo", NOT_INFORMED
            else:
                material, material_class = "não escolhido", NOT_INFORMED
            rows.append(
                [
                    part.name,
                    ROLE_LABELS.get(part.role, part.role),
                    part.quantity,
                    part.unit_mass if part.unit_mass is not None else NOT_INFORMED,
                    material,
                    material_class,
                    part.study.name if part.study else NONE_DECLARED,
                    part.load_case.label if part.load_case else NONE_DECLARED,
                ]
            )
        return Sheet(
            name="Peças",
            header=[
                "Peça",
                "Papel",
                "Quantidade",
                "Massa de cada uma (kg)",
                "Material",
                "Classe",
                "Estudo",
                "Caso de carga",
            ],
            rows=rows,
            notes=[] if rows else ["O projeto ainda não tem peças."],
        )

    def _figures(self, project: AssemblyOut) -> Sheet:
        """The four figures of each part, for the quantity declared."""
        units = {key: getattr(project.totals, key).unit for _field, key, _label in _QUANTITIES}
        return Sheet(
            name="Números por peça",
            header=[
                "Peça",
                # The cost has no declared currency: the column says only what it is, and the
                # note above says why (D-257) — a unit in the header would read as one.
                *(
                    label if key == "material_cost" else self._with_unit(label, units[key])
                    for _field, key, label in _QUANTITIES
                ),
            ],
            rows=[
                [
                    part.name,
                    *(self._figure(getattr(part, field)) for field, _key, _label in _QUANTITIES),
                ]
                for part in project.parts
            ],
            notes=[] if project.parts else ["O projeto ainda não tem peças."],
        )

    @staticmethod
    def _with_unit(label: str, unit: str) -> str:
        return f"{label} ({unit})" if unit else label

    def _totals(self, project: AssemblyOut) -> Sheet:
        rows = []
        for _field, key, label in _QUANTITIES:
            total: TotalOut = getattr(project.totals, key)
            rows.append(
                [
                    label,
                    total.value if total.value is not None else "sem total",
                    total.unit or "sem unidade declarada",
                    self._total_state(total, project.part_count),
                ]
            )
        return Sheet(
            name="Soma do projeto",
            header=["Grandeza", "Total", "Unidade", "Situação"],
            rows=rows,
        )

    @staticmethod
    def _total_state(total: TotalOut, part_count: int) -> str:
        if part_count == 0:
            return "O projeto ainda não tem peças."
        if total.value is not None:
            return "Soma de todas as peças."
        missing = ", ".join(total.missing_parts)
        if total.known_parts == 0:
            return f"Falta dado em: {missing}. Nenhuma peça tem este dado."
        # The partial sum is said as partial, in words, never placed in the total's column.
        return (
            f"Falta dado em: {missing}. Soma parcial, de {total.known_parts} "
            f"{'peça' if total.known_parts == 1 else 'peças'}: {format_number(total.known_sum)}."
        )

    @staticmethod
    def _trial(trial: AssemblyTrialOut) -> Sheet:
        rows = []
        for part in trial.parts:
            material = part.material_name or NOT_INFORMED
            if not part.requirements:
                rows.append(
                    [
                        part.name,
                        material,
                        "nenhum requisito ensaiado",
                        NOT_INFORMED,
                        NOT_INFORMED,
                        NOT_INFORMED,
                        part.status_label,
                        part.reason or "",
                    ]
                )
                continue
            for requirement in part.requirements:
                is_load = requirement.kind == "carga"
                rows.append(
                    [
                        part.name,
                        material,
                        requirement.label,
                        KIND_LABELS.get(requirement.kind, requirement.kind),
                        (
                            (
                                requirement.required_value
                                if requirement.required_value is not None
                                else "não foi possível calcular"
                            )
                            if is_load
                            else "não se aplica"
                        ),
                        (
                            (
                                requirement.declared_value
                                if requirement.declared_value is not None
                                else NOT_INFORMED
                            )
                            if is_load
                            else "não se aplica"
                        ),
                        requirement.verdict_label,
                        requirement.detail or "",
                    ]
                )
        return Sheet(
            name="Ensaio",
            header=[
                "Peça",
                "Material",
                "Requisito",
                "Origem",
                "Massa mínima (kg)",
                "Massa informada (kg)",
                "Veredito",
                "Observação",
            ],
            rows=rows,
            notes=[f"{trial.verdict_label}. {trial.summary}"],
        )

    @staticmethod
    def _load_cases(project: AssemblyOut) -> Sheet:
        """Every number the reader declared for a load case, so the minimum mass
        in the trial can be redone by hand from this page alone."""
        rows = []
        for part in project.parts:
            declared = part.load_case
            if declared is None:
                continue
            case = load_case_by_key(declared.key)
            for key, value in declared.inputs.items():
                variable = case.variable(key) if case is not None else None
                support = (
                    next(
                        (s for s in case.supports if s.variable_key == key and s.value == value),
                        None,
                    )
                    if case is not None
                    else None
                )
                rows.append(
                    [
                        part.name,
                        declared.label,
                        variable.label if variable is not None else key,
                        value,
                        variable.unit if variable is not None else NOT_INFORMED,
                        support.label if support is not None else "",
                    ]
                )
        return Sheet(
            name="Casos de carga declarados",
            header=["Peça", "Caso", "Variável", "Valor", "Unidade", "Condição de apoio"],
            rows=rows,
            notes=[] if rows else ["Nenhuma peça declara um caso de carga."],
        )

    # --- helpers --------------------------------------------------------------

    def _has_own_records(self, project: AssemblyOut) -> bool:
        ids = sorted({part.material.id for part in project.parts if part.material is not None})
        if not ids:
            return False
        materials = self._materials.list_materials(material_ids=ids, with_values=False)
        return any(material.owner_id is not None for material in materials)
