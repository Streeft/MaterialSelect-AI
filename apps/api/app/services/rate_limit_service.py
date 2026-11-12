"""Who is asking, which bucket, and whether they may ask again (D-223).

The counting itself is ``app.domain.rate_limit``; this module decides the key
and the limit from the request and the settings, and turns a refusal into a
``RateLimitedError`` (429 with ``Retry-After`` in ``app.main``).

The key is the session cookie's digest when there is one — the caller is a
person, and several people behind one school network must not share a quota —
and the client IP otherwise. On Fly the IP comes from ``Fly-Client-IP``, which
the Fly proxy sets on every request it forwards; elsewhere, from the socket.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from app.config import settings
from app.domain.errors import RateLimitedError
from app.domain.rate_limit import FixedWindowLimiter
from app.domain.session_token import hash_session_token

Bucket = Literal["auth", "ai", "exports", "notebooks"]


@dataclass(frozen=True)
class _BucketRule:
    setting: str
    label: str
    by_ip_only: bool = False


_RULES: dict[Bucket, _BucketRule] = {
    # Login has no session yet: always per IP.
    "auth": _BucketRule("rate_limit_auth_per_minute", "tentativas de login", by_ip_only=True),
    "ai": _BucketRule("rate_limit_ai_per_minute", "pedidos à IA"),
    "exports": _BucketRule("rate_limit_exports_per_minute", "exportações"),
    "notebooks": _BucketRule("rate_limit_notebooks_per_minute", "alterações nos cadernos"),
}

_limiter = FixedWindowLimiter(window_seconds=60.0)


def reset_rate_limits() -> None:
    """Forget every counter (used by the tests that turn the limit on)."""
    _limiter.reset()


def caller_key(*, session_cookie: str | None, client_ip: str | None, by_ip_only: bool) -> str:
    """The identity a request is counted under."""
    if session_cookie and not by_ip_only:
        return "s:" + hash_session_token(session_cookie)[:32]
    return "ip:" + (client_ip or "desconhecido")


def check_rate_limit(
    bucket: Bucket,
    *,
    session_cookie: str | None,
    client_ip: str | None,
    now: float | None = None,
) -> None:
    """Raise ``RateLimitedError`` when this caller spent the bucket's minute."""
    if not settings.rate_limit_enabled:
        return
    rule = _RULES[bucket]
    limit = int(getattr(settings, rule.setting))
    key = f"{bucket}:" + caller_key(
        session_cookie=session_cookie, client_ip=client_ip, by_ip_only=rule.by_ip_only
    )
    wait = _limiter.hit(key, limit, time.monotonic() if now is None else now)
    if wait is not None:
        raise RateLimitedError(
            f"Muitas {rule.label} em pouco tempo. Tente de novo em {wait} s.",
            retry_after=wait,
        )
