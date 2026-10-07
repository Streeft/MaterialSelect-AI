"""Domain-level exceptions, mapped to HTTP status codes in ``app.main``.

Keeping these framework-agnostic lets services raise meaningful errors without
importing FastAPI, and lets the HTTP layer translate them consistently.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base class for expected, user-facing domain errors."""


class NotFoundError(DomainError):
    """An entity referenced by id/slug does not exist. -> HTTP 404."""


class ValidationError(DomainError):
    """Input is structurally valid but violates a domain rule. -> HTTP 400."""


class ExportRefusedError(DomainError):
    """The requested export cannot be produced honestly. -> HTTP 422.

    Distinct from ``ValidationError`` (a malformed request, 400): the request
    is well formed, but the record lacks what the file format demands — a CAE
    material card without a Poisson's ratio would let the solver fill the blank
    with its own default (D-104). Refusing names what is missing instead.
    """


class ConflictError(DomainError):
    """The operation conflicts with current state (duplicate, in use). -> HTTP 409."""


class AuthenticationError(DomainError):
    """No session, or the session cookie is missing/invalid/expired. -> HTTP 401."""


class SubscriptionRequiredError(DomainError):
    """Raised when a route needs an active subscription and the user has none."""


class CatalogReadOnlyError(DomainError):
    """A write to the shared catalogue by someone who may only read it. -> HTTP 403.

    Only reachable in open access mode (D-83). The default message lives here
    so the route guard and the material service cannot word it differently.
    """

    def __init__(
        self,
        message: str = (
            "Durante o acesso aberto para testes, o catálogo compartilhado é somente "
            "leitura. Você pode criar e editar os seus próprios registros e estudos."
        ),
    ) -> None:
        super().__init__(message)


class QuotaExceededError(DomainError):
    """A per-user daily limit is spent (the Cadernos' AI quota, D-92). -> HTTP 429."""


class ServiceUnavailableError(DomainError):
    """A required external dependency is not configured. -> HTTP 503.

    Reserved for deployment-configuration gaps (e.g. no Google OAuth client
    set), not for domain rule violations — those are ``ValidationError`` or
    ``ConflictError``.
    """
