"""The engineering report (laudo): building it, issuing it, verifying it (D-241).

**This service never calculates.** It re-runs the study through
``ExportService`` (the same pipeline the screen and the selection report use),
asks the cost and environmental services for their own deterministic answers,
and arranges what comes back into a :class:`~app.exporters.laudo.LaudoDocument`.
What it does decide is *which* of those answers a client reads first — the
finalists, the recommended material, the order of the reasons — and that is
ordering and choosing, never a number of its own (principle 2, ADR 0004).

The short sentences of "Por que este material" are built here from the result,
word by word; the AI layer only writes the separate interpretation section and
never a number (D-224).

Issuing freezes the document: the HTML rendered from today's catalogue is
stored with its inputs and its digest, and from then on is read, never rebuilt.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.calculations.part_cost import MATERIAL_COST_SLUG
from app.calculations.units import pretty_unit
from app.config import settings
from app.domain.errors import NotFoundError, ValidationError
from app.exporters.figures import (
    Axis,
    CurveFigure,
    CurveSeries,
    DonutFigure,
    DonutSegment,
    HBar,
    HBarFigure,
    Light,
    RadarFigure,
    RadarSeries,
    TrafficLightFigure,
    WaterfallBar,
    WaterfallFigure,
    render_curves,
    render_donut,
    render_hbars,
    render_radar,
    render_traffic_light,
    render_waterfall,
)
from app.exporters.laudo import (
    Engineer,
    KeyFigure,
    LaudoDocument,
    LaudoSection,
    Recommendation,
    ScopeItem,
    Seal,
    laudo_digest,
    render_laudo,
    seal_document,
    short_code,
)
from app.exporters.laudo_theme import format_br
from app.exporters.qr import qr_svg
from app.exporters.report import Sheet, standard_notices
from app.models.issued_report import IssuedReport
from app.models.user import User
from app.repositories.issued_report_repository import IssuedReportRepository
from app.repositories.process_repository import ProcessRepository
from app.schemas.eco import PartFootprintOut, WaterfallOut
from app.schemas.laudo import (
    REQUIRED_TO_ISSUE,
    IssuedReportOut,
    IssuedReportVerificationOut,
    LaudoInputs,
)
from app.schemas.part_cost import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_LOAD_FACTOR,
    DEFAULT_WRITE_OFF_YEARS,
    MONETARY_UNIT_NOTE,
    CostCurvesOut,
    CostCurvesRequest,
    CostRequest,
    CostResultOut,
)
from app.schemas.selection import RunResultOut
from app.services.eco_service import EcoService
from app.services.export_service import ExportService
from app.services.part_cost_service import PartCostService

#: How many finalists the comparison, cost and eco sections show side by side.
FINALISTS = 4
#: How many finalists get an environmental audit (each is a full audit).
ECO_FINALISTS = 3
#: The lights a summary can hold before the limits are folded into one line.
MAX_LIMIT_LIGHTS = 6

METHOD_LABELS = {
    "weighted_sum": "soma ponderada",
    "topsis": "TOPSIS",
    "promethee": "PROMETHEE II",
}
MONEY = "u.m."

VERIFY_PATH = "/api/laudos/verificar/"


def verify_url(digest: str) -> str:
    """Where the QR points: the public, read-only check of one code."""
    return f"{settings.backend_base_url.rstrip('/')}{VERIFY_PATH}{digest}"


def _plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _join(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " e " + names[-1]


class _Finalist:
    """One of the first places, with what the run said about it."""

    def __init__(
        self,
        record_id: int,
        name: str,
        class_name: str | None,
        score: float | None,
        index_value: float | None,
        rank: int | None,
    ) -> None:
        self.record_id = record_id
        self.name = name
        self.class_name = class_name
        self.score = score
        self.index_value = index_value
        self.rank = rank


class LaudoService:
    def __init__(
        self,
        db: Session,
        user: User | None = None,
        unit_choices: Mapping[str, str] | None = None,
    ) -> None:
        self.db = db
        self.user = user
        self.viewer_id = user.id if user is not None else None
        self.export = ExportService(db, user, unit_choices)
        self.issued = IssuedReportRepository(db)

    # --- the document --------------------------------------------------------

    def document(
        self, study_id: int, project_id: int, inputs: LaudoInputs, *, version: int | None = None
    ) -> LaudoDocument:
        export = self.export
        study, result, records, root_description = export._run(study_id, project_id)
        narrative, caveats, note = export._narrative(study_id, project_id)
        finalists = self._finalists(result)
        recommended = self._recommendation(result, finalists)
        is_material = result.universe == "material"

        cost = self._cost(finalists, inputs) if is_material else None
        footprints = self._footprints(finalists, inputs, cost) if is_material else []
        processes = (
            ProcessRepository(self.db).processes_for_material_with_values(finalists[0].record_id)
            if is_material and recommended is not None and finalists
            else []
        )
        estimate = (
            self._estimate(finalists[0].record_id, inputs)
            if is_material and recommended is not None and finalists
            else None
        )

        sections = [self._comparison_section(study, result, finalists)]
        if is_material:
            sections += [
                self._cost_section(finalists, records, inputs, cost),
                self._eco_section(footprints, inputs),
                self._fabrication_section(finalists, recommended, processes, estimate),
            ]
        else:
            reason = (
                "Estudo de processos: custo, impacto ambiental e fabricação são avaliados "
                "por material."
            )
            sections += [
                LaudoSection(key=key, title=title, unavailable=reason)
                for key, title in (
                    ("custo", "Custo"),
                    ("eco", "Impacto ambiental"),
                    ("fabricacao", "Fabricação"),
                )
            ]

        lights = self._lights(result, recommended, inputs, cost, footprints, processes)
        engineer = Engineer(
            name=inputs.engineer_name,
            title=inputs.engineer_title,
            registration=inputs.engineer_registration,
            art=inputs.art_number,
            city=inputs.city,
            issue_date=inputs.issue_date,
        )
        return LaudoDocument(
            study_name=study.name,
            description=study.description or "",
            client_name=inputs.client_name,
            client_project=inputs.client_project,
            engineer=engineer,
            recommendation=recommended,
            no_recommendation=self._no_recommendation(result) if recommended is None else None,
            key_figures=self._key_figures(result, finalists, recommended, cost, footprints, inputs),
            why=self._why(result, finalists, recommended, cost, footprints),
            traffic_light=render_traffic_light(
                TrafficLightFigure(
                    title="Requisitos e verificações",
                    lights=lights,
                    description=(
                        "Lista de requisitos do estudo e verificações do laudo, cada um com "
                        "o estado escrito: atende, atenção, não atende ou não avaliado."
                    ),
                )
            ),
            donut=self._donut(lights),
            ranking_mini=self._ranking_mini(result, finalists),
            scope=self._scope(result, recommended, cost, footprints, processes),
            sections=sections,
            narrative=narrative,
            narrative_caveats=caveats,
            narrative_note=note,
            notices=standard_notices(
                includes_own_records=any(export._is_own_record(r) for r in records.values()),
            ),
            annex=export._sheets(study, result, records, root_description),
            version=version,
        )

    def preview_html(self, study_id: int, project_id: int, inputs: LaudoInputs) -> tuple[str, str]:
        doc = self.document(study_id, project_id, inputs)
        return f"Laudo de engenharia — {doc.study_name}", render_laudo(doc, draft=True)

    # --- choosing what leads -------------------------------------------------

    @staticmethod
    def _finalists(result: RunResultOut) -> list[_Finalist]:
        """The first places: by rank, else by the index, else as the run listed them."""
        candidates = {c.record_id: c for c in result.candidates}
        if result.ranking is not None and result.ranking.ranked:
            ranked = sorted(result.ranking.ranked, key=lambda r: (r.rank, r.name))
            return [
                _Finalist(
                    r.record_id,
                    r.name,
                    candidates[r.record_id].class_name if r.record_id in candidates else None,
                    r.score,
                    candidates[r.record_id].index_value if r.record_id in candidates else None,
                    r.rank,
                )
                for r in ranked[:FINALISTS]
            ]
        if result.index is not None:
            defined = [c for c in result.candidates if c.index_value is not None]
            maximize = result.index.goal == "maximize"
            defined.sort(key=lambda c: (-c.index_value if maximize else c.index_value, c.name))  # type: ignore[operator]
            return [
                _Finalist(c.record_id, c.name, c.class_name, None, c.index_value, position)
                for position, c in enumerate(defined[:FINALISTS], start=1)
            ]
        return [
            _Finalist(c.record_id, c.name, c.class_name, None, None, None)
            for c in result.candidates[:FINALISTS]
        ]

    @staticmethod
    def _recommendation(result: RunResultOut, finalists: list[_Finalist]) -> Recommendation | None:
        winner = result.winner
        if winner is None or winner.kind == "none" or not finalists:
            return None
        first = finalists[0]
        if winner.kind == "ranked" and result.ranking is not None:
            method = METHOD_LABELS.get(result.ranking.method, result.ranking.method)
            standing = (
                f"1º de {_plural(len(result.ranking.ranked), 'classificado', 'classificados')} "
                f"por {method}"
            )
            if len(winner.names) > 1:
                standing += f" (empate com {_join([n for n in winner.names if n != first.name])})"
        else:
            word = "maior" if winner.maximize is not False else "menor"
            count = result.index.defined_count if result.index is not None else len(finalists)
            standing = (
                f"{word} índice de desempenho entre {_plural(count, 'candidato', 'candidatos')}"
            )
        return Recommendation(name=first.name, class_name=first.class_name, standing=standing)

    @staticmethod
    def _no_recommendation(result: RunResultOut) -> str:
        reason = result.winner.reason if result.winner is not None else None
        return {
            "no_candidates": "Nenhum material atendeu a todos os limites do estudo.",
            "no_objective": (
                "O estudo não tem índice nem critérios de classificação: os candidatos "
                "aparecem sem ordem de preferência."
            ),
            "no_defined_index": "Nenhum candidato tem os dados que o índice de desempenho lê.",
        }.get(reason or "", "O estudo não indicou um material recomendado.")

    # --- cost and environment (the backend's own answers) --------------------

    def _cost(self, finalists: list[_Finalist], inputs: LaudoInputs) -> CostCurvesOut | None:
        if inputs.part_mass_kg is None or not finalists:
            return None
        return PartCostService(self.db, self.viewer_id).curves(
            CostCurvesRequest(
                material_ids=[f.record_id for f in finalists[:5]],
                part_mass=inputs.part_mass_kg,
                batch_size=inputs.batch_size or DEFAULT_BATCH_SIZE,
            )
        )

    def _estimate(self, material_id: int, inputs: LaudoInputs) -> CostResultOut | None:
        if inputs.part_mass_kg is None:
            return None
        try:
            return PartCostService(self.db, self.viewer_id).estimate(
                CostRequest(
                    material_id=material_id,
                    part_mass=inputs.part_mass_kg,
                    batch_size=inputs.batch_size or DEFAULT_BATCH_SIZE,
                )
            )
        except (NotFoundError, ValidationError):
            return None

    def _footprints(
        self, finalists: list[_Finalist], inputs: LaudoInputs, cost: CostCurvesOut | None
    ) -> list[PartFootprintOut]:
        if inputs.part_mass_kg is None:
            return []
        current = {
            curve.material_id: curve.current
            for curve in (cost.curves if cost is not None else [])
            if curve.current is not None
        }
        service = EcoService(self.db, self.viewer_id)
        footprints = []
        for finalist in finalists[:ECO_FINALISTS]:
            point = current.get(finalist.record_id)
            footprints.append(
                service.part_footprint(
                    finalist.record_id,
                    inputs.part_mass_kg,
                    process_id=point.process_id if point is not None else None,
                    process_choice=(
                        "o mais econômico no lote informado" if point is not None else None
                    ),
                )
            )
        return footprints

    # --- the summary ---------------------------------------------------------

    def _key_figures(
        self,
        result: RunResultOut,
        finalists: list[_Finalist],
        recommended: Recommendation | None,
        cost: CostCurvesOut | None,
        footprints: list[PartFootprintOut],
        inputs: LaudoInputs,
    ) -> list[KeyFigure]:
        cards = [
            KeyFigure(
                label="Candidatos aprovados",
                value=format_br(result.final_count),
                unit=f"de {format_br(result.initial_count)}",
                hint="atenderam a todos os limites",
                tone="brand",
            )
        ]
        first = finalists[0] if finalists and recommended is not None else None
        if first is not None and first.score is not None and result.ranking is not None:
            cards.append(
                KeyFigure(
                    label="Pontuação",
                    value=format_br(first.score),
                    hint=METHOD_LABELS.get(result.ranking.method, result.ranking.method),
                    tone="brand",
                )
            )
        if first is not None and result.index is not None:
            cards.append(
                KeyFigure(
                    label=result.index.name or "Índice de desempenho",
                    value=format_br(first.index_value, missing="indefinido"),
                    hint="maximizar" if result.index.goal == "maximize" else "minimizar",
                    tone="brand",
                )
            )
        if result.universe != "material":
            return cards
        batch = inputs.batch_size or DEFAULT_BATCH_SIZE
        point = None
        if cost is not None and first is not None:
            curve = next((c for c in cost.curves if c.material_id == first.record_id), None)
            point = curve.current if curve is not None else None
        if point is not None:
            cards.append(
                KeyFigure(
                    label="Custo por peça",
                    value=format_br(point.cost),
                    unit=MONEY,
                    hint=f"lote de {format_br(batch)} · {point.process_name}",
                    tone="ok",
                )
            )
        else:
            cards.append(
                KeyFigure(
                    label="Custo por peça",
                    value="não avaliado",
                    hint=(
                        "informe a massa da peça"
                        if inputs.part_mass_kg is None
                        else "sem dado econômico"
                    ),
                    tone="na",
                )
            )
        footprint = footprints[0] if footprints else None
        if footprint is not None and footprint.total_carbon is not None:
            cards.append(
                KeyFigure(
                    label="CO₂ da peça",
                    value=format_br(footprint.total_carbon),
                    unit="kg CO₂",
                    hint="material, fabricação e fim de vida",
                    tone="ok",
                )
            )
        else:
            cards.append(
                KeyFigure(
                    label="CO₂ da peça",
                    value="não avaliado",
                    hint=(
                        "informe a massa da peça"
                        if inputs.part_mass_kg is None
                        else "faltam fatores no catálogo"
                    ),
                    tone="na",
                )
            )
        return cards

    @staticmethod
    def _lights(
        result: RunResultOut,
        recommended: Recommendation | None,
        inputs: LaudoInputs,
        cost: CostCurvesOut | None,
        footprints: list[PartFootprintOut],
        processes: list,
    ) -> list[Light]:
        lights: list[Light] = []
        steps = result.funnel
        status = "ok" if recommended is not None else "na"
        for step in steps[:MAX_LIMIT_LIGHTS]:
            lights.append(
                Light(
                    label=step.label,
                    status=status,
                    detail=(
                        f"{_plural(step.remaining, 'material segue', 'materiais seguem')} "
                        f"após este limite, de {format_br(result.initial_count)}"
                    ),
                )
            )
        if len(steps) > MAX_LIMIT_LIGHTS:
            rest = len(steps) - MAX_LIMIT_LIGHTS
            lights.append(
                Light(
                    label=f"Mais {_plural(rest, 'limite', 'limites')} do estudo",
                    status=status,
                    detail="todos listados no anexo técnico (Limites e funil)",
                )
            )
        if not steps:
            lights.append(
                Light(label="Limites do estudo", status="na", detail="o estudo não tem limites")
            )
        ranking = result.ranking
        if ranking is not None:
            if ranking.excluded:
                lights.append(
                    Light(
                        label="Dados para a classificação",
                        status="warn",
                        detail=(
                            f"{_plural(len(ranking.excluded), 'candidato ficou', 'candidatos ficaram')} "
                            "fora da classificação por dado ausente"
                        ),
                    )
                )
            else:
                lights.append(
                    Light(
                        label="Dados para a classificação",
                        status="ok",
                        detail="todos os candidatos tinham os dados dos critérios",
                    )
                )
            if ranking.sensitivity:
                changed = [s for s in ranking.sensitivity if s.changed]
                total = len(ranking.sensitivity)
                lights.append(
                    Light(
                        label="Estabilidade da recomendação",
                        status="warn" if changed else "ok",
                        detail=(
                            f"o 1º lugar muda em {len(changed)} de {_plural(total, 'cenário', 'cenários')} de peso"
                            if changed
                            else f"o 1º lugar se mantém nos {_plural(total, 'cenário', 'cenários')} de peso"
                        ),
                    )
                )
        if result.universe == "material" and recommended is not None:
            lights.append(
                Light(
                    label="Fabricação",
                    status="ok" if processes else "warn",
                    detail=(
                        f"{_plural(len(processes), 'processo compatível', 'processos compatíveis')} no catálogo"
                        if processes
                        else "nenhum processo compatível cadastrado"
                    ),
                )
            )
            first_point = None
            if cost is not None:
                first_point = next(
                    (c.current for c in cost.curves if c.material_name == recommended.name), None
                )
            lights.append(
                Light(
                    label="Custo por peça",
                    status="ok" if first_point is not None else "na",
                    detail=(
                        f"estimado no lote de {format_br(cost.batch_size)} peças"
                        if first_point is not None and cost is not None
                        else (
                            "informe a massa da peça para estimar"
                            if inputs.part_mass_kg is None
                            else "o catálogo não tem os dados econômicos deste material"
                        )
                    ),
                )
            )
            footprint = footprints[0] if footprints else None
            if footprint is None:
                eco = Light(
                    label="Impacto ambiental",
                    status="na",
                    detail="informe a massa da peça para estimar",
                )
            elif footprint.total_carbon is not None:
                eco = Light(
                    label="Impacto ambiental",
                    status="ok",
                    detail="energia e CO₂ de material, fabricação e fim de vida estimados",
                )
            else:
                eco = Light(
                    label="Impacto ambiental",
                    status="warn" if not footprint.reason else "na",
                    detail=footprint.reason
                    or "uma fase não pôde ser calculada: faltam fatores no catálogo",
                )
            lights.append(eco)
        return lights

    @staticmethod
    def _donut(lights: list[Light]) -> str:
        counts = {
            key: sum(1 for light in lights if light.status == key)
            for key in ("ok", "warn", "fail", "na")
        }
        words = {"ok": "Atende", "warn": "Atenção", "fail": "Não atende", "na": "Não avaliado"}
        segments = [
            DonutSegment(label=words[key], value=count, status=key)
            for key, count in counts.items()
            if count
        ]
        return render_donut(
            DonutFigure(
                title="Verificações atendidas",
                segments=segments,
                centre=f"{counts['ok']} de {len(lights)}",
                centre_caption="atendidas",
                description=(
                    f"{counts['ok']} de {len(lights)} verificações atendidas, "
                    f"{counts['warn']} com atenção, {counts['fail']} não atendidas e "
                    f"{counts['na']} não avaliadas."
                ),
            )
        )

    @staticmethod
    def _ranking_mini(result: RunResultOut, finalists: list[_Finalist]) -> str:
        ranking = result.ranking
        if ranking is not None and ranking.ranked:
            ranked = sorted(ranking.ranked, key=lambda r: (r.rank, r.name))[:6]
            bars = [
                HBar(label=f"{r.rank}º {r.name}", value=r.score, highlighted=r.rank == 1)
                for r in ranked
            ]
            return render_hbars(
                HBarFigure(
                    title="Candidatos ranqueados",
                    unit="",
                    bars=bars,
                    caption=(
                        f"Pontuação por {METHOD_LABELS.get(ranking.method, ranking.method)}; "
                        f"{_plural(len(ranking.ranked), 'candidato classificado', 'candidatos classificados')}."
                    ),
                    description=(
                        "Barras horizontais com a pontuação dos primeiros colocados, "
                        "do maior para o menor."
                    ),
                )
            )
        if result.index is not None and finalists:
            bars = [
                HBar(label=f"{f.rank}º {f.name}", value=f.index_value, highlighted=f.rank == 1)
                for f in finalists
            ]
            return render_hbars(
                HBarFigure(
                    title="Candidatos pelo índice de desempenho",
                    unit="",
                    bars=bars,
                    caption=result.index.name or result.index.expression,
                    description="Barras horizontais com o índice dos primeiros colocados.",
                )
            )
        return ""

    @staticmethod
    def _why(
        result: RunResultOut,
        finalists: list[_Finalist],
        recommended: Recommendation | None,
        cost: CostCurvesOut | None,
        footprints: list[PartFootprintOut],
    ) -> list[str]:
        """Short sentences, each one a fact the run already states."""
        if recommended is None or not finalists:
            return []
        lines: list[str] = []
        first = finalists[0]
        ranking = result.ranking
        if ranking is not None and ranking.ranked:
            method = METHOD_LABELS.get(ranking.method, ranking.method)
            lines.append(
                f"Ficou em 1º lugar entre {_plural(len(ranking.ranked), 'candidato classificado', 'candidatos classificados')} por {method}."
            )
            top = next((r for r in ranking.ranked if r.record_id == first.record_id), None)
            if top is not None and top.contributions:
                leading = sorted(top.contributions, key=lambda c: (-c.contribution, c.label))[:2]
                names = [c.label for c in leading]
                if len(names) == 1:
                    lines.append(f"O critério que mais pesou na pontuação foi {names[0]}.")
                else:
                    lines.append(
                        f"Os critérios que mais pesaram na pontuação foram {_join(names)}."
                    )
        if result.funnel:
            lines.append(
                f"Atende a {_plural(len(result.funnel), 'limite', 'limites')} do estudo, "
                f"que deixaram {format_br(result.final_count)} de {format_br(result.initial_count)} materiais."
            )
        index = result.index
        if index is not None and first.index_value is not None:
            defined = [c.index_value for c in result.candidates if c.index_value is not None]
            best = max(defined) if index.goal == "maximize" else min(defined)
            name = index.name or "índice de desempenho"
            if first.index_value == best:
                lines.append(f"Tem o melhor valor de {name} entre os candidatos.")
        if ranking is not None and ranking.sensitivity:
            if not any(s.changed for s in ranking.sensitivity):
                lines.append("Continua em 1º quando os pesos dos critérios mudam.")
        if cost is not None:
            priced = [(c.current.cost, c.material_id) for c in cost.curves if c.current is not None]
            if len(priced) > 1 and min(priced)[1] == first.record_id:
                lines.append("Tem o menor custo por peça entre os finalistas, no lote informado.")
        carbons = [
            (f.total_carbon, f.material_id) for f in footprints if f.total_carbon is not None
        ]
        if len(carbons) > 1 and min(carbons)[1] == first.record_id:
            lines.append("Tem a menor pegada de CO₂ entre os finalistas avaliados.")
        return lines[:5]

    @staticmethod
    def _scope(
        result: RunResultOut,
        recommended: Recommendation | None,
        cost: CostCurvesOut | None,
        footprints: list[PartFootprintOut],
        processes: list,
    ) -> list[ScopeItem]:
        material = result.universe == "material"
        priced = cost is not None and any(c.current is not None for c in cost.curves)
        footprint = footprints[0] if footprints else None
        return [
            ScopeItem("Seleção", "ok" if result.final_count else "warn"),
            ScopeItem("Custo", "ok" if priced else "na"),
            ScopeItem(
                "Impacto ambiental",
                "ok" if footprint is not None and footprint.total_carbon is not None else "na",
            ),
            ScopeItem("Fabricação", "ok" if material and processes else "na"),
            ScopeItem(
                "Dimensionamento",
                "na",
                "o estudo não registra casos de carga; dimensione a peça na ferramenta Dimensionar",
            ),
        ]

    # --- the sections --------------------------------------------------------

    def _comparison_section(
        self, study, result: RunResultOut, finalists: list[_Finalist]
    ) -> LaudoSection:
        section = LaudoSection(
            key="comparacao",
            title="Comparação dos finalistas",
            table_first=True,
            lead=(
                (
                    "O único finalista, com seus valores. "
                    if len(finalists) == 1
                    else f"Os {len(finalists)} primeiros colocados lado a lado. "
                )
                + "Valores normalizados pelo próprio método de classificação: mais perto da borda é melhor."
                if finalists
                else ""
            ),
        )
        if not finalists:
            section.unavailable = "Nenhum candidato atendeu a todos os limites do estudo."
            return section
        ranking = result.ranking
        if ranking is not None and ranking.ranked:
            by_id = {r.record_id: r for r in ranking.ranked}
            labels: list[str] = []
            for contribution in by_id[finalists[0].record_id].contributions:
                labels.append(contribution.label)
            series = []
            values_seen: list[float] = []
            for position, finalist in enumerate(finalists):
                row = by_id.get(finalist.record_id)
                values: list[float | None] = []
                for label in labels:
                    match = next(
                        (c for c in (row.contributions if row else []) if c.label == label), None
                    )
                    values.append(match.normalized if match else None)
                values_seen += [v for v in values if v is not None]
                series.append(
                    RadarSeries(label=finalist.name, values=values, highlighted=position == 0)
                )
            if len(labels) >= 3:
                section.figures.append(
                    render_radar(
                        RadarFigure(
                            title="Desempenho normalizado por critério",
                            axes=labels,
                            series=series,
                            minimum=min([0.0, *values_seen]),
                            maximum=max([1.0, *values_seen]),
                            caption="Escala do método de classificação: 1 é o melhor valor entre os candidatos.",
                            description=(
                                "Radar com um eixo por critério e um polígono por finalista; "
                                "os valores estão na tabela de contribuições do anexo."
                            ),
                        )
                    )
                )
            else:
                bars = [
                    HBar(
                        label=f"{s.label} — {label}",
                        value=s.values[i],
                        highlighted=s.highlighted,
                    )
                    for s in series
                    for i, label in enumerate(labels)
                ]
                section.figures.append(
                    render_hbars(
                        HBarFigure(
                            title="Desempenho normalizado por critério",
                            unit="",
                            bars=bars,
                            caption="Escala do método de classificação: 1 é o melhor valor entre os candidatos.",
                            description="Barras com o valor normalizado de cada critério por finalista.",
                        )
                    )
                )
        map_svg = self.export._map_figure(study, result)
        if map_svg:
            section.figures.append(map_svg)
        subject = "Processo" if result.universe == "process" else "Material"
        section.table = Sheet(
            name="Finalistas",
            header=["Posição", subject, "Classe", "Pontuação", "Índice"],
            rows=[
                [
                    f"{f.rank}º" if f.rank is not None else "—",
                    f.name,
                    f.class_name or "—",
                    format_br(f.score, missing="—") if ranking is not None else "—",
                    (
                        format_br(f.index_value, missing="indefinido")
                        if result.index is not None
                        else "—"
                    ),
                ]
                for f in finalists
            ],
        )
        return section

    def _cost_section(
        self,
        finalists: list[_Finalist],
        records: dict,
        inputs: LaudoInputs,
        cost: CostCurvesOut | None,
    ) -> LaudoSection:
        section = LaudoSection(key="custo", title="Custo", paired=False)
        if not finalists:
            section.unavailable = "Sem finalistas para estimar."
            return section
        if cost is None:
            section.unavailable = (
                "Informe a massa da peça (e o lote) no formulário do laudo para estimar o custo "
                "por peça e a curva por lote dos finalistas."
            )
            catalogue = self._catalogue_cost_bars(finalists, records)
            if catalogue:
                section.figures.append(catalogue)
                section.notes.append(MONETARY_UNIT_NOTE)
            return section
        batch = cost.batch_size
        section.lead = (
            f"Custo por peça de {format_br(inputs.part_mass_kg)} kg, no lote de {format_br(batch)} "
            "peças, pelo processo mais econômico de cada material (estimador de custo do app)."
        )
        names = {f.record_id: f.name for f in finalists}
        bars = []
        for position, curve in enumerate(cost.curves):
            bars.append(
                HBar(
                    label=curve.material_name or names.get(curve.material_id, "?"),
                    value=curve.current.cost if curve.current is not None else None,
                    highlighted=position == 0,
                    note=curve.current.process_name if curve.current is not None else "",
                )
            )
            if curve.current is None:
                section.notes.append(
                    f"{curve.material_name or names.get(curve.material_id, '?')}: "
                    f"{curve.reason or 'não estimado'}"
                )
        section.figures.append(
            render_hbars(
                HBarFigure(
                    title=f"Custo por peça no lote de {format_br(batch)} peças",
                    unit=MONEY,
                    bars=bars,
                    caption="Processo de menor custo de cada material no lote informado.",
                    description="Barras com o custo por peça de cada finalista no lote informado.",
                )
            )
        )
        if cost.domain is not None:
            series = [
                CurveSeries(
                    label=curve.material_name or names.get(curve.material_id, "?"),
                    points=[(p.batch_size, p.cost) for p in curve.points],
                    current=(
                        (curve.current.batch_size, curve.current.cost) if curve.current else None
                    ),
                    highlighted=position == 0,
                )
                for position, curve in enumerate(cost.curves)
                if curve.points
            ]
            section.figures.append(
                render_curves(
                    CurveFigure(
                        title="Custo por peça conforme o lote",
                        x=Axis(
                            label="Lote (peças)",
                            scale="log",
                            min_value=cost.domain.x[0],
                            max_value=cost.domain.x[1],
                        ),
                        y=Axis(
                            label=f"Custo por peça ({MONEY})",
                            scale="log",
                            min_value=cost.domain.y[0],
                            max_value=cost.domain.y[1],
                        ),
                        series=series,
                        caption="Círculo: o lote informado. Escalas logarítmicas.",
                        description=(
                            "Curvas de custo por peça em função do lote, uma por finalista, "
                            "com o lote informado marcado."
                        ),
                    )
                )
            )
        section.notes += [
            (
                f"Premissas do estimador: amortização em {format_br(DEFAULT_WRITE_OFF_YEARS)} anos, "
                f"fator de carga {format_br(DEFAULT_LOAD_FACTOR)}."
                + (
                    ""
                    if inputs.batch_size is not None
                    else f" Lote não informado: usado o lote padrão de {format_br(DEFAULT_BATCH_SIZE)} peças."
                )
            ),
            MONETARY_UNIT_NOTE,
        ]
        return section

    @staticmethod
    def _catalogue_cost_bars(finalists: list[_Finalist], records: dict) -> str:
        """Cost per mass as catalogued, when the part mass is not known."""
        bars: list[HBar] = []
        unit = ""
        for position, finalist in enumerate(finalists):
            material = records.get(finalist.record_id)
            value = None
            for row in getattr(material, "property_values", []) or []:
                if row.property_definition.slug != MATERIAL_COST_SLUG:
                    continue
                if not row.is_missing and row.normalized_value is not None:
                    value = float(row.normalized_value)
                    unit = pretty_unit(row.canonical_unit or row.property_definition.canonical_unit)
            bars.append(HBar(label=finalist.name, value=value, highlighted=position == 0))
        if all(bar.value is None for bar in bars):
            return ""
        return render_hbars(
            HBarFigure(
                title="Custo por massa no catálogo",
                unit=unit,
                bars=bars,
                caption="Valor cadastrado do material; não inclui fabricação.",
                description="Barras com o custo por massa cadastrado de cada finalista.",
            )
        )

    @staticmethod
    def _waterfall(waterfall: WaterfallOut, title: str) -> str:
        bars = [
            WaterfallBar(
                label=step.label,
                value=step.value,
                start=step.start,
                end=step.end,
                reason=step.reason,
            )
            for step in waterfall.steps
        ]
        total = waterfall.total
        bars.append(
            WaterfallBar(
                label="Total",
                value=total.value,
                start=total.start,
                end=total.end,
                reason=total.reason,
                is_total=True,
            )
        )
        return render_waterfall(
            WaterfallFigure(
                title=title,
                unit=waterfall.unit,
                bars=bars,
                domain=waterfall.domain,
                caption="Cada barra parte do total acumulado; crédito de reciclagem desce.",
                description=(
                    f"Cascata de {waterfall.unit} por fase (material, manufatura, fim de vida) "
                    "e o total."
                ),
            )
        )

    def _eco_section(self, footprints: list[PartFootprintOut], inputs: LaudoInputs) -> LaudoSection:
        section = LaudoSection(key="eco", title="Impacto ambiental")
        if not footprints:
            section.unavailable = (
                "Informe a massa da peça no formulário do laudo para estimar energia e CO₂ "
                "de material, fabricação e fim de vida."
            )
            return section
        first = footprints[0]
        if first.reason:
            section.unavailable = f"{first.material_name or 'Material'}: {first.reason}"
        section.lead = (
            f"Peça de {format_br(inputs.part_mass_kg)} kg: energia e CO₂ de material, fabricação "
            "e fim de vida (auditoria ecológica do app). Transporte e uso não entram: o estudo "
            "não declara trajeto nem uso — avalie o ciclo completo na ferramenta Eco."
        )
        if not first.reason:
            section.cards = [
                KeyFigure(
                    label="CO₂ da peça",
                    value=format_br(first.total_carbon, missing="não calculado"),
                    unit="kg CO₂" if first.total_carbon is not None else "",
                    tone="ok" if first.total_carbon is not None else "warn",
                ),
                KeyFigure(
                    label="Energia da peça",
                    value=format_br(first.total_energy, missing="não calculada"),
                    unit="MJ" if first.total_energy is not None else "",
                    tone="ok" if first.total_energy is not None else "warn",
                ),
            ]
            if first.carbon_waterfall is not None:
                section.figures.append(
                    self._waterfall(first.carbon_waterfall, f"CO₂ por fase — {first.material_name}")
                )
            if first.energy_waterfall is not None:
                section.figures.append(
                    self._waterfall(
                        first.energy_waterfall, f"Energia por fase — {first.material_name}"
                    )
                )
        if len(footprints) > 1:
            section.figures.append(
                render_hbars(
                    HBarFigure(
                        title="CO₂ da peça por finalista",
                        unit="kg CO₂",
                        bars=[
                            HBar(
                                label=f.material_name or "?",
                                value=f.total_carbon,
                                highlighted=position == 0,
                            )
                            for position, f in enumerate(footprints)
                        ],
                        caption="Material, fabricação e fim de vida; ausente quando falta fator no catálogo.",
                        description="Barras com o CO₂ estimado da peça de cada finalista.",
                    )
                )
            )
        for footprint in footprints:
            if footprint.process_name:
                choice = f" ({footprint.process_choice})" if footprint.process_choice else ""
                section.notes.append(
                    f"{footprint.material_name}: processo considerado {footprint.process_name}{choice}; "
                    f"fim de vida {(footprint.end_of_life_label or 'reciclagem').lower()}."
                )
            elif footprint.reason and footprint is not first:
                section.notes.append(f"{footprint.material_name}: {footprint.reason}")
            for phase in footprint.phases:
                if phase.carbon is None and phase.carbon_reason:
                    section.notes.append(
                        f"{footprint.material_name} — {phase.label}: {phase.carbon_reason}"
                    )
        return section

    @staticmethod
    def _fabrication_section(
        finalists: list[_Finalist],
        recommended: Recommendation | None,
        processes: list,
        estimate: CostResultOut | None,
    ) -> LaudoSection:
        section = LaudoSection(key="fabricacao", title="Fabricação")
        if recommended is None or not finalists:
            section.unavailable = "Sem material recomendado, não há processo a indicar."
            return section
        if not processes:
            section.unavailable = (
                f"Nenhum processo compatível com {recommended.name} está cadastrado no catálogo."
            )
            return section
        section.lead = f"Processos do catálogo capazes de fabricar {recommended.name}."
        groups: dict[str, list[str]] = {}
        for process in processes:
            groups.setdefault(process.process_class.name, []).append(process.name)
        section.chips = sorted(groups.items())
        section.cards = [
            KeyFigure(
                label="Processos compatíveis",
                value=format_br(len(processes)),
                hint=_plural(len(groups), "família", "famílias"),
                tone="brand",
            )
        ]
        if estimate is not None and estimate.costed:
            section.cards.append(
                KeyFigure(
                    label="Mais econômico no lote",
                    value=estimate.costed[0].process_name,
                    hint=f"{format_br(estimate.costed[0].terms.total)} {MONEY} por peça",
                    tone="ok",
                )
            )
            section.figures.append(
                render_hbars(
                    HBarFigure(
                        title=f"Custo por peça por processo — lote de {format_br(estimate.batch_size)}",
                        unit=MONEY,
                        bars=[
                            HBar(
                                label=item.process_name,
                                value=item.terms.total,
                                highlighted=item.rank == 1,
                            )
                            for item in estimate.costed
                        ],
                        caption="Estimador de custo do app, com as mesmas premissas da seção Custo.",
                        description="Barras com o custo por peça de cada processo compatível.",
                    )
                )
            )
            for item in estimate.uncosted:
                section.notes.append(f"{item.process_name}: {item.reason}")
        return section

    # --- issuing -------------------------------------------------------------

    def issue(self, study_id: int, project_id: int, inputs: LaudoInputs) -> IssuedReport:
        missing = [
            label for name, label in REQUIRED_TO_ISSUE.items() if getattr(inputs, name) is None
        ]
        if missing:
            raise ValidationError("Para emitir o laudo, preencha: " + ", ".join(missing) + ".")
        version = self.issued.next_version(project_id, study_id)
        doc = self.document(study_id, project_id, inputs, version=version)
        unsealed = render_laudo(doc, draft=False)
        digest = laudo_digest(unsealed)
        url = verify_url(digest)
        report = IssuedReport(
            project_id=project_id,
            study_id=study_id,
            issued_by_id=self.viewer_id,
            study_name=doc.study_name,
            version=version,
            engineer_name=inputs.engineer_name or "",
            engineer_title=inputs.engineer_title,
            engineer_registration=inputs.engineer_registration,
            art_number=inputs.art_number,
            city=inputs.city,
            issue_date=inputs.issue_date,
            client_name=inputs.client_name,
            client_project=inputs.client_project,
            inputs=inputs.model_dump(mode="json"),
            html="",
            content_sha256=digest,
            issued_at=datetime.now(UTC),
        )
        self.issued.add(report)
        self.db.flush()
        report.html = seal_document(
            unsealed,
            Seal(
                version=version,
                digest=digest,
                verify_url=url,
                qr_svg=qr_svg(url),
                issued_at=report.issued_at,
            ),
        )
        self.issued.commit()
        return report

    def versions(self, study_id: int, project_id: int) -> list[IssuedReportOut]:
        self._require_study(study_id, project_id)
        return [self.out(r) for r in self.issued.list_for_study(project_id, study_id)]

    def version(self, study_id: int, project_id: int, version: int) -> IssuedReport:
        self._require_study(study_id, project_id)
        report = self.issued.get_version(project_id, study_id, version)
        if report is None:
            raise NotFoundError(f"Versão {version} do laudo não encontrada.")
        return report

    def _require_study(self, study_id: int, project_id: int) -> None:
        if self.export.selection_repo.get_study(study_id, project_id) is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

    @staticmethod
    def out(report: IssuedReport) -> IssuedReportOut:
        return IssuedReportOut(
            id=report.id,
            study_id=report.study_id,
            study_name=report.study_name,
            version=report.version,
            engineer_name=report.engineer_name,
            engineer_title=report.engineer_title,
            engineer_registration=report.engineer_registration,
            art_number=report.art_number,
            city=report.city,
            issue_date=report.issue_date,
            client_name=report.client_name,
            client_project=report.client_project,
            content_sha256=report.content_sha256,
            short_code=short_code(report.content_sha256),
            verify_url=verify_url(report.content_sha256),
            issued_at=report.issued_at,
        )


def verify_code(db: Session, code: str) -> IssuedReportVerificationOut:
    """The public check: the full digest, or its first 12+ hex digits (dashes allowed)."""
    cleaned = code.replace("-", "").strip().lower()
    if not 12 <= len(cleaned) <= 64 or any(c not in "0123456789abcdef" for c in cleaned):
        raise NotFoundError("Código de verificação não encontrado.")
    matches = IssuedReportRepository(db).find_by_code(cleaned)
    if len(matches) != 1:
        raise NotFoundError("Código de verificação não encontrado.")
    report = matches[0]
    return IssuedReportVerificationOut(
        study_name=report.study_name,
        version=report.version,
        issue_date=report.issue_date,
        issued_at=report.issued_at,
        engineer_name=report.engineer_name,
        engineer_title=report.engineer_title,
        engineer_registration=report.engineer_registration,
        content_sha256=report.content_sha256,
        short_code=short_code(report.content_sha256),
    )
