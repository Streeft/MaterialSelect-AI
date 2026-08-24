"""SubscriptionRepository: acesso a dado puro, sem service por cima."""

from __future__ import annotations

from app.repositories.subscription_repository import SubscriptionRepository


def test_get_by_user_id_returns_none_when_absent(db_session, test_user):
    assert SubscriptionRepository(db_session).get_by_user_id(test_user.id) is None


def test_create_and_get_by_user_id_round_trips(db_session, test_user):
    repo = SubscriptionRepository(db_session)
    repo.create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="incomplete",
    )
    db_session.commit()

    subscription = repo.get_by_user_id(test_user.id)
    assert subscription is not None
    assert subscription.stripe_customer_id == "cus_123"
    assert subscription.status == "incomplete"


def test_get_by_stripe_customer_id_finds_the_matching_row(db_session, test_user):
    repo = SubscriptionRepository(db_session)
    repo.create(
        user_id=test_user.id,
        stripe_customer_id="cus_456",
        stripe_subscription_id=None,
        status="active",
    )
    db_session.commit()

    subscription = repo.get_by_stripe_customer_id("cus_456")
    assert subscription is not None
    assert subscription.user_id == test_user.id


def test_get_by_stripe_customer_id_returns_none_for_unknown_customer(db_session):
    assert SubscriptionRepository(db_session).get_by_stripe_customer_id("cus_nao_existe") is None
