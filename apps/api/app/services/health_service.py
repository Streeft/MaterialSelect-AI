"""Deep health check: is the database answering? (D-223)

Kept apart from ``/api/health``, which Fly probes every few seconds and which
must stay up while Neon sleeps. This one is for a person or a workflow asking
"is the whole thing working?" — it wakes the database on purpose.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.domain.errors import ServiceUnavailableError
from app.repositories.health_repository import HealthRepository
from app.schemas.common import DatabaseHealthResponse

logger = logging.getLogger(__name__)


class HealthService:
    def __init__(self, db: Session) -> None:
        self.repo = HealthRepository(db)

    def database(self) -> DatabaseHealthResponse:
        started = time.perf_counter()
        try:
            self.repo.ping()
        except SQLAlchemyError as exc:
            # The driver's text can name the host and the user: log it, answer plainly.
            logger.warning("Saúde do banco: falhou (%s)", exc.__class__.__name__, exc_info=exc)
            raise ServiceUnavailableError("O banco de dados não respondeu.") from exc
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return DatabaseHealthResponse(status="ok", database="ok", latency_ms=latency_ms)
