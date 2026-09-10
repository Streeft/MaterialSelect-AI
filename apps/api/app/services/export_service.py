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

from app.ai.provider import AIUnavailableError
from app.calculations.expressions import variables_in
from app.domain.errors import NotFoundError, ValidationError
from app.exporters.cells import format_number
from app.exporters.figures import (
    Axis,
    Bar,
    BarFigure,
    Line,
    Point,
    Polygon,
    ScatterFigure,
    render_bars,
    render_scatter,
)
from app.exporters.report import Report, Sheet, standard_notices
from app.repositories.chart_repository import ChartRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.charts import PropertyMapRequest
from app.schemas.selection import IndexIn, RankingResultOut, RunResultOut
from app.services.ai_service import AIService
from app.services.chart_service import ChartService
from app.services.selection_service import INDEX_KEY, SelectionService

_MISSING = "ausente"


class ExportService:
    """Builds reports for saved studies and for the catalogue."""

    def __init__(self, db) -> None:
        self.db = db
        self.selection_repo = SelectionRepository(db)
        self.chart_repo = ChartRepository(db)

    # --- selection study --------------------------------------------------

    def _run(self, study_id: int, project_id: int):
        """Re-run the study and load the materials its candidates named.

        Shared by the selection report and the laudo, so both describe the
        same execution of the deterministic pipeline rather than two.
        """
        study = self.selection_repo.get_study(study_id, project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        service = SelectionService(self.db, project_id)
        result = service.run_study(study_id)
        # Same SelectionService instance as run_study above, so this reuses
        # its already-populated property cache and snapshot list rather than
        # rebuilding them — see SelectionService.describe_pipeline.
        root_group_description = service.describe_pipeline(study)
        # Only a material study's candidates are materials (P0-3). Looking a
        # process id up in the material table would not merely find nothing —
        # it would find whatever material happens to carry that id, and print
        # its provenance under a process's name. In a document whose whole
        # purpose is auditability that is the worst available failure, so the
        # lookup simply does not happen for the other universe.
        if result.universe == "material":
            candidate_ids = [c.record_id for c in result.candidates]
            materials = {
                m.id: m for m in self.chart_repo.list_materials(material_ids=candidate_ids or [-1])
            }
        else:
            materials = {}
        return study, result, materials, root_group_description

    def _sheets(
        self, study, result: RunResultOut, materials: dict, root_group_description: str
    ) -> list[Sheet]:
        sheets = [
            self._problem_sheet(study, result, root_group_description),
            self._stages_sheet(result),
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
        return sheets

    def study_report(self, study_id: int, project_id: int) -> Report:
        study, result, materials, root_group_description = self._run(study_id, project_id)
        return Report(
            title=f"Relatório de seleção — {study.name}",
            subtitle=study.description or "",
            notices=standard_notices(includes_demo_data=any(m.is_demo for m in materials.values())),
            sheets=self._sheets(study, result, materials, root_group_description),
            # The map, and only the map. The ranking chart stays a mark of the
            # laudo (D-41); the map is what makes this a *selection* report
            # rather than a table of numbers, so it belongs to both.
            figures=[f for f in (self._map_figure(study, result),) if f],
        )

    def study_laudo(
        self, study_id: int, project_id: int, *, responsible: str | None = None
    ) -> Report:
        """The engineering report: the selection report plus a figure and,
        when the AI layer is on, an interpretive narrative.

        A document distinct from ``study_report`` on purpose — it is meant to
        be attached on its own, not read as a reduced version of the
        spreadsheet-oriented tables.
        """
        study, result, materials, root_group_description = self._run(study_id, project_id)
        narrative, caveats, note = self._narrative(study_id, project_id)
        return Report(
            title=f"Laudo de engenharia — {study.name}",
            subtitle=study.description or "",
            notices=standard_notices(includes_demo_data=any(m.is_demo for m in materials.values())),
            sheets=self._sheets(study, result, materials, root_group_description),
            responsible=(responsible or "").strip() or None,
            figures=self._figures(study, result),
            narrative=narrative,
            narrative_caveats=caveats,
            narrative_note=note,
        )

    def _figures(self, study, result: RunResultOut) -> list[str]:
        """The laudo's figures: the selection map first, then the ranking chart.

        That order is the argument the document makes: the map is where the
        candidates come from, the bar chart is what the ranking did with them.
        Either may be absent — a study whose index names fewer than two
        catalogued properties has no plane to be drawn on — and the caption of
        whichever survives says so rather than leaving a silent gap.
        """
        return [f for f in (self._map_figure(study, result), self._ranking_figure(result)) if f]

    def _map_figure(self, study, result: RunResultOut) -> str | None:
        """The Ashby map of this study: every material, the candidates marked.

        The two axes are read off the study's own index expression, in the
        order it names them: `sqrt(modulo_young) / densidade` puts density on
        x and modulus on y, which is how the chart is drawn in the literature.
        A study with no index, or one naming a single property, has no such
        plane — the map is then omitted rather than invented from an unrelated
        pair.

        Geometry is not computed here. `ChartService.property_map` is the same
        call `/api/charts/property-map` serves, so the figure in the document
        and the map on the screen cannot disagree (ADR 0004).
        """
        axes = self._map_axes(study)
        if axes is None:
            return None
        x_slug, y_slug = axes

        ranked_ids = [r.material_id for r in result.ranking.ranked] if result.ranking else []
        winner = ranked_ids[:1]
        index_in = (
            IndexIn(name=study.index_name, expression=study.index_expression, goal=study.index_goal)
            if study.index_expression
            else None
        )

        try:
            chart = ChartService(self.db).property_map(
                PropertyMapRequest(
                    x=x_slug,
                    y=y_slug,
                    scale="log",
                    # Clouds, not hulls. A hull traces the outermost grades and
                    # reads as a boundary; the cloud is how an Ashby chart shows
                    # a family, and it is what the reader of a laudo recognises.
                    envelope_shape="ellipse",
                    highlight_material_ids=ranked_ids,
                    index=index_in,
                    # The line through the winner is what makes the map a
                    # selection map rather than a scatter plot: everything on
                    # its favourable side beat the leader on the index.
                    index_level_material_ids=winner,
                )
            )
        except ValidationError:
            # A property that cannot carry a map (no plottable values, log
            # scale refused) is a reason to omit the figure, never to fail the
            # export the reader actually asked for.
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
                caption=self._map_caption(chart, len(highlighted)),
                description=(
                    f"Mapa de {chart.y_axis.property_name} contra "
                    f"{chart.x_axis.property_name}, em escala {chart.scale}, com os "
                    f"candidatos aprovados destacados. Os mesmos números estão nas "
                    f"tabelas 'Candidatos' e 'Índice de desempenho'."
                ),
            )
        )

    def _map_axes(self, study) -> tuple[str, str] | None:
        """The (x, y) slugs the index names, in the order it names them."""
        expression = getattr(study, "index_expression", None)
        if not expression:
            return None
        known = {p.slug for p in self.chart_repo.list_properties()}
        # `variables_in` returns a set; the order the expression names them is
        # what decides which axis is which, so recover it by position.
        used = [slug for slug in variables_in(expression) if slug in known]
        if len(used) < 2:
            return None
        used.sort(key=expression.find)
        return used[1], used[0]

    @staticmethod
    def _figure_axis(axis, scale: str) -> Axis:
        label = f"{axis.property_name} ({axis.unit})" if axis.unit else axis.property_name
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
    def _map_caption(chart, highlighted_count: int) -> str:
        partes = [
            f"{chart.plotted_count} de {chart.considered_count} materiais têm os dois "
            f"valores cadastrados e aparecem no mapa"
        ]
        if chart.envelopes:
            # The cloud is padded on purpose, so it claims a little more area
            # than the materials in it occupy. Saying so is the price of
            # drawing it: a reader must not take the blob for a measurement.
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
        """A bar chart of the ranked candidates — omitted when no one ranked.

        Built from ``result.ranking`` rather than from the index/property
        pair, so it draws for every study regardless of how many variables
        the index expression involves.
        """
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
        """Ask the AI layer to write about this same run, or say why it can't.

        The layer is optional everywhere else in the project, and the laudo
        keeps that: a provider that is off, misconfigured, or momentarily
        unreachable degrades this one section instead of failing the whole
        document.

        This re-runs the deterministic pipeline: ``AIService.explain`` computes
        its own result and will not accept one from a caller, so assembling the
        laudo executes the study twice. Measured at 10.3 ms of a 30.4 ms
        document on the seeded catalogue — a third of it, and deliberate.
        Handing our result over is what the numeric anchoring depends on not
        happening: the prose is checked against numbers *that call* produced,
        and a parameter is exactly the door through which fabricated numbers
        would arrive already blessed. With a real provider the second run is
        under one percent of the wait, which is the case that matters.
        """
        try:
            explanation = AIService(self.db).explain(study_id, project_id)
        except (ValidationError, AIUnavailableError) as exc:
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
            # The real logic, not just study.combinator (the first root
            # group's own operator) — for a nested study the root operator alone
            # misdescribes it, and since P0-1 a study can have several stages
            # whose combination it does not describe at all. The row is named
            # for what it now holds; "Combinação das restrições" stopped being
            # true the moment a stage could be a folder selection rather than a
            # restriction. See SelectionService.describe_pipeline.
            ["Lógica da seleção", root_group_description],
        ]
        # P0-3: the document states which universe it selected over. Left to be
        # inferred from the candidate names, a reader skimming the header would
        # take a list of processes for a list of materials.
        if result.universe == "process":
            rows.append(["Universo do resultado", "Processos"])
            rows.append(["Processos considerados", result.initial_count])
        else:
            rows.append(["Universo do resultado", "Materiais"])
            rows.append(["Materiais considerados", result.initial_count])
        rows.append(["Candidatos após as restrições", result.final_count])
        return Sheet(name="Problema", header=["Item", "Valor"], rows=rows)

    @staticmethod
    def _stages_sheet(result: RunResultOut) -> Sheet:
        """The pipeline, one row per stage (P0-1).

        Always present, including for a single-stage study: an audit document
        whose sections appear and disappear with the shape of the study is
        harder to read than one that always answers the same questions. For a
        study saved before P0-1 this is one row, and it says so.

        "Admitidos sozinho" is what the stage admits over the whole catalogue,
        independently of the stages before it — reported for a disabled stage
        too, because that is the question switching one off asks. "Restantes"
        is the running count after the stage, unchanged when it is disabled.
        """
        kinds = {
            "limit": "Limites",
            "tree": "Classes",
            "process": "Processos",
            "material": "Materiais",
        }
        if result.universe == "process":
            # A tree stage walks the study's own universe, so in a process study
            # it selects process *families* — calling that column "Classes"
            # would point the reader at the material taxonomy.
            kinds = {**kinds, "tree": "Famílias"}
        rows = [
            [
                stage.position + 1,
                kinds.get(stage.kind, stage.kind),
                # Written, never a dash: an unnamed stage is named by what it is,
                # the same thing the funnel does, and the same rule D-24 sets for
                # every other absence in this document.
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
        # The column is named for what it holds. "Material" over a list of
        # processes would be a caption contradicting its own table.
        subject = "Processo" if result.universe == "process" else "Material"
        notes: list[str] = []
        if not rows:
            notes.append("Nenhum candidato sobreviveu às restrições.")
        if result.universe == "process":
            # The reason a figure is missing belongs where the reader looks for
            # the figure. With no attributes there is no plane to draw on, and
            # an unexplained gap reads as a rendering failure.
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
    def _contributions_note(ranking: RankingResultOut) -> str:
        """The one line explaining how "Contribuição" relates to "Pontuação".

        ``ranking.normalization`` only names a real normalization step for
        weighted_sum — TOPSIS and PROMETHEE II each set it to their own
        method name instead (see RankingIn's docstring on the backend), so
        printing it unconditionally used to render "Normalização: topsis" as
        if that were an actual normalization choice.

        The contribution-sums-to-score identity is method-specific, not
        method-agnostic, and the two non-weighted-sum methods do NOT agree
        with each other on it: TOPSIS's score is a ratio of distances to an
        ideal-best/-worst point, so the identity genuinely does not hold
        there (rank_topsis's own docstring, and docs/04-metodologia-selecao.md
        §"TOPSIS"). PROMETHEE II's score, by contrast, *is* the weighted sum
        of each criterion's pairwise preference margin — the identity holds
        for it exactly as it does for weighted_sum (rank_promethee's own
        docstring and test_promethee_contributions_sum_to_score both assert
        this) — so PROMETHEE keeps the "soma das contribuições" line and only
        drops the false "Normalização" label.
        """
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

    def _provenance_sheet(self, study, result: RunResultOut, materials: dict) -> Sheet:
        if result.universe == "process":
            # Declared, never a section that quietly appears empty: a process
            # carries no attribute with provenance yet, so there is nothing to
            # trace — and saying so is the audit trail for this document.
            return Sheet(
                name="Proveniência dos valores",
                header=["Item", "Situação"],
                rows=[],
                notes=[
                    "Este estudo seleciona processos, e um processo ainda não tem atributo "
                    "cadastrado — não há valor cuja origem rastrear. A seleção acima usou "
                    "apenas a taxonomia de processos e o vínculo com os materiais."
                ],
            )
        slugs = self._relevant_slugs(study, result)
        # A material with no row at all for a property still has to name that
        # property the way every other row names it. Reading the name off the
        # value would print the slug precisely for the missing case.
        names = {p.slug: p.name for p in self.chart_repo.list_properties()}
        rows: list[list[object]] = []

        for candidate in result.candidates:
            material = materials.get(candidate.record_id)
            if material is None:
                continue
            by_slug = {v.property_definition.slug: v for v in material.property_values}
            for slug in slugs:
                value = by_slug.get(slug)
                if value is None:
                    label = names.get(slug, slug)
                    rows.append([material.name, label, _MISSING, _MISSING, "—", "—", "—", "—"])
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
