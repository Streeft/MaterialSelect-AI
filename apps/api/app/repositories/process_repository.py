"""Data access for the process universe (P0-2)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.process_attribute import (
    ProcessAttributeDefinition,
    ProcessAttributeValue,
)


class ProcessRepository:
    """Reads over ``ProcessClass``, ``Process`` and the material↔process link.

    Read-only in v1: the demo universe comes from the seed, and a process
    catalogue an operator can edit by hand is a separate piece of work with its
    own audit trail (the material catalogue's shape, not a free-for-all).
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_classes_with_counts(self) -> list[tuple[ProcessClass, int]]:
        """Every process folder, with how many **active** processes are filed
        *directly* in it.

        Directly, not cumulatively: the count answers "is this folder empty",
        and a cumulative count would make every branch look populated even when
        nothing is filed in it — the same reason a Tree stage needs
        ``include_descendants`` to be a decision rather than a default.

        Active, because every other reading of this number already is. The count
        used to include withdrawn processes while `list_active_processes` excluded
        them, so a folder holding one live process and one withdrawn one reported
        two and handed back one. That went unseen while nothing put the count and
        the list on the same screen; the family record (P1-4) does, and a reader
        would have concluded the page lost a row. It was wrong for the stage
        picker too: a folder whose only process is withdrawn admits nobody, which
        is exactly what "is this folder empty" asks.

        The filter lives in the **ON** clause and not in a WHERE: moved to WHERE
        it would turn the outer join into an inner one and drop every empty
        folder from the taxonomy.
        """
        stmt = (
            select(ProcessClass, func.count(Process.id))
            .outerjoin(
                Process,
                (Process.class_id == ProcessClass.id) & Process.is_active.is_(True),
            )
            .group_by(ProcessClass.id)
            .order_by(ProcessClass.name)
        )
        return [(row[0], row[1]) for row in self.db.execute(stmt).all()]

    def list_active_processes(self) -> list[Process]:
        """Active processes with their class eager-loaded."""
        stmt = (
            select(Process)
            .options(joinedload(Process.process_class))
            .where(Process.is_active.is_(True))
            .order_by(Process.name)
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def list_attributes(self) -> list[ProcessAttributeDefinition]:
        """The process attribute catalogue (P0-4), in display order.

        Ordered by name and not by ``id``: the order a reader sees must not
        depend on which attribute an operator happened to create first.
        """
        stmt = select(ProcessAttributeDefinition).order_by(ProcessAttributeDefinition.name)
        return list(self.db.execute(stmt).scalars().all())

    def get_active_process_by_slug(self, slug: str) -> Process | None:
        """One active process with its class, attribute values and their
        definitions and sources loaded — the process datasheet's query (P0-4).

        Everything the sheet shows in one round trip, because the sheet shows the
        provenance and provenance is the source row.
        """
        stmt = (
            select(Process)
            .options(
                joinedload(Process.process_class),
                selectinload(Process.attribute_values).joinedload(ProcessAttributeValue.attribute),
                selectinload(Process.attribute_values).joinedload(ProcessAttributeValue.source),
            )
            .where(Process.slug == slug, Process.is_active.is_(True))
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()

    def material_counts_by_process(self) -> dict[int, int]:
        """How many materials each process applies to — one statement, not one
        per process."""
        stmt = select(MaterialProcess.process_id, func.count(MaterialProcess.material_id)).group_by(
            MaterialProcess.process_id
        )
        return {row[0]: row[1] for row in self.db.execute(stmt).all()}

    def processes_for_material(self, material_id: int) -> list[Process]:
        """The processes one material can be made with — the datasheet's side of
        the join."""
        stmt = (
            select(Process)
            .options(joinedload(Process.process_class))
            .join(MaterialProcess, MaterialProcess.process_id == Process.id)
            .where(MaterialProcess.material_id == material_id, Process.is_active.is_(True))
            .order_by(Process.name)
        )
        return list(self.db.execute(stmt).scalars().unique().all())
