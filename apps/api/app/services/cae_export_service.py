"""CAE material cards (D-104): read one visible material, build its card, render.

The service holds the three decisions the router must not: which material the
reader may see (D-62 — another person's record is a 404, never a 403), which
format and unit system were asked for (an unknown one is a 400 naming the
admitted values), and whether the record has what the format demands (a 422
naming what is missing, never a file with a blank the solver would fill).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.domain.errors import ExportRefusedError, NotFoundError, ValidationError
from app.exporters.cae import CAE_FORMATS, refusal_reason
from app.exporters.cae.card import CatalogueValue, MaterialInput, build_card
from app.exporters.cae.quantities import QUANTITIES, UNIT_SYSTEMS
from app.models.material import Material
from app.repositories.material_repository import MaterialRepository
from app.services.identity_lines import composition_lines, designation_lines


@dataclass(frozen=True)
class CaeFile:
    """A rendered card, ready for the HTTP layer."""

    body: str
    media_type: str
    #: Stem suffix and extension (``-abaqus.inp``); the router adds the stem.
    suffix: str
    material_name: str


def _material_input(material: Material) -> MaterialInput:
    wanted = {q.slug for q in QUANTITIES}
    values: dict[str, CatalogueValue] = {}
    for row in material.property_values:
        slug = row.property_definition.slug
        if slug not in wanted:
            continue
        source = row.source
        values[slug] = CatalogueValue(
            slug=slug,
            is_missing=row.is_missing,
            normalized_value=row.normalized_value,
            canonical_unit=row.canonical_unit or row.property_definition.canonical_unit,
            value_min=row.value_min,
            value_max=row.value_max,
            original_unit=row.original_unit,
            data_quality=row.data_quality.value if row.data_quality else None,
            source_label=source.label if source else None,
            source_is_demo=bool(source and source.is_demo),
            license_label=source.license_label if source else None,
        )
    return MaterialInput(
        id=material.id,
        name=material.name,
        class_name=material.material_class.name,
        is_demo=material.is_demo,
        is_own_record=material.owner_id is not None,
        is_active=material.is_active,
        values=values,
        composition=tuple(composition_lines(material)),
        designations=tuple(designation_lines(material)),
    )


class CaeExportService:
    def __init__(self, db: Session, viewer_id: int | None) -> None:
        self.repo = MaterialRepository(db, viewer_id)

    def material_card(self, material_id: int, fmt_key: str, system_key: str) -> CaeFile:
        fmt = CAE_FORMATS.get(fmt_key)
        if fmt is None:
            raise ValidationError(
                f"Formato CAE não suportado: '{fmt_key}'. Use {', '.join(CAE_FORMATS)}."
            )
        system = UNIT_SYSTEMS.get(system_key)
        if system is None:
            raise ValidationError(
                f"Sistema de unidades CAE não suportado: '{system_key}'. "
                f"Use {', '.join(UNIT_SYSTEMS)}."
            )
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        card = build_card(_material_input(material), system)
        reason = refusal_reason(card, fmt)
        if reason is not None:
            raise ExportRefusedError(reason)
        return CaeFile(
            body=fmt.render(card),
            media_type=fmt.media_type,
            suffix=fmt.suffix,
            material_name=material.name,
        )
