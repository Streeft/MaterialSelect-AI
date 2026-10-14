"""Any write to a row the release diff reads deletes every stored diff (D-123).

The stored diff (``CatalogReleaseDiff``) is a cache. It must never outlive the
rows it was computed from, so the rule is blunt and fail-closed: when a flush
writes (adds, changes or deletes) a row the diff reads — of the shared
catalogue — or a bulk statement touches one of those tables, every stored diff
is deleted **in the same transaction**. A rollback brings both back together;
a commit leaves no stored diff that disagrees with the rows. The next request
computes the diff from the rows, exactly as before D-123, and the next import
stores it again.

"Of the shared catalogue": a person's own records (D-62) are not in any
release, so editing one must not throw away a diff that took seconds to
compute. A value, composition row or curve is in the catalogue when its
material (or process) is the target of a ``CatalogRecordRef``, or — for a
curve — when it carries a dataset. The definition tables are small and rarely
written, so any write to one invalidates without asking.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, event, inspect, select
from sqlalchemy.orm import ORMExecuteState, Session

from app.models.catalog import CatalogDataset, CatalogRecordRef, CatalogReleaseDiff
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.property_definition import PropertyDefinition
from app.models.transport_mode import TransportMode

#: A write to any of these invalidates, whatever row it is.
ALWAYS = (
    CatalogDataset,
    CatalogRecordRef,
    PropertyDefinition,
    MaterialClass,
    ProcessClass,
    ProcessAttributeDefinition,
    TransportMode,
)
#: Bulk statements on these tables invalidate (no row to inspect).
WATCHED_TABLES = frozenset(
    model.__table__.name
    for model in (
        *ALWAYS,
        Material,
        MaterialPropertyValue,
        MaterialCompositionEntry,
        MaterialCurve,
        MaterialCurveSeries,
        MaterialCurvePoint,
        Process,
        ProcessAttributeValue,
    )
)


def _state_value(obj: Any, attribute: str) -> list[Any]:
    """The attribute now and, for a changed row, before the change."""
    history = inspect(obj).attrs[attribute].history
    values = [getattr(obj, attribute)]
    values.extend(history.deleted or ())
    return [value for value in values if value is not None]


def _touches_catalogue(session: Session, objects: list[Any]) -> bool:
    material_ids: set[int] = set()
    process_ids: set[int] = set()
    curve_ids: set[int] = set()
    series_ids: set[int] = set()
    for obj in objects:
        if isinstance(obj, ALWAYS):
            return True
        if isinstance(obj, Material):
            material_ids.update(_state_value(obj, "id"))
        elif isinstance(obj, MaterialPropertyValue | MaterialCompositionEntry):
            material_ids.update(_state_value(obj, "material_id"))
        elif isinstance(obj, MaterialCurve):
            if _state_value(obj, "dataset_id"):
                return True
            material_ids.update(_state_value(obj, "material_id"))
            curve_ids.update(_state_value(obj, "id"))
        elif isinstance(obj, MaterialCurveSeries):
            curve_ids.update(_state_value(obj, "curve_id"))
        elif isinstance(obj, MaterialCurvePoint):
            series_ids.update(_state_value(obj, "series_id"))
        elif isinstance(obj, Process):
            process_ids.update(_state_value(obj, "id"))
        elif isinstance(obj, ProcessAttributeValue):
            process_ids.update(_state_value(obj, "process_id"))
    if series_ids:
        curve_ids.update(
            session.execute(
                select(MaterialCurveSeries.curve_id).where(MaterialCurveSeries.id.in_(series_ids))
            ).scalars()
        )
    if curve_ids:
        for dataset_id, material_id in session.execute(
            select(MaterialCurve.dataset_id, MaterialCurve.material_id).where(
                MaterialCurve.id.in_(curve_ids)
            )
        ):
            if dataset_id is not None:
                return True
            material_ids.add(material_id)
    if (
        material_ids
        and session.execute(
            select(CatalogRecordRef.id)
            .where(CatalogRecordRef.material_id.in_(material_ids))
            .limit(1)
        ).first()
    ):
        return True
    if (
        process_ids
        and session.execute(
            select(CatalogRecordRef.id).where(CatalogRecordRef.process_id.in_(process_ids)).limit(1)
        ).first()
    ):
        return True
    return False


def _invalidate(session: Session) -> None:
    session.execute(delete(CatalogReleaseDiff))


@event.listens_for(Session, "before_flush")
def _before_flush(session: Session, flush_context: Any, instances: Any) -> None:
    dirty = [obj for obj in session.dirty if session.is_modified(obj)]
    objects = [*session.new, *dirty, *session.deleted]
    if not objects or all(isinstance(obj, CatalogReleaseDiff) for obj in objects):
        return
    if _touches_catalogue(session, objects):
        _invalidate(session)


@event.listens_for(Session, "do_orm_execute")
def _bulk_statement(state: ORMExecuteState) -> None:
    if not (state.is_insert or state.is_update or state.is_delete):
        return
    table = getattr(state.statement, "table", None)
    if table is not None and table.name in WATCHED_TABLES:
        _invalidate(state.session)
