"""Data access for import jobs and mapping templates."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.import_job import ImportJob, ImportMappingTemplate
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.property_definition import PropertyDefinition


class ImportRepository:
    """Queries for the import wizard (jobs, templates, lookups)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- jobs -------------------------------------------------------------

    def add(self, obj: object) -> None:
        self.db.add(obj)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def get_job(self, job_id: int) -> ImportJob | None:
        return self.db.get(ImportJob, job_id)

    def list_jobs(self) -> list[ImportJob]:
        stmt = select(ImportJob).order_by(ImportJob.created_at.desc(), ImportJob.id.desc())
        return list(self.db.execute(stmt).scalars().all())

    def materials_for_job(self, job_id: int) -> list[Material]:
        stmt = select(Material).where(Material.import_job_id == job_id)
        return list(self.db.execute(stmt).scalars().all())

    def delete_material(self, material: Material) -> None:
        # Property values are removed by the relationship cascade.
        self.db.delete(material)

    # --- lookups ----------------------------------------------------------

    def class_by_name_or_slug(self, text: str) -> MaterialClass | None:
        """Resolve a class cell to a taxonomy node (case-insensitive)."""
        needle = text.strip().lower()
        stmt = select(MaterialClass).where(
            (func.lower(MaterialClass.name) == needle)
            | (func.lower(MaterialClass.slug) == needle)
        )
        return self.db.execute(stmt).scalars().first()

    def get_class(self, class_id: int) -> MaterialClass | None:
        return self.db.get(MaterialClass, class_id)

    def list_properties(self) -> list[PropertyDefinition]:
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.slug)
        return list(self.db.execute(stmt).scalars().all())

    # --- templates --------------------------------------------------------

    def list_templates(self) -> list[ImportMappingTemplate]:
        stmt = select(ImportMappingTemplate).order_by(ImportMappingTemplate.name)
        return list(self.db.execute(stmt).scalars().all())

    def template_name_exists(self, name: str) -> bool:
        stmt = select(ImportMappingTemplate.id).where(
            func.lower(ImportMappingTemplate.name) == name.strip().lower()
        )
        return self.db.execute(stmt).first() is not None
