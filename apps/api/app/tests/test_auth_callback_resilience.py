"""The Google callback never answers a 500 (D-198).

In production the callback answered "Internal Server Error" in plain text: any
exception on the way (a Neon connection that died while the database slept, a
network hiccup talking to Google, a value too long for its column, a `state`
the CSRF comparison could not take) escaped the route. These tests reproduce
each cause and require the same outcome: a rollback, a log line with the
traceback, and a 302 to ``/entrar?erro=<code>`` that the web page explains.

Google itself is never reached: the token exchange goes through the
``get_http_transport`` dependency, replaced here by an ``httpx.MockTransport``,
and the token URL points at a closed local port so that, should the wiring
ever regress, the request fails fast instead of leaving the machine.
"""

from __future__ import annotations

import logging
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient
from google.auth import exceptions as google_auth_exceptions
from sqlalchemy.exc import DataError, OperationalError

from app.db.base import engine_kwargs, get_db
from app.integrations.http import get_http_transport
from app.main import app
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services import auth_service as auth_service_module
from app.services.auth_service import AuthService

CLAIMS = {
    "sub": "google-sub-resiliente",
    "email": "aluna@example.com",
    "email_verified": True,
    "name": "Aluna de Teste",
}


@pytest.fixture()
def google(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module.settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(auth_service_module.settings, "google_client_secret", "test-secret")
    monkeypatch.setattr(auth_service_module.settings, "google_allowed_domain", "")
    monkeypatch.setattr(auth_service_module.settings, "session_cookie_secure", False)
    monkeypatch.setattr(auth_service_module, "GOOGLE_TOKEN_URL", "http://127.0.0.1:9/token")
    monkeypatch.setattr(
        auth_service_module, "_default_verify_id_token", lambda jwt, client_id: dict(CLAIMS)
    )


def _google_answers(handler) -> None:
    app.dependency_overrides[get_http_transport] = lambda: httpx.MockTransport(handler)


def _token_ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"id_token": "fake-jwt"})


def _callback(client: TestClient, *, state: str = "s", cookie: str = "s") -> httpx.Response:
    client.cookies.set("msai_oauth_state", cookie)
    return client.get(
        "/api/auth/google/callback",
        params={"code": "abc", "state": state},
        follow_redirects=False,
    )


def _error_code(resp: httpx.Response) -> str:
    assert resp.status_code == 302, resp.text
    location = urlparse(resp.headers["location"])
    assert location.path == "/entrar"
    return parse_qs(location.query)["erro"][0]


def _disconnect() -> OperationalError:
    return OperationalError(
        "SELECT users.id FROM users", {}, Exception("server closed the connection unexpectedly")
    )


# --- the happy path still lands in the tool ---------------------------------


def test_callback_through_the_transport_logs_in(anon_client, google):
    _google_answers(_token_ok)
    resp = _callback(anon_client)
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/app")
    assert "msai_session" in resp.headers.get("set-cookie", "")


# --- network failures talking to Google -------------------------------------


def test_callback_connect_timeout_redirects_to_unavailable(anon_client, google, caplog):
    def _timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    _google_answers(_timeout)
    with caplog.at_level(logging.ERROR):
        resp = _callback(anon_client)
    assert _error_code(resp) == "indisponivel"
    assert any(r.exc_info for r in caplog.records), "o traceback precisa ir para o log"


def test_callback_retries_one_connect_error_on_the_token_exchange(anon_client, google):
    calls: list[int] = []

    def _flaky(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        if len(calls) == 1:
            raise httpx.ConnectError("connection refused", request=request)
        return _token_ok(request)

    _google_answers(_flaky)
    resp = _callback(anon_client)
    assert resp.headers["location"].endswith("/app")
    assert len(calls) == 2


def test_callback_non_json_token_response_redirects_to_unavailable(anon_client, google):
    _google_answers(lambda request: httpx.Response(200, text="<html>erro</html>"))
    assert _error_code(_callback(anon_client)) == "indisponivel"


def test_callback_google_cert_fetch_failure_redirects_to_unavailable(
    anon_client, google, monkeypatch
):
    def _no_certs(jwt: str, client_id: str) -> dict:
        raise google_auth_exceptions.TransportError("certs unreachable")

    monkeypatch.setattr(auth_service_module, "_default_verify_id_token", _no_certs)
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client)) == "indisponivel"


