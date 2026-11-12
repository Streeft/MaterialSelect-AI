"""AuthService: the Google OAuth handshake, session lifecycle, and the
first-login upsert of User + its default Project.

The CSRF ``state`` for the OAuth handshake is compared here, but it lives in
its own short-lived cookie set by the router — not in a library-managed
session. That keeps the one sensitive comparison in this project's own code
instead of inside a framework dependency.

Token verification goes through google-auth's ``verify_oauth2_token``, which
checks the ID token's signature against Google's published keys locally
(no round-trip to the `tokeninfo` endpoint Google itself discourages for
production traffic — see google-auth's own docs). google-auth's HTTP
transport abstraction expects either the `requests` package or a custom
adapter; ``_HttpxTransportRequest`` below is that adapter, so httpx stays the
project's only HTTP client instead of adding a second one just for this.

Every way the callback can fail ends in one of the codes of
:func:`login_error_code` (D-198): the route turns it into a redirect to
``/entrar?erro=<code>`` instead of letting an exception become a plain-text
500. A network error talking to Google, or a database connection the server
dropped while it slept, is retried once here before it reaches the user.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import Request as GoogleAuthRequest
from google.auth.transport import Response as GoogleAuthResponse
from google.oauth2 import id_token as google_id_token
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.config import settings
from app.domain.errors import AuthenticationError, ServiceUnavailableError
from app.domain.session_token import new_session_token
from app.models.project import Project
from app.models.user import User, UserSession
from app.repositories.project_repository import ProjectRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.user_repository import UserRepository

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

VerifyIdToken = Callable[[str, str], dict[str, Any]]

logger = logging.getLogger(__name__)

# Codes the callback appends as ``/entrar?erro=<code>``; the web page holds the
# message for each one (``ptBR.auth.loginErrors``).
LOGIN_ERROR_SESSION = "sessao"
LOGIN_ERROR_DOMAIN = "dominio"
LOGIN_ERROR_EMAIL = "email"
LOGIN_ERROR_UNAVAILABLE = "indisponivel"
LOGIN_ERROR_FAILURE = "falha"


class LoginRefusedError(AuthenticationError):
    """The login was refused for a reason the user can act on."""

    def __init__(self, message: str, code: str = LOGIN_ERROR_FAILURE) -> None:
        super().__init__(message)
        self.code = code


class LoginUnavailableError(ServiceUnavailableError):
    """Google or the database did not answer, even after one more try."""


def login_error_code(exc: BaseException) -> str:
    """The ``?erro=`` code for any exception the callback can meet."""
    if isinstance(exc, LoginRefusedError):
        return exc.code
    if isinstance(exc, AuthenticationError):
        return LOGIN_ERROR_SESSION
    if isinstance(exc, (ServiceUnavailableError, OperationalError, PoolTimeoutError)):
        return LOGIN_ERROR_UNAVAILABLE
    if isinstance(exc, (httpx.HTTPError, google_auth_exceptions.TransportError)):
        return LOGIN_ERROR_UNAVAILABLE
    return LOGIN_ERROR_FAILURE


def _fit(value: str, column: Any) -> str:
    """Cut a text to its column's length, so a long Google name is no DataError."""
    length = column.type.length
    return value[:length] if length else value


class _HttpxTransportResponse(GoogleAuthResponse):
    def __init__(self, response: httpx.Response) -> None:
        self._response = response

    @property
    def status(self) -> int:
        return self._response.status_code

    @property
    def headers(self) -> dict[str, str]:
        return dict(self._response.headers)

    @property
    def data(self) -> bytes:
        return self._response.content


class _HttpxTransportRequest(GoogleAuthRequest):
    """Adapts httpx to google-auth's ``Request`` interface (fetching Google's
    signing certs), so verification doesn't need the `requests` package.
    """

    def __call__(
        self, url: str, method: str = "GET", body=None, headers=None, timeout=None, **kwargs
    ) -> _HttpxTransportResponse:
        # google-auth only understands its own TransportError; an httpx error
        # escaping from here would skip every handler on the way. One retry: the
        # certificates are a plain GET, safe to repeat.
        for attempt in (1, 2):
            try:
                with httpx.Client(timeout=timeout or 10.0) as client:
                    response = client.request(method, url, content=body, headers=headers)
                return _HttpxTransportResponse(response)
            except httpx.TransportError as exc:
                if attempt == 2:
                    raise google_auth_exceptions.TransportError(str(exc)) from exc
                logger.warning("Certificados do Google: falha de rede, nova tentativa (%s)", exc)
            except httpx.HTTPError as exc:
                raise google_auth_exceptions.TransportError(str(exc)) from exc
        raise AssertionError("unreachable")  # pragma: no cover


