"""The catalogue panel: what is in the catalogue, and how much of it is real.

This service answers one question in several shapes — *how complete is this
data?* — and it is the screen where the project's third principle stops being a
rule in a document and becomes something a reader can see. A (material,
property) slot is in exactly one of three states:

``filled``
    a row exists and carries a normalised number.
``declared_missing``
    a row exists and says, explicitly, that the value is absent. Somebody looked
    and recorded that they found nothing. That is evidence.
``not_recorded``
    no row exists at all. Nobody has looked yet. That is a to-do list.

Reporting the last two as one number would be the ordinary thing to do and would
throw away the distinction this application was built to make.

Nothing here reaches for the ORM directly and nothing formats for display: the
counting is in :mod:`app.repositories.dashboard_repository`, the arithmetic is in
:mod:`app.calculations.statistics`, and pt-BR formatting is the client's job.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from app.calculations.expression_render import friendly_label, symbol_latex
from app.calculations.expressions import ExpressionError, safe_variable, variables_in
from app.calculations.performance import evaluate_index
from app.calculations.statistics import (
    MIN_PAIRS,
    average_ranks,
    five_number_summary,
    histogram,
    mean,
    pearson,
    share,
    spearman,
)
from app.calculations.treemap import Rect, squarify
from app.config import settings as app_settings
from app.domain.dashboard_filters import DashboardFilters
from app.domain.depth_profile import property_min_level
from app.domain.display_units import reading_for
from app.domain.errors import NotFoundError, ValidationError
from app.exporters.report import REPRODUCIBILITY_NOTICE, Report, Sheet
from app.models.enums import BetterDirection, DataQuality
from app.models.property_definition import PropertyDefinition
from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard import (
    ActivityOut,
    AIDayOut,
    AIUsageOut,
    AuditEventOut,
    BoxOut,
    ClassCoverageOut,
    CompositionOut,
    CorrelationCellOut,
    CorrelationOut,
    CorrelationPropertyOut,
    Coverage,
    DistributionOut,
    FiltersOut,
    HistogramBinOut,
    MonthCountOut,
    OverviewOut,
    ProcessClassUseOut,
    ProcessFamilyOut,
    ProcessPanelOut,
    ProcessUseOut,
    PropertyCoverageOut,
    PropertyStatsOut,
    QualitySliceOut,
    RankedMaterialOut,
    SourceQualityOut,
    SourcesOut,
    TopOut,
    TreemapCellOut,
)

# How many of the least-covered properties the panel names outright. Five fits
# on one screen next to the figure; a longer list stops being a call to action
# and becomes a second copy of the per-property table below it.
GAP_LIMIT = 5

#: The treemap's box, in data units. A 16:9 box: the client scales it to the
#: card's width and keeps the ratio, so the cells stay as square as laid out.
TREEMAP_WIDTH = 160.0
TREEMAP_HEIGHT = 90.0

#: Top-N bounds. Ten is what "Comparar top 10" sends; fifty is a long table.
TOP_DEFAULT = 10
TOP_MAX = 50

#: How many properties the correlation matrix reads when the client names none:
#: the best-covered ones visible at the level. Twelve fit a phone's width as a
#: readable grid; the client may ask for every property explicitly.
CORRELATION_DEFAULT = 12
CORRELATION_MAX = 60

#: How far back "Minha atividade" looks.
ACTIVITY_MONTHS = 12
AI_DAYS = 14
RECENT_EVENTS = 15


def _coverage(filled: int, declared_missing: int, slots: int) -> Coverage:
    """Assemble a coverage record, letting an impossible count fail loudly.

    ``not_recorded`` is derived, and it can only go negative if the catalogue
    holds more value rows than there are (material × property) pairs — which the
    unique constraint on that pair makes impossible. It is deliberately *not*
    clamped: if the impossible ever happens, the schema's ``ge=0`` turns it into
    a 500 that someone investigates, instead of a plausible-looking percentage
    nobody questions.
    """
    return Coverage(
        filled=filled,
        declared_missing=declared_missing,
        not_recorded=slots - filled - declared_missing,
        slots=slots,
        filled_pct=share(filled, slots),
    )


class DashboardService:
    """Read-only aggregation over the catalogue."""

    def __init__(
        self,
        db: Session,
        viewer_id: int | None = None,
        unit_choices: Mapping[str, str] | None = None,
        filters: DashboardFilters | None = None,
    ) -> None:
        self.db = db
        self.viewer_id = viewer_id
        #: Em que unidade este leitor pediu para ler cada grandeza (D-70).
        self.unit_choices: Mapping[str, str] = unit_choices or {}
        self.filters = filters or DashboardFilters()
        self.repo = DashboardRepository(db, viewer_id, self.filters)

    def _all_properties(self) -> list[PropertyDefinition]:
        if not hasattr(self, "_property_cache"):
            self._property_cache = self.repo.list_properties()
        return self._property_cache

    def _properties(self) -> list[PropertyDefinition]:
        """Property definitions visible at the filtered level (D-127, D-193)."""
        return [p for p in self._all_properties() if self.filters.shows_property(p.slug)]

    def _filters_out(self, materials: int | None = None) -> FiltersOut:
        if materials is None:
            materials, _ = self.repo.count_materials()
        return FiltersOut(
            class_slug=self.filters.class_slug,
            subclass=self.filters.subclass,
            level=int(self.filters.level),
            demo=self.filters.demo,
            materials=materials,
        )

    def overview(self) -> OverviewOut:
        """Totals, provenance mix, per-class and per-property coverage."""
        materials, demo_materials = self.repo.count_materials()
        classes = self.repo.count_classes()
        properties = self._properties()
        property_count = len(properties)
        visible = {p.slug for p in properties}
        # None when the level hides nothing, so the unfiltered panel keeps the
        # exact queries it always ran.
        level_ids = (
            {p.id for p in properties} if len(properties) < len(self._all_properties()) else None
        )

        by_class_counts = self.repo.value_counts_by_class(level_ids)
        by_property_counts = self.repo.value_counts_by_property()
        quality_counts = self.repo.quality_counts(level_ids)

        # The denominator of the whole panel: every material could carry every
        # property, and the gap between that and what exists is the story.
        total_slots = materials * property_count
        total_filled = sum(
            filled for slug, (filled, _) in by_property_counts.items() if slug in visible
        )
        total_declared = sum(
            missing for slug, (_, missing) in by_property_counts.items() if slug in visible
        )
        total = _coverage(total_filled, total_declared, total_slots)

        by_class = [
            ClassCoverageOut(
                slug=slug,
                name=name,
                materials=count,
                coverage=_coverage(
                    *by_class_counts.get(slug, (0, 0)),
                    slots=count * property_count,
                ),
            )
            for slug, name, count in self.repo.class_material_counts()
            # A filtered panel lists the classes it kept; the unfiltered one
            # still names an empty class, a fact about the taxonomy.
            if count > 0 or not self.filters.narrows_materials
        ]

        by_property = [
            PropertyCoverageOut(
                slug=definition.slug,
                name=definition.name,
                category=definition.category,
                canonical_unit=definition.canonical_unit,
                # One slot per material: every material either has this property
                # or does not.
                coverage=_coverage(
                    *by_property_counts.get(definition.slug, (0, 0)),
                    slots=materials,
                ),
            )
            for definition in properties
        ]

        return OverviewOut(
            materials=materials,
            demo_materials=demo_materials,
            classes=classes,
            properties=property_count,
            coverage=total,
            by_quality=self._quality_slices(quality_counts, total),
            by_class=by_class,
            by_property=by_property,
            gaps=self._gaps(by_property),
            filters=self._filters_out(materials),
        )

    def distribution(self, property_slug: str) -> DistributionOut:
        """One property's five-number summary, per class, in the reading unit.

        Os quartis são computados sobre o **canônico** e convertidos no fim: uma
        conversão linear preserva a ordem, então a caixa sai idêntica em forma e
        muda só de escala — converter antes de ordenar daria o mesmo resultado
        por mais trabalho, e converter entre os dois abriria a porta para a
        mediana de uma unidade ao lado do quartil de outra.
        """
        definition = self.repo.get_property(property_slug)
        if definition is None:
            raise NotFoundError(f"Propriedade não encontrada: {property_slug}")
        reading = reading_for(
            canonical_unit=definition.canonical_unit,
            display_unit=definition.display_unit,
            accepted_units=definition.accepted_units or [],
            requested=self.unit_choices.get(definition.slug),
        )

        grouped: dict[str, list[float]] = defaultdict(list)
        names: dict[str, str] = {}
        for class_slug, class_name, value in self.repo.values_for_property(property_slug):
            grouped[class_slug].append(value)
            names[class_slug] = class_name

        boxes: list[BoxOut] = []
        for class_slug, values in grouped.items():
            summary = five_number_summary(values)
            # Unreachable while `grouped` only gains keys alongside a value, and
            # kept because `five_number_summary` is the one function here allowed
            # to say "nothing to summarise" — swallowing that would be the bug.
            if summary is None:
                continue
            boxes.append(
                BoxOut(
                    class_slug=class_slug,
                    class_name=names[class_slug],
                    count=summary.count,
                    # Os cinco na unidade de leitura: a figura e a tabela que a
                    # acompanha leem a mesma grandeza (D-31, D-70). Conversão
                    # linear preserva a ordem, então a caixa continua válida.
                    minimum=reading.value(summary.minimum),
                    q1=reading.value(summary.q1),
                    median=reading.value(summary.median),
                    q3=reading.value(summary.q3),
                    maximum=reading.value(summary.maximum),
                )
            )

        # Tallest median first: the figure is read as a ranking of classes, and
        # alphabetical order would hide the comparison it exists to make. Ties
        # break on the class name so the order is stable between requests.
        boxes.sort(key=lambda box: (-box.median, box.class_name))

        # Only classes that actually hold materials. A class with no materials at
        # all is not "missing this property" — it is simply empty, and saying
        # otherwise would blame the property for a gap in the taxonomy.
        without = [
            name
            for slug, name, count in self.repo.class_material_counts()
            if count > 0 and slug not in grouped
        ]

        return DistributionOut(
            property_slug=definition.slug,
            property_name=definition.name,
            category=definition.category,
            canonical_unit=definition.canonical_unit,
            display_unit=reading.unit,
            allows_log_scale=definition.allows_log_scale,
            boxes=boxes,
            classes_without_data=without,
        )

    # --- Painel rico (D-193) ----------------------------------------------

    def composition(self) -> CompositionOut:
        """Materials per class and subclass, laid out as a two-level treemap.

        Classes are sorted largest first and squarified into the box; each
        class's subclasses are then squarified inside its own rectangle. Both
        layouts happen here (ADR 0004) — the client draws rectangles.
        """
        rows = self.repo.composition_counts()
        total = sum(count for *_, count in rows)
        by_class: dict[str, tuple[str, list[tuple[str | None, int]]]] = {}
        for slug, name, subclass, count in rows:
            by_class.setdefault(slug, (name, []))[1].append((subclass, count))

        classes = sorted(by_class.items(), key=lambda kv: (-sum(c for _, c in kv[1][1]), kv[1][0]))
        box = Rect(0.0, 0.0, TREEMAP_WIDTH, TREEMAP_HEIGHT)
        class_rects = squarify([sum(c for _, c in subs) for _, (_, subs) in classes], box)

        cells = []
        for (slug, (name, subs)), rect in zip(classes, class_rects, strict=True):
            class_count = sum(c for _, c in subs)
            cells.append(_cell(f"c:{slug}", 0, slug, name, None, class_count, total, rect))
            # Named subclasses largest first; the unnamed bucket last, so it
            # never takes the prominent corner.
            ordered = sorted(subs, key=lambda sc: (sc[0] is None, -sc[1], sc[0] or ""))
            for (subclass, count), sub_rect in zip(
                ordered, squarify([c for _, c in ordered], rect), strict=True
            ):
                cells.append(
                    _cell(
                        f"s:{slug}:{subclass or ''}",
                        1,
                        slug,
                        name,
                        subclass,
                        count,
                        total,
                        sub_rect,
                    )
                )
        return CompositionOut(
            filters=self._filters_out(total),
            width=TREEMAP_WIDTH,
            height=TREEMAP_HEIGHT,
            cells=cells,
        )

    def processes(self) -> ProcessPanelOut:
        """Processes per family and materials per process, any number of each.

        Five aggregate queries regardless of how many processes exist — the
        panel must not grow a query per process when the catalogue grows to the
        Ashby range (D-192).
        """
        materials, _ = self.repo.count_materials()
        families = {
            cid: (slug, name, parent) for cid, slug, name, parent in self.repo.process_classes()
        }

        def root_of(cid: int) -> int:
            seen: set[int] = set()
            while families[cid][2] is not None and cid not in seen:
                seen.add(cid)
                cid = families[cid][2]  # type: ignore[assignment]
            return cid

        processes = self.repo.active_processes()
        per_process = self.repo.material_counts_by_process()
        per_family = self.repo.material_counts_by_process_family()

        family_processes: dict[int, int] = defaultdict(int)
        for _, _, _, cid in processes:
            family_processes[cid] += 1

        family_out = []
        for cid, count in family_processes.items():
            slug, name, _ = families[cid]
            root = root_of(cid)
            family_out.append(
                ProcessFamilyOut(
                    slug=slug,
                    name=name,
                    root_slug=families[root][0],
                    root_name=families[root][1],
                    processes=count,
                    materials=per_family.get(cid, 0),
                )
            )
        family_out.sort(key=lambda f: (-f.processes, f.name))

        by_process = [
            ProcessUseOut(
                slug=slug,
                name=name,
                family_slug=families[cid][0],
                family_name=families[cid][1],
                materials=per_process.get(pid, 0),
                share_pct=share(per_process.get(pid, 0), materials),
            )
            for pid, slug, name, cid in processes
        ]
        by_process.sort(key=lambda p: (-p.materials, p.name))

        reach = self.repo.process_reach_by_material_class()
        by_class = [
            ProcessClassUseOut(
                class_slug=slug,
                class_name=name,
                materials=count,
                processes=reach.get(slug, (0, 0))[1],
            )
            for slug, name, count in self.repo.class_material_counts()
            if count > 0
        ]
        with_process = self.repo.materials_with_any_process()
        return ProcessPanelOut(
            filters=self._filters_out(materials),
            processes=len(processes),
            families=family_out,
            by_process=by_process,
            by_material_class=by_class,
            materials_with_process=with_process,
            materials_without_process=materials - with_process,
        )

    def sources(self) -> SourcesOut:
        """Provenance per source, over the properties visible at the level."""
        properties = self._properties()
        level_ids = (
            {p.id for p in properties} if len(properties) < len(self._all_properties()) else None
        )
        rows = self.repo.source_counts(level_ids)
        materials_by_source = self.repo.source_material_counts(level_ids)
        catalogue = self.repo.sources_by_id({sid for sid, *_ in rows if sid is not None})

        tallies: dict[int | None, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for sid, quality, missing, count, _ in rows:
            key = "declared_missing" if missing else quality.value.lower()
            tallies[sid][key] += count
        values_total = sum(t["medido"] + t["importado"] + t["estimado"] for t in tallies.values())
        out = []
        for sid, t in tallies.items():
            filled = t["medido"] + t["importado"] + t["estimado"]
            source = catalogue.get(sid) if sid is not None else None
            out.append(
                SourceQualityOut(
                    key=str(sid) if sid is not None else "sem-fonte",
                    label=source.label if source else None,
                    is_demo=bool(source.is_demo) if source else False,
                    license_label=source.license_label if source else None,
                    materials=materials_by_source.get(sid, 0),
                    values=filled,
                    medido=t["medido"],
                    importado=t["importado"],
                    estimado=t["estimado"],
                    declared_missing=t["declared_missing"],
                    share_pct=share(filled, values_total),
                )
            )
        out.sort(key=lambda s: (-s.values, s.label or "~"))
        return SourcesOut(filters=self._filters_out(), values=values_total, sources=out)

    def property_stats(self, property_slug: str) -> PropertyStatsOut:
        """Histogram, five-number summary, mean and gaps of one property."""
        definition = self._require_property(property_slug)
        reading = self._reading(definition)
        materials, _ = self.repo.count_materials()
        values = [v for _, _, v in self.repo.values_for_property(property_slug)]
        filled, missing = self.repo.property_counts(definition.id)
        summary = five_number_summary(values)
        bars = histogram(values, log=bool(definition.allows_log_scale))
        average = mean(values)

        def read(x: float | None) -> float | None:
            return None if x is None else reading.value(x)

        return PropertyStatsOut(
            filters=self._filters_out(materials),
            property_slug=definition.slug,
            property_name=definition.name,
            symbol_latex=symbol_latex(definition.symbol) if definition.symbol else None,
            category=definition.category,
            display_unit=reading.unit,
            better_direction=definition.better_direction.value,
            allows_log_scale=definition.allows_log_scale,
            log_bins=bars.log if bars else False,
            count=len(values),
            declared_missing=missing,
            not_recorded=materials - filled - missing,
            coverage_pct=share(filled, materials),
            minimum=read(summary.minimum if summary else None),
            q1=read(summary.q1 if summary else None),
            median=read(summary.median if summary else None),
            q3=read(summary.q3 if summary else None),
            maximum=read(summary.maximum if summary else None),
            mean=read(average),
            bins=[
                HistogramBinOut(
                    lower=reading.value(b.lower), upper=reading.value(b.upper), count=b.count
                )
                for b in (bars.bins if bars else ())
            ],
        )

    def top(
        self,
        *,
        property_slug: str | None = None,
        index_slug: str | None = None,
        n: int = TOP_DEFAULT,
        order: str = "melhor",
    ) -> TopOut:
        """The N best or worst materials by a property or a performance index.

        "Melhor" follows the property's ``better_direction`` (or the index's
        goal); a neutral property reads "melhor" as "maior". Ties break on the
        name so the list is stable. Materials without a value are counted and
        never ranked as zero (D-24).
        """
        if (property_slug is None) == (index_slug is None):
            raise ValidationError("Informe uma propriedade ou um índice, não os dois.")
        if order not in ("melhor", "pior"):
            raise ValidationError("Ordem deve ser 'melhor' ou 'pior'.")
        n = max(1, min(TOP_MAX, n))
        materials = {row[0]: row for row in self.repo.scoped_materials()}

        expression: str | None = None
        if property_slug is not None:
            definition = self._require_property(property_slug)
            reading = self._reading(definition)
            raw = {m: v for m, _, v in self.repo.numeric_values({definition.id}) if m in materials}
            scores = {m: reading.value(v) for m, v in raw.items()}
            higher = definition.better_direction != BetterDirection.LOWER
            kind, slug, label, unit = "property", definition.slug, definition.name, reading.unit
        else:
            index = self.repo.get_index(index_slug)  # type: ignore[arg-type]
            if index is None:
                raise NotFoundError(f"Índice não encontrado: {index_slug}")
            expression = index.expression
            try:
                used = variables_in(expression)
            except ExpressionError as exc:
                raise ValidationError(str(exc)) from exc
            by_var = {safe_variable(p.slug): p for p in self._all_properties()}
            needed = {by_var[v].id: v for v in used if v in by_var}
            per_material: dict[int, dict[str, float]] = defaultdict(dict)
            for m, pid, v in self.repo.numeric_values(set(needed)):
                per_material[m][needed[pid]] = v
            scores = {}
            for m in materials:
                evaluation = evaluate_index(expression, used, per_material.get(m, {}))
                if evaluation.value is not None:
                    scores[m] = evaluation.value
            higher = index.goal != "minimize"
            kind, slug, unit = "index", index.slug, None
            label = index.name or friendly_label(expression, self._all_properties())

        best_first = higher if order == "melhor" else not higher
        ranked = sorted(
            scores.items(),
            key=lambda kv: (-kv[1] if best_first else kv[1], materials[kv[0]][1]),
        )
        items = [
            RankedMaterialOut(
                rank=i + 1,
                material_id=m,
                name=materials[m][1],
                class_slug=materials[m][2],
                class_name=materials[m][3],
                subclass=materials[m][4],
                is_demo=bool(materials[m][5]),
                value=value,
            )
            for i, (m, value) in enumerate(ranked[:n])
        ]
        return TopOut(
            filters=self._filters_out(len(materials)),
            kind=kind,  # type: ignore[arg-type]
            slug=slug,
            label=label,
            expression=expression,
            unit=unit,
            order=order,  # type: ignore[arg-type]
            direction="maior" if higher else "menor",
            ranked=len(scores),
            without_value=len(materials) - len(scores),
            items=items,
        )

    def correlation(self, property_slugs: list[str] | None = None) -> CorrelationOut:
        """Spearman's ρ for every pair of properties, pairwise-complete.

        One query for the whole value matrix; each pair then uses only the
        materials carrying both (pairwise deletion — dropping every material
        with any gap would leave almost nothing on a sparse catalogue). A pair
        with fewer than ``MIN_PAIRS`` materials gets ``rho = None``.
        """
        visible = self._properties()
        if property_slugs:
            wanted = list(dict.fromkeys(property_slugs))
            if len(wanted) > CORRELATION_MAX:
                raise ValidationError(f"No máximo {CORRELATION_MAX} propriedades por matriz.")
            by_slug = {p.slug: p for p in self._all_properties()}
            unknown = [s for s in wanted if s not in by_slug]
            if unknown:
                raise NotFoundError(f"Propriedade não encontrada: {', '.join(unknown)}")
            chosen = [by_slug[s] for s in wanted]
        else:
            counts = self.repo.value_counts_by_property()
            # The textbook quantities first (the Nível 1 ones), then the best
            # covered: a default matrix of exotic columns would read as noise.
            chosen = sorted(
                visible,
                key=lambda p: (
                    int(property_min_level(p.slug)),
                    -counts.get(p.slug, (0, 0))[0],
                    p.name,
                ),
            )[:CORRELATION_DEFAULT]
            chosen.sort(key=lambda p: p.name)

        ids = {p.id: p.slug for p in chosen}
        columns: dict[str, dict[int, float]] = {p.slug: {} for p in chosen}
        for m, pid, v in self.repo.numeric_values(set(ids)):
            columns[ids[pid]][m] = v

        rank_cache: dict[str, list[float]] = {}

        def ranks(slug: str) -> list[float]:
            if slug not in rank_cache:
                ordered = sorted(columns[slug])
                rank_cache[slug] = average_ranks([columns[slug][m] for m in ordered])
            return rank_cache[slug]

        # Plain strings in the loop: an ORM attribute read per value would cost
        # more than the statistics themselves (~900 k reads at 48 columns).
        slugs = [p.slug for p in chosen]
        cells: list[CorrelationCellOut] = []
        for i, x in enumerate(slugs):
            cx = columns[x]
            for y in slugs[i:]:
                cy = columns[y]
                if x == y:
                    n = len(cx)
                    rho = 1.0 if n >= MIN_PAIRS else None
                else:
                    common = cx.keys() & cy.keys()
                    n = len(common)
                    if n == len(cx) == len(cy) and n >= MIN_PAIRS:
                        # Both columns complete on the same materials: the
                        # ranks computed once per column are the pair's ranks.
                        rho = pearson(ranks(x), ranks(y))
                    else:
                        ordered = sorted(common)
                        rho = spearman([cx[m] for m in ordered], [cy[m] for m in ordered])
                rho = None if rho is None else round(rho, 4)
                cells.append(CorrelationCellOut(x=x, y=y, rho=rho, pairs=n))
                if x != y:
                    cells.append(CorrelationCellOut(x=y, y=x, rho=rho, pairs=n))

        return CorrelationOut(
            filters=self._filters_out(),
            min_pairs=MIN_PAIRS,
            properties=[
                CorrelationPropertyOut(
                    slug=p.slug,
                    name=p.name,
                    symbol_latex=symbol_latex(p.symbol) if p.symbol else None,
                    count=len(columns[p.slug]),
                )
                for p in chosen
            ],
            cells=cells,
        )

    def activity(self, user_id: int) -> ActivityOut:
        """The reader's own work and AI use — nobody else's numbers, ever."""
        today = datetime.now(UTC).date()
        first_month = _month_start(today, ACTIVITY_MONTHS - 1)
        studies, charts, notebooks, own = self.repo.own_counts(user_id)
        dates = self.repo.own_creation_dates(user_id, first_month)
        months = [_month_key(_month_start(today, k)) for k in range(ACTIVITY_MONTHS - 1, -1, -1)]
        tally: dict[str, dict[str, int]] = {m: defaultdict(int) for m in months}
        for kind, stamps in dates.items():
            for stamp in stamps:
                key = _month_key(stamp)
                if key in tally:
                    tally[key][kind] += 1

        settings = app_settings
        since = today - timedelta(days=AI_DAYS - 1)
        usage = {u.day: u for u in self.repo.own_ai_usage(user_id, since)}

        def day_out(day: date) -> AIDayOut:
            row = usage.get(day)
            return AIDayOut(
                day=day.isoformat(),
                requests=row.requests if row else 0,
                artifacts=row.artifacts if row else 0,
                fetches=row.fetches if row else 0,
            )

        return ActivityOut(
            studies=studies,
            charts=charts,
            notebooks=notebooks,
            own_materials=own,
            months=[
                MonthCountOut(
                    month=m,
                    studies=tally[m]["studies"],
                    charts=tally[m]["charts"],
                    notebooks=tally[m]["notebooks"],
                )
                for m in months
            ],
            actions=self.repo.own_audit_actions(user_id),
            recent=[
                AuditEventOut(
                    entity_type=getattr(e.entity_type, "value", str(e.entity_type)),
                    entity_id=e.entity_id,
                    entity_label=e.entity_label,
                    action=getattr(e.action, "value", str(e.action)),
                    created_at=_iso(e.created_at),
                )
                for e in self.repo.own_recent_events(user_id, RECENT_EVENTS)
            ],
            ai=AIUsageOut(
                today=day_out(today),
                ai_daily_limit=settings.ai_daily_requests,
                notebook_daily_limit=settings.notebook_daily_requests,
                fetch_daily_limit=settings.notebook_daily_fetches,
                days=[day_out(since + timedelta(days=k)) for k in range(AI_DAYS)],
            ),
        )

    def export_report(self, section: str, user_id: int) -> Report:
        """The tables behind one tab of the panel, as a :class:`Report` (CSV).

        Every number is the one the screen shows, from the same methods; an
        absent statistic is written as words, never as an empty cell or 0.
        """
        f = self.filters
        subtitle = (
            f"Filtros: classe={f.class_slug or 'todas'}; subclasse={f.subclass or 'todas'}; "
            f"nível={int(f.level)}; demonstração={f.demo}"
        )
        sheets: list[Sheet] = []
        if section == "visao":
            overview = self.overview()
            sheets.append(
                Sheet(
                    name="Cobertura por classe",
                    header=[
                        "Classe",
                        "Materiais",
                        "Preenchidos",
                        "Ausentes declarados",
                        "Não registrados",
                        "Cobertura (%)",
                    ],
                    rows=[
                        [
                            c.name,
                            c.materials,
                            c.coverage.filled,
                            c.coverage.declared_missing,
                            c.coverage.not_recorded,
                            _or_words(c.coverage.filled_pct),
                        ]
                        for c in overview.by_class
                    ],
                )
            )
            sheets.append(
                Sheet(
                    name="Composição por classe e subclasse",
                    header=["Classe", "Subclasse", "Materiais", "Participação (%)"],
                    rows=[
                        [
                            c.class_name,
                            c.subclass or "Sem subclasse",
                            c.count,
                            _or_words(c.share_pct),
                        ]
                        for c in self.composition().cells
                        if c.depth == 1
                    ],
                )
            )
            sheets.append(
                Sheet(
                    name="Qualidade dos dados",
                    header=["Estado", "Pares", "Participação (%)"],
                    rows=[[q.bucket, q.count, _or_words(q.share_pct)] for q in overview.by_quality],
                )
            )
        elif section == "propriedades":
            overview = self.overview()
            sheets.append(
                Sheet(
                    name="Cobertura por propriedade",
                    header=[
                        "Propriedade",
                        "Unidade canônica",
                        "Preenchidos",
                        "Ausentes declarados",
                        "Não registrados",
                        "Cobertura (%)",
                    ],
                    rows=[
                        [
                            p.name,
                            p.canonical_unit or "adimensional",
                            p.coverage.filled,
                            p.coverage.declared_missing,
                            p.coverage.not_recorded,
                            _or_words(p.coverage.filled_pct),
                        ]
                        for p in overview.by_property
                    ],
                )
            )
            matrix = self.correlation()
            names = {p.slug: p.name for p in matrix.properties}
            sheets.append(
                Sheet(
                    name="Correlação de Spearman",
                    header=["Propriedade A", "Propriedade B", "rho", "Pares"],
                    notes=[f"Pares com menos de {matrix.min_pairs} materiais ficam sem rho."],
                    rows=[
                        [
                            names[c.x],
                            names[c.y],
                            c.rho if c.rho is not None else "dados insuficientes",
                            c.pairs,
                        ]
                        for c in matrix.cells
                        if c.x < c.y
                    ],
                )
            )
        elif section == "processos":
            panel = self.processes()
            sheets.append(
                Sheet(
                    name="Processos por família",
                    header=["Família", "Grupo", "Processos", "Materiais alcançados"],
                    rows=[[x.name, x.root_name, x.processes, x.materials] for x in panel.families],
                )
            )
            sheets.append(
                Sheet(
                    name="Materiais por processo",
                    header=["Processo", "Família", "Materiais", "Participação (%)"],
                    rows=[
                        [x.name, x.family_name, x.materials, _or_words(x.share_pct)]
                        for x in panel.by_process
                    ],
                )
            )
        elif section == "qualidade":
            panel = self.sources()
            sheets.append(
                Sheet(
                    name="Qualidade por fonte",
                    header=[
                        "Fonte",
                        "Materiais",
                        "Valores",
                        "Medido",
                        "Importado",
                        "Estimado",
                        "Ausentes declarados",
                        "Participação (%)",
                    ],
                    rows=[
                        [
                            x.label or "Sem fonte",
                            x.materials,
                            x.values,
                            x.medido,
                            x.importado,
                            x.estimado,
                            x.declared_missing,
                            _or_words(x.share_pct),
                        ]
                        for x in panel.sources
                    ],
                )
            )
        elif section == "atividade":
            activity = self.activity(user_id)
            sheets.append(
                Sheet(
                    name="Minha atividade por mês",
                    header=["Mês", "Estudos", "Gráficos salvos", "Cadernos"],
                    rows=[[m.month, m.studies, m.charts, m.notebooks] for m in activity.months],
                )
            )
            sheets.append(
                Sheet(
                    name="Meu uso de IA por dia",
                    header=["Dia", "Consultas", "Artefatos", "Buscas externas"],
                    rows=[[d.day, d.requests, d.artifacts, d.fetches] for d in activity.ai.days],
                )
            )
        else:
            raise ValidationError(
                "Seção inválida. Use visao, propriedades, processos, qualidade ou atividade."
            )
        return Report(
            title=f"Painel do catálogo - {section}",
            subtitle=subtitle,
            notices=[REPRODUCIBILITY_NOTICE],
            sheets=sheets,
        )

    def _require_property(self, slug: str) -> PropertyDefinition:
        definition = self.repo.get_property(slug)
        if definition is None:
            raise NotFoundError(f"Propriedade não encontrada: {slug}")
        return definition

    def _reading(self, definition: PropertyDefinition):
        return reading_for(
            canonical_unit=definition.canonical_unit,
            display_unit=definition.display_unit,
            accepted_units=definition.accepted_units or [],
            requested=self.unit_choices.get(definition.slug),
        )

    # --- Internals --------------------------------------------------------

    @staticmethod
    def _quality_slices(
        quality_counts: dict[DataQuality, int], total: Coverage
    ) -> list[QualitySliceOut]:
        """The provenance mix, over every slot rather than over every row.

        The denominator is ``slots``, not the number of stored values, so the
        five slices add up to the whole catalogue. Sharing out only the rows that
        exist would let a catalogue with two measured values and ten thousand
        empty slots report "100% medido".
        """
        buckets: list[tuple[str, int]] = [
            (quality.value, quality_counts.get(quality, 0)) for quality in DataQuality
        ]
        buckets.append(("AUSENTE", total.declared_missing))
        buckets.append(("NAO_REGISTRADO", total.not_recorded))
        return [
            QualitySliceOut(bucket=bucket, count=count, share_pct=share(count, total.slots))
            for bucket, count in buckets
        ]

    @staticmethod
    def _gaps(by_property: list[PropertyCoverageOut]) -> list[PropertyCoverageOut]:
        """The least-filled properties, worst first.

        Sorted on the count and not on the percentage: with no materials every
        percentage is ``None``, and a sort that has to special-case its own key
        is a sort that will be read wrong later. The count answers the reader's
        actual question — how many materials would I have to fill in?
        """
        return sorted(by_property, key=lambda p: (p.coverage.filled, p.name))[:GAP_LIMIT]


def _cell(
    key: str,
    depth: int,
    class_slug: str,
    class_name: str,
    subclass: str | None,
    count: int,
    total: int,
    rect: Rect,
) -> TreemapCellOut:
    return TreemapCellOut(
        key=key,
        depth=depth,  # type: ignore[arg-type]
        class_slug=class_slug,
        class_name=class_name,
        subclass=subclass,
        count=count,
        share_pct=share(count, total),
        x0=round(rect.x0, 4),
        y0=round(rect.y0, 4),
        x1=round(rect.x1, 4),
        y1=round(rect.y1, 4),
    )


def _month_start(today: date, months_back: int) -> date:
    year, month = today.year, today.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _month_key(moment: date | datetime) -> str:
    return f"{moment.year:04d}-{moment.month:02d}"


def _iso(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.isoformat()


def _or_words(pct: float | None) -> float | str:
    """A percentage, or the words saying there is none (D-24) — never blank."""
    return "sem pares" if pct is None else pct
