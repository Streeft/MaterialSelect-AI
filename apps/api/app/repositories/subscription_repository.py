"""Data access for Subscription — sempre parametrizado, nunca SQL concatenado."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.subscription import Subscription


class SubscriptionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_user_id(self, user_id: int) -> Subscription | None:
        stmt = select(Subscription).where(Subscription.user_id == user_id)
        return self.db.execute(stmt).scalars().first()

    def get_by_stripe_customer_id(self, stripe_customer_id: str) -> Subscription | None:
        stmt = select(Subscription).where(
            Subscription.stripe_customer_id == stripe_customer_id
        )
        return self.db.execute(stmt).scalars().first()

    def create(
        self,
        *,
        user_id: int,
        stripe_customer_id: str,
        stripe_subscription_id: str | None,
        status: str,
    ) -> Subscription:
        now = datetime.now(UTC)
        subscription = Subscription(
            user_id=user_id,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            status=status,
            current_period_end=None,
            created_at=now,
            updated_at=now,
        )
        self.db.add(subscription)
        return subscription
