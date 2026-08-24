"""Orchestration of Stripe billing.

The Stripe SDK is isolated behind `stripe_module` the same way AuthService
isolates Google's verifier behind `verify_id_token` — production leaves it
unset and gets the real `stripe` package (imported lazily, only once
`stripe_enabled` is true); tests always inject a fake with the same
attribute paths, so the SDK's own network calls never run in CI.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.config import Settings, settings
from app.domain.errors import AuthenticationError, ServiceUnavailableError, ValidationError
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories.subscription_repository import SubscriptionRepository
from app.schemas.billing import BillingStatusOut

logger = logging.getLogger(__name__)

# Transitions covered, one per Stripe event this service listens for:
#   checkout.session.completed    -> creates/activates the subscription
#   customer.subscription.updated -> mirrors whatever status Stripe reports
#   customer.subscription.deleted -> same handler; the payload's own status
#                                     ("canceled") already carries the meaning
#   invoice.payment_failed        -> forced to past_due, defensively, even if
#                                     the paired subscription.updated event
#                                     for the same failure has not landed yet


class BillingService:
    def __init__(
        self,
        db: Session,
        *,
        stripe_module: Any | None = None,
        # Default is the module-level `settings` singleton imported above (its
        # own name, not a re-exported one): tests monkeypatch attributes on
        # `billing_service.settings` directly, and this default has to be the
        # very same object for that to take effect.
        settings: Settings = settings,
    ) -> None:
        self.db = db
        self.settings = settings
        self.subscriptions = SubscriptionRepository(db)
        self._stripe_module = stripe_module

    def _client(self) -> Any:
        if not self.settings.stripe_enabled:
            raise ServiceUnavailableError(
                "Cobrança via Stripe não está configurada neste servidor "
                "(STRIPE_API_KEY/STRIPE_WEBHOOK_SECRET/STRIPE_PRICE_ID ausentes)."
            )
        stripe_module = self._stripe_module
        if stripe_module is None:
            import stripe as stripe_module  # imported lazily: only when enabled
        stripe_module.api_key = self.settings.stripe_api_key
        return stripe_module

    # --- checkout / portal -------------------------------------------------

    def create_checkout_session(self, user: User) -> str:
        stripe_module = self._client()
        subscription = self.subscriptions.get_by_user_id(user.id)
        customer_id = subscription.stripe_customer_id if subscription else None
        session = stripe_module.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            customer_email=None if customer_id else user.email,
            line_items=[{"price": self.settings.stripe_price_id, "quantity": 1}],
            success_url=f"{self.settings.frontend_url}/assinatura?status=sucesso",
            cancel_url=f"{self.settings.frontend_url}/assinatura?status=cancelado",
            client_reference_id=str(user.id),
        )
        return session.url

    def create_portal_session(self, user: User) -> str:
        stripe_module = self._client()
        subscription = self.subscriptions.get_by_user_id(user.id)
        if subscription is None or not subscription.stripe_customer_id:
            raise ValidationError("Nenhuma assinatura encontrada para gerenciar.")
        session = stripe_module.billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=f"{self.settings.frontend_url}/assinatura",
        )
        return session.url

    # --- status -------------------------------------------------------------

    def status(self, user: User) -> BillingStatusOut:
        subscription = self.subscriptions.get_by_user_id(user.id)
        return BillingStatusOut(
            active=subscription is not None and subscription.status == "active",
            status=subscription.status if subscription else None,
            current_period_end=subscription.current_period_end if subscription else None,
        )

    # --- webhook -------------------------------------------------------------

    def handle_webhook(self, payload: bytes, signature: str) -> None:
        stripe_module = self._client()
        try:
            event = stripe_module.Webhook.construct_event(
                payload, signature, self.settings.stripe_webhook_secret
            )
        except Exception as exc:
            # Broad on purpose: different major versions of the Stripe SDK use
            # different exception hierarchies for a bad signature. What matters
            # here is that verification failed, not which subclass says so.
            raise AuthenticationError("Assinatura do webhook inválida.") from exc

        event_type = event["type"]
        data = event["data"]["object"]
        # The only ordering the payload itself carries. Stripe delivers
        # at-least-once and out of order, so "the event that arrived last" is
        # not "the change that happened last" — see `_is_stale`.
        occurred_at = _event_time(event.get("created"))

        if event_type == "checkout.session.completed":
            self._on_checkout_completed(data, occurred_at)
        elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
            self._on_subscription_updated(data, occurred_at)
        elif event_type == "invoice.payment_failed":
            self._on_payment_failed(data, occurred_at)
        self.db.commit()

    def _is_stale(self, subscription: Subscription, occurred_at: datetime | None) -> bool:
        """True when this event predates the change already applied to the row.

        `updated_at` holds the Stripe clock of the last applied webhook (see
        `_stamp`), never the local clock, so both sides of this comparison come
        from the same ordering. Without it, a `customer.subscription.updated`
        carrying "active" that Stripe re-delivers *after* the
        `customer.subscription.deleted` for the same plan would put `status`
        back to "active" — restoring access to a cancelled subscription, on
        the very column the gate reads.

        An event with no usable `created` is applied, not dropped: dropping it
        would be inventing an ordering nobody stated.
        """
        if occurred_at is None:
            return False
        last_applied = subscription.updated_at
        if last_applied is None:
            return False
        if last_applied.tzinfo is None:
            # SQLite hands back naive datetimes even for DateTime(timezone=True);
            # everything this service writes is UTC.
            last_applied = last_applied.replace(tzinfo=UTC)
        return occurred_at < last_applied

    @staticmethod
    def _stamp(subscription: Subscription, occurred_at: datetime | None) -> None:
        """Record *when the applied change happened*, in Stripe's clock.

        Using the local arrival time here instead would make `_is_stale`
        compare two different clocks and drop legitimate events that Stripe
        emitted a fraction of a second after the previous one.
        """
        subscription.updated_at = occurred_at or datetime.now(UTC)

    def _on_checkout_completed(self, data: dict, occurred_at: datetime | None = None) -> None:
        user_id = _user_id_from(data.get("client_reference_id"))
        if user_id is None:
            # Not a session this app started: a Payment Link, a session created
            # in the Stripe Dashboard, or a `stripe trigger` test event all
            # carry `client_reference_id: null`. Same posture as an unknown
            # customer below — nothing here to reconcile, and raising would
            # only make Stripe retry a payload that will never improve.
            logger.warning(
                "checkout.session.completed sem client_reference_id utilizável; evento ignorado."
            )
            return
        subscription = self.subscriptions.get_by_user_id(user_id)
        if subscription is None:
            subscription = self.subscriptions.create(
                user_id=user_id,
                stripe_customer_id=data["customer"],
                stripe_subscription_id=data.get("subscription"),
                status="active",
            )
            self._stamp(subscription, occurred_at)
            return
        subscription.stripe_customer_id = data["customer"]
        subscription.stripe_subscription_id = data.get("subscription")
        subscription.status = "active"
        self._stamp(subscription, occurred_at)

    def _on_subscription_updated(self, data: dict, occurred_at: datetime | None = None) -> None:
        subscription = self.subscriptions.get_by_stripe_customer_id(data["customer"])
        if subscription is None:
            return  # unknown customer; nothing in this database to reconcile
        if self._is_stale(subscription, occurred_at):
            return  # a re-delivery of an older state; the row is already ahead
        subscription.status = data["status"]
        period_end = data.get("current_period_end")
        subscription.current_period_end = (
            datetime.fromtimestamp(period_end, tz=UTC) if period_end else None
        )
        self._stamp(subscription, occurred_at)

    def _on_payment_failed(self, data: dict, occurred_at: datetime | None = None) -> None:
        # No staleness guard on purpose: this handler can only move the row to
        # `past_due`, which never restores access, so an out-of-order delivery
        # here is defensive rather than dangerous.
        subscription = self.subscriptions.get_by_stripe_customer_id(data["customer"])
        if subscription is None:
            return
        subscription.status = "past_due"
        self._stamp(subscription, occurred_at)


def _event_time(created: Any) -> datetime | None:
    """Stripe's `event.created` (Unix seconds) as an aware datetime, or None."""
    if isinstance(created, bool) or not isinstance(created, (int, float)):
        return None
    try:
        return datetime.fromtimestamp(created, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _user_id_from(client_reference_id: Any) -> int | None:
    """`client_reference_id` as an int, or None when absent or not a number."""
    if isinstance(client_reference_id, bool) or client_reference_id is None:
        return None
    try:
        return int(client_reference_id)
    except (TypeError, ValueError):
        return None
