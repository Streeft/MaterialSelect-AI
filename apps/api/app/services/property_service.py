"""Business logic for the property-definition catalogue."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.units import UnitError, validate_dimension
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.slug import slugify
from app.models.property_definition import PropertyDefinition
from app.repositories.property_definition_repository import (
    PropertyDefinitionRepository,
)
from app.schemas.property import PropertyDefinitionIn, PropertyDefinitionOut


class PropertyService:
    """Coordinates CRUD of property definitions, validating units/dimensions."""

    def __init__(self, db: Session) -> None:
        self.repo = PropertyDefinitionRepository(db)

    def list_properties(self) -> list[PropertyDefinitionOut]:
        return [self._to_out(prop, count) for prop, count in self.repo.list_with_counts()]

    def create_property(self, payload: PropertyDefinitionIn) -> PropertyDefinitionOut:
        slug = self._resolve_slug(payload)
        if self.repo.slug_exists(slug):
            raise ConflictError(f"Já existe uma propriedade com o slug: {slug}")
        self._validate_units(payload)

        obj = PropertyDefinition(
            name=payload.name.strip(),
            slug=slug,
            symbol=payload.symbol,
            description=payload.description,
            category=payload.category,
            physical_dimension=payload.physical_dimension,
            canonical_unit=payload.canonical_unit,
            accepted_units=payload.accepted_units,
            is_interval=payload.is_interval,
            better_direction=payload.better_direction,
            allows_log_scale=payload.allows_log_scale,
        )
        self.repo.add(obj)
        self.repo.commit()
        return self._to_out(obj, 0)

    def update_property(
        self, property_id: int, payload: PropertyDefinitionIn
    ) -> PropertyDefinitionOut:
        obj = self.repo.get(property_id)
        if obj is None:
            raise NotFoundError(f"Propriedade não encontrada: {property_id}")

        slug = self._resolve_slug(payload)
        if self.repo.slug_exists(slug, exclude_id=property_id):
            raise ConflictError(f"Já existe uma propriedade com o slug: {slug}")
        self._validate_units(payload)

        # Changing the canonical unit or dimension would desynchronise every
        # stored normalized_value from the definition (a chart labelled g/cm³
        # plotting values still in kg/m³). Block while values exist; a future
        # migration tool may re-normalise instead (see docs/TODO.md).
        unit_changed = (
            payload.canonical_unit != obj.canonical_unit
            or payload.physical_dimension != obj.physical_dimension
        )
        if unit_changed and self.repo.value_count(property_id) > 0:
            raise ConflictError(
                "Não é possível alterar a unidade canônica ou a dimensão física de "
                "uma propriedade com valores cadastrados."
            )

        obj.name = payload.name.strip()
        obj.slug = slug
        obj.symbol = payload.symbol
        obj.description = payload.description
        obj.category = payload.category
        obj.physical_dimension = payload.physical_dimension
        obj.canonical_unit = payload.canonical_unit
        obj.accepted_units = payload.accepted_units
        obj.is_interval = payload.is_interval
        obj.better_direction = payload.better_direction
        obj.allows_log_scale = payload.allows_log_scale
        self.repo.commit()
        return self._to_out(obj, self.repo.value_count(property_id))

    def delete_property(self, property_id: int) -> None:
        obj = self.repo.get(property_id)
        if obj is None:
            raise NotFoundError(f"Propriedade não encontrada: {property_id}")
        if self.repo.value_count(property_id) > 0:
            raise ConflictError("Não é possível excluir uma propriedade com valores cadastrados.")
        self.repo.delete(obj)
        self.repo.commit()

    # --- helpers ----------------------------------------------------------

    def _resolve_slug(self, payload: PropertyDefinitionIn) -> str:
        slug = (payload.slug or slugify(payload.name)).strip()
        if not slug:
            raise ValidationError("Não foi possível gerar um slug a partir do nome.")
        return slug

    def _validate_units(self, payload: PropertyDefinitionIn) -> None:
        """Ensure the canonical unit is known and matches the declared dimension."""
        try:
            ok = validate_dimension(payload.canonical_unit, payload.physical_dimension)
        except UnitError as exc:
            raise ValidationError(str(exc)) from exc
        if not ok:
            raise ValidationError(
                f"A unidade canônica '{payload.canonical_unit}' não corresponde à "
                f"dimensão física '{payload.physical_dimension}'."
            )
        # Every accepted unit must be dimensionally compatible with the canonical one.
        for unit in payload.accepted_units:
            try:
                compatible = validate_dimension(unit, payload.physical_dimension)
            except UnitError as exc:
                raise ValidationError(str(exc)) from exc
            if not compatible:
                raise ValidationError(
                    f"A unidade aceita '{unit}' é incompatível com a dimensão da propriedade."
                )

    @staticmethod
    def _to_out(prop: PropertyDefinition, value_count: int) -> PropertyDefinitionOut:
        return PropertyDefinitionOut(
            id=prop.id,
            name=prop.name,
            slug=prop.slug,
            symbol=prop.symbol,
            description=prop.description,
            category=prop.category,
            physical_dimension=prop.physical_dimension,
            canonical_unit=prop.canonical_unit,
            accepted_units=list(prop.accepted_units or []),
            is_interval=prop.is_interval,
            better_direction=prop.better_direction,
            allows_log_scale=prop.allows_log_scale,
            value_count=value_count,
        )
