"""Business logic for the property-definition catalogue."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.units import UnitError, to_canonical, validate_dimension
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.slug import slugify
from app.models.enums import AuditAction, AuditEntityType
from app.models.property_definition import PropertyDefinition
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.property_definition_repository import (
    PropertyDefinitionRepository,
)
from app.schemas.property import PropertyDefinitionIn, PropertyDefinitionOut
from app.services.audit_service import diff_fields, record_change


class PropertyService:
    """Coordinates CRUD of property definitions, validating units/dimensions."""

    def __init__(self, db: Session, user: User | None = None) -> None:
        self.repo = PropertyDefinitionRepository(db)
        self.audit_repo = AuditRepository(db)
        self.user = user

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
        self.repo.flush()
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.PROPERTY_DEFINITION,
            entity_id=obj.id,
            entity_label=obj.name,
            action=AuditAction.CRIADO,
        )
        self.repo.commit()
        return self._to_out(obj, 0)

    def update_property(
        self, property_id: int, payload: PropertyDefinitionIn
    ) -> PropertyDefinitionOut:
        obj = self.repo.get(property_id)
        if obj is None:
            raise NotFoundError(f"Propriedade não encontrada: {property_id}")
        before = self._snapshot(obj)

        slug = self._resolve_slug(payload)
        if self.repo.slug_exists(slug, exclude_id=property_id):
            raise ConflictError(f"Já existe uma propriedade com o slug: {slug}")
        self._validate_units(payload)

        # Changing the physical dimension is never safe to renormalize
        # automatically: it means the unit conversion itself would be
        # dimensionally invalid (density -> pressure has no conversion
        # factor), so it stays blocked exactly as before. Changing only the
        # canonical unit *within* the same dimension (kg/m3 -> g/cm3) is
        # safe: every stored value's normalized_value can be recomputed from
        # its own original_unit via to_canonical, in one transaction.
        dimension_changed = payload.physical_dimension != obj.physical_dimension
        canonical_unit_changed = payload.canonical_unit != obj.canonical_unit

        if dimension_changed and self.repo.value_count(property_id) > 0:
            raise ConflictError(
                "Não é possível alterar a dimensão física de uma propriedade com "
                "valores cadastrados."
            )

        if canonical_unit_changed and not dimension_changed:
            values = self.repo.list_values(property_id)
            # Compute every new normalized_value BEFORE writing any of them:
            # one incompatible original_unit anywhere in the property must
            # abort the whole change rather than leave some rows renormalized
            # and others not (a chart reading this property mid-transaction
            # would otherwise mix two canonical units silently).
            recomputed: list[tuple] = []
            for value in values:
                if value.is_missing:
                    continue
                source = (
                    value.value_scalar if value.value_scalar is not None else value.value_typical
                )
                if source is None:
                    continue
                source_unit = value.original_unit or obj.canonical_unit
                try:
                    new_normalized, method = to_canonical(
                        source, source_unit, payload.canonical_unit
                    )
                except UnitError as exc:
                    raise ConflictError(
                        f"Não é possível renormalizar: o valor cadastrado em "
                        f"'{source_unit}' não converte para '{payload.canonical_unit}' ({exc})."
                    ) from exc
                recomputed.append((value, new_normalized, method))

            for value, new_normalized, method in recomputed:
                value.normalized_value = new_normalized
                value.canonical_unit = payload.canonical_unit
                value.conversion_method = method
            # value_scalar, value_min, value_max, value_typical, uncertainty and
            # original_unit are never touched here — they stay in the
            # material's original unit, per CLAUDE.md §1.4. Only the
            # canonical-unit-denominated fields (normalized_value,
            # canonical_unit, conversion_method) change.

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

        changes = diff_fields(before, self._snapshot(obj))
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.PROPERTY_DEFINITION,
                entity_id=obj.id,
                entity_label=obj.name,
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )
        self.repo.commit()
        return self._to_out(obj, self.repo.value_count(property_id))

    def delete_property(self, property_id: int) -> None:
        obj = self.repo.get(property_id)
        if obj is None:
            raise NotFoundError(f"Propriedade não encontrada: {property_id}")
        if self.repo.value_count(property_id) > 0:
            raise ConflictError("Não é possível excluir uma propriedade com valores cadastrados.")
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.PROPERTY_DEFINITION,
            entity_id=obj.id,
            entity_label=obj.name,
            action=AuditAction.EXCLUIDO,
        )
        self.repo.delete(obj)
        self.repo.commit()

    @staticmethod
    def _snapshot(obj: PropertyDefinition) -> dict:
        return {
            "name": obj.name,
            "slug": obj.slug,
            "symbol": obj.symbol,
            "description": obj.description,
            "category": obj.category,
            "physical_dimension": obj.physical_dimension,
            "canonical_unit": obj.canonical_unit,
            "accepted_units": list(obj.accepted_units or []),
            "is_interval": obj.is_interval,
            "better_direction": obj.better_direction,
            "allows_log_scale": obj.allows_log_scale,
        }

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
