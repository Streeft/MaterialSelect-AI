"""Data access for property maps and material comparison.

Charts need more of a property value than the selection snapshot keeps: the
original value and unit, the interval bounds, the uncertainty, the data quality
and the source. This repository therefore loads the full rows, eager-loading
class, definition and source so a map of N materials stays a constant number of
queries.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.property_definition import PropertyDefinition
from app.repositories.visibility import visible_materials


class ChartRepository:
    """Queries backing the visualisation endpoints.

    ``viewer_id`` narrows every material query to what that reader may see
    (P1-4), so a person's own records are plotted alongside the catalogue and
    nobody else's are. Defaults to ``None``: the shared catalogue alone.
    """

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    def list_materials(
        self,
        material_ids: list[int] | None = None,
        class_slugs: list[str] | None = None,
    ) -> list[Material]:
        """Return active materials with values, definitions, class and source.

        ``material_ids`` and ``class_slugs`` are optional narrowing filters;
        an empty ``class_slugs`` list means "every class" (not "no class"), so
        an unset filter never silently empties the chart.
        """
        stmt = (
            select(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .options(
                joinedload(Material.material_class),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.property_definition
                ),
                joinedload(Material.property_values).joinedload(MaterialPropertyValue.source),
            )
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
            .order_by(Material.name)
        )
        if material_ids is not None:
            stmt = stmt.where(Material.id.in_(material_ids))
        if class_slugs:
            stmt = stmt.where(MaterialClass.slug.in_(class_slugs))
        return list(self.db.execute(stmt).scalars().unique().all())

    def list_processes(
        self,
        process_ids: list[int] | None = None,
        class_slugs: list[str] | None = None,
    ) -> list[Process]:
        """Return active processes with attribute values, definitions and class.

        ``process_ids`` and ``class_slugs`` are optional narrowing filters;
        an empty ``class_slugs`` list means "every class", matching list_materials.
        """
        stmt = (
            select(Process)
            .join(ProcessClass, Process.class_id == ProcessClass.id)
            .options(
                joinedload(Process.process_class),
                joinedload(Process.attribute_values).joinedload(
                    ProcessAttributeValue.attribute
                ),
                joinedload(Process.attribute_values).joinedload(ProcessAttributeValue.source),
            )
            .where(Process.is_active.is_(True))
            .order_by(Process.name)
        )
        if process_ids is not None:
            stmt = stmt.where(Process.id.in_(process_ids))
        if class_slugs:
            stmt = stmt.where(ProcessClass.slug.in_(class_slugs))
        return list(self.db.execute(stmt).scalars().unique().all())

    def get_property(self, slug: str) -> PropertyDefinition | None:
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.slug)
        return list(self.db.execute(stmt).scalars().all())

    def get_process_attribute(self, slug: str) -> ProcessAttributeDefinition | None:
        stmt = select(ProcessAttributeDefinition).where(ProcessAttributeDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def list_process_attributes(self) -> list[ProcessAttributeDefinition]:
        stmt = select(ProcessAttributeDefinition).order_by(ProcessAttributeDefinition.slug)
        return list(self.db.execute(stmt).scalars().all())

    def existing_class_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(MaterialClass.slug).where(MaterialClass.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}

    def existing_process_class_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(ProcessClass.slug).where(ProcessClass.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}
