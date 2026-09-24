"""Open access mode (D-83): any Google login uses the tool, only subscribers
write the shared catalogue.

Every test here runs with the real subscription gate (``client_without_subscription``)
and a user with no Subscription row — a student — and flips ``settings.access_mode``
through monkeypatch, which is what ``ACCESS_MODE`` sets in production.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.config import settings
from app.domain import access
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.subscription import Subscription

READ_ONLY = "o catálogo compartilhado é somente leitura"


@pytest.fixture()
def open_mode(monkeypatch):
    monkeypatch.setattr(settings, "access_mode", "open")


def _class_id(db_session) -> int:
    return (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )


def _shared_material_id(db_session) -> int:
    return (
        db_session.execute(select(Material).where(Material.owner_id.is_(None)).limit(1))
        .scalars()
        .one()
        .id
    )


def _subscribe(db_session, user) -> None:
    db_session.add(
        Subscription(
            user_id=user.id,
            stripe_customer_id="cus_open",
            stripe_subscription_id="sub_open",
            status="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    db_session.commit()


# --- the rule ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("mode", "subscribed", "granted", "curator"),
    [
        ("subscription", False, False, True),
        ("subscription", True, True, True),
        ("open", False, True, False),
        ("open", True, True, True),
    ],
)
def test_access_rule_table(mode, subscribed, granted, curator):
    assert access.grants_access(mode, subscribed) is granted
    assert access.can_edit_shared_catalog(mode, subscribed) is curator


def test_default_mode_is_subscription():
    # Fail closed: a deployment that never set ACCESS_MODE stays behind the gate.
    assert type(settings).model_fields["access_mode"].default == "subscription"


# --- the gate ---------------------------------------------------------------


def test_subscription_mode_still_forbids_a_student(client_without_subscription):
    assert client_without_subscription.get("/api/materials").status_code == 403


def test_open_mode_admits_a_student(client_without_subscription, open_mode):
    assert client_without_subscription.get("/api/materials").status_code == 200
    assert client_without_subscription.get("/api/dashboard/overview").status_code == 200


def test_health_reports_the_mode_publicly(anon_client, monkeypatch):
    assert anon_client.get("/api/health").json()["access_mode"] == "subscription"
    monkeypatch.setattr(settings, "access_mode", "open")
    assert anon_client.get("/api/health").json()["access_mode"] == "open"


def test_open_mode_still_requires_login(anon_client, open_mode):
    assert anon_client.get("/api/materials").status_code == 401


def test_billing_status_reports_open_mode(client_without_subscription, open_mode):
    body = client_without_subscription.get("/api/billing/status").json()
    assert body["active"] is False
    assert body["access_mode"] == "open"
    assert body["has_access"] is True
    assert body["can_edit_catalog"] is False


def test_billing_status_keeps_a_subscriber_curator_in_open_mode(
    client_without_subscription, open_mode, db_session, test_user
):
    _subscribe(db_session, test_user)
    body = client_without_subscription.get("/api/billing/status").json()
    assert body["active"] is True
    assert body["has_access"] is True
    assert body["can_edit_catalog"] is True


# --- what a student may write -----------------------------------------------


def test_student_creates_and_edits_own_record(client_without_subscription, open_mode, db_session):
    created = client_without_subscription.post(
        "/api/materials",
        json={
            "name": "Liga do estudante",
            "class_id": _class_id(db_session),
            "values": [],
            "is_own_record": True,
        },
    )
    assert created.status_code == 201
    material_id = created.json()["id"]

    patched = client_without_subscription.patch(
        f"/api/materials/{material_id}", json={"description": "minha anotação"}
    )
    assert patched.status_code == 200
    assert client_without_subscription.delete(f"/api/materials/{material_id}").status_code == 204


def test_student_cannot_add_to_shared_catalogue(client_without_subscription, open_mode, db_session):
    response = client_without_subscription.post(
        "/api/materials",
        json={"name": "Liga compartilhada", "class_id": _class_id(db_session), "values": []},
    )
    assert response.status_code == 403
    assert READ_ONLY in response.json()["detail"]


def test_student_cannot_change_a_shared_material(
    client_without_subscription, open_mode, db_session
):
    material_id = _shared_material_id(db_session)
    responses = [
        client_without_subscription.patch(f"/api/materials/{material_id}", json={"name": "X"}),
        client_without_subscription.put(f"/api/materials/{material_id}/values", json=[]),
        client_without_subscription.delete(f"/api/materials/{material_id}"),
    ]
    assert [r.status_code for r in responses] == [403, 403, 403]
    assert db_session.get(Material, material_id).is_active is True


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/classes"),
        ("put", "/api/classes/1"),
        ("delete", "/api/classes/1"),
        ("post", "/api/properties"),
        ("put", "/api/properties/1"),
        ("delete", "/api/properties/1"),
        ("post", "/api/imports/upload"),
        ("post", "/api/imports/1/preview"),
        ("post", "/api/imports/1/validate"),
        ("post", "/api/imports/1/commit"),
        ("post", "/api/imports/1/cancel"),
        ("post", "/api/imports/1/rollback"),
        ("post", "/api/knowledge/ingest"),
    ],
)
def test_student_cannot_curate_catalogue_routes(
    client_without_subscription, open_mode, method, path
):
    response = getattr(client_without_subscription, method)(path)
    assert response.status_code == 403
    assert READ_ONLY in response.json()["detail"]


def test_subscriber_keeps_curating_in_open_mode(
    client_without_subscription, open_mode, db_session, test_user
):
    _subscribe(db_session, test_user)
    response = client_without_subscription.post(
        "/api/materials",
        json={"name": "Liga curada", "class_id": _class_id(db_session), "values": []},
    )
    assert response.status_code == 201
    assert response.json()["is_own_record"] is False


def test_subscription_mode_leaves_catalogue_writes_to_the_gate(client, db_session):
    # The `client` fixture stubs the gate for a user with no Subscription row;
    # the curator check must not add a second, stricter gate on top of D-46.
    response = client.post(
        "/api/materials",
        json={"name": "Liga do assinante", "class_id": _class_id(db_session), "values": []},
    )
    assert response.status_code == 201
