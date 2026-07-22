"""Material request/response schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.schemas.property import PropertyGroup


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
    class_name: str
    subclass: Optional[str] = None
    description: Optional[str] = None
    is_demo: bool
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
