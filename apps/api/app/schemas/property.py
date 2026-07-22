"""Schemas describing a property value as returned on the material sheet."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.models.enums import DataQuality, PropertyCategory


class PropertyValueOut(BaseModel):
    """A single property value, with full unit and provenance trail.

    ``is_missing`` is always present and explicit; when True the numeric fields
    are ``None`` (never ``0``), so the UI can render an "ausente" state.
    """

    property_slug: str
    property_name: str
    symbol: Optional[str] = None
    category: PropertyCategory

    is_missing: bool
    is_interval: bool

    value_scalar: Optional[float] = None
    value_min: Optional[float] = None
    value_max: Optional[float] = None
    value_typical: Optional[float] = None

    original_unit: Optional[str] = None
    normalized_value: Optional[float] = None
    canonical_unit: Optional[str] = None
    conversion_method: Optional[str] = None

    uncertainty: Optional[float] = None
    measurement_condition: Optional[str] = None
    notes: Optional[str] = None

    data_quality: DataQuality
    source_label: Optional[str] = None


class PropertyGroup(BaseModel):
    """Property values grouped under one category for display."""

    category: PropertyCategory
    properties: list[PropertyValueOut]
