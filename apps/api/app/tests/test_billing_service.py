"""BillingService: cobrança orquestrada, Stripe sempre mockado.

Nenhum teste aqui importa o SDK real do Stripe — o `_FakeStripeClient`
implementa só os três caminhos (checkout.Session.create,
billing_portal.Session.create, Webhook.construct_event) que o service usa,
espelhando exatamente os mesmos nomes de atributo do módulo `stripe` de
verdade, para que trocar o fake pelo real não exija mudar nenhuma linha do
service.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.errors import AuthenticationError, ServiceUnavailableError, ValidationError
from app.repositories.subscription_repository import SubscriptionRepository
from app.services import billing_service as billing_service_module
from app.services.billing_service import BillingService


class _FakeSession:
    def __init__(self, url: str) -> None:
        self.url = url


class _FakeStripeClient:
    def __init__(self) -> None:
        self.api_key: str | None = None
        self.created_checkout_kwargs: dict | None = None
        self.created_portal_kwargs: dict | None = None
        self.webhook_event: dict | None = None
        self.webhook_error: Exception | None = None
        client = self

        class _CheckoutSession:
            @staticmethod
            def create(**kwargs):
                client.created_checkout_kwargs = kwargs
                return _FakeSession("https://checkout.stripe.com/fake")

        class _Checkout:
            Session = _CheckoutSession

        class _PortalSession:
            @staticmethod
            def create(**kwargs):
                client.created_portal_kwargs = kwargs
                return _FakeSession("https://billing.stripe.com/fake")

        class _Portal:
            Session = _PortalSession

        class _Webhook:
            @staticmethod
            def construct_event(payload, signature, secret):
                if client.webhook_error is not None:
                    raise client.webhook_error
                return client.webhook_event

        self.checkout = _Checkout()
        self.billing_portal = _Portal()
        self.Webhook = _Webhook()


@pytest.fixture(autouse=True)
def _stripe_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing_service_module.settings, "stripe_api_key", "sk_test_123")
    monkeypatch.setattr(billing_service_module.settings, "stripe_webhook_secret", "whsec_123")
    monkeypatch.setattr(billing_service_module.settings, "stripe_price_id", "price_123")


def _service(db_session, stripe_client: _FakeStripeClient | None = None) -> BillingService:
    return BillingService(db_session, stripe_module=stripe_client or _FakeStripeClient())


# --- configuration ------------------------------------------------------


def test_raises_when_stripe_is_not_configured(db_session, monkeypatch, test_user):
    monkeypatch.setattr(billing_service_module.settings, "stripe_api_key", "")
    with pytest.raises(ServiceUnavailableError):
        _service(db_session).create_checkout_session(test_user)


# --- checkout -------------------------------------------------------------


def test_create_checkout_session_returns_the_stripe_url(db_session, test_user):
    fake = _FakeStripeClient()
    url = _service(db_session, fake).create_checkout_session(test_user)

    assert url == "https://checkout.stripe.com/fake"
    assert fake.created_checkout_kwargs["client_reference_id"] == str(test_user.id)
    assert fake.created_checkout_kwargs["customer_email"] == test_user.email
    assert fake.created_checkout_kwargs["line_items"] == [{"price": "price_123", "quantity": 1}]


def test_create_checkout_session_reuses_the_existing_stripe_customer(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_existing",
        stripe_subscription_id=None,
        status="incomplete",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    _service(db_session, fake).create_checkout_session(test_user)

    assert fake.created_checkout_kwargs["customer"] == "cus_existing"
    assert fake.created_checkout_kwargs["customer_email"] is None


# --- portal -----------------------------------------------------------


def test_create_portal_session_raises_without_an_existing_subscription(db_session, test_user):
    with pytest.raises(ValidationError):
        _service(db_session).create_portal_session(test_user)


def test_create_portal_session_returns_the_stripe_url(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id=None,
        status="incomplete",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    url = _service(db_session, fake).create_portal_session(test_user)

    assert url == "https://billing.stripe.com/fake"
    assert fake.created_portal_kwargs["customer"] == "cus_123"


# --- status -------------------------------------------------------------


def test_status_reports_inactive_without_any_subscription_row(db_session, test_user):
    result = _service(db_session).status(test_user)
    assert result.active is False
    assert result.status is None


def test_status_reports_active_for_an_active_subscription(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    result = _service(db_session).status(test_user)
    assert result.active is True
    assert result.status == "active"


# --- webhook: cada transição de status tem teste próprio (spec, secao 8) --


def test_webhook_rejects_an_invalid_signature(db_session):
    fake = _FakeStripeClient()
    fake.webhook_error = ValueError("assinatura invalida")
    with pytest.raises(AuthenticationError):
        _service(db_session, fake).handle_webhook(b"{}", "sig")


def test_webhook_checkout_completed_creates_an_active_subscription(db_session, test_user):
    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": str(test_user.id),
                "customer": "cus_123",
                "subscription": "sub_123",
            }
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription is not None
    assert subscription.status == "active"
    assert subscription.stripe_customer_id == "cus_123"
    assert subscription.stripe_subscription_id == "sub_123"


def test_webhook_subscription_updated_changes_status_and_period_end(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "customer": "cus_123",
                "status": "past_due",
                "current_period_end": 1_750_000_000,
            }
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "past_due"
    assert subscription.current_period_end is not None


def test_webhook_subscription_deleted_sets_canceled(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "customer.subscription.deleted",
        "data": {
            "object": {"customer": "cus_123", "status": "canceled", "current_period_end": None}
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "canceled"


def test_webhook_payment_failed_marks_past_due(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "invoice.payment_failed",
        "data": {"object": {"customer": "cus_123", "subscription": "sub_123"}},
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "past_due"


def test_webhook_checkout_completed_without_client_reference_id_is_a_no_op(db_session, test_user):
    # Payment Links, sessions created no Dashboard e eventos do `stripe
    # trigger` chegam com `client_reference_id: null`. Antes isto virava
    # TypeError -> 500 -> reentrega da Stripe por três dias.
    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": None,
                "customer": "cus_orfao",
                "subscription": "sub_orfao",
            }
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")  # does not raise

    assert SubscriptionRepository(db_session).get_by_user_id(test_user.id) is None


def test_webhook_ignores_a_subscription_event_older_than_the_last_applied_change(
    db_session, test_user
):
    # Entrega é at-least-once e sem ordem: um `updated` com "active" pode
    # chegar depois do `deleted` que cancelou o mesmo plano. Aplicar o mais
    # novo a chegar devolveria acesso a uma assinatura cancelada.
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    now = int(datetime.now(UTC).timestamp())
    fake = _FakeStripeClient()
    service = _service(db_session, fake)

    fake.webhook_event = {
        "type": "customer.subscription.deleted",
        "created": now + 10,
        "data": {
            "object": {"customer": "cus_123", "status": "canceled", "current_period_end": None}
        },
    }
    service.handle_webhook(b"{}", "sig")

    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "created": now + 5,  # criado ANTES do cancelamento, entregue depois
        "data": {"object": {"customer": "cus_123", "status": "active", "current_period_end": None}},
    }
    service.handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "canceled"


def test_webhook_applies_a_subscription_event_newer_than_the_last_applied_change(
    db_session, test_user
):
    # A guarda de ordem não pode virar um portão que descarta evento legítimo.
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    now = int(datetime.now(UTC).timestamp())
    fake = _FakeStripeClient()
    service = _service(db_session, fake)

    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "created": now + 5,
        "data": {
            "object": {"customer": "cus_123", "status": "past_due", "current_period_end": None}
        },
    }
    service.handle_webhook(b"{}", "sig")

    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "created": now + 10,
        "data": {"object": {"customer": "cus_123", "status": "active", "current_period_end": None}},
    }
    service.handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "active"


def test_webhook_for_an_unknown_customer_is_a_no_op(db_session):
    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "customer": "cus_desconhecido",
                "status": "active",
                "current_period_end": None,
            }
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")  # does not raise
