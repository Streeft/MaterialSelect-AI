"""Material curves: what a curve may carry, how it is built, and how it is drawn (D-106, TM4).

A curve is not a property value. A stress–strain curve, an S–N curve or the fall
of a modulus with temperature is a *set* of measured points, and the whole
reason to keep it is that no single number from it says what it says. Reducing
it to a scalar — "the value at 20 °C", "the stress at 10⁷ cycles" — would be a
choice this module refuses to make: it builds, validates and draws curves, and
**never interpolates, extrapolates or picks a point** (docs/18 §6).

Three things live here, and all three are pure (no SQLAlchemy, no FastAPI):

* **The vocabulary.** Which quantities an axis may carry (:data:`QUANTITIES`),
  each with its canonical unit, the unit it is read in by convention, the units
  a reader may choose (D-70) and whether a log axis means anything for it; and,
  per :class:`~app.models.enums.CurveKind`, which quantities each axis admits and
  which scale the figure opens in (:data:`KINDS`). Argument, not data — like the
  load cases of D-64 — so it lives in code and is checked by review.
* **The builder** (:func:`build_curve`). Every number goes through
  ``units.to_canonical`` (principle 4: original value, original unit, normalised
  value, canonical unit, method), and a curve that is not finite, not ordered or
  whose band does not contain its line is refused with the reason in Portuguese.
  The seed and the official importer both write through it.
* **The drawing** (:func:`draw_curve`). Every coordinate the figure needs —
  the points in the reader's unit, the band polygon, the padded data domain —
  is computed here, so the client only maps data to pixels (ADR 0004).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from app.calculations.units import UnitError, is_ratio_scale, pretty_unit, to_canonical
from app.domain.curve_quantities import QUANTITIES, AxisQuantity
from app.domain.display_units import DisplayUnitError, Reading, reading_for
from app.models.enums import CurveKind

#: Hard ceilings, so one bundle row cannot become a megabyte response.
MAX_SERIES = 24
MAX_POINTS_PER_SERIES = 2000
MIN_POINTS_PER_SERIES = 2

Scale = Literal["linear", "log-x", "log-y", "log-log"]
SCALES: tuple[Scale, ...] = ("linear", "log-x", "log-y", "log-log")


class CurveError(ValueError):
    """A curve that cannot be stored or drawn honestly; the message says why."""


@dataclass(frozen=True)
class KindSpec:
    """What one kind of curve admits."""

    label: str
    x_quantities: tuple[str, ...]
    y_quantities: tuple[str, ...]
    #: The quantities a family of curves may vary along (one per curve).
    parameter_quantities: tuple[str, ...]
    #: The scale the figure opens in when the reader chose none.
    default_scale: Scale
    #: Every kind today is a monotonic loading or a sweep: x strictly increases
    #: along a series. A hysteresis loop would not, and has no kind yet — it
    #: stays in ``CatalogSupplementalValue`` (TM4-c).
    x_strictly_increasing: bool = True


KINDS: dict[CurveKind, KindSpec] = {
    CurveKind.TENSAO_DEFORMACAO: KindSpec(
        "Tensão–deformação",
        ("deformacao",),
        ("tensao",),
        ("temperatura", "taxa_deformacao"),
        "linear",
    ),
    CurveKind.TEMPERATURA: KindSpec(
        "Dependência da temperatura",
        ("temperatura",),
        ("tensao", "modulo"),
        ("taxa_deformacao",),
        "linear",
    ),
    CurveKind.TAXA: KindSpec(
        "Dependência da taxa de deformação",
        ("taxa_deformacao",),
        ("tensao", "modulo"),
        ("temperatura",),
        "log-x",
    ),
    CurveKind.FADIGA: KindSpec(
        "Fadiga (S–N)",
        ("ciclos",),
        ("tensao",),
        ("razao_tensao", "temperatura"),
        "log-x",
    ),
    CurveKind.FLUENCIA: KindSpec(
        "Fluência",
        ("tempo",),
        ("deformacao", "tensao"),
        ("temperatura", "tensao"),
        "linear",
    ),
}


def lower_first(text: str) -> str:
    """Lower only the first letter: "Razão de tensões R" → "razão de tensões R"."""
    return text[:1].lower() + text[1:]


def kind_label(kind: CurveKind) -> str:
    return KINDS[kind].label


# --- Building ----------------------------------------------------------------


@dataclass(frozen=True)
class PointInput:
    """One point as the source wrote it, in the curve's original units."""

    x: float
    y: float
    y_min: float | None = None
    y_max: float | None = None


