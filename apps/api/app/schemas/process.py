"""Schemas for the process universe (P0-2)."""

from __future__ import annotations

from pydantic import BaseModel


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
