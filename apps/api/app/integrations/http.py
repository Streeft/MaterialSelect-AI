"""The one place an outbound ``httpx.Client`` is built (D-97).

Every integration receives its client from :func:`build_client` instead of
opening its own, for three reasons that do not change per integration:

* ``trust_env=False`` — a ``HTTP(S)_PROXY`` or ``SSL_CERT_FILE`` in the
  server's environment must not silently reroute or re-trust a request whose
  destination :mod:`app.integrations.safe_fetch` has just validated;
* ``follow_redirects=False`` — a redirect is a new destination, and only the
  caller knows how to validate one (``safe_fetch`` also passes the flag on each
  ``send``, so a client built elsewhere cannot re-enable it behind its back);
* one ``User-Agent`` that says who is calling and how to reach the operator,
  which public APIs such as Wikipedia's require and every server is owed;
* **no cookies**, ever stored or sent. ``safe_fetch`` requests the pinned IP,
  so a jar would file a site's cookie under an address that a shared CDN
  gives to many other sites, and hand it to the next one;
* **HTTP/1.1 only**. ``safe_fetch`` sends ``Connection: close`` so a TLS
  session opened for one name is never reused for another name pinned to
  the same IP; HTTP/2 multiplexes over the pooled session and ignores that
  header, so turning it on would reopen exactly that reuse.

The ``httpx`` and ``httpcore`` loggers are held at WARNING: at INFO httpx logs
every request's full URL, and OpenAlex takes its key in the query string.

:func:`get_http_transport` and :func:`get_resolver` are FastAPI dependencies
that return ``None`` in production — the real transport and the system
resolver. Tests override them with ``httpx.MockTransport`` and a fake resolver,
which is how no test in the suite ever reaches the network.
"""

from __future__ import annotations

import logging
import re
from http.cookiejar import CookieJar, DefaultCookiePolicy
from typing import Any

import httpx

from app import __version__
from app.integrations.safe_fetch import FetchLimits, Resolver

_PRODUCT = "MaterialSelectAI"


def _quiet_request_logs() -> None:
    """Hold httpx's per-request INFO lines (full URL, query included) back.

    Called by :func:`build_client` rather than once at import, so a logging
    configuration applied after import cannot bring the URLs back.
    """
    for name in ("httpx", "httpcore"):
        logger = logging.getLogger(name)
        if logger.getEffectiveLevel() < logging.WARNING:
            logger.setLevel(logging.WARNING)


#: What a ``User-Agent`` comment may carry: printable ASCII without the
#: parentheses and semicolon that delimit it. A value from the environment is
#: reduced to this rather than trusted, since a header is not a place for
#: configuration mistakes to become protocol errors.
_UNSAFE_IN_COMMENT = re.compile(r"[^\x21-\x7e ]|[();\\]")


def _comment_safe(value: str) -> str:
    cleaned = _UNSAFE_IN_COMMENT.sub("", value)
    return " ".join(cleaned.split())[:200]


def user_agent(settings: Any) -> str:
    """``MaterialSelectAI/<version> (+<frontend>; <contact>)``.

    ``external_contact`` falls back to the frontend URL, so the header always
    names a way back to the operator when either is configured. Read by
    attribute with fallbacks, like :meth:`FetchLimits.from_settings`.
    """
    frontend = _comment_safe(str(getattr(settings, "frontend_url", "") or ""))
    contact = _comment_safe(str(getattr(settings, "external_contact", "") or "")) or frontend
    details = [f"+{frontend}"] if frontend else []
    if contact:
        details.append(contact)
    if not details:
        return f"{_PRODUCT}/{__version__}"
    return f"{_PRODUCT}/{__version__} ({'; '.join(details)})"


def build_client(settings: Any, transport: httpx.BaseTransport | None = None) -> httpx.Client:
    """An ``httpx.Client`` for outbound integrations.

    ``transport`` is ``None`` in production (httpx's own, with certificate
    verification against certifi) and an ``httpx.MockTransport`` in tests. The
    default timeout is the fetch deadline; an integration with a different
    budget passes its own ``timeout`` per request. The caller closes the
    client.
    """
    limits = FetchLimits.from_settings(settings)
    _quiet_request_logs()
    return httpx.Client(
        transport=transport,
        trust_env=False,
        follow_redirects=False,
        http2=False,
        cookies=_refuse_all_cookies(),
        headers={"User-Agent": user_agent(settings)},
        timeout=httpx.Timeout(limits.timeout_seconds),
    )


def _refuse_all_cookies() -> CookieJar:
    """A jar whose policy admits no domain: nothing is stored, nothing is sent."""
    return CookieJar(policy=DefaultCookiePolicy(allowed_domains=[]))


def get_http_transport() -> httpx.BaseTransport | None:
    """FastAPI dependency: ``None`` means httpx's real transport."""
    return None


def get_resolver() -> Resolver | None:
    """FastAPI dependency: ``None`` means :func:`socket.getaddrinfo`."""
    return None
