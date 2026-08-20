"""API tests for /billing/* and for the subscription gate applied to the
rest of the API (a representative route, /materials, stands in for "every
router registered with require_active_subscription" — the gate itself is
tested once in test_dependencies.py; this file proves the wiring in main.py
actually applies it).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.subscription import Subscription


def test_billing_status_reports_inactive_with_no_subscription(client):
    response = client.get("/api/billing/status")
    assert response.status_code == 200
    assert response.json() == {"active": False, "status": None, "current_period_end": None}


def test_billing_status_does_not_require_an_active_subscription(client_without_subscription):
    # This is the route the frontend polls to learn there is no subscription
    # yet — it must stay reachable precisely when the user has none.
    response = client_without_subscription.get("/api/billing/status")
    assert response.status_code == 200


def test_checkout_requires_login(anon_client):
    response = anon_client.post("/api/billing/checkout")
    assert response.status_code == 401


def test_checkout_without_stripe_configured_returns_503(client):
    # Default test settings never set STRIPE_API_KEY/WEBHOOK_SECRET/PRICE_ID.
    response = client.post("/api/billing/checkout")
    assert response.status_code == 503


def test_portal_without_stripe_configured_returns_503(client):
    response = client.post("/api/billing/portal")
    assert response.status_code == 503


def test_protected_route_without_active_subscription_is_forbidden(client_without_subscription):
    response = client_without_subscription.get("/api/materials")
    assert response.status_code == 403


def test_protected_route_with_active_subscription_succeeds(
    client_without_subscription, db_session, test_user
):
    db_session.add(
        Subscription(
            user_id=test_user.id,
            stripe_customer_id="cus_x",
            stripe_subscription_id="sub_x",
            status="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    response = client_without_subscription.get("/api/materials")
    assert response.status_code == 200


def test_health_route_stays_public(anon_client):
    response = anon_client.get("/api/health")
    assert response.status_code == 200
