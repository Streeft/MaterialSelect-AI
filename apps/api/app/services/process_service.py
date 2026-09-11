"""Read services over the process universe (P0-2) and its attributes (P0-4)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import NotFoundError
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.repositories.process_repository import ProcessRepository
from app.schemas.process import (
    ProcessAttributeOut,
    ProcessAttributeValueOut,
    ProcessClassOut,
    ProcessDetailOut,
    ProcessOut,
)


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

    def list_attributes(self) -> list[ProcessAttributeOut]:
        """The process attribute catalogue (P0-4).

        Read by the constraint editor of a process study, which needs each
        attribute's ``kind`` to know whether to draw a number field or a label
        picker — and by nothing on the material side, which is the point of the
        catalogue being its own table.
        """
        return [self._attribute_to_out(a) for a in self.repo.list_attributes()]

    def get_process(self, slug: str) -> ProcessDetailOut:
        """One process with its attribute values and their provenance (P0-4)."""
        process = self.repo.get_active_process_by_slug(slug)
        if process is None:
            raise NotFoundError(f"Processo não encontrado: {slug}")
        counts = self.repo.material_counts_by_process()
        base = self._process_to_out(process, counts.get(process.id, 0))
        # Ordered by attribute name, so the sheet reads the same way twice — the
        # relationship's own order is whatever the database returned.
        values = sorted(process.attribute_values, key=lambda v: v.attribute.name)
        return ProcessDetailOut(
            **base.model_dump(),
            attributes=[self._attribute_value_to_out(v) for v in values],
        )

    @staticmethod
    def _attribute_to_out(attribute: ProcessAttributeDefinition) -> ProcessAttributeOut:
        return ProcessAttributeOut(
            id=attribute.id,
            name=attribute.name,
            slug=attribute.slug,
            symbol=attribute.symbol,
            description=attribute.description,
            kind=attribute.kind,
            physical_dimension=attribute.physical_dimension,
            canonical_unit=attribute.canonical_unit,
            accepted_units=list(attribute.accepted_units or []),
            allowed_labels=list(attribute.allowed_labels or []),
            better_direction=attribute.better_direction,
        )

    @staticmethod
    def _attribute_value_to_out(value: ProcessAttributeValue) -> ProcessAttributeValueOut:
        return ProcessAttributeValueOut(
            attribute_id=value.attribute_id,
            attribute_name=value.attribute.name,
            attribute_slug=value.attribute.slug,
            kind=value.attribute.kind,
            value_scalar=value.value_scalar,
            value_min=value.value_min,
            value_max=value.value_max,
            value_typical=value.value_typical,
            labels=list(value.labels or []),
            original_unit=value.original_unit,
            normalized_value=value.normalized_value,
            normalized_min=value.normalized_min,
            normalized_max=value.normalized_max,
            canonical_unit=value.canonical_unit,
            conversion_method=value.conversion_method,
            uncertainty=value.uncertainty,
            measurement_condition=value.measurement_condition,
            notes=value.notes,
            source_label=value.source.label if value.source else None,
            data_quality=value.data_quality,
            is_missing=value.is_missing,
        )

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
