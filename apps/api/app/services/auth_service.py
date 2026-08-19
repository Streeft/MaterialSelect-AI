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
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import Request as GoogleAuthRequest
from google.auth.transport import Response as GoogleAuthResponse
from google.oauth2 import id_token as google_id_token
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.errors import AuthenticationError, ServiceUnavailableError
from app.models.project import Project
from app.models.user import User, UserSession
from app.repositories.project_repository import ProjectRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.user_repository import UserRepository

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

VerifyIdToken = Callable[[str, str], dict[str, Any]]


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
        with httpx.Client(timeout=timeout or 10.0) as client:
            response = client.request(method, url, content=body, headers=headers)
        return _HttpxTransportResponse(response)


def _default_verify_id_token(id_token_jwt: str, client_id: str) -> dict[str, Any]:
    return google_id_token.verify_oauth2_token(
        id_token_jwt, _HttpxTransportRequest(), audience=client_id
    )


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

    def handle_callback(self, *, code: str, state: str, cookie_state: str | None) -> UserSession:
        """Complete the OAuth handshake and return a new, committed UserSession."""
        if not settings.google_oauth_enabled:
            raise ServiceUnavailableError("Login com Google não está configurado.")
        if not cookie_state or not secrets.compare_digest(state, cookie_state):
            raise AuthenticationError("Estado OAuth inválido ou expirado.")

        id_token_jwt = self._exchange_code(code)
        claims = self._verify_claims(id_token_jwt)
        user = self._upsert_user(claims)
        session = self._create_session(user)
        self.db.commit()
        return session

    def logout(self, token: str) -> None:
        """Revoke a session. Idempotent — deleting an unknown token is a no-op."""
        self.sessions.delete(token)
        self.db.commit()

    # --- internals ----------------------------------------------------

    def _redirect_uri(self) -> str:
        return f"{settings.backend_base_url}/api/auth/google/callback"

    def _exchange_code(self, code: str) -> str:
        client = self._http_client or httpx.Client(timeout=10.0)
        owns_client = self._http_client is None
        try:
            response = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": self._redirect_uri(),
                    "grant_type": "authorization_code",
                },
            )
        finally:
            if owns_client:
                client.close()
        if response.status_code != 200:
            raise AuthenticationError("Não foi possível concluir o login com o Google.")
        id_token_jwt = response.json().get("id_token")
        if not id_token_jwt:
            raise AuthenticationError("A resposta do Google não trouxe um id_token.")
        return id_token_jwt

    def _verify_claims(self, id_token_jwt: str) -> dict[str, Any]:
        try:
            claims = self._verify_id_token(id_token_jwt, settings.google_client_id)
        except (ValueError, google_auth_exceptions.GoogleAuthError) as exc:
            raise AuthenticationError("Não foi possível verificar a identidade do Google.") from exc
        if not claims.get("email_verified", False):
            raise AuthenticationError("O e-mail da conta Google não está verificado.")
        allowed_domain = settings.google_allowed_domain.strip()
        email = str(claims.get("email", ""))
        if allowed_domain and not email.lower().endswith(f"@{allowed_domain.lower()}"):
            raise AuthenticationError("Esta conta Google não pertence ao domínio permitido.")
        return claims

    def _upsert_user(self, claims: dict[str, Any]) -> User:
        google_sub = str(claims["sub"])
        user = self.users.get_by_google_sub(google_sub)
        if user is not None:
            return user
        user = self.users.create(
            google_sub=google_sub,
            email=str(claims.get("email", "")),
            name=str(claims.get("name") or claims.get("email", "")),
            avatar_url=claims.get("picture"),
        )
        # Flush (not commit) to assign user.id before the default Project can
        # reference it as owner_id — the caller commits both atomically.
        self.db.flush()
        self._create_default_project(user)
        return user

    def _create_default_project(self, user: User) -> Project:
        return self.projects.create(name="Meu projeto", owner_id=user.id)

    def _create_session(self, user: User) -> UserSession:
        now = datetime.now(UTC)
        token = secrets.token_urlsafe(48)
        return self.sessions.create(
            token=token,
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(hours=settings.session_ttl_hours),
        )
