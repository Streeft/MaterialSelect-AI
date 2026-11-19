"""Keep what a catalogue release brought, once, when it is written (D-250).

Called by the official import (``CatalogImporter._run``) in the import's own
transaction, after the promotion, and by the fictitious releases of the demo
seed. Counting again replaces the row — a rerun of the demo seed that adds a
record must not leave a stale count behind — but nothing else ever writes it:
a later curation of a row does not rewrite what the release *was*.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.catalog import RELEASE_COUNT_ORIGINS, CatalogDataset, CatalogReleaseCount
from app.repositories.release_count_repository import ReleaseCountRepository


def record_release_counts(
    db: Session, dataset: CatalogDataset, origin: str = "import"
) -> CatalogReleaseCount:
    """Count ``dataset``'s rows and keep the result; flushes, never commits."""
    if origin not in RELEASE_COUNT_ORIGINS:
        raise ValueError(f"Origem de contagem desconhecida: {origin}")
    repo = ReleaseCountRepository(db)
    db.flush()  # the release's rows must be visible to the counting queries
    tally = repo.measure(dataset.id)
    row = repo.get(dataset.id)
    if row is None:
        row = CatalogReleaseCount(dataset_id=dataset.id)
        repo.add(row)
    row.materials = tally.materials
    row.classes = tally.classes
    row.properties = tally.properties
    row.values_filled = tally.values_filled
    row.values_declared_missing = tally.values_declared_missing
    row.processes = tally.processes
    row.origin = origin
    row.counted_at = datetime.now(UTC)
    db.flush()
    return row
