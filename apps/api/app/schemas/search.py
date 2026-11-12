"""Contract of the palette's quick search (D-207)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

SearchKind = Literal["material", "process", "notebook", "study"]


class SearchHit(BaseModel):
    """What the palette shows and needs to navigate — nothing more.

    ``slug`` is set only for a process, whose page is addressed by slug.
    """

    kind: SearchKind
    id: int
    name: str
    class_name: str | None = None
    slug: str | None = None


class SearchOut(BaseModel):
    items: list[SearchHit]
