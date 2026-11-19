"""Data access for property maps and material comparison.

Charts need more of a property value than the selection snapshot keeps: the
original value and unit, the interval bounds, the uncertainty, the data quality
and the source. This repository therefore loads the full rows, eager-loading
class, definition and source so a map of N materials stays a constant number of
queries — by ``selectinload``, never a join, for the values (D-231).
"""

from __future__ import annotations

from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.property_definition import PropertyDefinition
from app.repositories.visibility import visible_materials


class ValueRow(NamedTuple):
    """One stored value, as the plain columns a report reads (D-249).

    What an annex line needs and nothing else — no ORM object, no definition, no source — so
    a table over hundreds of candidates holds a few thousand small tuples instead of the whole
    catalogue as objects.
    """

    material_id: int
    slug: str
    name: str
    #: The definition's canonical unit and the value's own, which wins when it has one.
    definition_unit: str | None
    canonical_unit: str | None
    is_missing: bool
    normalized_value: float | None
    value_scalar: float | None
    value_typical: float | None
    original_unit: str | None
    conversion_method: str | None
    data_quality: DataQuality


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
        with_values: bool = True,
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

        ``with_values=False`` (D-249) loads the materials **without touching their values**:
        ``property_values`` stays an ordinary lazy collection, so nothing is partial and a later
        read gets everything. For a report that needs the identity of hundreds of candidates and
        reads their values through :meth:`value_rows` — the laudo's annex held ~66 MB of ORM
        values it never used, for a catalogue of 32 thousand.
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
        options = [joinedload(Material.material_class)]
        if with_values:
            options += [
                # ``selectinload``, not a join, for the values (D-231): joined,
                # every one of the ~32 thousand value rows of the full demo
                # catalogue came back carrying its material's, definition's and
                # source's columns too, and the driver buffered all of it — about
                # twice the memory, per request. Definitions and sources are a
                # few dozen rows, loaded once and shared through the identity map.
                selectinload(values_loader).selectinload(MaterialPropertyValue.property_definition),
                selectinload(values_loader).selectinload(MaterialPropertyValue.source),
            ]
        stmt = (
            select(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .options(*options)
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
        if property_slugs is not None and with_values:
            stmt = stmt.execution_options(populate_existing=True)
        return list(self.db.execute(stmt).scalars().unique().all())

    def value_rows(
        self, material_ids: list[int], property_slugs: list[str]
    ) -> dict[int, dict[str, ValueRow]]:
        """The stored values of some properties of some materials, as plain rows (D-249).

        ``{material_id: {slug: row}}``; a material that has no value for a slug has no entry for
        it, which is how a caller tells "absent" from a value. Two columns' worth of filters
        (the ids and the slugs) bound the result to the few properties a decision rested on.
        """
        if not material_ids or not property_slugs:
            return {}
        stmt = (
            select(
                MaterialPropertyValue.material_id,
                PropertyDefinition.slug,
                PropertyDefinition.name,
                PropertyDefinition.canonical_unit,
                MaterialPropertyValue.canonical_unit,
                MaterialPropertyValue.is_missing,
                MaterialPropertyValue.normalized_value,
                MaterialPropertyValue.value_scalar,
                MaterialPropertyValue.value_typical,
                MaterialPropertyValue.original_unit,
                MaterialPropertyValue.conversion_method,
                MaterialPropertyValue.data_quality,
            )
            .join(PropertyDefinition, PropertyDefinition.id == MaterialPropertyValue.property_id)
            .where(MaterialPropertyValue.material_id.in_(material_ids))
            .where(PropertyDefinition.slug.in_(property_slugs))
        )
        rows: dict[int, dict[str, ValueRow]] = {}
        for row in self.db.execute(stmt):
            rows.setdefault(row[0], {})[row[1]] = ValueRow(*row)
        return rows

    def list_material_ids(self) -> list[int]:
        """Ids of the active, visible materials, in the order :meth:`list_materials` lists them.

        One column instead of the materials with every value: a caller that
        walks the whole catalogue (the catalogue export, D-235) takes these ids
        and loads them in batches, so the ORM objects of a batch can be freed
        before the next one is read.
        """
        stmt = (
            select(Material.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
            .order_by(Material.name, Material.id)
        )
        return list(self.db.execute(stmt).scalars().all())

    def has_own_materials(self) -> bool:
        """Whether any active, visible material is someone's own record.

        What :meth:`list_material_ids` would answer to "is any of these owned",
        without loading them: the catalogue export has to put the own-record
        notice at the top of the file before it has read the last batch.
        """
        stmt = (
            select(Material.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
            .where(Material.owner_id.is_not(None))
            .limit(1)
        )
        return self.db.execute(stmt).first() is not None

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
