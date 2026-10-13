"""Promote a release of an official catalogue: the previous one goes inactive (D-114).

TM7-a and TM4-g. Importing a release of a lineage that already has an active
release retires the older one **in the same transaction** as the import: the
importer writes everything first, and only then — when nothing failed — this
module sets ``is_active=False`` on the previous release and on the rows of it
that the new one supersedes or drops. Never a ``DELETE``: the previous release
stays readable, and the diff of the D-108 still compares the rows each release
stored. The decisions of which rows are pure (``app.domain.release_promotion``);
this module only reads and writes them.

A release without a lineage is comparable with nothing (D-108), so it retires
nothing either.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.release_promotion import Identity, PreviousRecord, UniversePlan, plan_universe
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.material_curve import MaterialCurve
from app.models.process import Process
from app.models.transport_mode import TransportMode

#: The curves' "external table": a curve's identity is its ``external_id`` alone.
CURVE_TABLE = "MaterialCurve"


class ReleasePromotionError(ValueError):
    """The release cannot vigorar over its lineage (an older one, or a retired one)."""


@dataclass(frozen=True)
class IncomingIdentities:
    """The external identities the new release carries, per universe."""

    materials: frozenset[Identity]
    processes: frozenset[Identity]
    transports: frozenset[Identity]
    curves: frozenset[Identity]


def lineage_datasets(db: Session, lineage: str | None, *, exclude_id: int | None = None):
    """Every release of a lineage, oldest first (the order of recording)."""
    if lineage is None:
        return []
    stmt = select(CatalogDataset).where(CatalogDataset.lineage == lineage)
    if exclude_id is not None:
        stmt = stmt.where(CatalogDataset.id != exclude_id)
    return list(db.execute(stmt.order_by(CatalogDataset.id)).scalars())


def check_promotable(db: Session, dataset: CatalogDataset) -> None:
    """Refuse a release that would make the lineage go back in time.

    A release already retired is not re-activated by importing it again, and a
    release older than the newest of its lineage is not imported over it: both
    would silently undo a promotion. Fail-closed, before anything is written.
    """
    if not dataset.is_active:
        raise ReleasePromotionError(
            f"A release {dataset.slug!r} já foi substituída e está inativa; "
            "reimportá-la não a reativa."
        )
    newer = [
        other.slug
        for other in lineage_datasets(db, dataset.lineage, exclude_id=dataset.id)
        if other.id > dataset.id
    ]
    if newer:
        raise ReleasePromotionError(
            f"A linha {dataset.lineage!r} já tem release mais recente que {dataset.slug!r}: "
            f"{', '.join(newer)}. Uma release antiga não é reimportada por cima da nova."
        )


def previous_active_releases(db: Session, dataset_id: int | None, lineage: str | None):
    """The active releases of the lineage recorded before this one (normally one)."""
    return [
        other
        for other in lineage_datasets(db, lineage, exclude_id=dataset_id)
        if other.is_active and (dataset_id is None or other.id < dataset_id)
    ]


def _ref_records(
    db: Session, releases: list[CatalogDataset], column, target
) -> list[PreviousRecord]:
    """The rows the previous releases point at through ``column`` (one universe)."""
    if not releases:
        return []
    slugs = {release.id: release.slug for release in releases}
    rows = db.execute(
        select(
            CatalogRecordRef.external_table,
            CatalogRecordRef.external_record_id,
            target.id,
            CatalogRecordRef.dataset_id,
            target.is_active,
        )
        .join(target, target.id == column)
        .where(CatalogRecordRef.dataset_id.in_(sorted(slugs)))
    ).all()
    return [
        PreviousRecord(
            external_table=row[0],
            external_record_id=row[1],
            internal_id=row[2],
            release_slug=slugs[row[3]],
            is_active=bool(row[4]),
        )
        for row in rows
    ]


def _curve_records(db: Session, releases: list[CatalogDataset]) -> list[PreviousRecord]:
    """Official curves of the previous releases; "active" means on an active material."""
    if not releases:
        return []
    slugs = {release.id: release.slug for release in releases}
    rows = db.execute(
        select(
            MaterialCurve.external_id,
            MaterialCurve.id,
            MaterialCurve.dataset_id,
            Material.is_active,
        )
        .join(Material, Material.id == MaterialCurve.material_id)
        .where(MaterialCurve.dataset_id.in_(sorted(slugs)))
    ).all()
    return [
        PreviousRecord(
            external_table=CURVE_TABLE,
            external_record_id=str(row[0]),
            internal_id=row[1],
            release_slug=slugs[row[2]],
            is_active=bool(row[3]),
        )
        for row in rows
    ]


@dataclass(frozen=True)
class PromotionPlan:
    lineage: str | None
    previous: tuple[str, ...]
    materials: UniversePlan
    processes: UniversePlan
    transports: UniversePlan
    #: Curves ride on their material (no column of their own): a superseded
    #: curve stays on the old, now inactive material — preserved for the diff,
    #: out of the active catalogue — and the new release's curve is on the new
    #: material. Nothing to write for them; the plan says what moves.
    curves: UniversePlan

    def report(self) -> dict:
        return {
            "lineage": self.lineage,
            "previous_releases": list(self.previous),
            "materials": self.materials.report(),
            "processes": self.processes.report(),
            "transport_modes": self.transports.report(),
            "curves": self.curves.report(),
        }


def plan(
    db: Session,
    *,
    dataset_id: int | None,
    lineage: str | None,
    incoming: IncomingIdentities,
    kept_material_ids: Iterable[int] = (),
    kept_process_ids: Iterable[int] = (),
    kept_transport_ids: Iterable[int] = (),
) -> PromotionPlan:
    """Read what the previous releases stored and decide; writes nothing."""
    releases = previous_active_releases(db, dataset_id, lineage)
    return PromotionPlan(
        lineage=lineage,
        previous=tuple(release.slug for release in releases),
        materials=plan_universe(
            _ref_records(db, releases, CatalogRecordRef.material_id, Material),
            incoming.materials,
            reuses_rows=False,
            kept_ids=kept_material_ids,
        ),
        processes=plan_universe(
            _ref_records(db, releases, CatalogRecordRef.process_id, Process),
            incoming.processes,
            reuses_rows=True,
            kept_ids=kept_process_ids,
        ),
        transports=plan_universe(
            _ref_records(db, releases, CatalogRecordRef.transport_mode_id, TransportMode),
            incoming.transports,
            reuses_rows=True,
            kept_ids=kept_transport_ids,
        ),
        curves=plan_universe(_curve_records(db, releases), incoming.curves, reuses_rows=False),
    )


def _identities(db: Session, dataset_id: int, column) -> frozenset[Identity]:
    rows = db.execute(
        select(CatalogRecordRef.external_table, CatalogRecordRef.external_record_id).where(
            CatalogRecordRef.dataset_id == dataset_id, column.is_not(None)
        )
    ).all()
    return frozenset((row[0], row[1]) for row in rows)


def _ids(db: Session, dataset_id: int, column) -> set[int]:
    return set(
        db.execute(
            select(column).where(CatalogRecordRef.dataset_id == dataset_id, column.is_not(None))
        ).scalars()
    )


def promote(db: Session, dataset: CatalogDataset) -> dict:
    """Retire the previous active releases of the lineage. Call after every write.

    Reads the new release from what it **stored** (its refs and curves), not
    from the bundle, so the retirement can only follow a complete import. The
    caller commits; an exception here leaves the whole import to roll back.
    """
    curves = frozenset(
        (CURVE_TABLE, str(external_id))
        for external_id in db.execute(
            select(MaterialCurve.external_id).where(MaterialCurve.dataset_id == dataset.id)
        ).scalars()
    )
    result = plan(
        db,
        dataset_id=dataset.id,
        lineage=dataset.lineage,
        incoming=IncomingIdentities(
            materials=_identities(db, dataset.id, CatalogRecordRef.material_id),
            processes=_identities(db, dataset.id, CatalogRecordRef.process_id),
            transports=_identities(db, dataset.id, CatalogRecordRef.transport_mode_id),
            curves=curves,
        ),
        kept_material_ids=_ids(db, dataset.id, CatalogRecordRef.material_id),
        kept_process_ids=_ids(db, dataset.id, CatalogRecordRef.process_id),
        kept_transport_ids=_ids(db, dataset.id, CatalogRecordRef.transport_mode_id),
    )
    for model, universe in (
        (Material, result.materials),
        (Process, result.processes),
        (TransportMode, result.transports),
    ):
        for row in db.execute(select(model).where(model.id.in_(universe.to_deactivate))).scalars():
            row.is_active = False
    for release in previous_active_releases(db, dataset.id, dataset.lineage):
        release.is_active = False
    db.flush()
    return result.report()
