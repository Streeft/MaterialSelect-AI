"""Read services over the process universe (P0-2)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.process import Process, ProcessClass
from app.repositories.process_repository import ProcessRepository
from app.schemas.process import ProcessClassOut, ProcessOut


class ProcessService:
    """Lists the process taxonomy and the processes themselves.

    Thin on purpose: the process universe is shared reference data, like the
    material taxonomy, and everything interesting it enables — the process
    selection stage, the compatible-processes list on a datasheet — reads it
    through here rather than reimplementing the join.
    """

    def __init__(self, db: Session) -> None:
        self.repo = ProcessRepository(db)

    def list_classes(self) -> list[ProcessClassOut]:
        return [
            self._class_to_out(cls, count) for cls, count in self.repo.list_classes_with_counts()
        ]

    def list_processes(self) -> list[ProcessOut]:
        counts = self.repo.material_counts_by_process()
        return [
            self._process_to_out(p, counts.get(p.id, 0)) for p in self.repo.list_active_processes()
        ]

    def processes_for_material(self, material_id: int) -> list[ProcessOut]:
        counts = self.repo.material_counts_by_process()
        return [
            self._process_to_out(p, counts.get(p.id, 0))
            for p in self.repo.processes_for_material(material_id)
        ]

    @staticmethod
    def _class_to_out(cls: ProcessClass, count: int) -> ProcessClassOut:
        return ProcessClassOut(
            id=cls.id,
            name=cls.name,
            slug=cls.slug,
            parent_id=cls.parent_id,
            description=cls.description,
            process_count=count,
        )

    @staticmethod
    def _process_to_out(process: Process, material_count: int) -> ProcessOut:
        return ProcessOut(
            id=process.id,
            name=process.name,
            slug=process.slug,
            class_id=process.class_id,
            class_name=process.process_class.name,
            class_slug=process.process_class.slug,
            description=process.description,
            is_demo=process.is_demo,
            material_count=material_count,
        )
