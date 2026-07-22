"""Business logic for the material catalogue.

Transforms ORM entities into API schemas, grouping property values by category
and preserving the missing-data and unit-provenance information end to end.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.enums import PropertyCategory
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.repositories.material_repository import MaterialRepository
from app.schemas.material import (
    ChartData,
    ChartPoint,
    MaterialDetail,
    MaterialListItem,
)
from app.schemas.property import PropertyGroup, PropertyValueOut

# Order in which categories are presented on the sheet.
_CATEGORY_ORDER = [
    PropertyCategory.FISICA,
    PropertyCategory.MECANICA,
    PropertyCategory.TERMICA,
    PropertyCategory.ELETRICA,
    PropertyCategory.AMBIENTAL,
    PropertyCategory.ECONOMICA,
]


class MaterialNotFoundError(Exception):
    """Raised when a material id does not exist."""


class MaterialService:
    """Coordinates catalogue reads and shapes them into API responses."""

    def __init__(self, db: Session) -> None:
        self.repo = MaterialRepository(db)

    def list_materials(self, search: Optional[str] = None) -> list[MaterialListItem]:
        materials = self.repo.list_materials(search)
        return [
            MaterialListItem(
                id=m.id,
                name=m.name,
                class_name=m.material_class.name,
                subclass=m.subclass,
                is_demo=m.is_demo,
                keywords=list(m.keywords or []),
            )
            for m in materials
        ]

    def get_material_detail(self, material_id: int) -> MaterialDetail:
        material = self.repo.get_material(material_id)
        if material is None:
            raise MaterialNotFoundError(str(material_id))
        return MaterialDetail(
            id=material.id,
            name=material.name,
            class_name=material.material_class.name,
            subclass=material.subclass,
            description=material.description,
            is_demo=material.is_demo,
            keywords=list(material.keywords or []),
            property_groups=self._group_properties(material),
        )

    def _group_properties(self, material: Material) -> list[PropertyGroup]:
        """Group a material's property values by category, preserving order."""
        buckets: dict[PropertyCategory, list[PropertyValueOut]] = {
            cat: [] for cat in _CATEGORY_ORDER
        }
        for value in material.property_values:
            out = self._to_property_out(value)
            buckets[out.category].append(out)

        groups: list[PropertyGroup] = []
        for category in _CATEGORY_ORDER:
            props = buckets[category]
            if props:
                props.sort(key=lambda p: p.property_name)
                groups.append(PropertyGroup(category=category, properties=props))
        return groups

    @staticmethod
    def _to_property_out(value: MaterialPropertyValue) -> PropertyValueOut:
        definition = value.property_definition
        return PropertyValueOut(
            property_slug=definition.slug,
            property_name=definition.name,
            symbol=definition.symbol,
            category=definition.category,
            is_missing=value.is_missing,
            is_interval=definition.is_interval,
            value_scalar=value.value_scalar,
            value_min=value.value_min,
            value_max=value.value_max,
            value_typical=value.value_typical,
            original_unit=value.original_unit,
            normalized_value=value.normalized_value,
            canonical_unit=value.canonical_unit,
            conversion_method=value.conversion_method,
            uncertainty=value.uncertainty,
            measurement_condition=value.measurement_condition,
            notes=value.notes,
            data_quality=value.data_quality,
            source_label=value.source.label if value.source else None,
        )

    def build_chart(self, x_slug: str, y_slug: str) -> ChartData:
        """Build scatter data for two properties using normalised values.

        A material is plotted only if it has a non-missing normalised value for
        *both* axes. Materials missing either axis are reported in
        ``excluded_material_ids`` so the UI can disclose incomplete coverage.
        """
        x_def = self.repo.get_property_by_slug(x_slug)
        y_def = self.repo.get_property_by_slug(y_slug)
        if x_def is None or y_def is None:
            missing = x_slug if x_def is None else y_slug
            raise MaterialNotFoundError(f"property:{missing}")

        x_values = {
            v.material_id: v
            for v in self.repo.values_for_property(x_slug)
            if v.normalized_value is not None
        }
        y_values = {
            v.material_id: v
            for v in self.repo.values_for_property(y_slug)
            if v.normalized_value is not None
        }

        points: list[ChartPoint] = []
        both_ids = x_values.keys() & y_values.keys()
        for material_id in both_ids:
            xv = x_values[material_id]
            points.append(
                ChartPoint(
                    material_id=material_id,
                    material_name=xv.material.name,
                    class_name=xv.material.material_class.name,
                    x=x_values[material_id].normalized_value,  # type: ignore[arg-type]
                    y=y_values[material_id].normalized_value,  # type: ignore[arg-type]
                )
            )
        points.sort(key=lambda p: p.material_name)

        excluded = sorted((x_values.keys() | y_values.keys()) - both_ids)

        return ChartData(
            x_property_slug=x_def.slug,
            x_property_name=x_def.name,
            x_unit=x_def.canonical_unit,
            y_property_slug=y_def.slug,
            y_property_name=y_def.name,
            y_unit=y_def.canonical_unit,
            points=points,
            excluded_material_ids=excluded,
        )
