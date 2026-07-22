"""Material request/response schemas."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.enums import DataQuality
from app.schemas.property import PropertyGroup

# The three ways a property value can be provided on input.
ValueKind = Literal["scalar", "interval", "missing"]


class PropertyValueIn(BaseModel):
    """Payload for one property value attached to a material.

    ``kind`` selects the representation:
      * ``scalar``   -> ``value`` + ``unit`` required;
      * ``interval`` -> ``value_min``/``value_max`` + ``unit`` required
        (``value_typical`` optional, defaults to the mid-point);
      * ``missing``  -> no numeric fields; recorded as explicitly absent.

    The service performs unit conversion and dimensional validation; a missing
    value is never coerced to zero.
    """

    property_slug: str
    kind: ValueKind
    # allow_inf_nan=False: non-finite numbers (inf/NaN) must be rejected at the
    # boundary — they would corrupt normalized values and chart scaling.
    value: Optional[float] = Field(default=None, allow_inf_nan=False)
    value_min: Optional[float] = Field(default=None, allow_inf_nan=False)
    value_max: Optional[float] = Field(default=None, allow_inf_nan=False)
    value_typical: Optional[float] = Field(default=None, allow_inf_nan=False)
    unit: Optional[str] = None
    uncertainty: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    measurement_condition: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)
    source_label: Optional[str] = Field(default=None, max_length=160)
    data_quality: DataQuality = DataQuality.ESTIMADO


class MaterialCreate(BaseModel):
    """Payload to create a material together with its property values."""

    name: str = Field(min_length=1, max_length=200)
    class_id: int
    subclass: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    keywords: list[str] = Field(default_factory=list)
    # User-created data is not demonstration data by default.
    is_demo: bool = False
    values: list[PropertyValueIn] = Field(default_factory=list)


class MaterialUpdate(BaseModel):
    """Partial update of a material's identity fields.

    All fields optional; only those provided are changed. Property values are
    replaced through a dedicated endpoint, not here.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    class_id: Optional[int] = None
    subclass: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    keywords: Optional[list[str]] = None
    is_active: Optional[bool] = None


class MaterialListItem(BaseModel):
    """Compact material representation for the catalogue list."""

    id: int
    name: str
    class_name: str
    subclass: Optional[str] = None
    is_demo: bool
    keywords: list[str] = []


class MaterialDetail(BaseModel):
    """Full material sheet: identity plus properties grouped by category."""

    id: int
    name: str
    class_id: int
    class_name: str
    subclass: Optional[str] = None
    description: Optional[str] = None
    is_demo: bool
    is_active: bool = True
    keywords: list[str] = []
    property_groups: list[PropertyGroup]


class ChartPoint(BaseModel):
    """One material's coordinates on the X-Y property map."""

    material_id: int
    material_name: str
    class_name: str
    x: float
    y: float


class ChartData(BaseModel):
    """Data for a two-property scatter map (canonical/normalised values).

    Only materials that have a non-missing normalised value for *both* axes are
    included; the excluded ones are reported so the UI can be honest about
    coverage.
    """

    x_property_slug: str
    x_property_name: str
    x_unit: str
    y_property_slug: str
    y_property_name: str
    y_unit: str
    points: list[ChartPoint]
    excluded_material_ids: list[int] = []