def _default_verify_id_token(id_token_jwt: str, client_id: str) -> dict[str, Any]:
    return google_id_token.verify_oauth2_token(
        id_token_jwt, _HttpxTransportRequest(), audience=client_id
    )


@dataclass(frozen=True)
class IssuedSession:
    """A session just opened: the row, and the token only the cookie carries.

    The row keeps the token's SHA-256 (D-223), so the token itself exists only
    here, on its way to the ``Set-Cookie`` header — it is never stored.
    """

    session: UserSession
    token: str

    @property
    def user_id(self) -> int:
        return self.session.user_id


class AuthService:
    """Orchestrates the Google login flow and session lifecycle."""

    def __init__(
        self,
        db: Session,
        *,
        verify_id_token: VerifyIdToken | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.projects = ProjectRepository(db)
        self.sessions = SessionRepository(db)
        self._verify_id_token = verify_id_token or _default_verify_id_token
        self._http_client = http_client

    def build_authorize_url(self) -> tuple[str, str]:
        """Return (authorize_url, state). Raises if OAuth isn't configured."""
        if not settings.google_oauth_enabled:
            raise ServiceUnavailableError(
                "Login com Google não está configurado neste servidor "
                "(GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes)."
            )
        state = secrets.token_urlsafe(24)
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": self._redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}", state

    def handle_callback(self, *, code: str, state: str, cookie_state: str | None) -> IssuedSession:
        """Complete the OAuth handshake and return a new, committed session."""
        if not settings.google_oauth_enabled:
            raise ServiceUnavailableError("Login com Google não está configurado.")
        # Bytes, not str: `compare_digest` raises TypeError on a non-ASCII str,
        # and the `state` comes straight from the query string.
        if not cookie_state or not secrets.compare_digest(
            state.encode("utf-8"), cookie_state.encode("utf-8")
        ):
            raise LoginRefusedError("Estado OAuth inválido ou expirado.", LOGIN_ERROR_SESSION)

        id_token_jwt = self._exchange_code(code)
        claims = self._verify_claims(id_token_jwt)
        return self._open_session(claims)

    def current_session(self, token: str) -> UserSession | None:
        """The live session for a cookie token, or ``None`` (D-223).

        The lookup is by the token's digest. A row written before D-223 holds
        the raw token: it is accepted once and rewritten to the digest right
        here, keeping its expiry, so a deploy logs nobody out and the raw
        tokens leave the table as their owners come back. Rows nobody returns
        to expire as before (``SESSION_TTL_HOURS``).
        """
        session = self.sessions.get_valid(token)
        if session is not None:
            return session
        legacy = self.sessions.get_legacy(token)
        if legacy is None:
            return None
        user = legacy.user
        try:
            converted = self.sessions.rehash(legacy, token)
            self.db.commit()
        except (IntegrityError, StaleDataError):
            # A page fires several requests at once: another one converted
            # this row first. Its digest is there now; use it.
            self.db.rollback()
            return self.sessions.get_valid(token)
        converted.user = user
        return converted

    def logout(self, token: str) -> None:
        """Revoke a session. Idempotent — deleting an unknown token is a no-op."""
        self.sessions.delete(token)
        self.db.commit()

    # --- internals ----------------------------------------------------

    def _open_session(self, claims: dict[str, Any]) -> IssuedSession:
        """Upsert the user and create the session, retrying a dropped connection once.

        Neon suspends an idle database, and the first query after that can
        meet a connection the server already closed. SQLAlchemy invalidates it
        on that error, so after a rollback the second try gets a fresh one.
        The Google code is single-use, which is why only this database part
        is repeated, never the exchange.
        """
        for attempt in (1, 2):
            try:
                user = self._upsert_user(claims)
                session = self._create_session(user)
                self.db.commit()
                return session
            except OperationalError as exc:
                self.db.rollback()
                if attempt == 2:
                    raise LoginUnavailableError("O banco de dados não respondeu ao login.") from exc
                logger.warning("Login: falha de conexão com o banco, nova tentativa (%s)", exc)
        raise AssertionError("unreachable")  # pragma: no cover

    def _redirect_uri(self) -> str:
        return f"{settings.backend_base_url}/api/auth/google/callback"

    def _exchange_code(self, code: str) -> str:
        client = self._http_client or httpx.Client(timeout=10.0)
        owns_client = self._http_client is None
        try:
            response = self._post_token(client, code)
        finally:
            if owns_client:
                client.close()
        if response.status_code != 200:
            raise LoginRefusedError("Não foi possível concluir o login com o Google.")
        try:
            body = response.json()
        except ValueError as exc:
            raise LoginUnavailableError("O Google respondeu algo que não é JSON.") from exc
        id_token_jwt = body.get("id_token") if isinstance(body, dict) else None
        if not id_token_jwt:
            raise LoginRefusedError("A resposta do Google não trouxe um id_token.")
        return str(id_token_jwt)

    def _post_token(self, client: httpx.Client, code: str) -> httpx.Response:
        """POST the code to Google, retrying once if the connection never opened.

        Only a connect failure is retried: the request never reached Google,
        so the single-use code is still good. Any other network error is
        reported as unavailable without a second POST.
        """
        data = {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": self._redirect_uri(),
            "grant_type": "authorization_code",
        }
        for attempt in (1, 2):
            try:
                return client.post(GOOGLE_TOKEN_URL, data=data)
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                if attempt == 2:
                    raise LoginUnavailableError("O Google não respondeu ao login.") from exc
                logger.warning("Login: sem conexão com o Google, nova tentativa (%s)", exc)
            except httpx.HTTPError as exc:
                raise LoginUnavailableError("O Google não respondeu ao login.") from exc
        raise AssertionError("unreachable")  # pragma: no cover

    def _verify_claims(self, id_token_jwt: str) -> dict[str, Any]:
        try:
            claims = self._verify_id_token(id_token_jwt, settings.google_client_id)
        except google_auth_exceptions.TransportError as exc:
            # Google's certificates could not be fetched: the token may be fine.
            raise LoginUnavailableError("Os certificados do Google não responderam.") from exc
        except (ValueError, google_auth_exceptions.GoogleAuthError) as exc:
            raise LoginRefusedError("Não foi possível verificar a identidade do Google.") from exc
        if not claims.get("email_verified", False):
            raise LoginRefusedError(
                "O e-mail da conta Google não está verificado.", LOGIN_ERROR_EMAIL
            )
        allowed_domain = settings.google_allowed_domain.strip()
        email = str(claims.get("email", ""))
        if allowed_domain and not email.lower().endswith(f"@{allowed_domain.lower()}"):
            raise LoginRefusedError(
                "Esta conta Google não pertence ao domínio permitido.", LOGIN_ERROR_DOMAIN
            )
        return claims

    def _upsert_user(self, claims: dict[str, Any]) -> User:
        google_sub = str(claims["sub"])
        user = self.users.get_by_google_sub(google_sub)
        if user is not None:
            return user
        # Google does not bound `name` or `picture`; the columns do. A name is
        # cut to fit; a cut URL would point nowhere, so a too-long one is left
        # out (the avatar is optional, the login is not).
        avatar_url = claims.get("picture")
        if avatar_url is not None:
            avatar_url = str(avatar_url)
            if len(avatar_url) > (User.__table__.c.avatar_url.type.length or len(avatar_url)):
                avatar_url = None
        user = self.users.create(
            google_sub=google_sub,
            email=str(claims.get("email", "")),
            name=_fit(str(claims.get("name") or claims.get("email", "")), User.__table__.c.name),
            avatar_url=avatar_url,
        )
        # Flush (not commit) to assign user.id before the default Project can
        # reference it as owner_id — the caller commits both atomically.
        self.db.flush()
        self._create_default_project(user)
        return user

    def _create_default_project(self, user: User) -> Project:
        return self.projects.create(name="Meu projeto", owner_id=user.id)

    def _create_session(self, user: User) -> IssuedSession:
        now = datetime.now(UTC)
        token = new_session_token()
        session = self.sessions.create(
            token=token,
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(hours=settings.session_ttl_hours),
        )
        return IssuedSession(session=session, token=token)
