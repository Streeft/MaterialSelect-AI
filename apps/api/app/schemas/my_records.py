"""Schemas for the user's own space: favourites and recently-opened (P1-4)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.material import MaterialListItem
from app.schemas.process import ProcessOut

#: The two universes a bookmark can point into — the same word the selection
#: engine speaks (D-58), so a client never has to translate between them.
Universe = Literal["material", "process"]


class BookmarkOut(BaseModel):
    """One bookmarked record, with the record itself rather than its id.

    ``universe`` is carried explicitly instead of being left for a client to
    infer from which of the two sides is null. Inference would work and would
    be one silent assumption away from breaking the day a third universe
    arrives; naming it costs one short string.

    The two record fields mirror the table: exactly one is filled.
    """

    universe: Universe
    at: datetime = Field(description="Quando foi favoritado ou aberto")
    material: MaterialListItem | None = None
    process: ProcessOut | None = None


class MyRecordsOut(BaseModel):
    """Everything the user's own space shows, in one request.

    Favourites and recents arrive together because the page shows them
    together, and two requests would let one of the halves render against a
    catalogue the other half never saw.
    """

    favorites: list[BookmarkOut] = []
    recents: list[BookmarkOut] = []
    own_records: list[MaterialListItem] = Field(
        default=[], description="Os materiais que este usuário cadastrou para si"
    )
