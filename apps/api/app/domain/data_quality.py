"""Domain rules for data quality and missing values.

Central place for the non-negotiable rule of the methodology: **a missing value
is never zero**. Any code that builds a property value goes through here so the
rule cannot be bypassed by accident.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.calculations.units import to_canonical
from app.models.enums import DataQuality


@dataclass(frozen=True)
class NormalizedValue:
    """Result of normalising a scalar/interval value to canonical units.

    ``is_missing`` marks the absence of data explicitly. When True, every numeric
    field is ``None`` — never ``0``.
    """

    is_missing: bool
    value_scalar: Optional[float] = None
    value_min: Optional[float] = None
    value_max: Optional[float] = None
    value_typical: Optional[float] = None
    original_unit: Optional[str] = None
    normalized_value: Optional[float] = None
    canonical_unit: Optional[str] = None
    conversion_method: Optional[str] = None


def missing_value() -> NormalizedValue:
    """Return a value marked as explicitly missing (all numeric fields None)."""
    return NormalizedValue(is_missing=True)


def build_scalar_value(
    value: float, original_unit: str, canonical_unit: str
) -> NormalizedValue:
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
    value_typical: Optional[float] = None,
) -> NormalizedValue:
    """Build a normalised interval value.

    The typical value (defaulting to the interval mid-point) is normalised and
    stored as ``normalized_value`` so charts have a single representative point.

    Raises:
        ValueError: if the interval is inverted (min > max) or the provided
            typical value falls outside [min, max] — the typical is the single
            representative point used on charts, so an out-of-range typical
            would silently misplace the material.
    """
    if value_min > value_max:
        raise ValueError(
            f"Intervalo invertido: min ({value_min}) maior que max ({value_max})"
        )
    if value_typical is not None and not (value_min <= value_typical <= value_max):
        raise ValueError(
            f"Valor típico ({value_typical}) fora do intervalo [{value_min}, {value_max}]"
        )
    typical = value_typical if value_typical is not None else (value_min + value_max) / 2.0
    normalized, method = to_canonical(typical, original_unit, canonical_unit)
    return NormalizedValue(
        is_missing=False,
        value_min=value_min,
        value_max=value_max,
        value_typical=typical,
        original_unit=original_unit,
        normalized_value=normalized,
        canonical_unit=canonical_unit,
        conversion_method=method,
    )


# Default provenance for demonstration data. Kept here so seeding and future
# importers agree on the same classification.
DEFAULT_DEMO_QUALITY = DataQuality.ESTIMADO
