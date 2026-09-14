"""The user's own space: favourites, recents and their own records (P1-4).

Every route here is implicitly scoped to whoever is logged in — there is no id
of a *user* anywhere in these paths, because a request to read somebody else's
space is not a request this API knows how to express.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.my_records import MyRecordsOut, Universe
from app.services.bookmark_service import BookmarkService

router = APIRouter(prefix="/my-records", tags=["my-records"])


@router.get("", response_model=MyRecordsOut)
def my_records(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyRecordsOut:
    """Favourites, recents and own records in one payload.

    One request and not three: the page shows them together, and separate
    requests would let one list render against a catalogue the others never
    saw.
    """
    return BookmarkService(db, user).my_records()


@router.put("/favorites/{universe}/{record_id}", response_model=MyRecordsOut)
def add_favorite(
    universe: Universe,
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyRecordsOut:
    """Star a record. PUT, not POST: starring is idempotent, and a second click
    on a lit star means what the first one meant."""
    return BookmarkService(db, user).add_favorite(universe, record_id)


@router.delete("/favorites/{universe}/{record_id}", response_model=MyRecordsOut)
def remove_favorite(
    universe: Universe,
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyRecordsOut:
    """Un-star a record."""
    return BookmarkService(db, user).remove_favorite(universe, record_id)


@router.post("/recents/{universe}/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def touch_recent(
    universe: Universe,
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Note that the user just opened a record.

    Declared by the client when it opens a datasheet, rather than recorded
    inside that datasheet's GET: a read that writes is un-cacheable and
    non-idempotent, and an export or a report re-reading a record would quietly
    reorder the list.
    """
    BookmarkService(db, user).touch_recent(universe, record_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
