"""Aggregate queries backing the catalogue panel.

Everything here counts in the database rather than in Python. That is not only
about speed: loading every value row to count it would make the panel's cost
grow with the catalogue, and the one screen whose job is to describe a large
catalogue is the worst place for a query that only works while the catalogue is
small.

Every query is filtered to **active** materials. Without it a soft-deleted
material would keep inflating the coverage of the class it used to belong to,
and the panel would quietly report data the rest of the application refuses to
show.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import ColumnElement, Select, and_, case, func, select
from sqlalchemy.orm import Session

from app.domain.dashboard_filters import DashboardFilters
from app.models.audit import AuditEvent
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.notebook import AIUsage, Notebook
from app.models.performance_index import PerformanceIndex
from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.project import Project
from app.models.property_definition import PropertyDefinition
from app.models.saved_chart import SavedChart
from app.models.selection import SelectionStudy
from app.models.source import Source
from app.repositories.visibility import visible_materials

# 1 for a row carrying a number, 0 for a row declaring absence — and the mirror
# of it. Summing these is what lets one GROUP BY return both counts, instead of
# two queries that could observe different states of the same transaction.
FILLED = case((MaterialPropertyValue.is_missing.is_(False), 1), else_=0)
DECLARED_MISSING = case((MaterialPropertyValue.is_missing.is_(True), 1), else_=0)


def _only(property_ids: set[int] | None) -> list[ColumnElement[bool]]:
    """The property restriction of a depth level, or nothing (D-193)."""
    if property_ids is None:
        return []
    return [MaterialPropertyValue.property_id.in_(property_ids or {-1})]


class DashboardRepository:
    """Counts and distributions over the catalogue.

    ``viewer_id`` narrows every count to the materials that reader may see
    (P1-4). The panel describes *their* catalogue: the shared reference data
    plus their own records, never anybody else's — a coverage percentage that
    silently included a stranger's record would be unexplainable from any
    screen they can open.
    """

    def __init__(
        self,
        db: Session,
        viewer_id: int | None = None,
        filters: DashboardFilters | None = None,
    ) -> None:
        self.db = db
        self.viewer_id = viewer_id
        self.filters = filters or DashboardFilters()
        self._class_ids: set[int] | None = None

    # --- Scope (D-193) ----------------------------------------------------

    def filtered_class_ids(self) -> set[int] | None:
        """Ids of the filtered class and its descendants; ``None`` = no filter.

        An unknown slug yields the empty set — and with it an empty panel —
        rather than silently ignoring the filter and showing everything.
        """
        slug = self.filters.class_slug
        if not slug:
            return None
        if self._class_ids is None:
            rows = self.db.execute(
                select(MaterialClass.id, MaterialClass.slug, MaterialClass.parent_id)
            ).all()
            children: dict[int | None, list[int]] = {}
            root: int | None = None
            for class_id, class_slug, parent_id in rows:
                children.setdefault(parent_id, []).append(class_id)
                if class_slug == slug:
                    root = class_id
            found: set[int] = set()
            stack = [root] if root is not None else []
            while stack:
                current = stack.pop()
                if current in found:
                    continue
                found.add(current)
                stack.extend(children.get(current, []))
            self._class_ids = found
        return self._class_ids

    def scope(self) -> list[ColumnElement[bool]]:
        """Every predicate a panel query applies to ``Material``.

        Active, visible to the reader (P1-4), and inside the panel's filters.
        One function so no query can forget one of them.
        """
        conditions: list[ColumnElement[bool]] = [
            Material.is_active.is_(True),
            visible_materials(self.viewer_id),
        ]
        class_ids = self.filtered_class_ids()
        if class_ids is not None:
            conditions.append(Material.class_id.in_(class_ids or {-1}))
        if self.filters.subclass:
            conditions.append(Material.subclass == self.filters.subclass)
        if self.filters.demo == "demo":
            conditions.append(Material.is_demo.is_(True))
        elif self.filters.demo == "reais":
            conditions.append(Material.is_demo.is_(False))
        return conditions

    # --- Totals -----------------------------------------------------------

    def count_materials(self) -> tuple[int, int]:
        """``(active materials, how many of those are demonstration data)``."""
        stmt = select(
            func.count(Material.id),
            func.coalesce(func.sum(case((Material.is_demo.is_(True), 1), else_=0)), 0),
        ).where(*self.scope())
        total, demo = self.db.execute(stmt).one()
        return int(total or 0), int(demo or 0)

    def count_classes(self) -> int:
        return int(self.db.execute(select(func.count(MaterialClass.id))).scalar_one() or 0)

    def count_properties(self) -> int:
        return int(self.db.execute(select(func.count(PropertyDefinition.id))).scalar_one() or 0)

    # --- Per class --------------------------------------------------------

    def class_material_counts(self) -> list[tuple[str, str, int]]:
        """``(slug, name, active material count)`` for every class.

        An outer join, so a class nobody has used yet still appears — with zero
        materials, which is a fact about the taxonomy and not an empty result.
        """
        stmt = (
            select(MaterialClass.slug, MaterialClass.name, func.count(Material.id))
            .select_from(MaterialClass)
            .outerjoin(
                Material,
                and_(Material.class_id == MaterialClass.id, *self.scope()),
            )
            .group_by(MaterialClass.id, MaterialClass.slug, MaterialClass.name)
            .order_by(MaterialClass.name)
        )
        return [(slug, name, int(count or 0)) for slug, name, count in self.db.execute(stmt).all()]

    def value_counts_by_class(
        self, property_ids: set[int] | None = None
    ) -> dict[str, tuple[int, int]]:
        """``slug -> (filled, declared missing)`` over active materials.

        ``property_ids`` narrows the count to the properties of a depth level
        (D-193); ``None`` counts every property.
        """
        stmt = (
            select(
                MaterialClass.slug,
                func.coalesce(func.sum(FILLED), 0),
                func.coalesce(func.sum(DECLARED_MISSING), 0),
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(*self.scope(), *_only(property_ids))
            .group_by(MaterialClass.slug)
        )
        return {
            slug: (int(filled or 0), int(missing or 0))
            for slug, filled, missing in self.db.execute(stmt).all()
        }

    # --- Per property -----------------------------------------------------

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.name)
        return list(self.db.execute(stmt).scalars().all())

    def get_property(self, slug: str) -> PropertyDefinition | None:
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def value_counts_by_property(self) -> dict[str, tuple[int, int]]:
        """``slug -> (filled, declared missing)`` over active materials."""
        stmt = (
            select(
                PropertyDefinition.slug,
                func.coalesce(func.sum(FILLED), 0),
                func.coalesce(func.sum(DECLARED_MISSING), 0),
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .join(
                PropertyDefinition,
                MaterialPropertyValue.property_id == PropertyDefinition.id,
            )
            .where(*self.scope())
            .group_by(PropertyDefinition.slug)
        )
        return {
            slug: (int(filled or 0), int(missing or 0))
            for slug, filled, missing in self.db.execute(stmt).all()
        }

    # --- Provenance -------------------------------------------------------

    def quality_counts(self, property_ids: set[int] | None = None) -> dict[DataQuality, int]:
        """How many *filled* values carry each provenance level.

        Rows marked ``is_missing`` are excluded: they still carry whatever
        ``data_quality`` they were created with, and counting them would credit
        "medido" for a measurement that was never taken.
        """
        stmt = (
            select(MaterialPropertyValue.data_quality, func.count(MaterialPropertyValue.id))
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .where(
                *self.scope(),
                *_only(property_ids),
                MaterialPropertyValue.is_missing.is_(False),
            )
            .group_by(MaterialPropertyValue.data_quality)
        )
        return {quality: int(count or 0) for quality, count in self.db.execute(stmt).all()}

    # --- Distribution of one property -------------------------------------

    def values_for_property(self, slug: str) -> list[tuple[str, str, float]]:
        """``(class slug, class name, normalised value)`` for one property.

        Only rows that actually carry a number: a row flagged as present but
        holding no normalised value is a data defect, and letting it through as
        a zero would drag its whole class to the bottom of the axis.
        """
        stmt: Select = (
            select(
                MaterialClass.slug,
                MaterialClass.name,
                MaterialPropertyValue.normalized_value,
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .join(
                PropertyDefinition,
                MaterialPropertyValue.property_id == PropertyDefinition.id,
            )
            .where(
                *self.scope(),
                MaterialPropertyValue.is_missing.is_(False),
                MaterialPropertyValue.normalized_value.is_not(None),
                PropertyDefinition.slug == slug,
            )
        )
        return [
            (class_slug, class_name, float(value))
            for class_slug, class_name, value in self.db.execute(stmt).all()
        ]

    # --- Painel rico (D-193) ----------------------------------------------

    def composition_counts(self) -> list[tuple[str, str, str | None, int]]:
        """``(class slug, class name, subclass, materials)`` inside the scope."""
        stmt = (
            select(
                MaterialClass.slug,
                MaterialClass.name,
                Material.subclass,
                func.count(Material.id),
            )
            .select_from(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(*self.scope())
            .group_by(MaterialClass.slug, MaterialClass.name, Material.subclass)
        )
        return [
            (slug, name, subclass, int(count or 0))
            for slug, name, subclass, count in self.db.execute(stmt).all()
        ]

    def process_classes(self) -> list[tuple[int, str, str, int | None]]:
        """``(id, slug, name, parent id)`` of every process family."""
        stmt = select(ProcessClass.id, ProcessClass.slug, ProcessClass.name, ProcessClass.parent_id)
        return [tuple(row) for row in self.db.execute(stmt).all()]  # type: ignore[misc]

    def active_processes(self) -> list[tuple[int, str, str, int]]:
        """``(id, slug, name, family id)`` of every active process."""
        stmt = (
            select(Process.id, Process.slug, Process.name, Process.class_id)
            .where(Process.is_active.is_(True))
            .order_by(Process.name)
        )
        return [tuple(row) for row in self.db.execute(stmt).all()]  # type: ignore[misc]

    def material_counts_by_process(self) -> dict[int, int]:
        """``process id -> scoped materials linked to it`` — one GROUP BY."""
        stmt = (
            select(MaterialProcess.process_id, func.count(MaterialProcess.material_id))
            .join(Material, MaterialProcess.material_id == Material.id)
            .where(*self.scope())
            .group_by(MaterialProcess.process_id)
        )
        return {pid: int(n or 0) for pid, n in self.db.execute(stmt).all()}

    def material_counts_by_process_family(self) -> dict[int, int]:
        """``process family id -> distinct scoped materials`` reached by it."""
        stmt = (
            select(Process.class_id, func.count(func.distinct(MaterialProcess.material_id)))
            .select_from(MaterialProcess)
            .join(Process, MaterialProcess.process_id == Process.id)
            .join(Material, MaterialProcess.material_id == Material.id)
            .where(*self.scope(), Process.is_active.is_(True))
            .group_by(Process.class_id)
        )
        return {cid: int(n or 0) for cid, n in self.db.execute(stmt).all()}

    def process_reach_by_material_class(self) -> dict[str, tuple[int, int]]:
        """``class slug -> (materials with a process, distinct processes)``."""
        stmt = (
            select(
                MaterialClass.slug,
                func.count(func.distinct(MaterialProcess.material_id)),
                func.count(func.distinct(MaterialProcess.process_id)),
            )
            .select_from(MaterialProcess)
            .join(Process, MaterialProcess.process_id == Process.id)
            .join(Material, MaterialProcess.material_id == Material.id)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(*self.scope(), Process.is_active.is_(True))
            .group_by(MaterialClass.slug)
        )
        return {slug: (int(m or 0), int(p or 0)) for slug, m, p in self.db.execute(stmt).all()}

    def materials_with_any_process(self) -> int:
        stmt = (
            select(func.count(func.distinct(MaterialProcess.material_id)))
            .select_from(MaterialProcess)
            .join(Process, MaterialProcess.process_id == Process.id)
            .join(Material, MaterialProcess.material_id == Material.id)
            .where(*self.scope(), Process.is_active.is_(True))
        )
        return int(self.db.execute(stmt).scalar_one() or 0)

    def source_counts(
        self, property_ids: set[int] | None = None
    ) -> list[tuple[int | None, DataQuality, bool, int, int]]:
        """``(source id, quality, is_missing, rows, distinct materials)``."""
        conditions = list(self.scope())
        if property_ids is not None:
            conditions.append(MaterialPropertyValue.property_id.in_(property_ids or {-1}))
        stmt = (
            select(
                MaterialPropertyValue.source_id,
                MaterialPropertyValue.data_quality,
                MaterialPropertyValue.is_missing,
                func.count(MaterialPropertyValue.id),
                func.count(func.distinct(MaterialPropertyValue.material_id)),
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .where(*conditions)
            .group_by(
                MaterialPropertyValue.source_id,
                MaterialPropertyValue.data_quality,
                MaterialPropertyValue.is_missing,
            )
        )
        return [
            (sid, quality, bool(missing), int(rows or 0), int(mats or 0))
            for sid, quality, missing, rows, mats in self.db.execute(stmt).all()
        ]

    def source_material_counts(self, property_ids: set[int] | None = None) -> dict[int | None, int]:
        """``source id -> distinct scoped materials`` across every quality."""
        conditions = list(self.scope())
        if property_ids is not None:
            conditions.append(MaterialPropertyValue.property_id.in_(property_ids or {-1}))
        stmt = (
            select(
                MaterialPropertyValue.source_id,
                func.count(func.distinct(MaterialPropertyValue.material_id)),
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .where(*conditions)
            .group_by(MaterialPropertyValue.source_id)
        )
        return {sid: int(n or 0) for sid, n in self.db.execute(stmt).all()}

    def get_index(self, slug: str) -> PerformanceIndex | None:
        stmt = select(PerformanceIndex).where(PerformanceIndex.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def sources_by_id(self, ids: set[int]) -> dict[int, Source]:
        if not ids:
            return {}
        stmt = select(Source).where(Source.id.in_(ids))
        return {s.id: s for s in self.db.execute(stmt).scalars().all()}

    def property_counts(self, property_id: int) -> tuple[int, int]:
        """``(filled, declared missing)`` of one property inside the scope."""
        stmt = (
            select(func.coalesce(func.sum(FILLED), 0), func.coalesce(func.sum(DECLARED_MISSING), 0))
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .where(*self.scope(), MaterialPropertyValue.property_id == property_id)
        )
        filled, missing = self.db.execute(stmt).one()
        return int(filled or 0), int(missing or 0)

    def scoped_materials(self) -> list[tuple[int, str, str, str, str | None, bool]]:
        """``(id, name, class slug, class name, subclass, is_demo)`` in scope."""
        stmt = (
            select(
                Material.id,
                Material.name,
                MaterialClass.slug,
                MaterialClass.name,
                Material.subclass,
                Material.is_demo,
            )
            .select_from(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(*self.scope())
        )
        return [tuple(row) for row in self.db.execute(stmt).all()]  # type: ignore[misc]

    def numeric_values(self, property_ids: set[int]) -> list[tuple[int, int, float]]:
        """``(material id, property id, normalised value)`` — one query.

        The whole matrix the correlation and the index ranking need, instead of
        one query per property (or per material): 679 × 48 rows is ~33 k
        tuples, which one indexed join returns faster than a loop of 48 would.
        """
        if not property_ids:
            return []
        stmt = (
            select(
                MaterialPropertyValue.material_id,
                MaterialPropertyValue.property_id,
                MaterialPropertyValue.normalized_value,
            )
            .select_from(MaterialPropertyValue)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .where(
                *self.scope(),
                MaterialPropertyValue.property_id.in_(property_ids),
                MaterialPropertyValue.is_missing.is_(False),
                MaterialPropertyValue.normalized_value.is_not(None),
            )
        )
        return [(int(m), int(p), float(v)) for m, p, v in self.db.execute(stmt).all()]

    # --- The reader's own activity (no scope: these are not materials) -----

    def own_counts(self, user_id: int) -> tuple[int, int, int, int]:
        """``(studies, saved charts, notebooks, own materials)`` of one user."""
        studies = self.db.execute(
            select(func.count(SelectionStudy.id))
            .join(Project, SelectionStudy.project_id == Project.id)
            .where(Project.owner_id == user_id)
        ).scalar_one()
        charts = self.db.execute(
            select(func.count(SavedChart.id))
            .join(Project, SavedChart.project_id == Project.id)
            .where(Project.owner_id == user_id)
        ).scalar_one()
        notebooks = self.db.execute(
            select(func.count(Notebook.id)).where(Notebook.owner_id == user_id)
        ).scalar_one()
        materials = self.db.execute(
            select(func.count(Material.id)).where(
                Material.owner_id == user_id, Material.is_active.is_(True)
            )
        ).scalar_one()
        return int(studies or 0), int(charts or 0), int(notebooks or 0), int(materials or 0)

    def own_creation_dates(self, user_id: int, since: date) -> dict[str, list]:
        """Creation timestamps of the user's studies, charts and notebooks."""
        studies = self.db.execute(
            select(SelectionStudy.created_at)
            .join(Project, SelectionStudy.project_id == Project.id)
            .where(Project.owner_id == user_id, SelectionStudy.created_at >= since)
        ).scalars()
        charts = self.db.execute(
            select(SavedChart.created_at)
            .join(Project, SavedChart.project_id == Project.id)
            .where(Project.owner_id == user_id, SavedChart.created_at >= since)
        ).scalars()
        notebooks = self.db.execute(
            select(Notebook.created_at).where(
                Notebook.owner_id == user_id, Notebook.created_at >= since
            )
        ).scalars()
        return {
            "studies": list(studies),
            "charts": list(charts),
            "notebooks": list(notebooks),
        }

    def own_audit_actions(self, user_id: int) -> dict[str, int]:
        stmt = (
            select(AuditEvent.action, func.count(AuditEvent.id))
            .where(AuditEvent.user_id == user_id)
            .group_by(AuditEvent.action)
        )
        return {
            getattr(action, "value", str(action)): int(n or 0)
            for action, n in self.db.execute(stmt).all()
        }

    def own_recent_events(self, user_id: int, limit: int) -> list[AuditEvent]:
        stmt = (
            select(AuditEvent)
            .where(AuditEvent.user_id == user_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())

    def own_ai_usage(self, user_id: int, since: date) -> list[AIUsage]:
        stmt = (
            select(AIUsage)
            .where(AIUsage.user_id == user_id, AIUsage.day >= since)
            .order_by(AIUsage.day)
        )
        return list(self.db.execute(stmt).scalars().all())
