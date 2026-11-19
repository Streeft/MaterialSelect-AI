"""UserAppearance: how one person wants the app to look, kept on the account (D-249).

The app's colour, the contrast level, motion and the side rail used to live in each device's
``localStorage`` (D-196, D-236b), so the choice made on the laptop was not there on the phone.
It belongs to the **user**, like the saved views (D-209): it follows them between devices.

One row per user, written whole (``PUT`` replaces the four fields); no row means "never saved
here", which is not the same as "chose the defaults" and is what lets a device that already has a
local choice offer it to the account the first time. The values are the closed sets the screen
offers (``app.schemas.appearance``), validated on the way in: a made-up colour is a 422, not a
string the next page load has to tolerate. Nothing here is a number about a material.

The theme (light/dark) and the table density are *not* here: they are about the device (its screen
and its light), and the system's own preference already seeds the theme.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class UserAppearance(Base):
    __tablename__ = "user_appearance"

    #: The account's own id is the key: one row per user, nothing to look up by.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )
    #: ``route`` or one of the app colours (``AppColor``).
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="route")
    #: ``standard`` | ``medium`` | ``high``.
    contrast: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    #: ``standard`` | ``reduced``.
    motion: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    #: ``dark`` | ``light``.
    rail: Mapped[str] = mapped_column(String(16), nullable=False, default="dark")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
