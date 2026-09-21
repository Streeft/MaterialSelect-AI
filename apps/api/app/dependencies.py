"""FastAPI dependencies shared across routers: who is logged in, and their
default Project. The single point of truth for "logged in" is a valid
``UserSession`` row — see ``app.repositories.session_repository``.
"""

from __future__ import annotations

from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.domain.display_units import parse_choices
from app.domain.errors import AuthenticationError, SubscriptionRequiredError
from app.models.project import Project
from app.models.user import User
from app.repositories.project_repository import ProjectRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.subscription_repository import SubscriptionRepository

# Named ``msai_*`` to avoid colliding with any cookie a proxy or the browser
# itself sets. The session cookie is the only one both the router and this
# dependency need to agree on by name.
SESSION_COOKIE_NAME = "msai_session"
OAUTH_STATE_COOKIE_NAME = "msai_oauth_state"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the logged-in User from the session cookie, or raise 401."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise AuthenticationError("Não autenticado.")
    session = SessionRepository(db).get_valid(token)
    if session is None:
        raise AuthenticationError("Sessão inválida ou expirada.")
    return session.user


def get_current_project(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Project:
    """Resolve the current user's default (and, in v1, only) Project."""
    project = ProjectRepository(db).get_default_for_user(user.id)
    if project is None:
        # Cannot happen outside a corrupted database: AuthService creates the
        # default Project atomically with the User on first login.
        raise AuthenticationError("Usuário sem projeto padrão.")
    return project


def require_active_subscription(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    subscription = SubscriptionRepository(db).get_by_user_id(user.id)
    if subscription is None or subscription.status != "active":
        raise SubscriptionRequiredError(
            "É necessária uma assinatura ativa para usar esta funcionalidade."
        )


def get_unit_choices(
    unidades: str | None = Query(
        default=None,
        description=(
            "Unidade de leitura por propriedade, no formato "
            "'propriedade:unidade,propriedade:unidade'. Omitido, cada grandeza "
            "sai na sua unidade convencional."
        ),
    ),
) -> dict[str, str]:
    """A escolha de leitura desta requisição (D-70).

    Vem na **URL** e não de uma linha de usuário, pela razão que o D-63 já
    fixou para o registro de referência: uma preferência guardada no servidor
    faria a mesma URL desenhar duas tabelas diferentes para duas pessoas, e um
    documento exportado a partir dela deixaria de ser reproduzível pelo próprio
    link.

    Um par malformado é recusado com o formato escrito, em vez de virar
    silenciosamente "leia tudo em canônico": uma URL truncada não pode mudar os
    números sem dizer nada.
    """
    return parse_choices(unidades)
