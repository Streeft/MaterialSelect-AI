"""Ordinal material properties: catalogue and per-material reading (D-126)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import NotFoundError
from app.domain.ordinal import describe_scale
from app.models.ordinal_property import OrdinalPropertyDefinition
from app.models.user import User
from app.repositories.material_repository import MaterialRepository
from app.repositories.ordinal_repository import OrdinalRepository
from app.schemas.ordinal import (
    MaterialOrdinalValueOut,
    MaterialOrdinalValuesOut,
    OrdinalPropertyOut,
)

#: The written states of a value that is not a level (D-24). Two of them on
#: purpose: a source that said "no datum" and a property nobody filled are
#: different facts, and neither is the worst level of the scale.
STATUS_TEXT = {
    "nivel": "Nível cadastrado",
    "ausente": "Ausente na fonte (sem nível)",
    "sem_dado": "Sem dado cadastrado",
}


def _definition_out(definition: OrdinalPropertyDefinition) -> OrdinalPropertyOut:
    levels = [level.label for level in definition.levels]
    return OrdinalPropertyOut(
        slug=definition.slug,
        name=definition.name,
        description=definition.description,
        levels=levels,
        scale_text=describe_scale(levels),
        is_demo=definition.is_demo,
    )


class OrdinalService:
    def __init__(self, db: Session, user: User | None) -> None:
        viewer_id = user.id if user is not None else None
        self.repo = OrdinalRepository(db, viewer_id)
        self.materials = MaterialRepository(db, viewer_id)

    def list_definitions(self) -> list[OrdinalPropertyOut]:
        return [_definition_out(d) for d in self.repo.list_definitions()]

    def material_values(self, material_id: int) -> MaterialOrdinalValuesOut:
        material = self.materials.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        held = {value.definition_id: value for value in self.repo.values_for_material(material_id)}
        rows: list[MaterialOrdinalValueOut] = []
        for definition in self.repo.list_definitions():
            scale = [level.label for level in definition.levels]
            value = held.get(definition.id)
            if value is None:
                status = "sem_dado"
            elif value.is_missing or value.level is None:
                status = "ausente"
            else:
                status = "nivel"
            rows.append(
                MaterialOrdinalValueOut(
                    slug=definition.slug,
                    name=definition.name,
                    status=status,
                    status_text=STATUS_TEXT[status],
                    level=value.level.label if status == "nivel" and value.level else None,
                    rank=value.level.rank if status == "nivel" and value.level else None,
                    scale=scale,
                    source_label=value.source.label if value and value.source else None,
                    data_quality=value.data_quality.value if value else None,
                    measurement_condition=value.measurement_condition if value else None,
                    notes=value.notes if value else None,
                    is_demo=bool(value and value.is_demo),
                )
            )
        return MaterialOrdinalValuesOut(
            material_id=material.id, material_name=material.name, values=rows
        )
