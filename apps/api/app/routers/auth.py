"""Google login: redirect to Google, handle the callback, hold a session.

The three public routes (``/google/login``, ``/google/callback``,
``/logout``) are the only ones in the whole API that stay reachable without a
session — everything else requires ``get_current_user`` (see
``app.dependencies``).
"""

from __future__ import annotations

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
from app.domain.errors import AuthenticationError
from app.models.project import Project
from app.models.user import User
from app.schemas.auth import UserOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


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
) -> RedirectResponse:
    """Exchange the code for tokens, open a session, and send the user home."""
    if error or not code:
        raise AuthenticationError(f"Login com Google não concluído ({error or 'sem código'}).")

    cookie_state = request.cookies.get(OAUTH_STATE_COOKIE_NAME)
    session = AuthService(db).handle_callback(code=code, state=state, cookie_state=cookie_state)

    response = RedirectResponse(settings.frontend_url, status_code=status.HTTP_302_FOUND)
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session.id,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )
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
