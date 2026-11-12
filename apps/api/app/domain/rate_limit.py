"""A fixed-window request counter, in memory (D-223).

Pure bookkeeping: no clock of its own (``now`` is passed in), no HTTP, no
settings. It answers one question — may this key make one more request in
this window, and if not, in how many seconds may it? — so the rule can be
tested without a server and swapped for a shared store (Redis) later without
touching the callers.

Fixed windows let a caller spend up to twice the limit across a window edge.
That is accepted: the goal is to stop a loop or a script, not to meter use.
"""

from __future__ import annotations

import math
import threading
from dataclasses import dataclass

# Above this many keys, windows that have already closed are dropped on the
# next hit, so the dictionary cannot grow without bound under many IPs.
_PRUNE_ABOVE = 10_000


@dataclass
class _Window:
    started_at: float
    count: int


class FixedWindowLimiter:
    """Counts hits per key in windows of ``window_seconds``."""

    def __init__(self, window_seconds: float = 60.0) -> None:
        self.window_seconds = window_seconds
        self._windows: dict[str, _Window] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, now: float) -> int | None:
        """Count one request; ``None`` if allowed, else seconds to wait (>= 1).

        A non-positive ``limit`` means "no limit" for that bucket.
        """
        if limit <= 0:
            return None
        with self._lock:
            window = self._windows.get(key)
            if window is None or now - window.started_at >= self.window_seconds:
                if len(self._windows) > _PRUNE_ABOVE:
                    self._prune(now)
                self._windows[key] = _Window(started_at=now, count=1)
                return None
            if window.count < limit:
                window.count += 1
                return None
            remaining = self.window_seconds - (now - window.started_at)
            return max(1, math.ceil(remaining))

    def reset(self) -> None:
        """Forget every window (tests, and a settings change at runtime)."""
        with self._lock:
            self._windows.clear()

    def _prune(self, now: float) -> None:
        stale = [
            key
            for key, window in self._windows.items()
            if now - window.started_at >= self.window_seconds
        ]
        for key in stale:
            del self._windows[key]
