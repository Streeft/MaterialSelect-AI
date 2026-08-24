"""Contracts for the billing endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BillingStatusOut(BaseModel):
    """What the frontend gate reads to decide whether to show the paywall."""

    active: bool
    status: str | None
    current_period_end: datetime | None


class CheckoutSessionOut(BaseModel):
    url: str


class PortalSessionOut(BaseModel):
    url: str
