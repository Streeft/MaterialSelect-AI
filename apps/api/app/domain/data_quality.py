"""Domain rules for data quality and missing values.

Central place for the non-negotiable rule of the methodology: **a missing value
is never zero**. Any code that builds a property value goes through here so the
rule cannot be bypassed by accident.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.calculations.units import to_canonical
from app.models.enums import DataQuality


@dataclass(frozen=True)
class NormalizedValue:
    """Result of normalising a scalar/interval value to canonical units.

    ``is_missing`` marks the absence of data explicitly. When True, every numeric
    field is ``None`` — never ``0``.
    """

    is_missing: bool
    value_scalar: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    value_typical: float | None = None
    original_unit: str | None = None
    normalized_value: float | None = None
    #: The interval's **bounds** in canonical units. Both None for a scalar.
    #:
    #: ``normalized_value`` alone was enough while every interval meant scatter
    #: around one true value: charts plot the representative point, and a filter
    #: compared against it. A process capability range (P0-4) is a different
    #: datum — every point inside is achievable, so the *bounds* are what a
    #: threshold is compared against, and they have to exist in canonical units
    #: to be comparable at all. Same arithmetic as the typical, one conversion
    #: per bound so an offset scale (°C→K) stays correct.
    #:
    #: ``MaterialPropertyValue`` has no columns for these yet, so for a material
    #: interval they are computed and dropped on write. Giving material
    #: intervals envelope semantics would move every existing funnel count, so
    #: it is its own item, not a side effect of this one.
    normalized_min: float | None = None
    normalized_max: float | None = None
    canonical_unit: str | None = None
    conversion_method: str | None = None


def missing_value() -> NormalizedValue:
    """Return a value marked as explicitly missing (all numeric fields None)."""
    return NormalizedValue(is_missing=True)


def build_scalar_value(value: float, original_unit: str, canonical_unit: str) -> NormalizedValue:
    """Build a normalised scalar value, converting to canonical units.

    The original value and unit are preserved; the normalised value and the
    conversion method are recorded for traceability.
    """
    normalized, method = to_canonical(value, original_unit, canonical_unit)
    return NormalizedValue(
        is_missing=False,
        value_scalar=value,
        original_unit=original_unit,
        normalized_value=normalized,
        canonical_unit=canonical_unit,
        conversion_method=method,
    )


def build_interval_value(
    value_min: float,
    value_max: float,
    original_unit: str,
    canonical_unit: str,
    value_typical: float | None = None,
) -> NormalizedValue:
    """Build a normalised interval value.

    The typical value (defaulting to the interval mid-point) is normalised and
    stored as ``normalized_value`` so charts have a single representative point.
    The **bounds** are normalised too, into ``normalized_min``/``normalized_max``:
    a process capability range is compared against its bounds, not its midpoint
    (P0-4), and the conversion is the same arithmetic either way — so this is one
    builder and what differs is how the engine reads the result.

    Raises:
        ValueError: if the interval is inverted (min > max) or the provided
            typical value falls outside [min, max] — the typical is the single
            representative point used on charts, so an out-of-range typical
            would silently misplace the material.
    """
    if value_min > value_max:
        raise ValueError(f"Intervalo invertido: min ({value_min}) maior que max ({value_max})")
    if value_typical is not None and not (value_min <= value_typical <= value_max):
        raise ValueError(
            f"Valor típico ({value_typical}) fora do intervalo [{value_min}, {value_max}]"
        )
    typical = value_typical if value_typical is not None else (value_min + value_max) / 2.0
    normalized, method = to_canonical(typical, original_unit, canonical_unit)
    normalized_min, _ = to_canonical(value_min, original_unit, canonical_unit)
    normalized_max, _ = to_canonical(value_max, original_unit, canonical_unit)
    return NormalizedValue(
        is_missing=False,
        value_min=value_min,
        value_max=value_max,
        value_typical=typical,
        original_unit=original_unit,
        normalized_value=normalized,
        normalized_min=normalized_min,
        normalized_max=normalized_max,
        canonical_unit=canonical_unit,
        conversion_method=method,
    )


# Default provenance for demonstration data. Kept here so seeding and future
# importers agree on the same classification.
DEFAULT_DEMO_QUALITY = DataQuality.ESTIMADO
