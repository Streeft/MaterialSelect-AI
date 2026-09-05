"""The comped-access command: what it grants, and what it refuses to guess.

This is the only way into a deployed instance while `STRIPE_API_KEY` is empty
(D-36) and `require_active_subscription` gates every product router with no
exception (D-46). Its refusals matter as much as its grants: an operator who
mistypes an address must not silently give access to somebody else.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.admin.grant_subscription import COMPED_CUSTOMER_PREFIX, apply_grant
from app.models.user import User
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.user_repository import UserRepository


def _status(db: Session, user_id: int) -> str | None:
    subscription = SubscriptionRepository(db).get_by_user_id(user_id)
    return None if subscription is None else subscription.status


def test_grants_access_to_an_existing_account(db_session: Session, test_user: User) -> None:
    outcome = apply_grant(db_session, email=test_user.email)

    assert outcome.ok
    assert outcome.status == "active"
    assert _status(db_session, test_user.id) == "active"


def test_comped_customer_id_is_not_a_stripe_shape(db_session: Session, test_user: User) -> None:
    """A reconciliation against Stripe has to be able to skip these rows."""
    apply_grant(db_session, email=test_user.email)

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription is not None
    assert subscription.stripe_customer_id.startswith(COMPED_CUSTOMER_PREFIX)
    assert not subscription.stripe_customer_id.startswith("cus_")
    # Never invent a Stripe subscription id: there is no subscription there.
    assert subscription.stripe_subscription_id is None


def test_granting_twice_changes_nothing(db_session: Session, test_user: User) -> None:
    apply_grant(db_session, email=test_user.email)
    before = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert before is not None
    customer_id = before.stripe_customer_id

    second = apply_grant(db_session, email=test_user.email)

    assert second.ok
    assert "Nada a fazer" in second.message
    after = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert after is not None
    assert after.stripe_customer_id == customer_id


def test_revoke_moves_an_active_subscription_to_canceled(
    db_session: Session, test_user: User
) -> None:
    apply_grant(db_session, email=test_user.email)

    outcome = apply_grant(db_session, email=test_user.email, revoke=True)

    assert outcome.ok
    assert _status(db_session, test_user.id) == "canceled"


def test_refuses_an_address_no_account_carries(db_session: Session) -> None:
    """Never create the user: inventing a `google_sub` is what D-42 forbids."""
    outcome = apply_grant(db_session, email="ninguem@exemplo.com")

    assert not outcome.ok
    assert "precisa entrar pelo Google" in outcome.message
    assert UserRepository(db_session).list_by_email("ninguem@exemplo.com") == []


def test_refuses_an_ambiguous_address_without_touching_either_account(
    db_session: Session,
) -> None:
    """`email` is not unique — identity is `google_sub`, which can outlive an address.

    Two rows may legitimately share one address, and picking either would be a
    guess about which person the operator meant.
    """
    repo = UserRepository(db_session)
    first = repo.create(
        google_sub="sub-homonimo-a", email="mesmo@exemplo.com", name="A", avatar_url=None
    )
    second = repo.create(
        google_sub="sub-homonimo-b", email="mesmo@exemplo.com", name="B", avatar_url=None
    )
    db_session.flush()

    outcome = apply_grant(db_session, email="mesmo@exemplo.com")

    assert not outcome.ok
    assert "Ambíguo" in outcome.message
    assert str(first.id) in outcome.message and str(second.id) in outcome.message
    assert _status(db_session, first.id) is None
    assert _status(db_session, second.id) is None


def test_revoking_an_account_that_never_had_one_is_not_an_error(
    db_session: Session, test_user: User
) -> None:
    outcome = apply_grant(db_session, email=test_user.email, revoke=True)

    assert outcome.ok
    assert "nada a revogar" in outcome.message
    assert _status(db_session, test_user.id) is None


def test_samesite_none_without_secure_is_refused_at_boot() -> None:
    """The browser drops that combination silently; the app must not.

    Deploying the two halves to different domains needs `none`; pairing it with
    a non-secure cookie would produce a login that writes a cookie the browser
    then throws away, with nothing in any log to say so.
    """
    import pytest

    from app.config import Settings

    with pytest.raises(ValueError, match="SESSION_COOKIE_SECURE"):
        Settings(session_cookie_samesite="none", session_cookie_secure=False)

    # The valid pairing still constructs.
    assert Settings(session_cookie_samesite="none", session_cookie_secure=True)
