"""The account's appearance: read it, replace it (D-249).

Every method is scoped to one user, and there is nothing to look up by id: the account *is* the
key. Reading when nothing was saved answers the defaults with ``saved=False`` rather than a 404,
so the screen has one shape to handle and can tell "never saved" from "saved the defaults".
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user_appearance import UserAppearance
from app.repositories.user_appearance_repository import UserAppearanceRepository
from app.schemas.appearance import AppearanceIn, AppearanceOut


class AppearanceService:
    def __init__(self, db: Session, user_id: int) -> None:
        self.repo = UserAppearanceRepository(db)
        self.user_id = user_id

    @staticmethod
    def _out(row: UserAppearance) -> AppearanceOut:
        return AppearanceOut(
            color=row.color,  # type: ignore[arg-type]
            contrast=row.contrast,  # type: ignore[arg-type]
            motion=row.motion,  # type: ignore[arg-type]
            rail=row.rail,  # type: ignore[arg-type]
            saved=True,
            updated_at=row.updated_at,
        )

    def get(self) -> AppearanceOut:
        row = self.repo.get(self.user_id)
        if row is None:
            return AppearanceOut(**AppearanceIn().model_dump(), saved=False)
        return self._out(row)

    def put(self, payload: AppearanceIn) -> AppearanceOut:
        row = self.repo.get(self.user_id)
        if row is None:
            row = UserAppearance(user_id=self.user_id)
            self.repo.add(row)
        row.color = payload.color
        row.contrast = payload.contrast
        row.motion = payload.motion
        row.rail = payload.rail
        self.repo.commit()
        self.repo.refresh(row)
        return self._out(row)
