"""Visualisation services: Ashby property maps and material comparison.

The methodological commitment of this layer is that the *client draws, the
server decides*. Slopes, iso-index endpoints, class envelopes, normalised
comparison scores and every unit conversion are computed here, deterministically,
from stored values only. Nothing on a chart is estimated, extrapolated or filled
in: a material that cannot be placed is returned in ``excluded`` with the reason,
and a missing comparison cell stays ``None`` all the way to the axis.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from app.calculations.expressions import (
    ExpressionError,
    result_dimension,
    safe_variable,
    validate_names,
)
from app.calculations.performance import IndexEvaluation, evaluate_index
from app.calculations.powerlaw import IndexLine, index_line
from app.calculations.units import UnitError, to_canonical, to_canonical_delta
from app.domain.errors import NotFoundError, ValidationError
from app.domain.geometry import Point, convex_hull, fitted_ellipse
from app.domain.ranking import Direction, Normalization, normalize_column
from app.models.enums import BetterDirection, DataQuality
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.repositories.chart_repository import ChartRepository
from app.schemas.charts import (
    MAX_INDEX_LEVELS,
    ClassEnvelopeOut,
    CompareAxisOut,
    CompareCellOut,
    CompareMaterialOut,
    CompareOut,
    CompareRequest,
    ExcludedPointOut,
    IndexLevelOut,
    IndexOverlayOut,
    MapAxisOut,
    MapPointOut,
    PropertyMapOut,
    PropertyMapRequest,
)
from app.schemas.selection import IndexIn

# Half a decade. Used only to give an index line somewhere to be drawn when
# every plotted material shares the same abscissa.
_HALF_DECADE = 10.0**0.5

# Two index values closer than this (in relative terms) describe the same line.
_LEVEL_TOLERANCE = 1e-9

T = TypeVar("T")


@dataclass(frozen=True)
class _AxisSample:
    """One material's placement on one axis — a property value or an index value.

    ``bounds`` already carries its axis's ``x_``/``y_`` prefix (built by
    :meth:`ChartService._bounds`), so it drops straight into ``MapPointOut`` as
    keyword arguments; empty for an index axis, which has no interval or
    uncertainty of its own to report.
    """

    value: float | None
    quality: DataQuality | None
    bounds: dict[str, float | bool | None]
    missing: bool


AxisGetter = Callable[[Material, dict[str, MaterialPropertyValue]], _AxisSample]


class ChartService:
    """Builds property maps and comparison matrices."""

    def __init__(self, db) -> None:
        self.repo = ChartRepository(db)

    # --- property map -----------------------------------------------------

    def property_map(self, request: PropertyMapRequest) -> PropertyMapOut:
        if (request.x is None) == (request.x_index is None):
            raise ValidationError("Informe x ou x_index no eixo X — nunca os dois, nunca nenhum.")
        if (request.y is None) == (request.y_index is None):
            raise ValidationError("Informe y ou y_index no eixo Y — nunca os dois, nunca nenhum.")
        if request.index is not None and (
            request.x_index is not None or request.y_index is not None
        ):
            raise ValidationError(
                "Não é possível sobrepor um índice quando um eixo já é um índice."
            )
        self._require_classes(request.class_slugs)

        materials = self.repo.list_materials(
            material_ids=request.material_ids, class_slugs=request.class_slugs
        )
        variables = self._material_variables(materials)

        x_meta, x_label, x_get = self._resolve_axis("x", request.x, request.x_index, variables)
        y_meta, y_label, y_get = self._resolve_axis("y", request.y, request.y_index, variables)

        if (
            not x_meta.is_index
            and not y_meta.is_index
            and x_meta.property_slug == y_meta.property_slug
        ):
            raise ValidationError("Escolha duas propriedades diferentes para os eixos.")
        if x_meta.is_index and y_meta.is_index and x_meta.expression == y_meta.expression:
            raise ValidationError("Escolha dois eixos diferentes para o mapa.")

        notes: list[str] = []
        points: list[MapPointOut] = []
        excluded: list[ExcludedPointOut] = []

        for material in materials:
            by_slug = {v.property_definition.slug: v for v in material.property_values}
            x_sample = x_get(material, by_slug)
            y_sample = y_get(material, by_slug)

            absent = [
                label
                for label, sample in ((x_label, x_sample), (y_label, y_sample))
                if sample.missing
            ]
            if absent:
                excluded.append(
                    ExcludedPointOut(
                        material_id=material.id,
                        name=material.name,
                        reason=f"Sem valor para: {', '.join(absent)}.",
                    )
                )
                continue

            x = x_sample.value  # type: ignore[assignment]
            y = y_sample.value  # type: ignore[assignment]
            if request.scale == "log" and (x <= 0 or y <= 0):
                excluded.append(
                    ExcludedPointOut(
                        material_id=material.id,
                        name=material.name,
                        reason="Valor não positivo: indefinido em escala logarítmica.",
                    )
                )
                continue

            points.append(
                MapPointOut(
                    material_id=material.id,
                    material_name=material.name,
                    class_name=material.material_class.name,
                    class_slug=material.material_class.slug,
                    is_demo=material.is_demo,
                    x=x,
                    y=y,
                    **x_sample.bounds,  # type: ignore[arg-type]
                    **y_sample.bounds,  # type: ignore[arg-type]
                    x_quality=x_sample.quality,
                    y_quality=y_sample.quality,
                )
            )

        if request.scale == "log":
            for meta in (x_meta, y_meta):
                if not meta.is_index and not meta.allows_log_scale:
                    notes.append(
                        f"A propriedade '{meta.property_name}' está marcada como imprópria para "
                        "escala logarítmica no catálogo."
                    )

        envelopes = (
            self._envelopes(points, request.scale, request.envelope_shape)
            if request.include_envelopes
            else []
        )
        alt_scale = "linear" if request.scale == "log" else "log"
        envelopes_alt = (
            self._envelopes(
                [p for p in points if not (alt_scale == "log" and (p.x <= 0 or p.y <= 0))],
                alt_scale,
                request.envelope_shape,
            )
            if request.include_envelopes
            else []
        )
        overlay = self._index_overlay(request, points, variables, notes)

        return PropertyMapOut(
            scale=request.scale,
            x_axis=x_meta.model_copy(update=self._range(points, "x")),
            y_axis=y_meta.model_copy(update=self._range(points, "y")),
            points=points,
            envelopes=envelopes,
            envelopes_alt=envelopes_alt,
            excluded=excluded,
            index=overlay,
            considered_count=len(materials),
            plotted_count=len(points),
            notes=notes,
        )

    def _resolve_axis(
        self,
        axis_key: str,
        slug: str | None,
        index_in: IndexIn | None,
        variables: dict[int, dict[str, float]],
    ) -> tuple[MapAxisOut, str, AxisGetter]:
        """Build one axis's metadata, its display label, and its per-material sample.

        ``variables`` is the whole request's material→canonical-values snapshot
        (:meth:`_material_variables`), computed once and shared with the overlay
        index so an index axis and an overlaid index never disagree about a
        material's own values.
        """
        if index_in is not None:
            used, dimension = self._validate_expression(index_in.expression)
            label = index_in.name or index_in.expression
            meta = MapAxisOut(
                is_index=True,
                property_name=label,
                expression=index_in.expression,
                unit=dimension,
                better_direction=(
                    BetterDirection.HIGHER if index_in.goal == "maximize" else BetterDirection.LOWER
                ),
                allows_log_scale=True,
            )

            def get_index(material: Material, by_slug: dict) -> _AxisSample:
                evaluation = evaluate_index(
                    index_in.expression, used, variables.get(material.id, {})
                )
                if evaluation.value is None:
                    return _AxisSample(None, None, {}, True)
                return _AxisSample(evaluation.value, None, {}, False)

            return meta, label, get_index

        definition = self._require_property(slug)  # type: ignore[arg-type]
        meta = MapAxisOut(
            property_slug=definition.slug,
            property_name=definition.name,
            symbol=definition.symbol,
            unit=definition.canonical_unit,
            category=definition.category,
            better_direction=definition.better_direction,
            allows_log_scale=definition.allows_log_scale,
        )

        def get_property(material: Material, by_slug: dict) -> _AxisSample:
            value_obj = self._plottable(by_slug.get(definition.slug))
            if value_obj is None:
                return _AxisSample(None, None, {}, True)
            return _AxisSample(
                value_obj.normalized_value,
                value_obj.data_quality,
                self._bounds(value_obj, definition, axis_key),
                False,
            )

        return meta, definition.name, get_property

    @staticmethod
    def _material_variables(materials: list[Material]) -> dict[int, dict[str, float]]:
        """Every material's canonical values, keyed by safe variable name.

        Shared by an index axis and the overlay index so both evaluate from the
        same snapshot — the same guarantee D-35 already makes between a saved
        study and a chart, extended to a map whose own axis is an index.
        """
        return {
            m.id: {
                safe_variable(v.property_definition.slug): v.normalized_value
                for v in m.property_values
                if not v.is_missing and v.normalized_value is not None
            }
            for m in materials
        }

    @staticmethod
    def _range(points: list[MapPointOut], axis: str) -> dict[str, float | None]:
        values = [getattr(p, axis) for p in points]
        return {
            "min_value": min(values) if values else None,
            "max_value": max(values) if values else None,
        }

    @staticmethod
    def _plottable(value: MaterialPropertyValue | None) -> MaterialPropertyValue | None:
        """Return the value only if it can be placed on an axis."""
        if value is None or value.is_missing or value.normalized_value is None:
            return None
        return value

    @staticmethod
    def _bounds(
        value: MaterialPropertyValue, definition: PropertyDefinition, axis: str
    ) -> dict[str, float | bool | None]:
        """Convert interval bounds and uncertainty of one axis to canonical units.

        ``value_min``/``value_max``/``uncertainty`` are stored in the *original*
        unit; the axis is drawn in the canonical one. Bounds are absolute values
        (plain conversion) while the uncertainty is a difference (offset-aware
        conversion), so ±5 °C stays ±5 K instead of becoming ±278 K.

        A conversion failure degrades to "no error bar" rather than failing the
        whole chart — the point itself is already normalised and trustworthy.
        """
        source_unit = value.original_unit or definition.canonical_unit
        canonical = definition.canonical_unit

        def absolute(raw: float | None) -> float | None:
            if raw is None:
                return None
            try:
                converted, _ = to_canonical(raw, source_unit, canonical)
            except UnitError:
                return None
            return converted

        def difference(raw: float | None) -> float | None:
            if raw is None:
                return None
            try:
                return to_canonical_delta(raw, source_unit, canonical)
            except UnitError:
                return None

        low = absolute(value.value_min)
        high = absolute(value.value_max)
        return {
            f"{axis}_min": low,
            f"{axis}_max": high,
            f"{axis}_uncertainty": difference(value.uncertainty),
            f"{axis}_is_interval": low is not None and high is not None,
        }

    @staticmethod
    def _envelopes(
        points: list[MapPointOut], scale: str, shape: str = "hull"
    ) -> list[ClassEnvelopeOut]:
        """Convex hull or fitted ellipse per class, computed in the space the
        chart displays."""
        grouped: dict[str, list[MapPointOut]] = {}
        for point in points:
            grouped.setdefault(point.class_slug, []).append(point)

        envelope_fn = fitted_ellipse if shape == "ellipse" else convex_hull

        envelopes: list[ClassEnvelopeOut] = []
        for class_slug, members in sorted(grouped.items()):
            if scale == "log":
                raw: list[Point] = [(math.log10(p.x), math.log10(p.y)) for p in members]
                polygon = [[10.0**hx, 10.0**hy] for hx, hy in envelope_fn(raw)]
            else:
                polygon = [[hx, hy] for hx, hy in envelope_fn([(p.x, p.y) for p in members])]
            envelopes.append(
                ClassEnvelopeOut(
                    class_slug=class_slug,
                    class_name=members[0].class_name,
                    point_count=len(members),
                    polygon=polygon,
                )
            )
        return envelopes

    # --- index overlay ----------------------------------------------------

    def _index_overlay(
        self,
        request: PropertyMapRequest,
        points: list[MapPointOut],
        variables: dict[int, dict[str, float]],
        notes: list[str],
    ) -> IndexOverlayOut | None:
        if request.index is None:
            return None
        # Guaranteed by property_map's own guard: the overlay is only ever
        # requested alongside two property axes, never an axis that is itself
        # an index (see the "Não é possível sobrepor..." check).
        assert request.x is not None and request.y is not None

        expression = request.index.expression
        used, dimension = self._validate_expression(expression)

        evaluations: dict[int, IndexEvaluation] = {
            point.material_id: evaluate_index(
                expression, used, variables.get(point.material_id, {})
            )
            for point in points
        }
        for point in points:
            evaluation = evaluations[point.material_id]
            point.index_value = evaluation.value
            point.index_undefined_reason = evaluation.undefined_reason

        defined = {mid: e.value for mid, e in evaluations.items() if e.value is not None}
        overlay = IndexOverlayOut(
            name=request.index.name,
            expression=expression,
            goal=request.index.goal,
            dimension=dimension,
            available=False,
            defined_count=len(defined),
            undefined_count=len(evaluations) - len(defined),
        )

        try:
            line = index_line(expression, safe_variable(request.x), safe_variable(request.y))
        except ExpressionError as exc:
            overlay.unavailable_reason = str(exc)
            return overlay

        overlay.orientation = line.orientation
        overlay.slope = line.slope

        levels = self._collect_levels(request, defined, points, notes)
        overlay.levels = self._draw_levels(line, levels, points, request.index.goal, defined)
        overlay.available = True
        if not overlay.levels and levels:
            overlay.available = False
            overlay.unavailable_reason = (
                "Nenhum nível pôde ser traçado no intervalo de dados do mapa."
            )
        return overlay

    def _validate_expression(self, expression: str) -> tuple[set[str], str]:
        """Validate the expression against the property catalogue; return vars + dimension."""
        properties = {p.slug: p for p in self.repo.list_properties()}
        var_to_slug = {safe_variable(slug): slug for slug in properties}
        try:
            used = validate_names(expression, set(var_to_slug))
            dimension = result_dimension(
                expression,
                {var: properties[var_to_slug[var]].canonical_unit for var in used},
            )
        except ExpressionError as exc:
            raise ValidationError(str(exc)) from exc
        return used, dimension

    @staticmethod
    def _collect_levels(
        request: PropertyMapRequest,
        defined: dict[int, float],
        points: list[MapPointOut],
        notes: list[str],
    ) -> list[tuple[float, int | None, str | None]]:
        """Assemble the requested iso-index levels as ``(value, material_id, name)``."""
        names = {p.material_id: p.material_name for p in points}
        requested: list[tuple[float, int | None, str | None]] = []

        for material_id in request.index_level_material_ids:
            value = defined.get(material_id)
            if value is None:
                notes.append(
                    f"Sem linha de índice para o material {material_id}: índice indefinido "
                    "ou material fora do mapa."
                )
                continue
            requested.append((value, material_id, names.get(material_id)))

        for value in request.index_levels:
            if math.isfinite(value):
                requested.append((value, None, None))

        deduplicated: list[tuple[float, int | None, str | None]] = []
        for level in requested:
            if not any(
                math.isclose(level[0], kept[0], rel_tol=_LEVEL_TOLERANCE, abs_tol=0.0)
                for kept in deduplicated
            ):
                deduplicated.append(level)

        if len(deduplicated) > MAX_INDEX_LEVELS:
            notes.append(
                f"{len(deduplicated) - MAX_INDEX_LEVELS} linha(s) de índice além do limite de "
                f"{MAX_INDEX_LEVELS} não foram traçadas."
            )
            deduplicated = deduplicated[:MAX_INDEX_LEVELS]
        return deduplicated

    @staticmethod
    def _span(values: list[float]) -> tuple[float, float] | None:
        """Positive drawing span for a coordinate, widened when degenerate."""
        positive = [v for v in values if v > 0]
        if not positive:
            return None
        low, high = min(positive), max(positive)
        if low == high:
            return low / _HALF_DECADE, high * _HALF_DECADE
        return low, high

    @classmethod
    def _draw_levels(
        cls,
        line: IndexLine,
        levels: list[tuple[float, int | None, str | None]],
        points: list[MapPointOut],
        goal: str,
        defined: dict[int, float],
    ) -> list[IndexLevelOut]:
        """Turn each level into a drawable two-point segment.

        Index lines live on the positive quadrant (a power law with a fractional
        exponent has no real branch elsewhere), so the span is taken over the
        positive plotted coordinates only.

        Each orientation needs only the span it actually spends: an oblique line
        is sampled at the two extreme abscissas, while a vertical one takes its
        abscissa from the level itself and needs only somewhere on the y axis to
        stretch between.
        """
        x_span = cls._span([p.x for p in points])
        y_span = cls._span([p.y for p in points])
        if y_span is None:
            return []
        is_vertical = line.orientation == "vertical"
        if not is_vertical and x_span is None:
            return []

        drawn: list[IndexLevelOut] = []
        for value, material_id, material_name in levels:
            if is_vertical:
                x = line.x_for_level(value)
                if x is None:
                    continue
                segment = [[x, y_span[0]], [x, y_span[1]]]
            else:
                ends = [line.y_for_x(value, x) for x in x_span]  # type: ignore[union-attr]
                if any(end is None for end in ends):
                    continue
                segment = [[x_span[i], ends[i]] for i in range(2)]  # type: ignore[list-item]

            superior = sorted(
                mid
                for mid, index_value in defined.items()
                if (index_value >= value if goal == "maximize" else index_value <= value)
            )
            drawn.append(
                IndexLevelOut(
                    value=value,
                    material_id=material_id,
                    material_name=material_name,
                    points=segment,
                    superior_material_ids=superior,
                )
            )
        return drawn

    # --- comparison -------------------------------------------------------

    def compare(self, request: CompareRequest) -> CompareOut:
        property_slugs = _unique(request.property_slugs)
        material_ids = _unique(request.material_ids)

        definitions = {p.slug: p for p in self.repo.list_properties()}
        unknown_properties = [slug for slug in property_slugs if slug not in definitions]
        if unknown_properties:
            raise NotFoundError(f"Propriedades não encontradas: {', '.join(unknown_properties)}")

        materials = {m.id: m for m in self.repo.list_materials(material_ids=material_ids)}
        unknown_materials = [str(mid) for mid in material_ids if mid not in materials]
        if unknown_materials:
            raise NotFoundError(
                f"Materiais não encontrados ou inativos: {', '.join(unknown_materials)}"
            )

        # Requested order is preserved: it may carry meaning (a ranking).
        ordered = [materials[mid] for mid in material_ids]
        method = Normalization(request.normalization)
        notes: list[str] = []

        values_by_material = {
            material.id: {v.property_definition.slug: v for v in material.property_values}
            for material in ordered
        }
        raw: dict[str, dict[int, MaterialPropertyValue]] = {}
        for slug in property_slugs:
            column: dict[int, MaterialPropertyValue] = {}
            for material in ordered:
                value = self._plottable(values_by_material[material.id].get(slug))
                if value is not None:
                    column[material.id] = value
            raw[slug] = column

        normalized: dict[str, dict[int, float]] = {}
        axes: list[CompareAxisOut] = []
        for slug in property_slugs:
            definition = definitions[slug]
            column = raw[slug]
            present_ids = list(column)
            values = [column[mid].normalized_value for mid in present_ids]

            direction = (
                Direction.MIN
                if definition.better_direction is BetterDirection.LOWER
                else Direction.MAX
            )
            scores = normalize_column([float(v) for v in values], direction, method)  # type: ignore[arg-type]
            normalized[slug] = dict(zip(present_ids, scores, strict=True))

            missing_ids = [m.id for m in ordered if m.id not in column]
            if missing_ids:
                notes.append(
                    f"'{definition.name}' está ausente em {len(missing_ids)} material(is); "
                    "esses pontos ficam em branco no radar, nas coordenadas paralelas e no heatmap."
                )
            if len(values) > 1 and len(set(values)) == 1:
                notes.append(
                    f"Todos os valores de '{definition.name}' são iguais: a normalização "
                    "atribui 1,0 a todos, sem diferenciar os materiais."
                )
            if definition.better_direction is BetterDirection.NEUTRAL:
                notes.append(
                    f"'{definition.name}' não tem direção preferida: a escala normalizada "
                    "indica posição relativa, não mérito."
                )

            axes.append(
                CompareAxisOut(
                    property_slug=slug,
                    property_name=definition.name,
                    symbol=definition.symbol,
                    unit=definition.canonical_unit,
                    category=definition.category,
                    better_direction=definition.better_direction,
                    allows_log_scale=definition.allows_log_scale,
                    min_value=min(values) if values else None,  # type: ignore[type-var]
                    max_value=max(values) if values else None,  # type: ignore[type-var]
                    present_count=len(values),
                    missing_material_ids=missing_ids,
                )
            )

        rows = [
            CompareMaterialOut(
                material_id=material.id,
                name=material.name,
                class_name=material.material_class.name,
                class_slug=material.material_class.slug,
                is_demo=material.is_demo,
                cells=[
                    self._cell(slug, raw[slug].get(material.id), normalized[slug].get(material.id))
                    for slug in property_slugs
                ],
                complete=all(material.id in raw[slug] for slug in property_slugs),
            )
            for material in ordered
        ]

        return CompareOut(normalization=method.value, properties=axes, materials=rows, notes=notes)

    @staticmethod
    def _cell(
        slug: str, value: MaterialPropertyValue | None, normalized: float | None
    ) -> CompareCellOut:
        if value is None:
            return CompareCellOut(property_slug=slug, is_missing=True)
        return CompareCellOut(
            property_slug=slug,
            is_missing=False,
            value=value.normalized_value,
            normalized=normalized,
            value_min=value.value_min,
            value_max=value.value_max,
            original_value=(
                value.value_scalar if value.value_scalar is not None else value.value_typical
            ),
            original_unit=value.original_unit,
            conversion_method=value.conversion_method,
            uncertainty=value.uncertainty,
            data_quality=value.data_quality,
            source_label=value.source.label if value.source else None,
            measurement_condition=value.measurement_condition,
        )

    # --- shared lookups ---------------------------------------------------

    def _require_property(self, slug: str) -> PropertyDefinition:
        definition = self.repo.get_property(slug)
        if definition is None:
            raise NotFoundError(f"Propriedade não encontrada: {slug}")
        return definition

    def _require_classes(self, slugs: list[str]) -> None:
        if not slugs:
            return
        unknown = sorted(set(slugs) - self.repo.existing_class_slugs(slugs))
        if unknown:
            raise NotFoundError(f"Classes desconhecidas: {', '.join(unknown)}")


def _unique(items: Sequence[T]) -> list[T]:
    """Deduplicate while preserving the caller's order."""
    seen: set[T] = set()
    result: list[T] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result
