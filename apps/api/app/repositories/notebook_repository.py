"""Data access for the Cadernos (D-92), always through the owner.

The owner is a **constructor argument with no default**, and every read joins
through ``Notebook.owner_id``. There is no method here that takes a notebook
id without that filter — a student asking for somebody else's notebook, source,
message or note gets ``None``, which the service turns into a 404, the same
answer a notebook that never existed gets (the D-62 rule: a 403 would confirm
that the id is real).

Deletes are written out table by table rather than left to ``ondelete``: the
SQLite this project develops and tests on does not enforce foreign keys, and a
passage orphaned there could be inherited by the next source that reuses its
parent's id — another student's source (the D-72 reasoning).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, selectinload

from app.models.notebook import (
    AIUsage,
    Notebook,
    NotebookChunk,
    NotebookEmbedding,
    NotebookMessage,
    NotebookNote,
    NotebookSource,
    StudioArtifact,
)


class NotebookRepository:
    def __init__(self, db: Session, owner_id: int) -> None:
        self.db = db
        self.owner_id = owner_id

    # --- notebooks -----------------------------------------------------------

    def list_notebooks(self) -> list[tuple[Notebook, int]]:
        counts = (
            select(NotebookSource.notebook_id, func.count(NotebookSource.id).label("n"))
            .group_by(NotebookSource.notebook_id)
            .subquery()
        )
        rows = self.db.execute(
            select(Notebook, func.coalesce(counts.c.n, 0))
            .outerjoin(counts, counts.c.notebook_id == Notebook.id)
            .where(Notebook.owner_id == self.owner_id)
            .order_by(Notebook.updated_at.desc(), Notebook.id.desc())
        ).all()
        return [(notebook, int(count)) for notebook, count in rows]

    def get(self, notebook_id: int) -> Notebook | None:
        return self.db.execute(
            select(Notebook)
            .options(selectinload(Notebook.sources), selectinload(Notebook.notes))
            .where(Notebook.id == notebook_id, Notebook.owner_id == self.owner_id)
        ).scalar_one_or_none()

    def add(self, notebook: Notebook) -> Notebook:
        notebook.owner_id = self.owner_id
        self.db.add(notebook)
        self.db.flush()
        return notebook

    def delete(self, notebook: Notebook) -> None:
        for source in list(notebook.sources):
            self.delete_source(source)
        for model in (NotebookMessage, NotebookNote, StudioArtifact):
            self.db.execute(delete(model).where(model.notebook_id == notebook.id))
        self.db.execute(delete(Notebook).where(Notebook.id == notebook.id))
        self.db.expire_all()

    # --- sources -------------------------------------------------------------

    def get_source(self, notebook_id: int, source_id: int) -> NotebookSource | None:
        return self.db.execute(
            select(NotebookSource)
            .join(Notebook, Notebook.id == NotebookSource.notebook_id)
            .where(
                NotebookSource.id == source_id,
                NotebookSource.notebook_id == notebook_id,
                Notebook.owner_id == self.owner_id,
            )
        ).scalar_one_or_none()

    def source_with_origin(self, notebook_id: int, origin: str) -> NotebookSource | None:
        """The owner's source in this notebook that came from ``origin``, if any.

        What an external source is deduplicated by (D-97) — *before* the fetch,
        so adding the same page twice costs no request and no quota. ``origin``
        is compared as written: the caller normalises it (the canonical URL of a
        page, video, work or article). The checksum check still runs after the
        fetch, for the same text reached by two addresses.
        """
        return (
            self.db.execute(
                select(NotebookSource)
                .join(Notebook, Notebook.id == NotebookSource.notebook_id)
                .where(
                    NotebookSource.notebook_id == notebook_id,
                    NotebookSource.origin == origin,
                    Notebook.owner_id == self.owner_id,
                )
                .order_by(NotebookSource.id)
            )
            .scalars()
            .first()
        )

    def source_checksum_exists(self, notebook_id: int, checksum: str) -> NotebookSource | None:
        return self.db.execute(
            select(NotebookSource).where(
                NotebookSource.notebook_id == notebook_id, NotebookSource.checksum == checksum
            )
        ).scalar_one_or_none()

    def delete_source(self, source: NotebookSource) -> None:
        chunk_ids = select(NotebookChunk.id).where(NotebookChunk.source_id == source.id)
        self.db.execute(delete(NotebookEmbedding).where(NotebookEmbedding.chunk_id.in_(chunk_ids)))
        self.db.execute(delete(NotebookChunk).where(NotebookChunk.source_id == source.id))
        self.db.execute(delete(NotebookSource).where(NotebookSource.id == source.id))

    def selected_chunks(self, notebook_id: int) -> list[NotebookChunk]:
        """Every passage of the notebook's selected, readable sources."""
        return list(
            self.db.execute(
                select(NotebookChunk)
                .join(NotebookSource, NotebookSource.id == NotebookChunk.source_id)
                .join(Notebook, Notebook.id == NotebookSource.notebook_id)
                .options(selectinload(NotebookChunk.embedding), selectinload(NotebookChunk.source))
                .where(
                    Notebook.id == notebook_id,
                    Notebook.owner_id == self.owner_id,
                    NotebookSource.selected.is_(True),
                    NotebookSource.status == "pronto",
                )
                .order_by(NotebookChunk.source_id, NotebookChunk.ordinal)
            ).scalars()
        )

    # --- chat ----------------------------------------------------------------

    def messages(self, notebook_id: int, limit: int | None = None) -> list[NotebookMessage]:
        stmt = (
            select(NotebookMessage)
            .join(Notebook, Notebook.id == NotebookMessage.notebook_id)
            .where(Notebook.id == notebook_id, Notebook.owner_id == self.owner_id)
            .order_by(NotebookMessage.id.desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(reversed(self.db.execute(stmt).scalars().all()))

    def get_message(self, notebook_id: int, message_id: int) -> NotebookMessage | None:
        return self.db.execute(
            select(NotebookMessage)
            .join(Notebook, Notebook.id == NotebookMessage.notebook_id)
            .where(
                NotebookMessage.id == message_id,
                Notebook.id == notebook_id,
                Notebook.owner_id == self.owner_id,
            )
        ).scalar_one_or_none()

    def clear_messages(self, notebook_id: int) -> None:
        self.db.execute(delete(NotebookMessage).where(NotebookMessage.notebook_id == notebook_id))

    # --- notes ---------------------------------------------------------------

    def get_note(self, notebook_id: int, note_id: int) -> NotebookNote | None:
        return self.db.execute(
            select(NotebookNote)
            .join(Notebook, Notebook.id == NotebookNote.notebook_id)
            .where(
                NotebookNote.id == note_id,
                Notebook.id == notebook_id,
                Notebook.owner_id == self.owner_id,
            )
        ).scalar_one_or_none()

    def chunks_of(self, notebook_id: int, source_ids: list[int]) -> list[NotebookChunk]:
        """The passages of these sources, still readable — what a Studio job reads.

        By id and not by the current selection: the student may untick a
        source while the job runs, and the artifact says what it was made from.
        """
        if not source_ids:
            return []
        return list(
            self.db.execute(
                select(NotebookChunk)
                .join(NotebookSource, NotebookSource.id == NotebookChunk.source_id)
                .join(Notebook, Notebook.id == NotebookSource.notebook_id)
                .options(selectinload(NotebookChunk.embedding), selectinload(NotebookChunk.source))
                .where(
                    Notebook.id == notebook_id,
                    Notebook.owner_id == self.owner_id,
                    NotebookSource.id.in_(source_ids),
                    NotebookSource.status == "pronto",
                )
                .order_by(NotebookChunk.source_id, NotebookChunk.ordinal)
            ).scalars()
        )

    # --- studio --------------------------------------------------------------

    def artifacts(self, notebook_id: int) -> list[StudioArtifact]:
        return list(
            self.db.execute(
                select(StudioArtifact)
                .join(Notebook, Notebook.id == StudioArtifact.notebook_id)
                .where(Notebook.id == notebook_id, Notebook.owner_id == self.owner_id)
                .order_by(StudioArtifact.id.desc())
            ).scalars()
        )

    def get_artifact(self, notebook_id: int, artifact_id: int) -> StudioArtifact | None:
        return self.db.execute(
            select(StudioArtifact)
            .join(Notebook, Notebook.id == StudioArtifact.notebook_id)
            .where(
                StudioArtifact.id == artifact_id,
                Notebook.id == notebook_id,
                Notebook.owner_id == self.owner_id,
            )
        ).scalar_one_or_none()

    def find_artifact(self, artifact_id: int) -> StudioArtifact | None:
        """An artifact by id alone — still only among the owner's. What a job
        has in hand."""
        return self.db.execute(
            select(StudioArtifact)
            .join(Notebook, Notebook.id == StudioArtifact.notebook_id)
            .where(StudioArtifact.id == artifact_id, Notebook.owner_id == self.owner_id)
        ).scalar_one_or_none()

    def running(self) -> list[StudioArtifact]:
        """Every generation of the owner's still marked as running, in any
        notebook. Whether one is stuck is the service's call."""
        return list(
            self.db.execute(
                select(StudioArtifact)
                .join(Notebook, Notebook.id == StudioArtifact.notebook_id)
                .where(Notebook.owner_id == self.owner_id, StudioArtifact.status == "gerando")
            ).scalars()
        )

    # A running generation holds one reserved unit, handed back when it fails
    # or is deleted unfinished. Two of those can race — the job failing while
    # the student deletes it — and both would hand the unit back. So leaving
    # ``gerando`` is itself the guard: one statement conditioned on the status,
    # whose row count says whether *this* caller moved the row out of it and so
    # owns the refund. On PostgreSQL the loser waits on the row lock and then
    # finds the status changed; on SQLite the writers queue.

    def _owned_artifact(self, artifact_id: int):
        owned = select(Notebook.id).where(Notebook.owner_id == self.owner_id)
        return (StudioArtifact.id == artifact_id, StudioArtifact.notebook_id.in_(owned))

    def settle_running(self, artifact_id: int, **values: object) -> bool:
        """Write ``values`` (a final status and its error) on a generation only
        if it is still ``gerando``; whether it was."""
        result = self.db.execute(
            update(StudioArtifact)
            .where(*self._owned_artifact(artifact_id), StudioArtifact.status == "gerando")
            .values(**values)
            .execution_options(synchronize_session="fetch")
        )
        return result.rowcount == 1

    def delete_running(self, artifact_id: int) -> bool:
        """Delete a generation only if it is still ``gerando``; whether it was."""
        result = self.db.execute(
            delete(StudioArtifact)
            .where(*self._owned_artifact(artifact_id), StudioArtifact.status == "gerando")
            .execution_options(synchronize_session="fetch")
        )
        return result.rowcount == 1

    # --- quota ---------------------------------------------------------------
    #
    # Every change to a counter is one SQL statement, never read-then-write in
    # Python (``usage.fetches += 1`` loses an increment to a concurrent one).
    # Spending is a *reservation*: ``reserve`` adds one only while the counter
    # is under the limit, in the same ``UPDATE … WHERE counter < limit``, and
    # says by its row count whether it did — so two requests racing for the
    # last unit cannot both have it, on PostgreSQL (the row lock re-checks the
    # condition against the committed value) as on SQLite (one writer at a
    # time). What the caller decides not to charge in the end is handed back
    # with ``release``.

    _COUNTERS = ("requests", "artifacts", "fetches")

    def usage(self, day: date) -> AIUsage | None:
        """Today's counters — ``requests``, ``artifacts`` and ``fetches`` — or
        ``None`` when nothing was counted yet (the service reads that as 0).

        Always read from the database: the counters change by ``UPDATE``
        statements that bypass the identity map, and a session that loaded the
        row earlier would otherwise keep answering with its old numbers."""
        return self.db.execute(
            select(AIUsage)
            .where(AIUsage.user_id == self.owner_id, AIUsage.day == day)
            .execution_options(populate_existing=True)
        ).scalar_one_or_none()

    def reserve(self, day: date, counter: str, limit: int, *, slack: int = 0) -> bool:
        """Add one to ``counter`` if it is below ``limit + slack``; whether it did.

        ``slack`` is what the counter holds that the caller does not charge
        (a Studio generation interrupted by a restart), so the comparison is
        ``counter - slack < limit`` without a second statement.
        """
        column = self._column(counter)
        self._ensure_row(day)
        result = self.db.execute(
            update(AIUsage)
            .where(
                AIUsage.user_id == self.owner_id,
                AIUsage.day == day,
                column < limit + slack,
            )
            .values({counter: column + 1})
            .execution_options(synchronize_session=False)
        )
        return result.rowcount == 1

    def release(self, day: date, counter: str) -> None:
        """Hand back one unit reserved and not spent — never below zero."""
        column = self._column(counter)
        self.db.execute(
            update(AIUsage)
            .where(AIUsage.user_id == self.owner_id, AIUsage.day == day, column > 0)
            .values({counter: column - 1})
            .execution_options(synchronize_session=False)
        )

    def count_request(self, day: date) -> AIUsage:
        return self._count(day, "requests")

    def count_artifact(self, day: date) -> AIUsage:
        return self._count(day, "artifacts")

    def count_fetch(self, day: date) -> AIUsage:
        """One request that left the server for an external source (D-97)."""
        return self._count(day, "fetches")

    def _count(self, day: date, counter: str) -> AIUsage:
        """Add one unconditionally — still one statement, never read-then-write."""
        column = self._column(counter)
        self._ensure_row(day)
        self.db.execute(
            update(AIUsage)
            .where(AIUsage.user_id == self.owner_id, AIUsage.day == day)
            .values({counter: column + 1})
            .execution_options(synchronize_session=False)
        )
        usage = self.usage(day)
        assert usage is not None  # the row was just ensured
        return usage

    def _column(self, counter: str):
        if counter not in self._COUNTERS:  # pragma: no cover - a programming error
            raise ValueError(f"unknown quota counter: {counter}")
        return getattr(AIUsage, counter)

    def _ensure_row(self, day: date) -> None:
        """The (user, day) row, created if missing without racing a concurrent
        creation: ``INSERT … ON CONFLICT DO NOTHING`` on the unique pair, in
        the dialects this project runs on (SQLite in development and tests,
        PostgreSQL in production)."""
        values = {"user_id": self.owner_id, "day": day, "requests": 0, "artifacts": 0}
        values |= {"fetches": 0}
        dialect = self.db.get_bind().dialect.name
        if dialect in ("sqlite", "postgresql"):
            insert = sqlite_insert if dialect == "sqlite" else postgresql_insert
            self.db.execute(
                insert(AIUsage.__table__)
                .values(**values)
                .on_conflict_do_nothing(index_elements=["user_id", "day"])
            )
        elif self.usage(day) is None:  # pragma: no cover - no third dialect in use
            self.db.add(AIUsage(**values))
            self.db.flush()
