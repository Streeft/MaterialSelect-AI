"""Read services over the process universe (P0-2) and its attributes (P0-4)."""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.orm import Session

from app.calculations.expressions import safe_variable
from app.domain.display_units import Reading, reading_for
from app.domain.errors import NotFoundError
from app.domain.taxonomy import lineages
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.repositories.process_repository import ProcessRepository
from app.schemas.process import (
    ProcessAttributeOut,
    ProcessAttributeValueOut,
    ProcessClassDetailOut,
    ProcessClassOut,
    ProcessClassRefOut,
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

    def __init__(self, db: Session, unit_choices: Mapping[str, str] | None = None) -> None:
        self.repo = ProcessRepository(db)
        # D-70: a escolha de leitura vale para a requisição inteira. Argumento de
        # construtor pela mesma razão do `MaterialService`: um parâmetro por
        # método deixaria alguma superfície de fora, e é assim que a ficha do
        # processo passaria a discordar da do material sobre a mesma grandeza.
        self.unit_choices: Mapping[str, str] = unit_choices or {}

    def _reading(self, attribute: ProcessAttributeDefinition) -> Reading:
        """Em que unidade este atributo sai nesta requisição.

        Um atributo **discreto** não tem unidade nenhuma — nem canônica, nem de
        leitura —, e a `Reading` vazia que sai daqui converte nada: pertinência a
        um vocabulário fechado não se converte.
        """
        return reading_for(
            canonical_unit=attribute.canonical_unit or "",
            display_unit=attribute.display_unit,
            accepted_units=attribute.accepted_units or [],
            requested=self.unit_choices.get(attribute.slug),
        )

    def list_classes(self) -> list[ProcessClassOut]:
        return [
            self._class_to_out(cls, count) for cls, count in self.repo.list_classes_with_counts()
        ]

    def get_class(self, slug: str) -> ProcessClassDetailOut:
        """One process family as a record: prose, breadcrumb, subfolders, processes.

        Same shape and same method as ``TaxonomyService.get_class`` (P1-4): the
        whole taxonomy is read once and walked in memory by
        ``app.domain.taxonomy.lineages`` — the same walk a process Tree stage
        uses, so a breadcrumb and a stage cannot disagree about who is under
        whom.
        """
        rows = self.repo.list_classes_with_counts()
        by_slug = {cls.slug: (cls, count) for cls, count in rows}
        found = by_slug.get(slug)
        if found is None:
            raise NotFoundError(f"Família de processo não encontrada: {slug}")
        cls, direct_count = found

        slug_by_id = {c.id: c.slug for c, _ in rows}
        parents = {c.slug: slug_by_id.get(c.parent_id) for c, _ in rows}
        paths = lineages(parents)

        material_counts = self.repo.material_counts_by_process()
        return ProcessClassDetailOut(
            id=cls.id,
            name=cls.name,
            slug=cls.slug,
            parent_id=cls.parent_id,
            description=cls.description,
            process_count=direct_count,
            applications=cls.applications,
            characteristics=cls.characteristics,
            ancestors=[
                ProcessClassRefOut(
                    id=by_slug[ancestor][0].id, name=by_slug[ancestor][0].name, slug=ancestor
                )
                for ancestor in paths[slug][:-1]
                if ancestor in by_slug
            ],
            children=[
                self._class_to_out(child, count)
                for child, count in rows
                if child.parent_id == cls.id
            ],
            descendant_process_count=sum(
                count for child, count in rows if slug in paths[child.slug]
            ),
            # Active only, exactly like `list_processes`: a withdrawn process
            # admits nobody in a stage, so offering it in a folder would be a
            # link to something the rest of the tool refuses to use.
            processes=[
                self.process_to_out(p, material_counts.get(p.id, 0))
                for p in self.repo.list_active_processes()
                if p.class_id == cls.id
            ],
        )

    def list_processes(self) -> list[ProcessOut]:
        counts = self.repo.material_counts_by_process()
        return [
            self.process_to_out(p, counts.get(p.id, 0)) for p in self.repo.list_active_processes()
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
        base = self.process_to_out(process, counts.get(process.id, 0))
        # Ordered by attribute name, so the sheet reads the same way twice — the
        # relationship's own order is whatever the database returned.
        values = sorted(process.attribute_values, key=lambda v: v.attribute.name)
        return ProcessDetailOut(
            **base.model_dump(),
            attributes=[self._attribute_value_to_out(v) for v in values],
        )

    def _attribute_to_out(self, attribute: ProcessAttributeDefinition) -> ProcessAttributeOut:
        return ProcessAttributeOut(
            id=attribute.id,
            name=attribute.name,
            slug=attribute.slug,
            symbol=attribute.symbol,
            description=attribute.description,
            kind=attribute.kind,
            variable=safe_variable(attribute.slug),
            physical_dimension=attribute.physical_dimension,
            canonical_unit=attribute.canonical_unit,
            accepted_units=list(attribute.accepted_units or []),
            display_unit=attribute.display_unit,
            allowed_labels=list(attribute.allowed_labels or []),
            better_direction=attribute.better_direction,
        )

    def _attribute_value_to_out(self, value: ProcessAttributeValue) -> ProcessAttributeValueOut:
        """Um atributo da ficha, com a leitura ao lado do registro (D-70)."""
        reading = self._reading(value.attribute)
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
            **reading.read(value),
        )

    def processes_for_material(self, material_id: int) -> list[ProcessOut]:
        counts = self.repo.material_counts_by_process()
        return [
            self.process_to_out(p, counts.get(p.id, 0))
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
    def process_to_out(process: Process, material_count: int) -> ProcessOut:
        """A process's API shape. Public since P1-4: the user's own space
        renders a starred process as the same card the catalogue does."""
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
