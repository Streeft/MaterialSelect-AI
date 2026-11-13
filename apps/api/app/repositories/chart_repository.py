"""Data access for property maps and material comparison.

Charts need more of a property value than the selection snapshot keeps: the
original value and unit, the interval bounds, the uncertainty, the data quality
and the source. This repository therefore loads the full rows, eager-loading
class, definition and source so a map of N materials stays a constant number of
queries — by ``selectinload``, never a join, for the values (D-231).
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
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
        property_slugs: list[str] | None = None,
    ) -> list[Material]:
        """Return active materials with values, definitions, class and source.

        ``material_ids`` and ``class_slugs`` are optional narrowing filters;
        an empty ``class_slugs`` list means "every class" (not "no class"), so
        an unset filter never silently empties the chart.

        ``property_slugs`` narrows the **values** loaded, never the materials
        (D-231): every visible material still comes back, with
        ``property_values`` holding only the rows of those properties. For a
        caller that reads nothing else — a two-axis map, the solver's basis —
        this is the same answer for a fraction of the memory. The collection is
        then deliberately partial, so the query refreshes the materials it
        touches (``populate_existing``) and the caller must not read other
        properties from them.
        """
        values_loader = (
            Material.property_values.and_(
                MaterialPropertyValue.property_id.in_(
                    select(PropertyDefinition.id).where(PropertyDefinition.slug.in_(property_slugs))
                )
            )
            if property_slugs is not None
            else Material.property_values
        )
        stmt = (
            select(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .options(
                joinedload(Material.material_class),
                # ``selectinload``, not a join, for the values (D-231): joined,
                # every one of the ~32 thousand value rows of the full demo
                # catalogue came back carrying its material's, definition's and
                # source's columns too, and the driver buffered all of it — about
                # twice the memory, per request. Definitions and sources are a
                # few dozen rows, loaded once and shared through the identity map.
                selectinload(values_loader).selectinload(MaterialPropertyValue.property_definition),
                selectinload(values_loader).selectinload(MaterialPropertyValue.source),
            )
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
            # ``id`` breaks ties: the demo catalogue repeats names (the releases
            # of D-108), and two queries must list them in the same order.
            .order_by(Material.name, Material.id)
        )
        if material_ids is not None:
            stmt = stmt.where(Material.id.in_(material_ids))
        if class_slugs:
            stmt = stmt.where(MaterialClass.slug.in_(class_slugs))
        if property_slugs is not None:
            stmt = stmt.execution_options(populate_existing=True)
        return list(self.db.execute(stmt).scalars().unique().all())

    def visible_class_names(self) -> list[tuple[str, str]]:
        """``(slug, name)`` of every class an active, visible material is in.

        What the AI prompts need from the materials (D-224): two columns,
        one query, instead of every material with every value — which is what
        reading the classes through :meth:`list_materials` used to cost on
        each call.
        """
        stmt = (
            select(MaterialClass.slug, MaterialClass.name)
            .join(Material, Material.class_id == MaterialClass.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
            .distinct()
            .order_by(MaterialClass.slug)
        )
        return [(row[0], row[1]) for row in self.db.execute(stmt).all()]

    def observed_ranges(self) -> dict[str, tuple[float, float]]:
        """Lowest and highest canonical value held per property, over what the
        viewer can see — declared absences never count (D-24).

        The yardstick of an AI-suggested range (D-224): a suggestion outside
        what the catalogue actually holds cannot select anything and is refused.
        """
        stmt = (
            select(
                PropertyDefinition.slug,
                func.min(MaterialPropertyValue.normalized_value),
                func.max(MaterialPropertyValue.normalized_value),
            )
            .join(
                MaterialPropertyValue,
                MaterialPropertyValue.property_id == PropertyDefinition.id,
            )
            .join(Material, Material.id == MaterialPropertyValue.material_id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
            .where(MaterialPropertyValue.is_missing.is_(False))
            .where(MaterialPropertyValue.normalized_value.is_not(None))
            .group_by(PropertyDefinition.slug)
        )
        return {
            row[0]: (float(row[1]), float(row[2]))
            for row in self.db.execute(stmt).all()
            if row[1] is not None and row[2] is not None
        }

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
                joinedload(Process.attribute_values).joinedload(ProcessAttributeValue.attribute),
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

    def list_performance_indices(self) -> list[PerformanceIndex]:
        stmt = select(PerformanceIndex).order_by(PerformanceIndex.slug)
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
