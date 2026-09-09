"""Data access for the selection pipeline: materials snapshot, indices, studies."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased, joinedload

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.property_definition import PropertyDefinition
from app.models.selection import SelectionStudy


class SelectionRepository:
    """Queries backing filtering, indices, ranking and saved studies."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- snapshot / lookups ----------------------------------------------

    def list_active_materials_with_values(self) -> list[Material]:
        """Active materials with class, values and property definitions eager-loaded."""
        stmt = (
            select(Material)
            .options(
                joinedload(Material.material_class),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.property_definition
                ),
            )
            .where(Material.is_active.is_(True))
            .order_by(Material.name)
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.slug)
        return list(self.db.execute(stmt).scalars().all())

    def class_parents(self) -> dict[str, str | None]:
        """Every class slug mapped to its parent's slug (``None`` at a root).

        Two columns of the whole taxonomy — dozens of rows, not a join per
        material — which is what lets ``app.domain.taxonomy.lineages`` give a
        Tree stage the ancestry a snapshot needs.
        """
        parent = aliased(MaterialClass)
        stmt = select(MaterialClass.slug, parent.slug).join(
            parent, MaterialClass.parent_id == parent.id, isouter=True
        )
        return {row[0]: row[1] for row in self.db.execute(stmt).all()}

    def class_names(self) -> dict[str, str]:
        """Every class slug mapped to its display name — for a document that
        should say "Metais", not "metais"."""
        stmt = select(MaterialClass.slug, MaterialClass.name)
        return {row[0]: row[1] for row in self.db.execute(stmt).all()}

    # --- process universe (P0-2) ------------------------------------------

    def process_class_parents(self) -> dict[str, str | None]:
        """Every process-class slug mapped to its parent's slug (``None`` at a root).

        The process-side twin of ``class_parents``, and read the same way: two
        columns of the whole taxonomy, fed to ``app.domain.taxonomy.lineages`` so
        a process stage can pick a folder and mean everything under it.
        """
        parent = aliased(ProcessClass)
        stmt = select(ProcessClass.slug, parent.slug).join(
            parent, ProcessClass.parent_id == parent.id, isouter=True
        )
        return {row[0]: row[1] for row in self.db.execute(stmt).all()}

    def process_reach_by_material(self) -> dict[int, list[tuple[str, str]]]:
        """Every material↔process link as ``{material_id: [(process, class)]}``.

        One statement for the whole join, not one per material: this feeds the
        snapshot, and the snapshot is built for the entire active catalogue on
        every selection run.

        Inactive processes are left out, matching what
        ``list_active_materials_with_values`` does on the other side — a process
        withdrawn from the catalogue must not keep admitting materials.
        """
        stmt = (
            select(MaterialProcess.material_id, Process.slug, ProcessClass.slug)
            .join(Process, Process.id == MaterialProcess.process_id)
            .join(ProcessClass, ProcessClass.id == Process.class_id)
            .where(Process.is_active.is_(True))
            .order_by(MaterialProcess.material_id, Process.slug)
        )
        reach: dict[int, list[tuple[str, str]]] = {}
        for material_id, process_slug, class_slug in self.db.execute(stmt).all():
            reach.setdefault(material_id, []).append((process_slug, class_slug))
        return reach

    def existing_process_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(Process.slug).where(Process.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}

    def existing_process_class_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(ProcessClass.slug).where(ProcessClass.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}

    def process_names(self) -> dict[str, str]:
        """Process slug → display name, so a document says "Solda MIG"."""
        stmt = select(Process.slug, Process.name)
        return {row[0]: row[1] for row in self.db.execute(stmt).all()}

    def process_class_names(self) -> dict[str, str]:
        """Process-class slug → display name."""
        stmt = select(ProcessClass.slug, ProcessClass.name)
        return {row[0]: row[1] for row in self.db.execute(stmt).all()}

    # --- material taxonomy -------------------------------------------------

    def existing_class_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        stmt = select(MaterialClass.slug).where(MaterialClass.slug.in_(slugs))
        return {row[0] for row in self.db.execute(stmt).all()}

    # --- performance indices ---------------------------------------------

    def list_indices(self) -> list[PerformanceIndex]:
        stmt = select(PerformanceIndex).order_by(PerformanceIndex.name)
        return list(self.db.execute(stmt).scalars().all())

    def index_slug_exists(self, slug: str) -> bool:
        stmt = select(PerformanceIndex.id).where(PerformanceIndex.slug == slug)
        return self.db.execute(stmt).first() is not None

    # --- saved studies ----------------------------------------------------

    def list_studies(self, project_id: int) -> list[SelectionStudy]:
        stmt = (
            select(SelectionStudy)
            .options(
                joinedload(SelectionStudy.constraints),
                joinedload(SelectionStudy.criteria),
                # P0-1: the summary reports how many stages a study has, and
                # reading it lazily would be one query per study in the list.
                joinedload(SelectionStudy.stages),
            )
            .where(SelectionStudy.project_id == project_id)
            .order_by(SelectionStudy.created_at.desc(), SelectionStudy.id.desc())
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def get_study(self, study_id: int, project_id: int) -> SelectionStudy | None:
        stmt = (
            select(SelectionStudy)
            .options(
                joinedload(SelectionStudy.constraints),
                joinedload(SelectionStudy.criteria),
                # P0-1: reading a study returns its whole pipeline, groups
                # included — both are walked on every read.
                joinedload(SelectionStudy.stages),
                joinedload(SelectionStudy.constraint_groups),
            )
            .where(SelectionStudy.id == study_id, SelectionStudy.project_id == project_id)
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()

    def study_name_exists(self, name: str, project_id: int, exclude_id: int | None = None) -> bool:
        stmt = select(SelectionStudy.id).where(
            func.lower(SelectionStudy.name) == name.strip().lower(),
            SelectionStudy.project_id == project_id,
        )
        if exclude_id is not None:
            stmt = stmt.where(SelectionStudy.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def add(self, obj: object) -> None:
        self.db.add(obj)

    def delete(self, obj: object) -> None:
        self.db.delete(obj)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
