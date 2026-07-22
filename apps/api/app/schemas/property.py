"""Schemas describing a property value as returned on the material sheet."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.enums import BetterDirection, DataQuality, PropertyCategory


class PropertyValueOut(BaseModel):
    """A single property value, with full unit and provenance trail.

    ``is_missing`` is always present and explicit; when True the numeric fields
    are ``None`` (never ``0``), so the UI can render an "ausente" state.
    """

    property_slug: str
    property_name: str
    symbol: str | None = None
    category: PropertyCategory

    is_missing: bool
    is_interval: bool

    value_scalar: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    value_typical: float | None = None

    original_unit: str | None = None
    normalized_value: float | None = None
    canonical_unit: str | None = None
    conversion_method: str | None = None

    uncertainty: float | None = None
    measurement_condition: str | None = None
    notes: str | None = None

    data_quality: DataQuality
    source_label: str | None = None


class PropertyGroup(BaseModel):
    """Property values grouped under one category for display."""

    category: PropertyCategory
    properties: list[PropertyValueOut]


class PropertyDefinitionIn(BaseModel):
    """Payload to create or update a property definition.

    ``slug`` is optional on input; when omitted it is derived from ``name``.
    ``canonical_unit`` and ``physical_dimension`` are Pint-parsable strings; the
    service validates them before persisting.
    """

    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=160)
    symbol: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=500)
    category: PropertyCategory
    physical_dimension: str = Field(default="", max_length=120)
    canonical_unit: str = Field(min_length=1, max_length=60)
    accepted_units: list[str] = Field(default_factory=list)
    is_interval: bool = False
    better_direction: BetterDirection = BetterDirection.NEUTRAL
    allows_log_scale: bool = True


class PropertyDefinitionOut(BaseModel):
    """A property definition as returned by the API."""

    id: int
    name: str
    slug: str
    symbol: str | None = None
    description: str | None = None
    category: PropertyCategory
    physical_dimension: str
    canonical_unit: str
    accepted_units: list[str]
    is_interval: bool
    better_direction: BetterDirection
    allows_log_scale: bool
    value_count: int = 0
