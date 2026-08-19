"""Unit tests for AuthService: the Google handshake, minus Google and minus HTTP.

``verify_id_token`` is injected (no real network, no real signature check) and
``_exchange_code`` is monkeypatched per test — the id-token exchange itself is
a thin two-line HTTP call, and what actually matters here is what AuthService
does with the claims it gets back.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.domain.errors import AuthenticationError, ServiceUnavailableError
from app.models.project import Project
from app.models.user import User
from app.repositories.project_repository import ProjectRepository
from app.services import auth_service as auth_service_module
from app.services.auth_service import AuthService

GOOGLE_CLAIMS = {
    "sub": "google-sub-123",
    "email": "pesquisador@example.com",
    "email_verified": True,
    "name": "Pesquisador de Teste",
    "picture": "https://example.com/avatar.png",
}


@pytest.fixture(autouse=True)
def _google_oauth_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(auth_service_module.settings, "google_client_secret", "test-secret")
    monkeypatch.setattr(auth_service_module.settings, "google_allowed_domain", "")


def _service(db_session, *, claims: dict = GOOGLE_CLAIMS) -> AuthService:
    service = AuthService(db_session, verify_id_token=lambda jwt, client_id: dict(claims))
    service._exchange_code = lambda code: "fake-id-token-jwt"
    return service


# --- build_authorize_url ----------------------------------------------------


def test_build_authorize_url_raises_when_not_configured(db_session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    with pytest.raises(ServiceUnavailableError):
        AuthService(db_session).build_authorize_url()


def test_build_authorize_url_returns_a_google_url_with_matching_state(db_session):
    url, state = AuthService(db_session).build_authorize_url()
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert f"state={state}" in url
    assert "client_id=test-client-id" in url


# --- handle_callback --------------------------------------------------------


def test_handle_callback_rejects_state_mismatch(db_session):
    service = _service(db_session)
    with pytest.raises(AuthenticationError):
        service.handle_callback(code="abc", state="a", cookie_state="b")


def test_handle_callback_rejects_missing_cookie_state(db_session):
    service = _service(db_session)
    with pytest.raises(AuthenticationError):
        service.handle_callback(code="abc", state="a", cookie_state=None)


def test_handle_callback_creates_user_and_default_project(db_session):
    service = _service(db_session)
    session = service.handle_callback(code="abc", state="s", cookie_state="s")

    user = db_session.get(User, session.user_id)
    assert user.google_sub == GOOGLE_CLAIMS["sub"]
    assert user.email == GOOGLE_CLAIMS["email"]
    assert user.avatar_url == GOOGLE_CLAIMS["picture"]

    project = ProjectRepository(db_session).get_default_for_user(user.id)
    assert project is not None
    assert project.name == "Meu projeto"


def test_handle_callback_reuses_the_existing_user_and_project_on_second_login(db_session):
    service = _service(db_session)
    first = service.handle_callback(code="abc", state="s", cookie_state="s")
    second = service.handle_callback(code="abc", state="s", cookie_state="s")

    assert first.user_id == second.user_id
    project_count = db_session.query(Project).filter(Project.owner_id == first.user_id).count()
    assert project_count == 1


def test_handle_callback_rejects_unverified_email(db_session):
    claims = {**GOOGLE_CLAIMS, "email_verified": False}
    service = _service(db_session, claims=claims)
    with pytest.raises(AuthenticationError):
        service.handle_callback(code="abc", state="s", cookie_state="s")


def test_handle_callback_rejects_email_outside_allowed_domain(db_session, monkeypatch):
    monkeypatch.setattr(auth_service_module.settings, "google_allowed_domain", "empresa.com")
    service = _service(db_session)
    with pytest.raises(AuthenticationError):
        service.handle_callback(code="abc", state="s", cookie_state="s")


def test_handle_callback_accepts_email_inside_allowed_domain(db_session, monkeypatch):
    monkeypatch.setattr(auth_service_module.settings, "google_allowed_domain", "example.com")
    service = _service(db_session)
    session = service.handle_callback(code="abc", state="s", cookie_state="s")
    assert session.user_id is not None


def test_handle_callback_raises_when_not_configured(db_session, monkeypatch):
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "")
    service = _service(db_session)
    with pytest.raises(ServiceUnavailableError):
        service.handle_callback(code="abc", state="s", cookie_state="s")


# --- logout ------------------------------------------------------------------


def test_logout_deletes_the_session(db_session):
    service = _service(db_session)
    session = service.handle_callback(code="abc", state="s", cookie_state="s")

    service.logout(session.id)

    from app.models.user import UserSession

    assert db_session.get(UserSession, session.id) is None


def test_logout_is_idempotent_for_an_unknown_token(db_session):
    AuthService(db_session).logout("does-not-exist")  # must not raise


# --- session expiry ----------------------------------------------------------


def test_session_repository_rejects_an_expired_session(db_session):
    from app.repositories.session_repository import SessionRepository

    service = _service(db_session)
    session = service.handle_callback(code="abc", state="s", cookie_state="s")

    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()

    assert SessionRepository(db_session).get_valid(session.id) is None
