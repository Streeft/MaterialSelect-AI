"""The quantities a material curve's axes may carry (D-106, TM4).

Kept apart from ``app.domain.curves`` so the ORM model can read the list for its
``CHECK`` without importing the domain module that imports the model package —
plain data, no imports from ``app``.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AxisQuantity:
    """A quantity an axis (or a series parameter) may carry."""

    key: str
    name: str
    canonical_unit: str
    #: The unit the quantity is read in when the reader chose none (D-70).
    reading_unit: str
    #: The units a reader may choose. Anything else is refused, never ignored.
    accepted_units: tuple[str, ...]
    #: Whether a logarithmic axis means anything for this quantity. False for a
    #: temperature (an offset scale: log °C is not log K shifted) and for the
    #: stress ratio R, which is routinely negative.
    allows_log: bool


QUANTITIES: dict[str, AxisQuantity] = {
    q.key: q
    for q in (
        AxisQuantity(
            "deformacao", "Deformação", "dimensionless", "%", ("dimensionless", "%"), True
        ),
        AxisQuantity(
            "tensao",
            "Tensão",
            "Pa",
            "MPa",
            ("Pa", "kPa", "MPa", "GPa", "psi", "ksi"),
            True,
        ),
        AxisQuantity("modulo", "Módulo", "Pa", "GPa", ("Pa", "MPa", "GPa", "psi", "ksi"), True),
        AxisQuantity("temperatura", "Temperatura", "K", "degC", ("K", "degC", "degF"), False),
        AxisQuantity("tempo", "Tempo", "s", "h", ("s", "min", "h", "day"), True),
        AxisQuantity(
            "ciclos", "Número de ciclos", "dimensionless", "dimensionless", ("dimensionless",), True
        ),
        AxisQuantity(
            "taxa_deformacao", "Taxa de deformação", "1/s", "1/s", ("1/s", "1/min", "1/h"), True
        ),
        AxisQuantity(
            "razao_tensao",
            "Razão de tensões R",
            "dimensionless",
            "dimensionless",
            ("dimensionless",),
            False,
        ),
    )
}

__all__ = ["QUANTITIES", "AxisQuantity"]
