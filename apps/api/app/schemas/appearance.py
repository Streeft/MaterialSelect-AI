"""Contracts for the account's appearance (D-249): four closed sets, nothing free-form."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

#: The values ``apps/web/lib/appearance.ts`` offers; a value outside them is a 422.
AppColor = Literal["route", "azul", "verde-azulado", "verde", "violeta", "rosa", "terracota"]
ContrastLevel = Literal["standard", "medium", "high"]
MotionPreference = Literal["standard", "reduced"]
RailPreference = Literal["dark", "light"]


class AppearanceIn(BaseModel):
    """The whole choice, sent together: a partial write would leave a mix nobody picked."""

    model_config = ConfigDict(extra="forbid")

    color: AppColor = "route"
    contrast: ContrastLevel = "standard"
    motion: MotionPreference = "standard"
    rail: RailPreference = "dark"


class AppearanceOut(AppearanceIn):
    #: ``False`` when the account has never saved one: the four fields are then the defaults, and a
    #: device that has a local choice may offer it. ``True`` once a ``PUT`` has stored it.
    saved: bool
    updated_at: datetime | None = None
