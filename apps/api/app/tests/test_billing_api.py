"""API tests for /billing/* and for the subscription gate applied to the
rest of the API (a representative route, /materials, stands in for "every
router registered with require_active_subscription" — the gate itself is
tested once in test_dependencies.py; this file proves the wiring in main.py
actually applies it).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models.subscription import Subscription
from app.routers import billing as billing_router
from app.services import billing_service as billing_service_module
from app.services.billing_service import BillingService

# The fake Stripe module is defined once, in the service test, so the attribute
# paths the route exercises can never drift from the ones the service does.
from app.tests.test_billing_service import _FakeStripeClient


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


@pytest.mark.skip(
    reason="Portão global de assinatura não está ligado. Esta branch traz duas "
    "arquiteturas de cobrança: a desta implementação, em que toda rota exige "
    "assinatura ativa, e o plano Free/Pro de "
    "docs/superpowers/plans/2026-08-21-assinatura-e-limites.md, em que o plano "
    "gratuito é funcional e só recursos específicos têm teto. Ligar o portão "
    "global aqui derrubaria todo usuário sem assinatura — inclusive as "
    "fixtures de toda a suíte — e decidiria a reconciliação por omissão. O "
    "teste fica como registro da intenção original até essa decisão ser "
    "tomada explicitamente."
)
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


# --- webhook: a única rota que a Stripe chama -----------------------------
# Ela é pública de propósito (a Stripe não tem cookie de sessão), então o que
# a protege é só a verificação da assinatura HMAC — e isso é propriedade da
# rota, não do serviço, por isso os dois casos são exercitados aqui via HTTP.


@pytest.fixture()
def fake_stripe(monkeypatch: pytest.MonkeyPatch) -> _FakeStripeClient:
    """Configure Stripe and hand the route a fake SDK.

    The route builds its own `BillingService`, so the injection point is the
    name it looks up — same technique as overriding a FastAPI dependency, one
    level down.
    """
    fake = _FakeStripeClient()
    monkeypatch.setattr(billing_service_module.settings, "stripe_api_key", "sk_test_123")
    monkeypatch.setattr(billing_service_module.settings, "stripe_webhook_secret", "whsec_123")
    monkeypatch.setattr(billing_service_module.settings, "stripe_price_id", "price_123")
    monkeypatch.setattr(
        billing_router,
        "BillingService",
        lambda db: BillingService(db, stripe_module=fake),
    )
    return fake


def test_webhook_with_a_bad_signature_is_rejected_without_any_session(anon_client, fake_stripe):
    fake_stripe.webhook_error = ValueError("assinatura inválida")

    response = anon_client.post(
        "/api/billing/webhook",
        content=b'{"type": "checkout.session.completed"}',
        headers={"stripe-signature": "t=1,v1=falsa"},
    )

    # 401, not 403: no cookie was sent, so the route is reachable without a
    # session — it just refused an event it could not verify.
    assert response.status_code == 401


def test_webhook_with_a_verified_event_answers_204_without_a_body(
    anon_client, fake_stripe, db_session, test_user
):
    fake_stripe.webhook_event = {
        "type": "checkout.session.completed",
        "created": int(datetime.now(UTC).timestamp()),
        "data": {
            "object": {
                "client_reference_id": str(test_user.id),
                "customer": "cus_webhook",
                "subscription": "sub_webhook",
            }
        },
    }

    response = anon_client.post(
        "/api/billing/webhook",
        content=b"{}",
        headers={"stripe-signature": "t=1,v1=aceita-pelo-fake"},
    )

    assert response.status_code == 204
    assert response.content == b""
