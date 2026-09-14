"""The user's own space: favourites, recents and their own records (P1-4).

Two rules hold everywhere in here and are the whole of its logic:

**A bookmark over a record you cannot see is impossible.** Every write resolves
the record through the same visibility filter the rest of the application
reads with, and a record that does not resolve produces the same 404 as a
record that does not exist. Anything else would turn the favourites endpoint
into an oracle for guessing which ids belong to somebody.

**A bookmark carries no number.** It is a pointer and a timestamp. A value
about a material lives in ``MaterialPropertyValue`` with the provenance trail
behind it (principle 1), and a copy of one kept here for convenience would be
a second, unattributed answer to a question the catalogue already answers.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import NotFoundError
from app.models.material import Material
from app.models.process import Process
from app.models.user import User
from app.repositories.bookmark_repository import BookmarkRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.process_repository import ProcessRepository
from app.schemas.my_records import BookmarkOut, MyRecordsOut, Universe
from app.services.material_service import MaterialService
from app.services.process_service import ProcessService


class BookmarkService:
    """Reads and writes one person's bookmarks."""

    def __init__(self, db: Session, user: User) -> None:
        # A ``User`` and not an optional one: there is no anonymous reading of
        # somebody's own space, so the absence a `None` would represent has no
        # meaning here.
        self.user = user
        self.db = db
        self.repo = BookmarkRepository(db, user.id)
        self.process_repo = ProcessRepository(db)
        self.material_repo = MaterialRepository(db, user.id)

    # --- read -------------------------------------------------------------

    def my_records(self) -> MyRecordsOut:
        counts = self.process_repo.material_counts_by_process()
        material_service = MaterialService(self.db, self.user)

        def bookmarks(materials, processes) -> list[BookmarkOut]:
            out = [
                BookmarkOut(
                    universe="material",
                    at=_moment(row),
                    material=material_service.list_item(material),
                )
                for row, material in materials
            ]
            out += [
                BookmarkOut(
                    universe="process",
                    at=_moment(row),
                    process=ProcessService.process_to_out(process, counts.get(process.id, 0)),
                )
                for row, process in processes
            ]
            # Merged and re-sorted rather than concatenated: "where was I" is a
            # single chronology, and a reader who opened a process after a
            # material should see it first regardless of which universe it was.
            out.sort(key=lambda bookmark: bookmark.at, reverse=True)
            return out

        return MyRecordsOut(
            favorites=bookmarks(self.repo.favorite_materials(), self.repo.favorite_processes()),
            recents=bookmarks(self.repo.recent_materials(), self.repo.recent_processes()),
            own_records=[
                item for item in material_service.list_materials(None) if item.is_own_record
            ],
        )

    # --- write ------------------------------------------------------------

    def _resolve(self, universe: Universe, record_id: int) -> dict[str, int]:
        """The record's id as a keyword for the repository, or 404.

        The same "not found" for a record that does not exist and for one that
        belongs to somebody else — see the module docstring.
        """
        if universe == "material":
            record: Material | Process | None = self.repo.visible_material(record_id)
            if record is None:
                raise NotFoundError(f"Material não encontrado: {record_id}")
            return {"material_id": record_id}
        record = self.repo.active_process(record_id)
        if record is None:
            raise NotFoundError(f"Processo não encontrado: {record_id}")
        return {"process_id": record_id}

    def add_favorite(self, universe: Universe, record_id: int) -> MyRecordsOut:
        self.repo.add_favorite(**self._resolve(universe, record_id))
        self.repo.commit()
        return self.my_records()

    def remove_favorite(self, universe: Universe, record_id: int) -> MyRecordsOut:
        # Deliberately not resolved first: un-starring has to keep working on a
        # record that has since been withdrawn from the catalogue, or a reader
        # would be stuck with a star they cannot remove.
        keyword = "material_id" if universe == "material" else "process_id"
        self.repo.remove_favorite(**{keyword: record_id})
        self.repo.commit()
        return self.my_records()

    def touch_recent(self, universe: Universe, record_id: int) -> None:
        """Record that the user just opened a record.

        A POST and not a side effect of the datasheet's GET, which would make
        reading a record mutate the database — un-cacheable, non-idempotent,
        and impossible to exercise from a report or an export without polluting
        the list it feeds.
        """
        self.repo.touch_recent(**self._resolve(universe, record_id))
        self.repo.commit()


def _moment(row) -> object:
    """``created_at`` for a favourite, ``viewed_at`` for a recent."""
    return getattr(row, "viewed_at", None) or row.created_at
