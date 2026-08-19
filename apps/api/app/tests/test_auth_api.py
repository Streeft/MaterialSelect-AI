"""Integration tests for the auth endpoints.

``client`` is pre-authenticated (see conftest.py), so the "logged in" cases use
it directly. The "logged out" cases need ``anon_client``, which swaps only
``get_db`` and leaves the real cookie-based ``get_current_user`` running.
"""

from __future__ import annotations

import pytest

from app.services import auth_service as auth_service_module


def test_me_requires_login(anon_client):
    resp = anon_client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_returns_the_logged_in_user(client, test_user):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == test_user.email
    assert body["name"] == test_user.name
    assert body["project_id"] is not None


def test_logout_clears_the_session_cookie(client):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 204
    assert "msai_session" in resp.headers.get("set-cookie", "")


def test_logout_without_a_session_is_a_no_op(anon_client):
    resp = anon_client.post("/api/auth/logout")
    assert resp.status_code == 204


def test_google_login_is_503_when_oauth_is_not_configured(anon_client, monkeypatch):
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "")
    resp = anon_client.get("/api/auth/google/login", follow_redirects=False)
    assert resp.status_code == 503


def test_google_login_redirects_to_google_when_configured(anon_client, monkeypatch):
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(auth_service_module.settings, "google_client_secret", "test-secret")
    resp = anon_client.get("/api/auth/google/login", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("https://accounts.google.com/")
    assert "msai_oauth_state" in resp.headers.get("set-cookie", "")


def test_google_callback_rejects_a_denied_consent(anon_client):
    resp = anon_client.get(
        "/api/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    assert resp.status_code == 401


def test_google_callback_rejects_a_missing_code(anon_client):
    resp = anon_client.get("/api/auth/google/callback", follow_redirects=False)
    assert resp.status_code == 401


@pytest.fixture()
def _google_oauth_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(auth_service_module.settings, "google_client_secret", "test-secret")
    # TestClient talks to "testserver" over plain HTTP; a Secure cookie would be
    # set but never sent back on the next request, exactly like a real browser
    # on http://localhost without SESSION_COOKIE_SECURE=false.
    monkeypatch.setattr(auth_service_module.settings, "session_cookie_secure", False)


def test_google_callback_rejects_state_not_matching_the_cookie(
    anon_client, _google_oauth_configured
):
    anon_client.cookies.set("msai_oauth_state", "cookie-state")
    resp = anon_client.get(
        "/api/auth/google/callback",
        params={"code": "abc", "state": "different-state"},
        follow_redirects=False,
    )
    assert resp.status_code == 401


def test_google_callback_completes_login_and_sets_a_session_cookie(
    anon_client, _google_oauth_configured, monkeypatch
):
    monkeypatch.setattr(
        auth_service_module,
        "_default_verify_id_token",
        lambda jwt, client_id: {
            "sub": "google-sub-e2e",
            "email": "novo@example.com",
            "email_verified": True,
            "name": "Novo Usuário",
        },
    )
    monkeypatch.setattr(
        auth_service_module.AuthService, "_exchange_code", lambda self, code: "fake-jwt"
    )

    anon_client.cookies.set("msai_oauth_state", "matching-state")
    resp = anon_client.get(
        "/api/auth/google/callback",
        params={"code": "abc", "state": "matching-state"},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "msai_session" in resp.headers.get("set-cookie", "")

    me = anon_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "novo@example.com"
