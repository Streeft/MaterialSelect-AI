"""Errors raised by clients of services outside this application (D-97)."""

from __future__ import annotations

from app.domain.errors import ServiceUnavailableError


class ExternalUnavailableError(ServiceUnavailableError):
    """An outside service is off, unconfigured, rate-limited or out of quota.

    Its message is pt-BR and reaches the student as it is: it has to say which
    service and why, never a status code alone.
    """
