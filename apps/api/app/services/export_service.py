"""Turning computed results into exportable reports.

This service never calculates: it re-runs the deterministic pipeline and
arranges what comes back. That is deliberate — an export must show the same
numbers the application shows, and the only way to guarantee that is to have a
single place producing them.

The provenance sheet is the point of the whole exercise. A ranking table alone
is an assertion; the same table next to "this 69 GPa was entered as 69 GPa and
converted by pint:GPa->Pa, estimated, from the demo dataset" is an argument
someone else can check.
"""

from __future__ import annotations

from app.domain.errors import NotFoundError
from app.exporters.cells import format_number
from app.exporters.report import Report, Sheet, standard_notices
from app.repositories.chart_repository import ChartRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.selection import RunResultOut
from app.services.selection_service import INDEX_KEY, SelectionService

_MISSING = "ausente"


class ExportService:
    """Builds reports for saved studies and for the catalogue."""

    def __init__(self, db) -> None:
        self.db = db
        self.selection_repo = SelectionRepository(db)
        self.chart_repo = ChartRepository(db)

    # --- selection study --------------------------------------------------

    def study_report(self, study_id: int) -> Report:
        study = self.selection_repo.get_study(study_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        result = SelectionService(self.db).run_study(study_id)
        candidate_ids = [c.material_id for c in result.candidates]
        materials = {
            m.id: m for m in self.chart_repo.list_materials(material_ids=candidate_ids or [-1])
        }

        sheets = [
            self._problem_sheet(study, result),
            self._funnel_sheet(result),
            self._candidates_sheet(result),
        ]
        if result.index is not None:
            sheets.append(self._index_sheet(result))
        if result.ranking is not None:
            sheets.append(self._contributions_sheet(result))
            sheets.append(self._excluded_sheet(result))
            sheets.append(self._sensitivity_sheet(result))
        sheets.append(self._provenance_sheet(study, result, materials))

        return Report(
            title=f"Relatório de seleção — {study.name}",
            subtitle=study.description or "",
            notices=standard_notices(includes_demo_data=any(m.is_demo for m in materials.values())),
            sheets=sheets,
        )

    @staticmethod
    def _problem_sheet(study, result: RunResultOut) -> Sheet:
        rows = [
            ["Estudo", study.name],
            ["Função do componente", study.function_text or "—"],
            ["Objetivo", study.objective_text or "—"],
            ["Variáveis livres", ", ".join(study.free_variables or []) or "—"],
            ["Combinação das restrições", study.combinator],
            ["Materiais considerados", result.initial_count],
            ["Candidatos após as restrições", result.final_count],
        ]
        return Sheet(name="Problema", header=["Item", "Valor"], rows=rows)

    @staticmethod
    def _funnel_sheet(result: RunResultOut) -> Sheet:
        rows = [[step.label, step.operator, step.passed, step.remaining] for step in result.funnel]
        notes = [] if rows else ["Nenhuma restrição foi aplicada."]
        return Sheet(
            name="Restrições e funil",
            header=["Restrição", "Operador", "Passaram", "Restantes"],
            rows=rows,
            notes=notes,
        )

    @staticmethod
    def _candidates_seq(result: RunResultOut):
        for candidate in result.candidates:
            yield [
                candidate.rank if candidate.rank is not None else "—",
                candidate.name,
                candidate.class_name,
                format_number(candidate.index_value, missing="indefinido"),
                format_number(candidate.score, missing="—"),
            ]

    @classmethod
    def _candidates_sheet(cls, result: RunResultOut) -> Sheet:
        rows = list(cls._candidates_seq(result))
        return Sheet(
            name="Candidatos",
            header=["Posição", "Material", "Classe", "Índice", "Pontuação"],
            rows=rows,
            notes=[] if rows else ["Nenhum candidato sobreviveu às restrições."],
        )

    @staticmethod
    def _index_sheet(result: RunResultOut) -> Sheet:
        index = result.index
        assert index is not None  # guarded by the caller
        rows = [
            ["Nome", index.name or "—"],
            ["Expressão", index.expression],
            ["Objetivo", "maximizar" if index.goal == "maximize" else "minimizar"],
            ["Dimensão (derivada)", index.dimension],
            ["Variáveis", ", ".join(index.variables)],
            ["Definido para", index.defined_count],
            ["Indefinido para", index.undefined_count],
        ]
        return Sheet(
            name="Índice de desempenho",
            header=["Item", "Valor"],
            rows=rows,
            notes=[
                "A dimensão é derivada da própria expressão por análise dimensional, "
                "não declarada à mão."
            ],
        )

    @staticmethod
    def _contributions_sheet(result: RunResultOut) -> Sheet:
        ranking = result.ranking
        assert ranking is not None
        rows = [
            [
                ranked.rank,
                ranked.name,
                contribution.label,
                format_number(contribution.raw),
                round(contribution.normalized, 6),
                round(contribution.weight, 6),
                round(contribution.contribution, 6),
            ]
            for ranked in ranking.ranked
            for contribution in ranked.contributions
        ]
        return Sheet(
            name="Contribuições",
            header=[
                "Posição",
                "Material",
                "Critério",
                "Valor bruto",
                "Normalizado",
                "Peso",
                "Contribuição",
            ],
            rows=rows,
            notes=[
                f"Normalização: {ranking.normalization}. Os pesos são renormalizados "
                "para somar 1; a pontuação é a soma das contribuições."
            ],
        )

    @staticmethod
    def _excluded_sheet(result: RunResultOut) -> Sheet:
        ranking = result.ranking
        assert ranking is not None
        rows = [[e.name, ", ".join(e.missing_keys)] for e in ranking.excluded]
        return Sheet(
            name="Excluídos por dado ausente",
            header=["Material", "Critérios sem valor"],
            rows=rows,
            notes=(
                [
                    "Estes materiais não foram ranqueados por falta de dado, e não por "
                    "mau desempenho. A ausência nunca foi preenchida com zero ou média."
                ]
                if rows
                else ["Nenhum material foi excluído por dado ausente."]
            ),
        )

    @staticmethod
    def _sensitivity_sheet(result: RunResultOut) -> Sheet:
        ranking = result.ranking
        assert ranking is not None
        rows = [
            [s.description, s.top_material_name or "—", "mudou" if s.changed else "estável"]
            for s in ranking.sensitivity
        ]
        return Sheet(
            name="Sensibilidade",
            header=["Cenário de pesos", "1º colocado", "Resultado"],
            rows=rows,
            notes=(
                [
                    "O ranking é recalculado sob pesos perturbados. 'Mudou' indica que a "
                    "recomendação depende da ponderação escolhida."
                ]
                if rows
                else ["Sensibilidade não calculada (menos de dois candidatos ranqueados)."]
            ),
        )

    @staticmethod
    def _relevant_slugs(study, result: RunResultOut) -> list[str]:
        """Properties the decision actually rested on, in a stable order."""
        slugs: list[str] = []
        for criterion in study.criteria:
            if criterion.key != INDEX_KEY and criterion.key not in slugs:
                slugs.append(criterion.key)
        if result.index is not None:
            for variable in result.index.variables:
                if variable not in slugs:
                    slugs.append(variable)
        for constraint in study.constraints:
            if constraint.property_slug and constraint.property_slug not in slugs:
                slugs.append(constraint.property_slug)
        return slugs

    @classmethod
    def _provenance_sheet(cls, study, result: RunResultOut, materials: dict) -> Sheet:
        slugs = cls._relevant_slugs(study, result)
        rows: list[list[object]] = []

        for candidate in result.candidates:
            material = materials.get(candidate.material_id)
            if material is None:
                continue
            by_slug = {v.property_definition.slug: v for v in material.property_values}
            for slug in slugs:
                value = by_slug.get(slug)
                if value is None:
                    rows.append([material.name, slug, _MISSING, _MISSING, "—", "—", "—", "—"])
                    continue
                definition = value.property_definition
                rows.append(
                    [
                        material.name,
                        definition.name,
                        _MISSING if value.is_missing else format_number(value.normalized_value),
                        definition.canonical_unit,
                        (
                            _MISSING
                            if value.is_missing
                            else format_number(
                                value.value_scalar
                                if value.value_scalar is not None
                                else value.value_typical
                            )
                        ),
                        value.original_unit or "—",
                        value.conversion_method or "—",
                        value.data_quality.value,
                    ]
                )

        return Sheet(
            name="Proveniência",
            header=[
                "Material",
                "Propriedade",
                "Valor normalizado",
                "Unidade canônica",
                "Valor original",
                "Unidade original",
                "Método de conversão",
                "Qualidade do dado",
            ],
            rows=rows,
            notes=(
                [
                    "Origem de cada número usado na decisão. Um valor ausente aparece como "
                    "'ausente', nunca como zero ou célula vazia."
                ]
                if rows
                else ["Sem propriedades a rastrear para este estudo."]
            ),
        )

    # --- catalogue --------------------------------------------------------

    def catalogue_report(self) -> Report:
        """Every active material and its property values, with the full trail."""
        materials = self.chart_repo.list_materials()
        definitions = self.chart_repo.list_properties()

        header = ["Material", "Classe", "Demonstrativo"] + [
            f"{d.name} [{d.canonical_unit}]" for d in definitions
        ]
        rows: list[list[object]] = []
        provenance: list[list[object]] = []

        for material in materials:
            by_slug = {v.property_definition.slug: v for v in material.property_values}
            row: list[object] = [material.name, material.material_class.name, material.is_demo]
            for definition in definitions:
                value = by_slug.get(definition.slug)
                row.append(
                    _MISSING
                    if value is None or value.is_missing
                    else format_number(value.normalized_value)
                )
                if value is not None and not value.is_missing:
                    provenance.append(
                        [
                            material.name,
                            definition.name,
                            format_number(
                                value.value_scalar
                                if value.value_scalar is not None
                                else value.value_typical
                            ),
                            value.original_unit or "—",
                            format_number(value.normalized_value),
                            definition.canonical_unit,
                            value.conversion_method or "—",
                            value.data_quality.value,
                            value.source.label if value.source else "—",
                        ]
                    )
            rows.append(row)

        return Report(
            title="Catálogo de materiais",
            subtitle=f"{len(materials)} materiais ativos, {len(definitions)} propriedades",
            notices=standard_notices(includes_demo_data=any(m.is_demo for m in materials)),
            sheets=[
                Sheet(
                    name="Materiais",
                    header=header,
                    rows=rows,
                    notes=["Valores em unidade canônica. 'ausente' significa dado não cadastrado."],
                ),
                Sheet(
                    name="Proveniência",
                    header=[
                        "Material",
                        "Propriedade",
                        "Valor original",
                        "Unidade original",
                        "Valor normalizado",
                        "Unidade canônica",
                        "Método de conversão",
                        "Qualidade do dado",
                        "Fonte",
                    ],
                    rows=provenance,
                ),
            ],
        )
