"""Contracts for the billing endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class BillingStatusOut(BaseModel):
    """What the frontend gate reads to decide whether to show the paywall.

    ``active`` is the subscription's own truth and nothing else; whether the
    gate admits is ``has_access``, which open mode (D-83) grants without one.
    Keeping them apart is what lets a subscriber still see "manage your
    subscription" while the tool is open to a class.
    """

    active: bool
    status: str | None
    current_period_end: datetime | None
    access_mode: Literal["subscription", "open"]
    has_access: bool
    can_edit_catalog: bool


class CheckoutSessionOut(BaseModel):
    url: str


class PortalSessionOut(BaseModel):
    url: str
