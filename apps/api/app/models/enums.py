"""Enumerations shared across the domain model.

These are stored as strings in the database so they remain human-readable and
portable between SQLite (development) and PostgreSQL (production).
"""

from __future__ import annotations

import enum


class PropertyCategory(str, enum.Enum):
    """Category used to group properties on the material detail sheet."""

    FISICA = "FISICA"
    MECANICA = "MECANICA"
    TERMICA = "TERMICA"
    ELETRICA = "ELETRICA"
    AMBIENTAL = "AMBIENTAL"
    ECONOMICA = "ECONOMICA"


class BetterDirection(str, enum.Enum):
    """Whether a higher or lower value of a property is desirable.

    Used later by ranking / performance-index features to know the optimisation
    direction. ``NEUTRAL`` means neither direction is inherently better.
    """

    HIGHER = "HIGHER"
    LOWER = "LOWER"
    NEUTRAL = "NEUTRAL"


class DataQuality(str, enum.Enum):
    """Provenance / confidence level of a stored property value.

    The distinction is required by the methodology: measured data must never be
    silently mixed with estimated or imported data.
    """

    MEDIDO = "MEDIDO"
    IMPORTADO = "IMPORTADO"
    ESTIMADO = "ESTIMADO"
