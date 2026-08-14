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


class ConflictError(DomainError):
    """The operation conflicts with current state (duplicate, in use). -> HTTP 409."""


class AuthenticationError(DomainError):
    """No session, or the session cookie is missing/invalid/expired. -> HTTP 401."""


class ServiceUnavailableError(DomainError):
    """A required external dependency is not configured. -> HTTP 503.

    Reserved for deployment-configuration gaps (e.g. no Google OAuth client
    set), not for domain rule violations — those are ``ValidationError`` or
    ``ConflictError``.
    """
