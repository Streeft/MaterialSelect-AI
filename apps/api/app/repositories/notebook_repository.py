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

from sqlalchemy import delete, func, select
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

    # --- quota ---------------------------------------------------------------

    def usage(self, day: date) -> AIUsage | None:
        """Today's counters — ``requests``, ``artifacts`` and ``fetches`` — or
        ``None`` when nothing was counted yet (the service reads that as 0)."""
        return self.db.execute(
            select(AIUsage).where(AIUsage.user_id == self.owner_id, AIUsage.day == day)
        ).scalar_one_or_none()

    def _usage_row(self, day: date) -> AIUsage:
        usage = self.usage(day)
        if usage is None:
            usage = AIUsage(user_id=self.owner_id, day=day, requests=0, artifacts=0, fetches=0)
            self.db.add(usage)
        return usage

    def count_request(self, day: date) -> AIUsage:
        usage = self._usage_row(day)
        usage.requests += 1
        self.db.flush()
        return usage

    def count_artifact(self, day: date) -> AIUsage:
        usage = self._usage_row(day)
        usage.artifacts += 1
        self.db.flush()
        return usage

    def count_fetch(self, day: date) -> AIUsage:
        """One request that left the server for an external source (D-97)."""
        usage = self._usage_row(day)
        usage.fetches += 1
        self.db.flush()
        return usage
