"""Data access for one person's favourites and recently-opened records (P1-4).

Every query here is already narrowed to one user — the id is a constructor
argument, not a parameter — because there is no such thing as reading somebody
else's bookmarks. That makes this repository the one place in the codebase
where a missing filter could not even be expressed.

Both listings **join the record** rather than returning bare ids. A bookmark
that no longer resolves to a live record is simply absent from the answer: a
material can be withdrawn from the catalogue (``is_active`` False) while the
row that starred it stays, and rendering "material 41" for it would be worse
than rendering nothing. The row is kept rather than deleted because withdrawal
is reversible, and a star the reader never removed should come back with the
material.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Select, delete, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.material import Material
from app.models.my_records import Favorite, RecentRecord
from app.models.process import Process
from app.repositories.visibility import visible_materials

#: How many recently-opened records are kept. "Where was I" is answered by a
#: short list; a long one is a history, which is a different question and one
#: ``AuditEvent`` already answers with far better fidelity (M2).
RECENT_LIMIT = 20


class BookmarkRepository:
    """Favourites and recents for exactly one user."""

    def __init__(self, db: Session, user_id: int) -> None:
        self.db = db
        self.user_id = user_id

    # --- reads ------------------------------------------------------------

    def _materials(self, model: type[Favorite | RecentRecord], order) -> list[tuple]:
        stmt: Select = (
            select(model, Material)
            .join(Material, model.material_id == Material.id)
            .options(
                joinedload(Material.material_class),
                # The list item states each material's data-quality mix, same as
                # the catalogue does; reaching it lazily would be one query per
                # starred row.
                selectinload(Material.property_values),
            )
            .where(model.user_id == self.user_id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.user_id))
            .order_by(order)
        )
        return list(self.db.execute(stmt).unique().all())

    def _processes(self, model: type[Favorite | RecentRecord], order) -> list[tuple]:
        stmt: Select = (
            select(model, Process)
            .join(Process, model.process_id == Process.id)
            .options(joinedload(Process.process_class))
            .where(model.user_id == self.user_id)
            .where(Process.is_active.is_(True))
            .order_by(order)
        )
        return list(self.db.execute(stmt).unique().all())

    def favorite_materials(self) -> list[tuple[Favorite, Material]]:
        return self._materials(Favorite, Favorite.created_at.desc())

    def favorite_processes(self) -> list[tuple[Favorite, Process]]:
        return self._processes(Favorite, Favorite.created_at.desc())

    def recent_materials(self) -> list[tuple[RecentRecord, Material]]:
        return self._materials(RecentRecord, RecentRecord.viewed_at.desc())

    def recent_processes(self) -> list[tuple[RecentRecord, Process]]:
        return self._processes(RecentRecord, RecentRecord.viewed_at.desc())

    # --- existence checks -------------------------------------------------

    def visible_material(self, material_id: int) -> Material | None:
        """The material, if this user may see it and it is still catalogued."""
        stmt = (
            select(Material)
            .where(Material.id == material_id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.user_id))
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def active_process(self, process_id: int) -> Process | None:
        stmt = select(Process).where(Process.id == process_id).where(Process.is_active.is_(True))
        return self.db.execute(stmt).scalars().one_or_none()

    # --- writes -----------------------------------------------------------

    def _existing(
        self,
        model: type[Favorite | RecentRecord],
        *,
        material_id: int | None,
        process_id: int | None,
    ):
        stmt = select(model).where(model.user_id == self.user_id)
        if material_id is not None:
            stmt = stmt.where(model.material_id == material_id)
        else:
            stmt = stmt.where(model.process_id == process_id)
        return self.db.execute(stmt).scalars().one_or_none()

    def add_favorite(
        self, *, material_id: int | None = None, process_id: int | None = None
    ) -> bool:
        """Star a record. Returns False when it was already starred.

        Idempotent rather than a conflict: a star is a desired end state, and a
        second click on an already-lit star means the same thing as the first.
        """
        if self._existing(Favorite, material_id=material_id, process_id=process_id) is not None:
            return False
        self.db.add(Favorite(user_id=self.user_id, material_id=material_id, process_id=process_id))
        self.db.flush()
        return True

    def remove_favorite(
        self, *, material_id: int | None = None, process_id: int | None = None
    ) -> bool:
        """Un-star a record. Returns False when it was not starred."""
        row = self._existing(Favorite, material_id=material_id, process_id=process_id)
        if row is None:
            return False
        self.db.delete(row)
        self.db.flush()
        return True

    def touch_recent(
        self, *, material_id: int | None = None, process_id: int | None = None
    ) -> None:
        """Record that this user just opened a record, newest first.

        Updates the row that already exists rather than adding a second one —
        which is what makes this a set with an order instead of a log, and what
        the table's uniqueness constraint independently guarantees.
        """
        row = self._existing(RecentRecord, material_id=material_id, process_id=process_id)
        if row is None:
            row = RecentRecord(user_id=self.user_id, material_id=material_id, process_id=process_id)
            self.db.add(row)
        row.viewed_at = datetime.now(UTC)
        self.db.flush()
        self._prune_recents()

    def _prune_recents(self) -> None:
        """Keep only the newest ``RECENT_LIMIT`` rows for this user.

        Ids are collected first and deleted by id, rather than deleted by a
        correlated subquery over the same table: SQLite and PostgreSQL disagree
        about LIMIT inside a DELETE, and the list is twenty rows long.
        """
        keep = (
            select(RecentRecord.id)
            .where(RecentRecord.user_id == self.user_id)
            .order_by(RecentRecord.viewed_at.desc())
            .limit(RECENT_LIMIT)
        )
        keep_ids = [row[0] for row in self.db.execute(keep).all()]
        self.db.execute(
            delete(RecentRecord)
            .where(RecentRecord.user_id == self.user_id)
            .where(RecentRecord.id.not_in(keep_ids))
        )

    def commit(self) -> None:
        self.db.commit()
