"""Stripe billing: checkout, customer portal, webhook, status.

Every route but the webhook requires login (`get_current_user`); none of them
depends on `require_active_subscription` on purpose — a user with no
subscription still needs `checkout` to be able to buy one, and `status` is
exactly what the frontend gate polls to decide whether to redirect to the
paywall in the first place (see app.main for where every OTHER router gets
the subscription gate, applied in bulk at include_router).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.billing import BillingStatusOut, CheckoutSessionOut, PortalSessionOut
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/checkout", response_model=CheckoutSessionOut)
def create_checkout(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CheckoutSessionOut:
    url = BillingService(db).create_checkout_session(user)
    return CheckoutSessionOut(url=url)


@router.post("/portal", response_model=PortalSessionOut)
def create_portal(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PortalSessionOut:
    url = BillingService(db).create_portal_session(user)
    return PortalSessionOut(url=url)


@router.get("/status", response_model=BillingStatusOut)
def billing_status(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> BillingStatusOut:
    return BillingService(db).status(user)


@router.post("/webhook", status_code=204)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> None:
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    BillingService(db).handle_webhook(payload, signature)
