"""Schemas for the material taxonomy (classes)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MaterialClassIn(BaseModel):
    """Payload to create or update a material class.

    ``slug`` is optional on input; when omitted it is derived from ``name``.
    ``parent_id`` enables the hierarchical taxonomy.
    """

    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    parent_id: int | None = None
    description: str | None = Field(default=None, max_length=500)


class MaterialClassOut(BaseModel):
    """A material class as returned by the API."""

    id: int
    name: str
    slug: str
    parent_id: int | None = None
    description: str | None = None
    material_count: int = 0
