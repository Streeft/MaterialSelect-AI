"""Business logic for the material catalogue.

Transforms ORM entities into API schemas, grouping property values by category
and preserving the missing-data and unit-provenance information end to end.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.units import UnitError
from app.domain.data_quality import (
    build_interval_value,
    build_scalar_value,
    missing_value,
)
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.enums import DataQuality, PropertyCategory
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.repositories.material_repository import MaterialRepository
from app.schemas.material import (
    ChartData,
    ChartPoint,
    DataQualitySummary,
    MaterialCreate,
    MaterialDetail,
    MaterialListItem,
    MaterialUpdate,
    PropertyValueIn,
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


def _summarise_quality(material: Material) -> DataQualitySummary:
    """Count a material's values by provenance, keeping absence separate.

    A value flagged missing carries a ``data_quality`` like any other row, but
    counting it under that quality would state that something was measured or
    imported when nothing was. Absence is counted on its own.
    """
    summary = DataQualitySummary()
    for value in material.property_values:
        if value.is_missing:
            summary.missing += 1
        elif value.data_quality is DataQuality.MEDIDO:
            summary.medido += 1
        elif value.data_quality is DataQuality.IMPORTADO:
            summary.importado += 1
        else:
            summary.estimado += 1
    return summary


class MaterialService:
    """Coordinates catalogue reads and shapes them into API responses."""

    def __init__(self, db: Session) -> None:
        self.repo = MaterialRepository(db)

    def list_materials(self, search: str | None = None) -> list[MaterialListItem]:
        materials = self.repo.list_materials(search)
        return [
            MaterialListItem(
                id=m.id,
                name=m.name,
                class_name=m.material_class.name,
                class_slug=m.material_class.slug,
                subclass=m.subclass,
                is_demo=m.is_demo,
                keywords=list(m.keywords or []),
                quality=_summarise_quality(m),
            )
            for m in materials
        ]

    def get_material_detail(self, material_id: int) -> MaterialDetail:
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        return MaterialDetail(
            id=material.id,
            name=material.name,
            class_id=material.class_id,
            class_name=material.material_class.name,
            class_slug=material.material_class.slug,
            subclass=material.subclass,
            description=material.description,
            is_demo=material.is_demo,
            is_active=material.is_active,
            keywords=list(material.keywords or []),
            property_groups=self._group_properties(material),
        )

    # --- write operations -------------------------------------------------

    def create_material(self, payload: MaterialCreate) -> MaterialDetail:
        """Create a material and its property values.

        Validates the referenced class and every property/unit; the whole
        operation is atomic (a single invalid value aborts the creation).
        """
        if self.repo.get_class(payload.class_id) is None:
            raise NotFoundError(f"Classe não encontrada: {payload.class_id}")
        if self.repo.name_exists(payload.name):
            raise ConflictError(f"Já existe um material com o nome: {payload.name}")
        self._ensure_unique_slugs(payload.values)

        material = Material(
            name=payload.name.strip(),
            class_id=payload.class_id,
            subclass=payload.subclass,
            description=payload.description,
            keywords=payload.keywords,
            is_demo=payload.is_demo,
            is_active=True,
        )
        self.repo.add(material)
        self.repo.flush()

        for value_in in payload.values:
            row = self._build_value_from_input(value_in, is_demo=payload.is_demo)
            row.material_id = material.id
            self.repo.add(row)

        self.repo.commit()
        return self.get_material_detail(material.id)

    def update_material(self, material_id: int, payload: MaterialUpdate) -> MaterialDetail:
        """Apply a partial update to a material's identity fields."""
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")

        data = payload.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is not None:
            new_name = data["name"].strip()
            if self.repo.name_exists(new_name, exclude_id=material_id):
                raise ConflictError(f"Já existe um material com o nome: {new_name}")
            material.name = new_name
        if "class_id" in data and data["class_id"] is not None:
            if self.repo.get_class(data["class_id"]) is None:
                raise NotFoundError(f"Classe não encontrada: {data['class_id']}")
            material.class_id = data["class_id"]
        if "subclass" in data:
            material.subclass = data["subclass"]
        if "description" in data:
            material.description = data["description"]
        if "keywords" in data and data["keywords"] is not None:
            material.keywords = data["keywords"]
        if "is_active" in data and data["is_active"] is not None:
            material.is_active = data["is_active"]

        self.repo.commit()
        return self.get_material_detail(material_id)

    def deactivate_material(self, material_id: int) -> None:
        """Soft-delete a material by setting ``is_active`` to False."""
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        material.is_active = False
        self.repo.commit()

    def replace_property_values(
        self, material_id: int, values: list[PropertyValueIn]
    ) -> MaterialDetail:
        """Replace all property values of a material with the provided set."""
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        self._ensure_unique_slugs(values)

        # Build (and validate) the new rows before deleting the old ones, so a
        # validation error leaves the existing data untouched.
        new_rows = [self._build_value_from_input(v, is_demo=material.is_demo) for v in values]
        self.repo.delete_values_for_material(material_id)
        for row in new_rows:
            row.material_id = material_id
            self.repo.add(row)
        self.repo.commit()
        return self.get_material_detail(material_id)

    @staticmethod
    def _ensure_unique_slugs(values: list[PropertyValueIn]) -> None:
        """Reject payloads with the same property listed more than once.

        Duplicate rows for one (material, property) pair would make chart points
        depend on arbitrary SELECT ordering — a determinism violation.
        """
        slugs = [v.property_slug for v in values]
        duplicates = sorted({s for s in slugs if slugs.count(s) > 1})
        if duplicates:
            raise ValidationError(f"Propriedades repetidas no payload: {', '.join(duplicates)}")

    def _build_value_from_input(
        self, payload: PropertyValueIn, is_demo: bool
    ) -> MaterialPropertyValue:
        """Convert a PropertyValueIn into a validated MaterialPropertyValue.

        Unit conversion and dimensional/interval validation happen here; any
        failure is surfaced as a ``ValidationError`` (HTTP 400).
        """
        prop = self.repo.get_property_by_slug(payload.property_slug)
        if prop is None:
            raise NotFoundError(f"Propriedade não encontrada: {payload.property_slug}")

        try:
            if payload.kind == "missing":
                nv = missing_value()
            elif payload.kind == "scalar":
                if payload.value is None or not payload.unit:
                    raise ValidationError(
                        f"Valor escalar requer 'value' e 'unit' ({payload.property_slug})."
                    )
                nv = build_scalar_value(payload.value, payload.unit, prop.canonical_unit)
            elif payload.kind == "interval":
                if payload.value_min is None or payload.value_max is None or not payload.unit:
                    raise ValidationError(
                        f"Intervalo requer 'value_min', 'value_max' e 'unit' ({payload.property_slug})."
                    )
                nv = build_interval_value(
                    payload.value_min,
                    payload.value_max,
                    payload.unit,
                    prop.canonical_unit,
                    value_typical=payload.value_typical,
                )
            else:  # pragma: no cover - guarded by the schema's Literal
                raise ValidationError(f"Tipo de valor inválido: {payload.kind}")
        except UnitError as exc:
            raise ValidationError(str(exc)) from exc
        except ValueError as exc:
            # Raised by build_interval_value on an inverted interval.
            raise ValidationError(str(exc)) from exc

        source_id = None
        if payload.source_label:
            source = self.repo.get_or_create_source(payload.source_label, is_demo=is_demo)
            source_id = source.id

        return MaterialPropertyValue(
            property_id=prop.id,
            value_scalar=nv.value_scalar,
            value_min=nv.value_min,
            value_max=nv.value_max,
            value_typical=nv.value_typical,
            original_unit=nv.original_unit,
            normalized_value=nv.normalized_value,
            canonical_unit=nv.canonical_unit,
            conversion_method=nv.conversion_method,
            uncertainty=payload.uncertainty,
            measurement_condition=payload.measurement_condition,
            notes=payload.notes,
            source_id=source_id,
            data_quality=payload.data_quality,
            is_missing=nv.is_missing,
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
            raise NotFoundError(f"Propriedade não encontrada: {missing}")

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
