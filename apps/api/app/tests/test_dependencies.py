"""require_active_subscription: a extensão de get_current_user que checa cobrança."""

from __future__ import annotations

import pytest

from app.dependencies import require_active_subscription
from app.domain.errors import SubscriptionRequiredError
from app.repositories.subscription_repository import SubscriptionRepository


def test_raises_without_any_subscription_row(db_session, test_user):
    with pytest.raises(SubscriptionRequiredError):
        require_active_subscription(user=test_user, db=db_session)


def test_raises_when_subscription_is_not_active(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="past_due",
    )
    db_session.commit()
    with pytest.raises(SubscriptionRequiredError):
        require_active_subscription(user=test_user, db=db_session)


def test_passes_silently_when_subscription_is_active(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()
    assert require_active_subscription(user=test_user, db=db_session) is None