@dataclass(frozen=True)
class SeriesInput:
    points: Sequence[PointInput]
    label: str | None = None
    conditions: str | None = None
    #: The value of the curve's family parameter for this series, as written.
    parameter: float | None = None
    parameter_unit: str | None = None


@dataclass(frozen=True)
class NormalizedPoint:
    position: int
    x_value: float
    y_value: float
    y_min_value: float | None
    y_max_value: float | None
    x_normalized: float
    y_normalized: float
    y_min_normalized: float | None
    y_max_normalized: float | None


@dataclass(frozen=True)
class NormalizedSeries:
    position: int
    label: str | None
    conditions: str | None
    parameter_value: float | None
    parameter_original_unit: str | None
    parameter_normalized: float | None
    parameter_canonical_unit: str | None
    parameter_conversion_method: str | None
    points: tuple[NormalizedPoint, ...]


@dataclass(frozen=True)
class NormalizedCurve:
    kind: CurveKind
    x_quantity: str
    y_quantity: str
    parameter_quantity: str | None
    x_original_unit: str
    y_original_unit: str
    x_canonical_unit: str
    y_canonical_unit: str
    x_conversion_method: str
    y_conversion_method: str
    series: tuple[NormalizedSeries, ...]


def _number(value: object, what: str) -> float:
    """A finite float, or the reason it is not one. ``True`` is not 1."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise CurveError(f"{what}: valor não numérico ({value!r}).")
    number = float(value)
    if not math.isfinite(number):
        raise CurveError(f"{what}: valor não finito ({value!r}).")
    return number


def _convert(value: float, unit: str, quantity: AxisQuantity, what: str) -> tuple[float, str]:
    try:
        return to_canonical(value, unit, quantity.canonical_unit)
    except UnitError as exc:
        raise CurveError(f"{what}: {exc}") from exc


def _quantity(key: str | None, allowed: tuple[str, ...], what: str) -> AxisQuantity:
    if key not in allowed:
        names = ", ".join(allowed)
        raise CurveError(
            f"{what}: grandeza {key!r} não admitida para este tipo de curva ({names})."
        )
    return QUANTITIES[key]


def build_curve(
    kind: CurveKind,
    *,
    x_quantity: str,
    x_unit: str,
    y_quantity: str,
    y_unit: str,
    series: Sequence[SeriesInput],
    parameter_quantity: str | None = None,
) -> NormalizedCurve:
    """Validate a curve as the source wrote it and normalise every number.

    Refused, with the reason: an axis quantity the kind does not admit; a unit
    Pint does not know or that has the wrong dimension; a point that is not a
    finite number; fewer than two points in a series (one point is a scalar,
    and a scalar belongs in ``MaterialPropertyValue``); x not strictly
    increasing along a series; a band given on one side only or not containing
    its line; a family parameter missing on a series, given without a family,
    or repeated (two series the legend could not tell apart).

    Nothing is filled in: a point without a band has no band, and a series
    without a label is drawn with its parameter as the legend.
    """
    spec = KINDS[kind]
    xq = _quantity(x_quantity, spec.x_quantities, "Eixo x")
    yq = _quantity(y_quantity, spec.y_quantities, "Eixo y")
    pq = (
        _quantity(parameter_quantity, spec.parameter_quantities, "Parâmetro da família")
        if parameter_quantity is not None
        else None
    )
    if not series:
        raise CurveError("Curva sem nenhuma série de pontos.")
    if len(series) > MAX_SERIES:
        raise CurveError(f"Curva com {len(series)} séries; o máximo é {MAX_SERIES}.")

    x_method = y_method = ""
    built: list[NormalizedSeries] = []
    seen_parameters: set[float] = set()
    for s_index, item in enumerate(series):
        where = f"Série {s_index + 1}"
        points = list(item.points)
        if len(points) < MIN_POINTS_PER_SERIES:
            raise CurveError(
                f"{where}: uma curva precisa de ao menos {MIN_POINTS_PER_SERIES} pontos; "
                "um ponto só é um valor escalar, não uma curva."
            )
        if len(points) > MAX_POINTS_PER_SERIES:
            raise CurveError(
                f"{where}: {len(points)} pontos; o máximo é {MAX_POINTS_PER_SERIES} por série."
            )

        parameter_fields: dict[str, float | str | None] = {
            "parameter_value": None,
            "parameter_original_unit": None,
            "parameter_normalized": None,
            "parameter_canonical_unit": None,
            "parameter_conversion_method": None,
        }
        if pq is None:
            if item.parameter is not None:
                raise CurveError(
                    f"{where}: valor de parâmetro sem grandeza de família declarada na curva."
                )
        else:
            if item.parameter is None or not item.parameter_unit:
                raise CurveError(
                    f"{where}: a curva é uma família por {lower_first(pq.name)}, e esta série "
                    "não declara o valor e a unidade do parâmetro."
                )
            raw = _number(item.parameter, f"{where}, parâmetro")
            normalized, method = _convert(raw, item.parameter_unit, pq, f"{where}, parâmetro")
            if normalized in seen_parameters:
                raise CurveError(
                    f"{where}: o mesmo valor de {lower_first(pq.name)} já está em outra série; "
                    "a legenda não teria como distingui-las."
                )
            seen_parameters.add(normalized)
            parameter_fields = {
                "parameter_value": raw,
                "parameter_original_unit": item.parameter_unit,
                "parameter_normalized": normalized,
                "parameter_canonical_unit": pq.canonical_unit,
                "parameter_conversion_method": method,
            }

        normalized_points: list[NormalizedPoint] = []
        previous_x: float | None = None
        for p_index, point in enumerate(points):
            at = f"{where}, ponto {p_index + 1}"
            x = _number(point.x, f"{at}, x")
            y = _number(point.y, f"{at}, y")
            if (point.y_min is None) != (point.y_max is None):
                raise CurveError(
                    f"{at}: faixa com um lado só; a fonte tem de dar o mínimo e o máximo."
                )
            y_min = _number(point.y_min, f"{at}, y mín.") if point.y_min is not None else None
            y_max = _number(point.y_max, f"{at}, y máx.") if point.y_max is not None else None
            if y_min is not None and y_max is not None and not (y_min <= y <= y_max):
                raise CurveError(f"{at}: a faixa [{y_min:g}; {y_max:g}] não contém y = {y:g}.")

            x_norm, x_method = _convert(x, x_unit, xq, f"{at}, x")
            y_norm, y_method = _convert(y, y_unit, yq, f"{at}, y")
            y_min_norm = (
                _convert(y_min, y_unit, yq, f"{at}, y mín.")[0] if y_min is not None else None
            )
            y_max_norm = (
                _convert(y_max, y_unit, yq, f"{at}, y máx.")[0] if y_max is not None else None
            )

            if spec.x_strictly_increasing and previous_x is not None and x_norm <= previous_x:
                raise CurveError(
                    f"{at}: x tem de crescer ao longo da série (curva de {lower_first(spec.label)}); "
                    "pontos fora de ordem ou repetidos não são reordenados."
                )
            previous_x = x_norm
            normalized_points.append(
                NormalizedPoint(
                    position=p_index,
                    x_value=x,
                    y_value=y,
                    y_min_value=y_min,
                    y_max_value=y_max,
                    x_normalized=x_norm,
                    y_normalized=y_norm,
                    y_min_normalized=y_min_norm,
                    y_max_normalized=y_max_norm,
                )
            )

        built.append(
            NormalizedSeries(
                position=s_index,
                label=(item.label or None),
                conditions=(item.conditions or None),
                points=tuple(normalized_points),
                **parameter_fields,  # type: ignore[arg-type]
            )
        )

    return NormalizedCurve(
        kind=kind,
        x_quantity=xq.key,
        y_quantity=yq.key,
        parameter_quantity=pq.key if pq else None,
        x_original_unit=x_unit,
        y_original_unit=y_unit,
        x_canonical_unit=xq.canonical_unit,
        y_canonical_unit=yq.canonical_unit,
        x_conversion_method=x_method,
        y_conversion_method=y_method,
        series=tuple(built),
    )


# --- Drawing -----------------------------------------------------------------


@dataclass(frozen=True)
class PointData:
    """A stored point: canonical numbers plus what the source wrote."""

    x: float
    y: float
    y_min: float | None
    y_max: float | None
    x_original: float
    y_original: float
    y_min_original: float | None
    y_max_original: float | None


@dataclass(frozen=True)
class SeriesData:
    id: int
    label: str | None
    conditions: str | None
    parameter: float | None
    parameter_original: float | None
    parameter_original_unit: str | None
    points: tuple[PointData, ...]


@dataclass(frozen=True)
class DrawnAxis:
    quantity: AxisQuantity
    reading: Reading
    log: bool
    #: ``(min, max)`` in reading units, padded; ``None`` when nothing is drawn.
    domain: tuple[float, float] | None

    @property
    def unit_label(self) -> str:
        """The unit for the axis title; empty for a pure number (cycles, R)."""
        return "" if self.reading.unit == "dimensionless" else pretty_unit(self.reading.unit)


@dataclass(frozen=True)
class DrawnPoint:
    """One table row: the point in reading units, and whether it was drawn."""

    position: int
    x: float
    y: float
    y_min: float | None
    y_max: float | None
    x_original: float
    y_original: float
    y_min_original: float | None
    y_max_original: float | None
    drawn: bool


@dataclass(frozen=True)
class DrawnSeries:
    id: int
    label: str | None
    conditions: str | None
    parameter_value: float | None
    parameter_original: float | None
    parameter_original_unit: str | None
    #: The polyline, in reading units, in the source's order.
    path: tuple[tuple[float, float], ...]
    #: The band as a closed polygon (lower edge forward, upper edge back), or
    #: ``None`` when the source gave no band or it cannot be drawn on this scale.
    band: tuple[tuple[float, float], ...] | None
    points: tuple[DrawnPoint, ...]
    excluded: int


@dataclass(frozen=True)
class DrawnCurve:
    scale: Scale
    x: DrawnAxis
    y: DrawnAxis
    parameter_reading: Reading | None
    series: tuple[DrawnSeries, ...]
    notes: list[str] = field(default_factory=list)


def axis_reading(quantity: AxisQuantity, requested: str | None, axis: str) -> Reading:
    """The unit an axis is read in: the reader's choice, else the convention.

    Refused, never ignored (D-56, D-70): a unit outside the quantity's list is
    a 400 naming the admitted ones, because drawing the curve in another unit
    without saying so would make the reader read the wrong numbers.
    """
    allowed = {quantity.canonical_unit, quantity.reading_unit, *quantity.accepted_units}
    if requested is not None and requested not in allowed:
        raise DisplayUnitError(
            f"Unidade {requested!r} não é admitida no eixo {axis} ({quantity.name}). "
            f"Admitidas: {', '.join(sorted(allowed))}."
        )
    return reading_for(
        canonical_unit=quantity.canonical_unit,
        display_unit=quantity.reading_unit,
        accepted_units=quantity.accepted_units,
        requested=requested,
    )


def scale_axes(scale: str) -> tuple[bool, bool]:
    """``(x is log, y is log)`` for a scale name, or a 400-ready refusal."""
    if scale not in SCALES:
        raise CurveError(f"Escala {scale!r} desconhecida. Use: {', '.join(SCALES)}.")
    return scale in ("log-x", "log-log"), scale in ("log-y", "log-log")


def log_refusal(quantity: AxisQuantity, reading: Reading) -> str | None:
    """Why this axis may not be logarithmic, or ``None`` when it may.

    The same rule the maps follow (D-70): the quantity has to allow it, and the
    reading unit has to be a pure scale factor of the canonical one — log °C is
    not log K shifted, and a line straight on one would bend on the other.
    """
    if not quantity.allows_log:
        return f"{quantity.name} não admite escala logarítmica."
    if not is_ratio_scale(reading.unit):
        return (
            f"{quantity.name} lida em {pretty_unit(reading.unit)} não admite escala "
            "logarítmica: a unidade tem deslocamento de zero."
        )
    return None


def available_scales(x: AxisQuantity, rx: Reading, y: AxisQuantity, ry: Reading) -> list[Scale]:
    x_ok = log_refusal(x, rx) is None
    y_ok = log_refusal(y, ry) is None
    return [
        s
        for s in SCALES
        if (s not in ("log-x", "log-log") or x_ok) and (s not in ("log-y", "log-log") or y_ok)
    ]


def _padded(
    values: list[float], log: bool, zero_is_floor: bool = True
) -> tuple[float, float] | None:
    """The data range with a little air, in the space the axis is drawn in.

    Linear: 4 % of the span each side, never crossing zero when the data does
    not (a strain axis that starts at 0 starts at 0) — but only when zero is a
    true origin of the reading unit. On an offset scale (°C, °F) 0 is an
    arbitrary mark, so data from 20 to 600 °C must not be pulled down to 0 °C
    (TM4-h). Log: 0.04 decade.
    """
    if not values:
        return None
    lo, hi = min(values), max(values)
    if log:
        a, b = math.log10(lo), math.log10(hi)
        pad = max((b - a) * 0.04, 0.04)
        return 10 ** (a - pad), 10 ** (b + pad)
    span = hi - lo
    pad = span * 0.04 if span > 0 else (abs(lo) * 0.1 or 1.0)
    low, high = lo - pad, hi + pad
    if zero_is_floor:
        if lo >= 0 > low:
            low = 0.0
        if hi <= 0 < high:
            high = 0.0
    return low, high


def draw_curve(
    kind: CurveKind,
    x_quantity: str,
    y_quantity: str,
    parameter_quantity: str | None,
    series: Sequence[SeriesData],
    *,
    x_unit: str | None = None,
    y_unit: str | None = None,
    scale: str | None = None,
) -> DrawnCurve:
    """Everything the figure and its table need, in the reader's units.

    **Converted at the end, point by point.** Every output is a coordinate pair,
    and a unit change is affine, so converting each pair is exact — the same
    reasoning as the maps (D-70). The band is converted as two edges for the
    same reason.

    A point that cannot sit on a log axis (≤ 0) is not drawn, and is still in
    the table with ``drawn=False``; the note says how many. Nothing is moved,
    clipped or interpolated to make it fit.
    """
    spec = KINDS[kind]
    xq = QUANTITIES[x_quantity]
    yq = QUANTITIES[y_quantity]
    rx = axis_reading(xq, x_unit, "x")
    ry = axis_reading(yq, y_unit, "y")
    chosen: Scale = spec.default_scale if scale is None else scale  # type: ignore[assignment]
    x_log, y_log = scale_axes(chosen)
    if scale is None:
        # The kind's default never refuses: fall back to linear on the axis
        # that cannot be logarithmic in the reader's unit.
        if x_log and log_refusal(xq, rx):
            x_log = False
        if y_log and log_refusal(yq, ry):
            y_log = False
        chosen = (
            "log-log"
            if x_log and y_log
            else "log-x" if x_log else "log-y" if y_log else "linear"  # type: ignore[assignment]
        )
    else:
        for is_log, quantity, reading, axis in ((x_log, xq, rx, "x"), (y_log, yq, ry, "y")):
            reason = log_refusal(quantity, reading) if is_log else None
            if reason:
                raise CurveError(f"Escala logarítmica recusada no eixo {axis}: {reason}")

    parameter_reading = (
        reading_for(
            canonical_unit=QUANTITIES[parameter_quantity].canonical_unit,
            display_unit=QUANTITIES[parameter_quantity].reading_unit,
            accepted_units=QUANTITIES[parameter_quantity].accepted_units,
            requested=None,
        )
        if parameter_quantity
        else None
    )

    def fits(value: float, log: bool) -> bool:
        return value > 0 if log else True

    drawn: list[DrawnSeries] = []
    xs: list[float] = []
    ys: list[float] = []
    excluded_total = 0
    bands_dropped = 0
    for item in series:
        rows: list[DrawnPoint] = []
        path: list[tuple[float, float]] = []
        excluded = 0
        for position, point in enumerate(item.points):
            x = rx.value(point.x)
            y = ry.value(point.y)
            assert x is not None and y is not None
            ok = fits(x, x_log) and fits(y, y_log)
            rows.append(
                DrawnPoint(
                    position=position,
                    x=x,
                    y=y,
                    y_min=ry.value(point.y_min),
                    y_max=ry.value(point.y_max),
                    x_original=point.x_original,
                    y_original=point.y_original,
                    y_min_original=point.y_min_original,
                    y_max_original=point.y_max_original,
                    drawn=ok,
                )
            )
            if ok:
                path.append((x, y))
                xs.append(x)
                ys.append(y)
            else:
                excluded += 1

        band: tuple[tuple[float, float], ...] | None = None
        banded = [r for r in rows if r.y_min is not None and r.y_max is not None]
        if banded:
            drawable = len(banded) >= 2 and all(
                fits(r.x, x_log) and fits(r.y_min, y_log) and fits(r.y_max, y_log)  # type: ignore[arg-type]
                for r in banded
            )
            if drawable:
                lower = [(r.x, r.y_min) for r in banded]
                upper = [(r.x, r.y_max) for r in reversed(banded)]
                band = tuple(lower + upper)  # type: ignore[arg-type]
                ys.extend(r.y_min for r in banded)  # type: ignore[misc]
                ys.extend(r.y_max for r in banded)  # type: ignore[misc]
            else:
                bands_dropped += 1

        excluded_total += excluded
        drawn.append(
            DrawnSeries(
                id=item.id,
                label=item.label,
                conditions=item.conditions,
                parameter_value=(
                    parameter_reading.value(item.parameter) if parameter_reading else None
                ),
                parameter_original=item.parameter_original,
                parameter_original_unit=item.parameter_original_unit,
                path=tuple(path),
                band=band,
                points=tuple(rows),
                excluded=excluded,
            )
        )

    notes: list[str] = []
    if excluded_total:
        notes.append(
            f"{excluded_total} ponto(s) com valor menor ou igual a zero não aparecem em escala "
            "logarítmica; continuam na tabela de pontos."
        )
    if bands_dropped:
        notes.append(
            f"A faixa declarada de {bands_dropped} série(s) não é desenhada nesta escala "
            "(precisa de ao menos dois pontos com faixa, todos positivos em eixo log); "
            "os limites continuam na tabela."
        )

    return DrawnCurve(
        scale=chosen,
        x=DrawnAxis(xq, rx, x_log, _padded(xs, x_log, is_ratio_scale(rx.unit))),
        y=DrawnAxis(yq, ry, y_log, _padded(ys, y_log, is_ratio_scale(ry.unit))),
        parameter_reading=parameter_reading,
        series=tuple(drawn),
        notes=notes,
    )
