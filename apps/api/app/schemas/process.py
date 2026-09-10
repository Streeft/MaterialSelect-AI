"""Schemas for the process universe (P0-2) and its attributes (P0-4)."""

from __future__ import annotations

from pydantic import BaseModel

from app.models.enums import BetterDirection, DataQuality, ProcessAttributeKind


class ProcessClassOut(BaseModel):
    """A process folder as returned by the API.

    ``process_count`` counts what is filed *directly* here, so an empty branch
    reads as empty instead of borrowing its children's contents.
    """

    id: int
    name: str
    slug: str
    parent_id: int | None = None
    description: str | None = None
    process_count: int = 0


class ProcessOut(BaseModel):
    """A process as returned by the API.

    ``material_count`` is the join's own number: how many catalogued materials
    this process applies to. It is what tells a reader whether ticking this
    process in a selection stage can admit anything at all.
    """

    id: int
    name: str
    slug: str
    class_id: int
    class_name: str
    class_slug: str
    description: str | None = None
    is_demo: bool = True
    material_count: int = 0


class ProcessAttributeOut(BaseModel):
    """One process attribute *definition* (P0-4) — what the editor needs before
    any value exists.

    ``kind`` is what decides which editor to draw and which operators apply, so
    it is the field a client must read first: a discrete attribute takes a label
    picker and set-membership operators, an envelope and a scalar take a number
    and the comparison operators.
    """

    id: int
    name: str
    slug: str
    symbol: str | None = None
    description: str | None = None
    kind: ProcessAttributeKind
    physical_dimension: str = ""
    #: NULL exactly when ``kind`` is discrete — a label has no unit.
    canonical_unit: str | None = None
    accepted_units: list[str] = []
    #: The closed vocabulary, for a discrete attribute; empty otherwise.
    allowed_labels: list[str] = []
    better_direction: BetterDirection = BetterDirection.NEUTRAL


class ProcessAttributeValueOut(BaseModel):
    """One attribute value of one process, with its provenance (P0-4).

    Structured rather than pre-rendered, exactly like a material property value:
    the interface owns how absence looks, and it must look like the fourth state
    of data quality — a written label, never ``0``, ``—`` or an empty cell (D-24).
    That is why ``is_missing`` travels next to fields that are all NULL when it is
    true, instead of a zero standing in for the answer.
    """

    attribute_id: int
    attribute_name: str
    attribute_slug: str
    kind: ProcessAttributeKind

    value_scalar: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    value_typical: float | None = None
    labels: list[str] = []

    original_unit: str | None = None
    normalized_value: float | None = None
    normalized_min: float | None = None
    normalized_max: float | None = None
    canonical_unit: str | None = None
    conversion_method: str | None = None

    uncertainty: float | None = None
    measurement_condition: str | None = None
    notes: str | None = None
    source_label: str | None = None
    data_quality: DataQuality
    is_missing: bool = False


class ProcessDetailOut(ProcessOut):
    """A process with its attributes — the process datasheet (P0-4).

    A separate response from ``ProcessOut`` and not extra fields on the list:
    the list is read to pick a process in a stage, and attaching every process's
    provenance to it would send the whole attribute table to draw a picker.
    """

    attributes: list[ProcessAttributeValueOut] = []
