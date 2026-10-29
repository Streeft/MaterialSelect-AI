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

from collections.abc import Mapping

from app.ai.provider import AIUnavailableError
from app.calculations.expressions import variables_in
from app.calculations.units import pretty_unit
from app.domain.composition import RULE_TEXT
from app.domain.display_units import readings_for
from app.domain.errors import NotFoundError, QuotaExceededError, ValidationError
from app.exporters.cells import format_number
from app.exporters.eco import eco_sheets
from app.exporters.figures import (
    Axis,
    Bar,
    BarFigure,
    Line,
    Point,
    Polygon,
    Region,
    ScatterFigure,
    render_bars,
    render_scatter,
)
from app.exporters.identity import composition_sheet, designation_sheet
from app.exporters.report import Report, Sheet, standard_notices
from app.models.enums import ProcessAttributeKind
from app.models.user import User
from app.repositories.chart_repository import ChartRepository
from app.repositories.selection_repository import SelectionRepository
from app.repositories.transport_repository import TransportRepository
from app.schemas.charts import PropertyMapRequest
from app.schemas.curve import MaterialCurvesOut
from app.schemas.eco import EcoAuditRequest
from app.schemas.equivalence import MaterialEquivalencesOut
from app.schemas.material import MaterialDetail
from app.schemas.selection import ChartStageIn, IndexIn, RankingResultOut, RunResultOut
from app.services.ai_service import AIService
from app.services.chart_service import ChartService
from app.services.curve_service import CurveService
from app.services.eco_provenance import component_rows, leg_rows
from app.services.eco_service import EcoService
from app.services.equivalence_service import EquivalenceService
from app.services.identity_lines import composition_lines, designation_lines
from app.services.material_service import MaterialService
from app.services.selection_service import INDEX_KEY, SelectionService

_MISSING = "ausente"


