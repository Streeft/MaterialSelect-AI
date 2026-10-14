"""The release diff as a stored document, and back (TM7-d, D-123).

Pure: no database, no clock. ``dump_diffs`` turns the output of
:func:`app.domain.release_diff.diff_releases` into JSON-safe data, and
``load_diffs`` turns that data back into the same objects the service reads.
The round trip is exact for everything the service and the exporters read —
the header of each side, the status and every change with both stored values
— and that is pinned by an equivalence test against the live computation.

What is **not** stored is every stored value of every record: once the
changes are known, the service never reads a record's values again, and
keeping them would store the catalogue a second time. A loaded record has
empty ``values``, ``composition`` and ``curves``; nothing downstream of the
diff reads them.

Absence stays absence: ``None`` is written as JSON ``null`` and read back as
``None``, never as a number, and a non-finite number refuses the dump (the
caller then simply does not cache, and the diff is computed from the rows).
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import fields
from typing import Any

from app.domain.release_diff import (
    ChangeKind,
    FieldChange,
    RecordDiff,
    RecordSnapshot,
    RecordStatus,
    Universe,
    ValueSnapshot,
)

#: Bump whenever ``app.domain.release_diff`` changes what it computes, or this
#: module changes what it writes: a stored diff of another version is never
#: served, it is recomputed from the rows.
FORMAT_VERSION = 1

_HEADER_FIELDS = (
    "external_table",
    "external_record_id",
    "raw_record_sha256",
    "record_id",
    "name",
    "class_slug",
    "class_name",
    "external_gruid",
    "subclass",
    "description",
    "is_active",
)
_VALUE_FIELDS = tuple(f.name for f in fields(ValueSnapshot))


class NotStorable(ValueError):
    """The diff carries something JSON cannot hold faithfully (a NaN, an infinity)."""


def _check_number(number: object) -> None:
    if isinstance(number, float) and not math.isfinite(number):
        raise NotStorable(f"Número não finito no diff: {number!r}")


def _dump_value(value: ValueSnapshot | None) -> dict[str, Any] | None:
    if value is None:
        return None
    out: dict[str, Any] = {}
    for name in _VALUE_FIELDS:
        item = getattr(value, name)
        _check_number(item)
        out[name] = list(item) if name == "labels" else item
    return out


def _load_value(data: Mapping[str, Any] | None) -> ValueSnapshot | None:
    if data is None:
        return None
    kwargs = {name: data[name] for name in _VALUE_FIELDS}
    kwargs["labels"] = tuple(kwargs["labels"])
    return ValueSnapshot(**kwargs)


def _dump_record(record: RecordSnapshot | None) -> dict[str, Any] | None:
    if record is None:
        return None
    out = {name: getattr(record, name) for name in _HEADER_FIELDS}
    out["universe"] = record.universe.value
    return out


def _load_record(data: Mapping[str, Any] | None) -> RecordSnapshot | None:
    if data is None:
        return None
    kwargs = {name: data[name] for name in _HEADER_FIELDS}
    return RecordSnapshot(universe=Universe(data["universe"]), **kwargs)


def _dump_change(change: FieldChange) -> dict[str, Any]:
    return {
        "field": change.field,
        "label": change.label,
        "kind": change.kind.value,
        "before_text": change.before_text,
        "after_text": change.after_text,
        "property_slug": change.property_slug,
        "before_value": _dump_value(change.before_value),
        "after_value": _dump_value(change.after_value),
    }


def _load_change(data: Mapping[str, Any]) -> FieldChange:
    return FieldChange(
        field=data["field"],
        label=data["label"],
        kind=ChangeKind(data["kind"]),
        before_text=data["before_text"],
        after_text=data["after_text"],
        property_slug=data["property_slug"],
        before_value=_load_value(data["before_value"]),
        after_value=_load_value(data["after_value"]),
    )


def dump_diffs(diffs: Iterable[RecordDiff]) -> list[dict[str, Any]]:
    """The diffs as JSON-safe data, in the order given (the diff's own order).

    Raises:
        NotStorable: a number JSON cannot carry exactly; do not cache.
    """
    out = [
        {
            "external_table": diff.external_table,
            "external_record_id": diff.external_record_id,
            "status": diff.status.value,
            "base": _dump_record(diff.base),
            "target": _dump_record(diff.target),
            "changes": [_dump_change(change) for change in diff.changes],
        }
        for diff in diffs
    ]
    # The same check the database would make, made here so a refusal is ours.
    try:
        json.dumps(out, allow_nan=False)
    except ValueError as exc:  # pragma: no cover - _check_number catches it first
        raise NotStorable(str(exc)) from exc
    return out


def load_diffs(payload: Sequence[Mapping[str, Any]]) -> list[RecordDiff]:
    """The stored diffs back as :class:`RecordDiff`, in the stored order."""
    return [
        RecordDiff(
            external_table=item["external_table"],
            external_record_id=item["external_record_id"],
            status=RecordStatus(item["status"]),
            base=_load_record(item["base"]),
            target=_load_record(item["target"]),
            changes=tuple(_load_change(change) for change in item["changes"]),
        )
        for item in payload
    ]
