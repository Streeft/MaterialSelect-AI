"""The loop that sends again a laudo e-mail that failed for a passing reason (D-252).

No queue server, no new dependency: the queue is the ``report_delivery`` table (status
``na_fila`` and ``next_attempt_at``) and this is one daemon thread of the API process that
looks at it every ``EMAIL_RETRY_POLL_SECONDS``. The Fly app runs one always-on machine
(``min_machines_running = 1``, ``auto_stop_machines = false``), so a thread in the process is
as alive as the process; if the machine restarts, the table still holds the queue and the
thread that starts with the new process picks it up. The one conditional ``UPDATE`` that takes
an attempt (``claim_due``) is what keeps two threads — a second machine, a second tick — from
sending the same message twice.

It starts only with ``EMAIL_PROVIDER=smtp`` (the ``mock`` provider never fails, so there is
nothing to retry) and ``EMAIL_RETRY_MAX_ATTEMPTS`` above 1. An empty queue costs one indexed
query per tick.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.config import settings
from app.services.report_delivery_service import process_due_deliveries

logger = logging.getLogger(__name__)


class DeliveryRetryWorker:
    """A stoppable polling loop over :func:`process_due_deliveries`."""

    def __init__(self, session_factory: Callable[[], Session], interval_seconds: float) -> None:
        self._session_factory = session_factory
        self._interval = max(float(interval_seconds), 0.05)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def run_once(self) -> int:
        """One tick: the attempts that are due now. Never raises (a tick must not kill the loop)."""
        try:
            return process_due_deliveries(self._session_factory)
        except Exception:  # noqa: BLE001 - the database may be asleep or restarting
            logger.exception("Fila de e-mail: o ciclo falhou; tenta de novo no próximo.")
            return 0

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="laudo-email-retry", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while not self._stop.wait(self._interval):
            self.run_once()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)
            self._thread = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()


def start_delivery_retry_worker(
    session_factory: Callable[[], Session] | None = None,
) -> DeliveryRetryWorker | None:
    """Start the loop when the settings call for it; ``None`` when there is nothing to retry."""
    if settings.email_provider_name != "smtp" or settings.email_retry_max_attempts <= 1:
        return None
    if session_factory is None:
        from app.db.base import SessionLocal

        session_factory = SessionLocal
    worker = DeliveryRetryWorker(session_factory, settings.email_retry_poll_seconds)
    worker.start()
    logger.info(
        "Fila de reenvio de laudos ligada: ciclo de %s s, até %s tentativas por envio.",
        settings.email_retry_poll_seconds,
        settings.email_retry_max_attempts,
    )
    return worker
