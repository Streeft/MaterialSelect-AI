"""Google login: redirect to Google, handle the callback, hold a session.

The three public routes (``/google/login``, ``/google/callback``,
``/logout``) are the only ones in the whole API that stay reachable without a
session — everything else requires ``get_current_user`` (see
``app.dependencies``).

The callback never answers with an error page of its own (D-198): whatever
fails on the way is rolled back, logged with its traceback (``fly logs``) and
turned into a redirect to ``/entrar?erro=<code>``, where the web page says
what happened in Portuguese and offers the button again.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.dependencies import (
    OAUTH_STATE_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    get_current_project,
    get_current_user,
)
from app.integrations.http import get_http_transport
from app.models.project import Project
from app.models.user import User
from app.schemas.auth import UserOut
from app.services.auth_service import (
    LOGIN_ERROR_SESSION,
    AuthService,
    LoginRefusedError,
    login_error_code,
)

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)


@router.get("/google/login")
def google_login(db: Session = Depends(get_db)) -> RedirectResponse:
    """Redirect to Google's consent screen, with a fresh CSRF `state` cookie."""
    url, state = AuthService(db).build_authorize_url()
    response = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        OAUTH_STATE_COOKIE_NAME,
        state,
        max_age=settings.oauth_state_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str = "",
    error: str | None = None,
    db: Session = Depends(get_db),
    transport: httpx.BaseTransport | None = Depends(get_http_transport),
) -> RedirectResponse:
    """Exchange the code for tokens, open a session, and send the user home."""
    try:
        if error or not code:
            raise LoginRefusedError(
                f"Login com Google não concluído ({error or 'sem código'}).",
                LOGIN_ERROR_SESSION,
            )
        cookie_state = request.cookies.get(OAUTH_STATE_COOKIE_NAME)
        # `None` in production: AuthService opens its own client. Tests hand a
        # MockTransport here, so the exchange never leaves the machine.
        http_client = httpx.Client(transport=transport, timeout=10.0) if transport else None
        try:
            session = AuthService(db, http_client=http_client).handle_callback(
                code=code, state=state, cookie_state=cookie_state
            )
        finally:
            if http_client is not None:
                http_client.close()
    except Exception as exc:  # noqa: BLE001 - the login must never end in a 500
        return _login_failed(db, exc)

    # Into the tool, not back to the public front door (D-86): that page is one
    # button that leads here, and landing on it again right after logging in
    # read as "the login did not work".
    response = RedirectResponse(
        f"{settings.frontend_url.rstrip('/')}/app", status_code=status.HTTP_302_FOUND
    )
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session.id,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        # Configurable because the frontend and the API are not necessarily one
        # site once deployed — see the note on `session_cookie_samesite` in
        # config.py. The `state` cookie above stays `lax` on purpose.
        samesite=settings.session_cookie_samesite,
    )
    return response


def _login_failed(db: Session, exc: Exception) -> RedirectResponse:
    """Roll back, log the traceback, and send the user to `/entrar?erro=<code>`."""
    try:
        db.rollback()
    except Exception:  # noqa: BLE001 - a dead connection may refuse even this
        logger.exception("Login com Google: o rollback também falhou")
    code = login_error_code(exc)
    logger.exception("Login com Google falhou (erro=%s)", code, exc_info=exc)
    response = RedirectResponse(
        f"{settings.frontend_url.rstrip('/')}/entrar?erro={code}",
        status_code=status.HTTP_302_FOUND,
    )
    # The `state` was single-use; the button on /entrar starts a fresh one.
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    """Revoke the current session, if any. Idempotent."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        AuthService(db).logout(token)
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserOut)
def me(
    user: User = Depends(get_current_user),
    project: Project = Depends(get_current_project),
) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        project_id=project.id,
    )