def test_cert_transport_turns_httpx_errors_into_google_transport_errors(monkeypatch):
    def _refuse(self, *args, **kwargs):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx.Client, "request", _refuse)
    with pytest.raises(google_auth_exceptions.TransportError):
        auth_service_module._HttpxTransportRequest()("https://www.googleapis.com/oauth2/v1/certs")


# --- database failures --------------------------------------------------------


def test_callback_retries_one_operational_error_and_logs_in(anon_client, google, monkeypatch):
    original = AuthService._upsert_user
    calls: list[int] = []

    def _dies_once(self, claims):
        calls.append(1)
        if len(calls) == 1:
            raise _disconnect()
        return original(self, claims)

    monkeypatch.setattr(AuthService, "_upsert_user", _dies_once)
    _google_answers(_token_ok)
    resp = _callback(anon_client)
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/app")
    assert len(calls) == 2


def test_callback_operational_error_twice_redirects_to_unavailable(
    anon_client, google, monkeypatch
):
    def _always_dies(self, claims):
        raise _disconnect()

    monkeypatch.setattr(AuthService, "_upsert_user", _always_dies)
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client)) == "indisponivel"


def test_callback_data_error_redirects_to_failure(anon_client, google, monkeypatch):
    def _too_long(self, **kwargs):
        raise DataError("INSERT INTO users", {}, Exception("value too long for type"))

    monkeypatch.setattr(UserRepository, "create", _too_long)
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client)) == "falha"


def test_long_name_and_avatar_fit_their_columns(db_session, google):
    claims = {
        **CLAIMS,
        "sub": "google-sub-longo",
        "name": "N" * 500,
        "picture": "https://example.com/" + "a" * 600,
    }
    service = AuthService(db_session, verify_id_token=lambda jwt, client_id: dict(claims))
    service._exchange_code = lambda code: "fake-jwt"
    session = service.handle_callback(code="abc", state="s", cookie_state="s")

    user = db_session.get(User, session.user_id)
    assert len(user.name) == User.__table__.c.name.type.length
    # A cut URL points nowhere: an avatar that does not fit is left out.
    assert user.avatar_url is None


def test_postgres_queue_pool_pings_and_recycles_connections():
    kwargs = engine_kwargs("postgresql+psycopg://u:p@host/db", pool_mode="queue")
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_recycle"] == 300
    assert kwargs["pool_timeout"] == 10
    assert kwargs["hide_parameters"] is True


def test_sqlite_engine_keeps_its_own_settings():
    kwargs = engine_kwargs("sqlite://")
    assert kwargs["connect_args"] == {"check_same_thread": False}
    assert "pool_pre_ping" not in kwargs
    assert "pool_size" not in kwargs


# --- requests that cannot be a login ----------------------------------------


def test_callback_non_ascii_state_redirects_to_session(anon_client, google):
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client, state="estado-ção")) == "sessao"


def test_callback_denied_consent_redirects_to_session(anon_client, google):
    resp = anon_client.get(
        "/api/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    assert _error_code(resp) == "sessao"


def test_callback_outside_allowed_domain_redirects_to_domain(anon_client, google, monkeypatch):
    monkeypatch.setattr(auth_service_module.settings, "google_allowed_domain", "empresa.com")
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client)) == "dominio"


def test_callback_unverified_email_redirects_to_email(anon_client, google, monkeypatch):
    monkeypatch.setattr(
        auth_service_module,
        "_default_verify_id_token",
        lambda jwt, client_id: {**CLAIMS, "email_verified": False},
    )
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client)) == "email"


def test_callback_unexpected_error_redirects_to_failure(anon_client, google, monkeypatch):
    def _boom(self, user):
        raise RuntimeError("bug")

    monkeypatch.setattr(AuthService, "_create_session", _boom)
    _google_answers(_token_ok)
    assert _error_code(_callback(anon_client)) == "falha"


# --- the global safety net ----------------------------------------------------


def test_unhandled_exception_is_json_in_portuguese_and_logged(caplog):
    def _broken_db():
        raise RuntimeError("banco fora do ar")
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = _broken_db
    try:
        with caplog.at_level(logging.ERROR):
            with TestClient(app, raise_server_exceptions=False) as test_client:
                test_client.cookies.set("msai_session", "qualquer")
                resp = test_client.get("/api/auth/me")
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 500
    assert resp.headers["content-type"].startswith("application/json")
    assert "Erro interno" in resp.json()["detail"]
    assert any(r.exc_info for r in caplog.records)