class ExportService:
    """Builds reports for saved studies, the catalogue and material datasheets."""

    def __init__(
        self,
        db,
        user: User | None = None,
        unit_choices: Mapping[str, str] | None = None,
    ) -> None:
        self.db = db
        self.user = user
        self.viewer_id = user.id if user is not None else None
        self.selection_repo = SelectionRepository(db, self.viewer_id)
        self.chart_repo = ChartRepository(db, self.viewer_id)
        self.unit_choices: Mapping[str, str] = unit_choices or {}

    # --- selection study --------------------------------------------------

    def _run(self, study_id: int, project_id: int):
        """Re-run the study and load the records its candidates named."""
        study = self.selection_repo.get_study(study_id, project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        service = SelectionService(self.db, project_id, self.user)
        result = service.run_study(study_id)
        root_group_description = service.describe_pipeline(study)
        candidate_ids = [c.record_id for c in result.candidates]
        if result.universe == "material":
            records = {
                m.id: m for m in self.chart_repo.list_materials(material_ids=candidate_ids or [-1])
            }
        else:
            records = {
                p.id: p for p in self.selection_repo.processes_with_attributes(candidate_ids)
            }
        return study, result, records, root_group_description

    @staticmethod
    def _is_own_record(record: object) -> bool:
        """Whether this record belongs to one person rather than the catalogue."""
        return getattr(record, "owner_id", None) is not None

    def _sheets(
        self, study, result: RunResultOut, records: dict, root_group_description: str
    ) -> list[Sheet]:
        sheets = [
            self._problem_sheet(study, result, root_group_description),
            self._stages_sheet(result),
            self._author_notes_sheet(study, result),
            self._funnel_sheet(result),
            self._candidates_sheet(result),
        ]
        if result.index is not None:
            sheets.append(self._index_sheet(result))
        if result.ranking is not None:
            sheets.append(self._contributions_sheet(result))
            sheets.append(self._excluded_sheet(result))
            sheets.append(self._sensitivity_sheet(result))
        if result.universe != "process":
            sheets.extend(self._identity_sheets(result, records))
        sheets.append(self._provenance_sheet(study, result, records))
        return sheets

    @staticmethod
    def _identity_sheets(result: RunResultOut, records: dict) -> list[Sheet]:
        """Composition and designations of the candidates (D-105, TM2-d)."""
        materials = [records[c.record_id] for c in result.candidates if c.record_id in records]
        return [
            composition_sheet([(m.name, composition_lines(m)) for m in materials]),
            designation_sheet([(m.name, designation_lines(m)) for m in materials]),
        ]

    def study_report(self, study_id: int, project_id: int) -> Report:
        study, result, records, root_group_description = self._run(study_id, project_id)
        return Report(
            title=f"Relatório de seleção — {study.name}",
            subtitle=study.description or "",
            notices=standard_notices(
                includes_own_records=any(self._is_own_record(r) for r in records.values()),
            ),
            sheets=self._sheets(study, result, records, root_group_description),
            figures=[f for f in (self._map_figure(study, result),) if f],
        )

    def study_laudo(
        self, study_id: int, project_id: int, *, responsible: str | None = None
    ) -> Report:
        """The engineering report: the selection report plus a figure and,
        when the AI layer is on, an interpretive narrative.
        """
        study, result, records, root_group_description = self._run(study_id, project_id)
        narrative, caveats, note = self._narrative(study_id, project_id)
        return Report(
            title=f"Laudo de engenharia — {study.name}",
            subtitle=study.description or "",
            notices=standard_notices(
                includes_own_records=any(self._is_own_record(r) for r in records.values()),
            ),
            sheets=self._sheets(study, result, records, root_group_description),
            responsible=(responsible or "").strip() or None,
            figures=self._figures(study, result),
            narrative=narrative,
            narrative_caveats=caveats,
            narrative_note=note,
        )

    def _figures(self, study, result: RunResultOut) -> list[str]:
        """The laudo's figures: the selection map first, then the ranking chart."""
        return [f for f in (self._map_figure(study, result), self._ranking_figure(result)) if f]

    def _map_figure(self, study, result: RunResultOut) -> str | None:
        """The Ashby map of this study: every material, the candidates marked."""
        if result.universe != "material":
            return None

        ranked_ids = [r.record_id for r in result.ranking.ranked] if result.ranking else []
        winner = ranked_ids[:1]
        plane = self._chart_plane(study)

        if plane is not None:
            request = self._plane_request(plane, ranked_ids)
        else:
            axes = self._map_axes(study)
            if axes is None:
                return None
            x_slug, y_slug = axes
            request = PropertyMapRequest(
                x=x_slug,
                y=y_slug,
                scale="log",
                envelope_shape="ellipse",
                highlight_material_ids=ranked_ids,
                index=(
                    IndexIn(
                        name=study.index_name,
                        expression=study.index_expression,
                        goal=study.index_goal,
                    )
                    if study.index_expression
                    else None
                ),
                index_level_material_ids=winner,
            )

        try:
            chart = ChartService(self.db, self.viewer_id, self.unit_choices).property_map(request)
        except ValidationError:
            return None

        if not chart.points:
            return None

        highlighted = set(ranked_ids)
        points = [
            Point(
                x=p.x,
                y=p.y,
                label=p.material_name,
                group=p.class_name,
                highlighted=p.material_id in highlighted,
            )
            for p in chart.points
        ]
        polygons = [
            Polygon(label=e.class_name, vertices=[(v[0], v[1]) for v in e.polygon])
            for e in chart.envelopes
        ]
        lines = [
            Line(label=self._level_label(level), points=[(pt[0], pt[1]) for pt in level.points])
            for level in (chart.index.levels if chart.index and chart.index.available else [])
        ]

        return render_scatter(
            ScatterFigure(
                title="Mapa de seleção",
                x=self._figure_axis(chart.x_axis, chart.scale),
                y=self._figure_axis(chart.y_axis, chart.scale),
                points=points,
                polygons=polygons,
                lines=lines,
                regions=self._plane_regions(plane),
                caption=self._map_caption(chart, len(highlighted), plane),
                description=(
                    f"Mapa de {chart.y_axis.property_name} contra "
                    f"{chart.x_axis.property_name}, em escala {chart.scale}, com os "
                    f"candidatos aprovados destacados. Os mesmos números estão nas "
                    f"tabelas 'Candidatos' e 'Índice de desempenho'."
                ),
            )
        )

    @staticmethod
    def _chart_plane(study) -> ChartStageIn | None:
        """The plane a Chart stage drew, if the study has one that ran (P1-2)."""
        for stage in sorted(getattr(study, "stages", []) or [], key=lambda st: st.position):
            if stage.kind == "chart" and stage.enabled:
                return SelectionService._stage_row_to_chart_in(stage)
        return None

    @staticmethod
    def _plane_request(plane: ChartStageIn, ranked_ids: list[int]) -> PropertyMapRequest:
        """The map request for a Chart stage's plane — the reader's own axes."""
        line_fits = (
            plane.index_expression is not None
            and plane.index_level is not None
            and plane.x.expression is None
            and plane.y.expression is None
        )
        return PropertyMapRequest(
            x=plane.x.property_slug,
            y=plane.y.property_slug,
            x_index=(
                IndexIn(expression=plane.x.expression) if plane.x.expression is not None else None
            ),
            y_index=(
                IndexIn(expression=plane.y.expression) if plane.y.expression is not None else None
            ),
            scale="log",
            envelope_shape="ellipse",
            highlight_material_ids=ranked_ids,
            index=(
                IndexIn(expression=plane.index_expression, goal=plane.index_goal)
                if line_fits
                else None
            ),
            index_levels=[plane.index_level] if line_fits else [],
        )

    @staticmethod
    def _plane_regions(plane: ChartStageIn | None) -> list[Region]:
        """The drawn box, or nothing when the stage bounded neither axis."""
        if plane is None:
            return []
        bounds = (
            plane.x.min_value,
            plane.x.max_value,
            plane.y.min_value,
            plane.y.max_value,
        )
        if all(bound is None for bound in bounds):
            return []
        return [
            Region(
                label="Região do estágio",
                x_min=plane.x.min_value,
                x_max=plane.x.max_value,
                y_min=plane.y.min_value,
                y_max=plane.y.max_value,
            )
        ]

    def _map_axes(self, study) -> tuple[str, str] | None:
        """The (x, y) slugs the index names, in the order it names them."""
        expression = getattr(study, "index_expression", None)
        if not expression:
            return None
        known = {p.slug for p in self.chart_repo.list_properties()}
        used = [slug for slug in variables_in(expression) if slug in known]
        if len(used) < 2:
            return None
        used.sort(key=expression.find)
        return used[1], used[0]

    @staticmethod
    def _figure_axis(axis, scale: str) -> Axis:
        label = (
            f"{axis.property_name} ({pretty_unit(axis.unit)})" if axis.unit else axis.property_name
        )
        return Axis(
            label=label,
            scale="log" if scale == "log" else "linear",
            min_value=axis.min_value if axis.min_value is not None else 0.0,
            max_value=axis.max_value if axis.max_value is not None else 1.0,
        )

    @staticmethod
    def _level_label(level) -> str:
        if level.material_name:
            return f"Índice de {level.material_name}"
        return f"M = {level.value:.3g}"

    @staticmethod
    def _map_caption(chart, highlighted_count: int, plane: ChartStageIn | None = None) -> str:
        partes = [
            f"{chart.plotted_count} de {chart.considered_count} materiais têm os dois "
            f"valores cadastrados e aparecem no mapa"
        ]
        if plane is not None:
            partes.append(
                "os eixos são os do estágio de gráfico — este é o plano em que a "
                "decisão foi desenhada"
            )
            if any(
                b is not None
                for b in (
                    plane.x.min_value,
                    plane.x.max_value,
                    plane.y.min_value,
                    plane.y.max_value,
                )
            ):
                partes.append(
                    "o retângulo é a região do estágio; um lado sem limite é desenhado "
                    "até a borda do gráfico e não é um limite"
                )
            if plane.index_expression is not None and plane.index_level is not None:
                if plane.x.expression is None and plane.y.expression is None:
                    partes.append(
                        f"a linha está no nível {format_number(plane.index_level)} de "
                        f"{plane.index_expression}, como o estágio a guardou"
                    )
                else:
                    partes.append(
                        f"a linha de {plane.index_expression} não foi traçada porque um "
                        f"dos eixos já é um índice; o nível está na tabela 'Estágios'"
                    )
        if chart.envelopes:
            partes.append(
                "as nuvens de classe são indicativas — desenhadas com folga em "
                "torno dos materiais cadastrados, não são a região exata que a "
                "classe ocupa"
            )
        if chart.excluded:
            partes.append(f"{len(chart.excluded)} ficaram de fora por dado ausente")
        if highlighted_count:
            partes.append(f"{highlighted_count} candidatos aprovados estão destacados")
        if chart.index and not chart.index.available and chart.index.unavailable_reason:
            partes.append(f"a linha de índice não foi traçada: {chart.index.unavailable_reason}")
        return ". ".join(partes) + "."

    @staticmethod
    def _ranking_figure(result: RunResultOut) -> str | None:
        """A bar chart of the ranked candidates — omitted when no one ranked."""
        if result.ranking is None or not result.ranking.ranked:
            return None
        ranked = sorted(result.ranking.ranked, key=lambda r: r.rank)
        bars = [Bar(label=r.name, value=r.score, highlighted=r.rank == 1) for r in ranked]
        return render_bars(
            BarFigure(
                title="Candidatos ranqueados",
                value_label="Pontuação (normalizada)",
                bars=bars,
                caption=("Pontuação após normalização e ponderação dos critérios do estudo."),
                description=(
                    "Gráfico de barras com a pontuação de cada candidato ranqueado, "
                    "do maior para o menor."
                ),
            )
        )

    def _narrative(
        self, study_id: int, project_id: int
    ) -> tuple[list[str] | None, list[str] | None, str | None]:
        """Ask the AI layer to write about this same run, or say why it can't."""
        try:
            explanation = AIService(self.db, user=self.user).explain(study_id, project_id)
        except (ValidationError, AIUnavailableError, QuotaExceededError) as exc:
            # Out of today's AI budget (D-179) the laudo still goes out, without
            # the narrative and with the reason in its note.
            return None, None, f"Interpretação por IA não disponível: {exc}"

        paragraphs = [explanation.summary, *explanation.paragraphs]
        return paragraphs, explanation.caveats, explanation.disclaimer

    @staticmethod
    def _problem_sheet(study, result: RunResultOut, root_group_description: str) -> Sheet:
        rows = [
            ["Estudo", study.name],
            ["Função do componente", study.function_text or "—"],
            ["Objetivo", study.objective_text or "—"],
            ["Variáveis livres", ", ".join(study.free_variables or []) or "—"],
            ["Lógica da seleção", root_group_description],
        ]
        if result.universe == "process":
            rows.append(["Universo do resultado", "Processos"])
            rows.append(["Processos considerados", result.initial_count])
        else:
            rows.append(["Universo do resultado", "Materiais"])
            rows.append(["Materiais considerados", result.initial_count])
        rows.append(["Candidatos após as restrições", result.final_count])
        return Sheet(name="Problema", header=["Item", "Valor"], rows=rows)

    @staticmethod
    def _stage_kind_labels(universe: str) -> dict[str, str]:
        kinds = {
            "limit": "Limites",
            "tree": "Classes",
            "process": "Processos",
            "material": "Materiais",
            "chart": "Gráfico",
        }
        if universe == "process":
            kinds = {**kinds, "tree": "Famílias"}
        return kinds

    @staticmethod
    def _author_notes_sheet(study, result: RunResultOut) -> Sheet:
        """The author's own words on the study and on each stage (D-122, FL-b).

        Plain text, never computed and never rendered as markup. Each renderer
        escapes it its own way (``html.escape`` in the HTML, the leading
        apostrophe in a spreadsheet cell, the XML writer in DOCX/PPTX); this
        sheet only decides *which* notes appear. A study with no note says so
        in words: an absent note is a stated absence, not a missing section.
        """
        kinds = ExportService._stage_kind_labels(result.universe)
        rows: list[list[object]] = []
        if getattr(study, "notes", None):
            rows.append(["Estudo", study.notes])
        for stage in sorted(getattr(study, "stages", []) or [], key=lambda st: st.position):
            if not stage.notes:
                continue
            where = f"Estágio {stage.position + 1} — {kinds.get(stage.kind, stage.kind)}"
            if stage.label:
                where = f"{where} — {stage.label}"
            rows.append([where, stage.notes])
        notes = (
            ["Só aparecem aqui o estudo e os estágios que têm nota."]
            if rows
            else ["Nenhuma nota foi escrita neste estudo, nem em seus estágios."]
        )
        return Sheet(name="Notas do autor", header=["Onde", "Nota"], rows=rows, notes=notes)

    @staticmethod
    def _stages_sheet(result: RunResultOut) -> Sheet:
        """The pipeline, one row per stage (P0-1)."""
        kinds = ExportService._stage_kind_labels(result.universe)
        rows = [
            [
                stage.position + 1,
                kinds.get(stage.kind, stage.kind),
                stage.label or "Sem rótulo",
                "Sim" if stage.enabled else "Não",
                stage.passed,
                stage.remaining,
            ]
            for stage in result.stages
        ]
        return Sheet(
            name="Estágios",
            header=[
                "Nº",
                "Tipo",
                "Rótulo",
                "Habilitado",
                "Admitidos sozinho",
                "Restantes",
            ],
            rows=rows,
            notes=(
                []
                if len(rows) > 1
                else ["Estudo de um único estágio: o funil abaixo é a totalidade da seleção."]
            ),
        )

    @staticmethod
    def _funnel_sheet(result: RunResultOut) -> Sheet:
        rows = [[step.label, step.operator, step.passed, step.remaining] for step in result.funnel]
        notes = [] if rows else ["Nenhuma restrição foi aplicada."]
        composition_steps = [step for step in result.funnel if step.undetermined is not None]
        if composition_steps:
            notes.append(RULE_TEXT)
            notes.extend(
                f"{step.label}: {step.undetermined} candidato(s) sem o dado de composição "
                "necessário não foram decididos e não passam."
                for step in composition_steps
            )
        # D-126: the written reason for a minimum-level criterion — a material
        # with no level left there for lack of data, not for being too poor.
        notes.extend(
            f"{step.label}: {step.without_level} candidato(s) sem nível cadastrado "
            "(ausente ou sem dado) não passam; ausência não é o pior nível."
            for step in result.funnel
            if step.without_level is not None
        )
        return Sheet(
            name="Limites e funil",
            header=["Limite", "Operador", "Passaram", "Restantes"],
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
        subject = "Processo" if result.universe == "process" else "Material"
        notes: list[str] = []
        if not rows:
            notes.append("Nenhum candidato sobreviveu às restrições.")
        if result.universe == "process":
            notes.append(
                "Sem mapa de seleção e sem ranqueamento: ambos precisam de valores numéricos, "
                "e um processo ainda não tem atributo cadastrado."
            )
        return Sheet(
            name="Candidatos",
            header=["Posição", subject, "Classe", "Índice", "Pontuação"],
            rows=rows,
            notes=notes,
        )

    @staticmethod
    def _index_sheet(result: RunResultOut) -> Sheet:
        index = result.index
        assert index is not None
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
    def _contributions_note(ranking: RankingResultOut) -> str:
        method = ranking.method
        if method == "topsis":
            return (
                "Método: TOPSIS. Os pesos são renormalizados para somar 1; a "
                "pontuação é a proximidade (razão de distâncias) a uma solução "
                "ideal, não a soma linear das contribuições listadas — cada "
                "contribuição é reportada por critério como transparência do "
                "cálculo, não como decomposição exata da pontuação."
            )
        if method == "promethee":
            return (
                "Método: PROMETHEE II. Os pesos são renormalizados para somar "
                "1; a pontuação é o fluxo de saída líquido, calculado pela "
                "própria fórmula do método — a soma das margens de preferência "
                "pareada por critério, já ponderadas — e não uma normalização "
                "min-máx ou vetorial."
            )
        normalization_label = {"minmax": "min-máx", "vector": "vetorial"}.get(
            ranking.normalization, ranking.normalization
        )
        return (
            f"Normalização: {normalization_label}. Os pesos são renormalizados "
            "para somar 1; a pontuação é a soma das contribuições."
        )

    @classmethod
    def _contributions_sheet(cls, result: RunResultOut) -> Sheet:
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
            notes=[cls._contributions_note(ranking)],
        )

    @staticmethod
    def _excluded_sheet(result: RunResultOut) -> Sheet:
        ranking = result.ranking
        assert ranking is not None
        rows = [[e.name, ", ".join(e.missing_labels)] for e in ranking.excluded]
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
            [s.description, s.top_record_name or "—", "mudou" if s.changed else "estável"]
            for s in ranking.sensitivity
        ]
        return Sheet(
            name="Sensibilidade",
            header=["Cenário de pesos", "1º colocado", "Resultado"],
            rows=rows,
            notes=(
                [
                    "A classificação é recalculada sob pesos perturbados. 'Mudou' indica que a "
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

    def _provenance_sheet(self, study, result: RunResultOut, records: dict) -> Sheet:
        if result.universe == "process":
            return self._process_provenance_sheet(study, result, records)
        materials = records
        slugs = self._relevant_slugs(study, result)
        names = {p.slug: p.name for p in self.chart_repo.list_properties()}
        rows: list[list[object]] = []

        for candidate in result.candidates:
            material = materials.get(candidate.record_id)
            if material is None:
                continue
            by_slug = {v.property_definition.slug: v for v in material.property_values}
            for slug in slugs:
                value = by_slug.get(slug)
                origin = "Próprio" if self._is_own_record(material) else "Catálogo"
                if value is None:
                    label = names.get(slug, slug)
                    rows.append(
                        [material.name, label, _MISSING, _MISSING, "—", "—", "—", "—", origin]
                    )
                    continue
                definition = value.property_definition
                rows.append(
                    [
                        material.name,
                        definition.name,
                        _MISSING if value.is_missing else format_number(value.normalized_value),
                        pretty_unit(definition.canonical_unit),
                        (
                            _MISSING
                            if value.is_missing
                            else format_number(
                                value.value_scalar
                                if value.value_scalar is not None
                                else value.value_typical
                            )
                        ),
                        pretty_unit(value.original_unit) if value.original_unit else "—",
                        value.conversion_method or "—",
                        value.data_quality.value,
                        origin,
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
                "Registro",
            ],
            rows=rows,
            notes=(
                [
                    "Origem de cada número usado na decisão. Um valor ausente aparece como "
                    "'ausente', nunca como zero ou célula vazia.",
                    "'Registro' distingue o catálogo compartilhado de um registro próprio do "
                    "usuário, que não passou pela revisão de fonte e licença do catálogo.",
                ]
                if rows
                else ["Sem propriedades a rastrear para este estudo."]
            ),
        )

    def _process_provenance_sheet(self, study, result: RunResultOut, records: dict) -> Sheet:
        """The same argument the material provenance sheet makes, for a process study."""
        slugs = self._relevant_slugs(study, result)
        attributes = {a.slug: a for a in self.selection_repo.list_process_attributes()}
        kind_labels = {
            ProcessAttributeKind.ESCALAR: "escalar",
            ProcessAttributeKind.ENVELOPE: "envelope de capacidade",
            ProcessAttributeKind.DISCRETO: "discreto",
        }
        rows: list[list[object]] = []

        for candidate in result.candidates:
            process = records.get(candidate.record_id)
            if process is None:
                continue
            by_slug = {v.attribute.slug: v for v in process.attribute_values}
            for slug in slugs:
                attribute = attributes.get(slug)
                kind = kind_labels.get(attribute.kind, "—") if attribute else "—"
                name = attribute.name if attribute else slug
                value = by_slug.get(slug)
                if value is None or value.is_missing:
                    rows.append([process.name, name, kind, _MISSING, "—", _MISSING, "—", "—", "—"])
                    continue
                rows.append(
                    [
                        process.name,
                        name,
                        kind,
                        self._attribute_value_text(value),
                        pretty_unit(value.canonical_unit) if value.canonical_unit else "—",
                        self._attribute_original_text(value),
                        pretty_unit(value.original_unit) if value.original_unit else "—",
                        value.conversion_method or "—",
                        value.data_quality.value,
                    ]
                )

        notes = [
            "Origem de cada valor de processo usado na decisão. Um valor ausente aparece "
            "como 'ausente', nunca como zero ou célula vazia.",
            "Um envelope de capacidade é comparado por alcance: o limiar é atendido quando "
            "a faixa alcança o valor, e não quando o ponto médio alcança. O ponto "
            "representativo é o que um ranqueamento ou um índice lê.",
        ]
        return Sheet(
            name="Proveniência",
            header=[
                "Processo",
                "Atributo",
                "Tipo de valor",
                "Valor normalizado",
                "Unidade canônica",
                "Valor original",
                "Unidade original",
                "Método de conversão",
                "Qualidade do dado",
            ],
            rows=rows,
            notes=notes if rows else ["Sem atributos a rastrear para este estudo."],
        )

    @staticmethod
    def _attribute_value_text(value) -> str:
        """The normalised value as the document prints it, by shape of datum."""
        if value.labels:
            return ", ".join(value.labels)
        if value.normalized_min is not None and value.normalized_max is not None:
            return f"{format_number(value.normalized_min)} – {format_number(value.normalized_max)}"
        return format_number(value.normalized_value)

    @staticmethod
    def _attribute_original_text(value) -> str:
        if value.labels:
            return ", ".join(value.labels)
        if value.value_min is not None and value.value_max is not None:
            return f"{format_number(value.value_min)} – {format_number(value.value_max)}"
        if value.value_scalar is not None:
            return format_number(value.value_scalar)
        return format_number(value.value_typical)

    # --- catalogue --------------------------------------------------------

    def catalogue_report(self) -> Report:
        """Every active material and its property values, with the full trail."""
        materials = self.chart_repo.list_materials()
        definitions = self.chart_repo.list_properties()

        readings = readings_for(definitions, self.unit_choices)
        header = ["Material", "Classe", "Registro próprio"] + [
            f"{d.name} [{readings[d.slug].label}]" for d in definitions
        ]
        rows: list[list[object]] = []
        provenance: list[list[object]] = []

        for material in materials:
            by_slug = {v.property_definition.slug: v for v in material.property_values}
            row: list[object] = [
                material.name,
                material.material_class.name,
                self._is_own_record(material),
            ]
            for definition in definitions:
                value = by_slug.get(definition.slug)
                row.append(
                    _MISSING
                    if value is None or value.is_missing
                    else format_number(readings[definition.slug].value(value.normalized_value))
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
                            pretty_unit(value.original_unit) if value.original_unit else "—",
                            format_number(value.normalized_value),
                            pretty_unit(definition.canonical_unit),
                            value.conversion_method or "—",
                            value.data_quality.value,
                            value.source.label if value.source else "—",
                        ]
                    )
            rows.append(row)

        return Report(
            title="Catálogo de materiais",
            subtitle=f"{len(materials)} materiais ativos, {len(definitions)} propriedades",
            notices=standard_notices(
                includes_own_records=any(self._is_own_record(m) for m in materials),
            ),
            sheets=[
                Sheet(
                    name="Materiais",
                    header=header,
                    rows=rows,
                    notes=["Valores em unidade canônica. 'ausente' significa dado não cadastrado."],
                ),
                composition_sheet([(m.name, composition_lines(m)) for m in materials]),
                designation_sheet([(m.name, designation_lines(m)) for m in materials]),
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

    # --- eco audit (D-121, D-172) -----------------------------------------

    def eco_report(self, request: EcoAuditRequest) -> Report:
        """The eco audit of a brief, by component and by transport leg.

        The brief is re-run through ``EcoService`` — the same call that serves
        the screen — so the file cannot disagree with what the reader saw. What
        this adds is where each input came from (``eco_provenance``); the
        arrangement into sheets is ``exporters/eco.py``.
        """
        result = EcoService(self.db, self.viewer_id).run(request)
        items = request.resolved_components()
        materials = {
            m.id: m
            for m in self.chart_repo.list_materials(
                material_ids=[component.material_id for component in result.components]
            )
        }
        processes = {
            p.id: p
            for p in self.selection_repo.processes_with_attributes(
                [component.process_id for component in result.components]
            )
        }
        property_names = {p.slug: p for p in self.chart_repo.list_properties()}

        values = []
        for component, item in zip(result.components, items, strict=True):
            values += component_rows(
                scope=component.name,
                item=item,
                material=materials[component.material_id],
                process=processes[component.process_id],
                property_names=property_names,
            )
        transport = TransportRepository(self.db)
        for position, leg in enumerate(request.resolved_legs(), start=1):
            mode = transport.get_active_by_slug(leg.mode)
            if mode is not None:
                values += leg_rows(scope=f"Trecho {position} — {mode.name}", mode=mode)

        own = any(self._is_own_record(m) for m in materials.values())
        phrase = "componente" if len(result.components) == 1 else "componentes"
        legs = "trecho" if len(result.transport_legs) == 1 else "trechos"
        return Report(
            title="Auditoria ambiental do produto",
            subtitle=(
                f"{len(result.components)} {phrase} e {len(result.transport_legs)} {legs} "
                "de transporte; cinco fases: material, manufatura, transporte, uso e fim de vida."
            ),
            notices=standard_notices(includes_own_records=own),
            sheets=eco_sheets(result, request.use, values),
        )

    # --- material sheet (D-125) -------------------------------------------

    def material_report(self, material_id: int) -> Report:
        """Ficha técnica detalhada do material em 9 seções canônicas (D-125)."""
        material_detail = MaterialService(
            self.db, self.user, self.unit_choices
        ).get_material_detail(material_id)
        equivalences = EquivalenceService(self.db, self.user).for_material(material_id)
        curves = CurveService(self.db, self.viewer_id).list_curves(material_id)

        sheets = [
            self._material_identification_sheet(material_detail),
            self._material_properties_sheet(material_detail),
            self._material_provenance_sheet(material_detail),
            self._material_composition_sheet(material_detail),
            self._material_atomic_composition_sheet(material_detail),
            self._material_designations_sheet(material_detail),
            self._material_equivalences_sheet(material_detail, equivalences),
            self._material_curves_sheet(material_detail, curves),
            self._material_processes_sheet(material_detail),
        ]

        sub_parts = [f"Classe: {material_detail.class_name}"]
        if material_detail.subclass:
            sub_parts.append(f"Subclasse: {material_detail.subclass}")
        subtitle = " — ".join(sub_parts)

        return Report(
            title=f"Ficha técnica — {material_detail.name}",
            subtitle=subtitle,
            notices=standard_notices(
                includes_own_records=material_detail.is_own_record,
            ),
            sheets=sheets,
            figures=[],
        )

    @staticmethod
    def _material_identification_sheet(d: MaterialDetail) -> Sheet:
        rows = [
            ["Nome", d.name],
            ["Classe", d.class_name],
            ["Subclasse", d.subclass or _MISSING],
            ["Descrição", d.description or _MISSING],
            ["Palavras-chave", ", ".join(d.keywords) if d.keywords else _MISSING],
            ["Registro próprio", "Sim" if d.is_own_record else "Não"],
            ["Registro oficial", "Sim" if d.is_official else "Não"],
            [
                "Duplicado de",
                f"{d.copied_from.name} (id {d.copied_from.id})" if d.copied_from else _MISSING,
            ],
        ]
        return Sheet(
            name="Identificação",
            header=["Item", "Valor"],
            rows=rows,
            notes=["Metadados e classificação cadastral do material."],
        )

    @staticmethod
    def _material_properties_sheet(d: MaterialDetail) -> Sheet:
        rows: list[list[object]] = []
        for group in d.property_groups:
            for p in group.properties:
                category_name = group.category.value
                prop_name = p.property_name
                symbol = p.symbol or "—"
                if p.is_missing:
                    rows.append(
                        [
                            category_name,
                            prop_name,
                            symbol,
                            _MISSING,
                            _MISSING,
                            _MISSING,
                            _MISSING,
                            "—",
                            "—",
                        ]
                    )
                elif p.is_interval:
                    display_val = f"{format_number(p.display_min)} – {format_number(p.display_max)}"
                    orig_val = f"{format_number(p.value_min)} – {format_number(p.value_max)}"
                    read_unit = pretty_unit(p.display_unit) if p.display_unit else _MISSING
                    orig_unit = pretty_unit(p.original_unit) if p.original_unit else _MISSING
                    uncertainty = (
                        f"±{format_number(p.uncertainty)}%" if p.uncertainty is not None else "—"
                    )
                    rows.append(
                        [
                            category_name,
                            prop_name,
                            symbol,
                            display_val,
                            read_unit,
                            orig_val,
                            orig_unit,
                            p.measurement_condition or "—",
                            uncertainty,
                        ]
                    )
                else:
                    display_val = format_number(p.display_value)
                    orig_val = format_number(p.value_scalar)
                    read_unit = pretty_unit(p.display_unit) if p.display_unit else _MISSING
                    orig_unit = pretty_unit(p.original_unit) if p.original_unit else _MISSING
                    uncertainty = (
                        f"±{format_number(p.uncertainty)}%" if p.uncertainty is not None else "—"
                    )
                    rows.append(
                        [
                            category_name,
                            prop_name,
                            symbol,
                            display_val,
                            read_unit,
                            orig_val,
                            orig_unit,
                            p.measurement_condition or "—",
                            uncertainty,
                        ]
                    )
        notes = [
            "Valores de leitura expressos nas unidades selecionadas pelo usuário (D-70). "
            "'ausente' indica dado não cadastrado (D-24).",
        ]
        return Sheet(
            name="Propriedades",
            header=[
                "Categoria",
                "Propriedade",
                "Símbolo",
                "Valor de leitura",
                "Unidade de leitura",
                "Valor original",
                "Unidade original",
                "Condição",
                "Incerteza",
            ],
            rows=rows,
            notes=notes if rows else ["Nenhuma propriedade cadastrada para este material."],
        )

    @staticmethod
    def _material_provenance_sheet(d: MaterialDetail) -> Sheet:
        rows: list[list[object]] = []
        for group in d.property_groups:
            for p in group.properties:
                canon_unit = pretty_unit(p.canonical_unit)
                if p.is_missing:
                    rows.append(
                        [
                            p.property_name,
                            _MISSING,
                            _MISSING,
                            _MISSING,
                            canon_unit,
                            "—",
                            p.data_quality.value,
                            p.source_label or "—",
                            p.notes or "—",
                        ]
                    )
                else:
                    orig_val = (
                        f"{format_number(p.value_min)} – {format_number(p.value_max)}"
                        if p.is_interval
                        else format_number(p.value_scalar)
                    )
                    orig_unit = pretty_unit(p.original_unit) if p.original_unit else _MISSING
                    norm_val = format_number(p.normalized_value)
                    rows.append(
                        [
                            p.property_name,
                            orig_val,
                            orig_unit,
                            norm_val,
                            canon_unit,
                            p.conversion_method or "—",
                            p.data_quality.value,
                            p.source_label or "—",
                            p.notes or "—",
                        ]
                    )
        return Sheet(
            name="Proveniência propriedades",
            header=[
                "Propriedade",
                "Valor original",
                "Unidade original",
                "Valor normalizado",
                "Unidade canônica",
                "Método de conversão",
                "Qualidade do dado",
                "Fonte",
                "Notas",
            ],
            rows=rows,
            notes=[
                "Rastreabilidade metrológica e proveniência de cada propriedade cadastrada. "
                "Valores ausentes aparecem como 'ausente' (D-24).",
            ],
        )

    @staticmethod
    def _material_composition_sheet(d: MaterialDetail) -> Sheet:
        rows: list[list[object]] = []
        for e in d.composition:
            cond = e.condition_label or "Padrão"
            if e.state == "resto":
                teor = "resto (balanço)"
                min_val = _MISSING
                max_val = _MISSING
            elif e.state == "ausente":
                teor = _MISSING
                min_val = _MISSING
                max_val = _MISSING
            else:
                if e.normalized_nominal is not None:
                    teor = format_number(e.normalized_nominal)
                else:
                    teor = f"{format_number(e.normalized_min)} – {format_number(e.normalized_max)}"
                min_val = (
                    format_number(e.normalized_min) if e.normalized_min is not None else _MISSING
                )
                max_val = (
                    format_number(e.normalized_max) if e.normalized_max is not None else _MISSING
                )
            rows.append(
                [
                    cond,
                    e.element_name,
                    e.element,
                    e.atomic_number,
                    e.state,
                    teor,
                    min_val,
                    max_val,
                    e.data_quality.value,
                    e.source_label,
                ]
            )
        notes = (
            ["Composição química em porcentagem de massa (% massa)."]
            if rows
            else ["Sem composição cadastrada para este material."]
        )
        return Sheet(
            name="Composição",
            header=[
                "Condição",
                "Elemento",
                "Símbolo",
                "Nº atômico",
                "Estado",
                "Teor declarado (% massa)",
                "Mín (% massa)",
                "Máx (% massa)",
                "Qualidade do dado",
                "Fonte",
            ],
            rows=rows,
            notes=notes,
        )

    @staticmethod
    def _material_atomic_composition_sheet(d: MaterialDetail) -> Sheet:
        rows: list[list[object]] = []
        has_any_entry = False
        for block in d.atomic_composition:
            cond = block.condition_label or "Padrão"
            if block.reason:
                rows.append([cond, "Todos", _MISSING, _MISSING, block.message or block.reason])
            else:
                for entry in block.entries:
                    has_any_entry = True
                    rows.append(
                        [
                            cond,
                            entry.element,
                            format_number(entry.atomic_min),
                            format_number(entry.atomic_max),
                            block.basis,
                        ]
                    )
        notes = (
            [
                "Composição atômica calculada a partir da composição em massa "
                "e pesos atômicos IUPAC (D-117).",
            ]
            if (rows and (has_any_entry or any(b.reason for b in d.atomic_composition)))
            else ["Sem composição atômica calculada para este material."]
        )
        return Sheet(
            name="Composição atômica",
            header=[
                "Condição",
                "Elemento",
                "Teor atômico mín (% at)",
                "Teor atômico máx (% at)",
                "Base de cálculo",
            ],
            rows=rows,
            notes=notes,
        )

    @staticmethod
    def _material_designations_sheet(d: MaterialDetail) -> Sheet:
        rows = [
            [
                item.system_label,
                item.code,
                item.region or "—",
                item.source_label,
                item.citation or "—",
            ]
            for item in d.designations
        ]
        return Sheet(
            name="Designações",
            header=["Sistema", "Código", "Região", "Fonte", "Citação"],
            rows=rows,
            notes=(
                ["Designações comerciais e normativas reconhecidas para o material (D-105)."]
                if rows
                else ["Nenhuma designação cadastrada para este material."]
            ),
        )

    @staticmethod
    def _material_equivalences_sheet(d: MaterialDetail, equivs: MaterialEquivalencesOut) -> Sheet:
        rows: list[list[object]] = []
        for group in equivs.groups:
            self_member = next((m for m in group.members if m.is_self), None)
            orig_code = self_member.code if self_member else "—"
            for m in group.members:
                if m.is_self:
                    continue
                rows.append(
                    [
                        group.kind_label,
                        orig_code,
                        m.material_name,
                        m.code,
                        m.system_label,
                        m.region or "—",
                        group.source_label,
                    ]
                )
        return Sheet(
            name="Equivalências",
            header=[
                "Tipo de equivalência",
                "Designação de origem",
                "Material equivalente",
                "Designação equivalente",
                "Sistema",
                "Região",
                "Fonte",
            ],
            rows=rows,
            notes=(
                ["Equivalências declaradas por fontes normativas ou bibliográficas (D-115)."]
                if rows
                else ["Nenhuma equivalência declarada para este material."]
            ),
        )

    @staticmethod
    def _material_curves_sheet(d: MaterialDetail, curves_out: MaterialCurvesOut) -> Sheet:
        rows = [
            [
                c.kind_label,
                c.title,
                c.x_quantity_label,
                c.y_quantity_label,
                c.parameter_quantity_label or "—",
                c.series_count,
                c.point_count,
                c.source_label,
            ]
            for c in curves_out.curves
        ]
        return Sheet(
            name="Curvas características",
            header=[
                "Tipo de curva",
                "Título",
                "Eixo X",
                "Eixo Y",
                "Parâmetro",
                "Séries",
                "Pontos",
                "Fonte",
            ],
            rows=rows,
            notes=(
                [
                    "Curvas experimentais registradas. Pontos detalhados disponíveis via "
                    "exportação individual de curva (D-106)."
                ]
                if rows
                else ["Nenhuma curva experimental cadastrada para este material."]
            ),
        )

    @staticmethod
    def _material_processes_sheet(d: MaterialDetail) -> Sheet:
        rows = [[p.name, p.class_name or "—", p.description or "—"] for p in d.processes]
        return Sheet(
            name="Processos compatíveis",
            header=["Processo", "Família", "Descrição"],
            rows=rows,
            notes=(
                ["Processos de fabricação compatíveis mapeados no catálogo (P0-2)."]
                if rows
                else ["Nenhum processo compatível associado a este material."]
            ),
        )
