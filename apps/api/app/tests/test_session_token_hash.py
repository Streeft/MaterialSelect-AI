"""D-223: the session token is kept in the database only as its SHA-256.

The cookie carries the token; the ``user_session`` row carries its digest. A
read of the table (a backup, a log of a query, a leaked dump) no longer hands
out live logins. Rows written before this change hold the raw token: they keep
working and are rewritten to the digest on their first use, so nobody who is
logged in is logged out by the deploy.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.db.seed import seed_e2e_session
from app.domain.session_token import hash_session_token
from app.models.project import Project
from app.models.user import User, UserSession
from app.repositories.session_repository import SessionRepository
from app.services import auth_service as auth_service_module
from app.services.auth_service import AuthService

CLAIMS = {
    "sub": "google-sub-hash",
    "email": "hash@example.com",
    "email_verified": True,
    "name": "Pessoa do hash",
}


@pytest.fixture(autouse=True)
def _google_oauth_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(auth_service_module.settings, "google_client_secret", "test-secret")
    monkeypatch.setattr(auth_service_module.settings, "google_allowed_domain", "")


def _login(db_session):
    service = AuthService(db_session, verify_id_token=lambda jwt, client_id: dict(CLAIMS))
    service._exchange_code = lambda code: "fake-jwt"
    return service.handle_callback(code="abc", state="s", cookie_state="s")


def _legacy_row(db_session, token: str, *, expires_in: timedelta = timedelta(hours=1)):
    user = User(google_sub="google-sub-legado", email="legado@example.com", name="Legado")
    db_session.add(user)
    db_session.flush()
    db_session.add(Project(name="Meu projeto", owner_id=user.id))
    row = UserSession(id=token, user_id=user.id, expires_at=datetime.now(UTC) + expires_in)
    db_session.add(row)
    db_session.commit()
    return user


def test_hash_is_the_hex_sha256_of_the_token():
    assert hash_session_token("abc") == hashlib.sha256(b"abc").hexdigest()
    assert len(hash_session_token("x" * 64)) == 64


def test_the_row_stores_the_digest_never_the_token(db_session):
    issued = _login(db_session)

    assert len(issued.token) >= 43
    assert issued.session.id == hash_session_token(issued.token)
    assert db_session.get(UserSession, issued.token) is None
    assert db_session.get(UserSession, hash_session_token(issued.token)) is not None


def test_the_cookie_token_resolves_to_the_user(db_session):
    issued = _login(db_session)

    session = AuthService(db_session).current_session(issued.token)

    assert session is not None
    assert session.user.email == CLAIMS["email"]


def test_the_digest_itself_does_not_log_anyone_in(db_session):
    """Whoever reads the table holds digests; a digest is not a cookie."""
    issued = _login(db_session)

    assert AuthService(db_session).current_session(issued.session.id) is None


def test_a_legacy_row_still_logs_in_and_is_rewritten_on_first_use(db_session):
    token = "token-legado-de-antes-do-hash-0123456789abcdefghijklmnopqrstu"
    user = _legacy_row(db_session, token)

    session = AuthService(db_session).current_session(token)

    assert session is not None
    assert session.user_id == user.id
    assert db_session.get(UserSession, token) is None
    converted = db_session.get(UserSession, hash_session_token(token))
    assert converted is not None
    assert converted.user_id == user.id
    # A second request finds the digest directly.
    assert AuthService(db_session).current_session(token) is not None


def test_a_legacy_row_keeps_its_expiry_when_rewritten(db_session):
    token = "token-legado-expiracao-0123456789abcdefghijklmnopqrstuvwxyz"
    _legacy_row(db_session, token, expires_in=timedelta(minutes=5))
    before = db_session.get(UserSession, token).expires_at

    AuthService(db_session).current_session(token)

    after = db_session.get(UserSession, hash_session_token(token)).expires_at
    assert after == before


def test_an_expired_legacy_row_is_not_rewritten(db_session):
    token = "token-legado-vencido-0123456789abcdefghijklmnopqrstuvwxyz0"
    _legacy_row(db_session, token, expires_in=timedelta(seconds=-1))

    assert AuthService(db_session).current_session(token) is None
    assert db_session.get(UserSession, hash_session_token(token)) is None


def test_logout_removes_the_hashed_row(db_session):
    issued = _login(db_session)

    AuthService(db_session).logout(issued.token)

    assert db_session.get(UserSession, issued.session.id) is None


def test_logout_removes_a_legacy_row_too(db_session):
    token = "token-legado-logout-0123456789abcdefghijklmnopqrstuvwxyz01"
    _legacy_row(db_session, token)

    AuthService(db_session).logout(token)

    assert db_session.get(UserSession, token) is None
    assert SessionRepository(db_session).get_valid(token) is None


def test_the_api_accepts_a_legacy_cookie_and_rewrites_it(anon_client, db_session):
    token = "token-legado-api-0123456789abcdefghijklmnopqrstuvwxyz012345"
    _legacy_row(db_session, token)

    anon_client.cookies.set("msai_session", token)
    resp = anon_client.get("/api/auth/me")

    assert resp.status_code == 200
    assert resp.json()["email"] == "legado@example.com"
    db_session.expire_all()
    assert db_session.get(UserSession, token) is None
    assert db_session.get(UserSession, hash_session_token(token)) is not None


def test_the_callback_sets_the_token_in_the_cookie_and_the_digest_in_the_row(
    anon_client, db_session, monkeypatch
):
    monkeypatch.setattr(
        auth_service_module, "_default_verify_id_token", lambda jwt, client_id: dict(CLAIMS)
    )
    monkeypatch.setattr(
        auth_service_module.AuthService, "_exchange_code", lambda self, code: "fake-jwt"
    )
    anon_client.cookies.set("msai_oauth_state", "st")
    resp = anon_client.get(
        "/api/auth/google/callback",
        params={"code": "abc", "state": "st"},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    token = anon_client.cookies.get("msai_session")
    assert token
    assert db_session.get(UserSession, token) is None
    assert db_session.get(UserSession, hash_session_token(token)) is not None


def test_the_e2e_seed_stores_the_digest_of_its_fixed_token(db_session, monkeypatch):
    token = "e2e-fixed-session-token-nao-use-em-producao"
    monkeypatch.setenv("E2E_SESSION_TOKEN", token)
    monkeypatch.setattr(settings, "environment", "development")

    seed_e2e_session(db_session)

    assert db_session.get(UserSession, token) is None
    row = db_session.get(UserSession, hash_session_token(token))
    assert row is not None
    assert AuthService(db_session).current_session(token) is not None
