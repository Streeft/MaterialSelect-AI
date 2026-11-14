"""How many heavy requests one process serves at once (D-231).

A heavy request reads a large share of the catalogue (the selection funnel,
the property map, the calculators, the AI plan). Each one holds tens of
megabytes while it runs, so a burst of them — one person opening a few tabs,
or a class opening the same screen together — used to add up past the VM's
memory and get the process killed (exit 137), taking every other request with
it. The gate lets ``HEAVY_REQUEST_CONCURRENCY`` of them run together; the
next one waits up to ``HEAVY_REQUEST_WAIT_SECONDS`` for a free slot and is then
refused with 503 and ``Retry-After``, which the screen shows as "try again"
instead of the whole API going down.

A ``threading`` semaphore, not an ``asyncio`` one: the heavy routes are plain
``def`` endpoints served from the thread pool, and the dependency that holds
the slot runs there too. It is per process, like the rate limit (D-223): one
Fly machine with one worker means one gate.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

from app.config import settings
from app.domain.errors import ServerBusyError

# Seconds a refused caller is told to wait before asking again.
RETRY_AFTER_SECONDS = 5


class HeavyRequestGate:
    """A counting semaphore with a bounded wait and a Portuguese refusal."""

    def __init__(self, capacity: int, wait_seconds: float) -> None:
        self.capacity = capacity
        self.wait_seconds = wait_seconds
        self._slots = threading.BoundedSemaphore(capacity) if capacity > 0 else None
        self._lock = threading.Lock()
        self._in_use = 0

    @property
    def in_use(self) -> int:
        return self._in_use

    @contextmanager
    def slot(self) -> Iterator[None]:
        """Hold one slot for the duration of the block; ``capacity <= 0`` never waits."""
        if self._slots is None:
            yield
            return
        if not self._slots.acquire(timeout=max(self.wait_seconds, 0.0)):
            raise ServerBusyError(
                "O servidor está ocupado com outros cálculos pesados agora. "
                f"Tente de novo em {RETRY_AFTER_SECONDS} segundos.",
                retry_after=RETRY_AFTER_SECONDS,
            )
        with self._lock:
            self._in_use += 1
        try:
            yield
        finally:
            with self._lock:
                self._in_use -= 1
            self._slots.release()


_gate: HeavyRequestGate | None = None
_gate_lock = threading.Lock()


def get_gate() -> HeavyRequestGate:
    """The process-wide gate, rebuilt when the settings it was built from change."""
    global _gate
    capacity = settings.heavy_request_concurrency
    wait = settings.heavy_request_wait_seconds
    with _gate_lock:
        if _gate is None or _gate.capacity != capacity or _gate.wait_seconds != wait:
            _gate = HeavyRequestGate(capacity, wait)
        return _gate


def reset_gate() -> None:
    """Forget the gate (tests): the next request builds one from the settings."""
    global _gate
    with _gate_lock:
        _gate = None
