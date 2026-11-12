"""``ETag`` and ``Cache-Control`` on the lists that rarely change (D-223).

An ASGI middleware, not code in each router: the tag is the hash of the exact
bytes FastAPI serialised, so it cannot drift from the body, and no route had
to learn about headers. Only ``GET`` on the paths below, and only a 200, is
touched; every other request passes straight through, unbuffered.

``private``: every route sits behind the login (``require_active_subscription``)
and some lists depend on who asks (own records in a class count), so a shared
cache must never keep one. ``Vary: Cookie`` keeps two logins on one browser
apart. ``max-age`` is ``STATIC_LIST_MAX_AGE_SECONDS``; the web client asks with
``cache: "no-cache"`` and lets React Query decide when, so in practice the
browser revalidates and gets a 304 with no body when nothing changed.
"""

from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from app.config import settings

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

STATIC_LIST_PATHS: frozenset[str] = frozenset(
    {
        "/api/properties",
        "/api/properties/ordinais",
        "/api/classes",
        "/api/processes",
        "/api/processes/classes",
        "/api/processes/attributes",
        "/api/glossario",
        "/api/padroes",
    }
)


def etag_for(body: bytes) -> str:
    """A weak tag: equal bodies, equal tags (the JSON is not byte-promised)."""
    return 'W/"' + hashlib.sha256(body).hexdigest()[:32] + '"'


def _opaque(tag: str) -> str:
    tag = tag.strip()
    return tag[2:] if tag.startswith("W/") else tag


def etag_matches(current: str, if_none_match: str | None) -> bool:
    """RFC 9110 weak comparison of ``If-None-Match`` against ``current``."""
    if not if_none_match:
        return False
    if if_none_match.strip() == "*":
        return True
    wanted = _opaque(current)
    return any(_opaque(candidate) == wanted for candidate in if_none_match.split(","))


def cache_control() -> str:
    return f"private, max-age={settings.static_list_max_age_seconds}, must-revalidate"


class StaticListCacheMiddleware:
    """Buffers the static lists' 200 answers to tag them; nothing else."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "GET"
            or scope["path"] not in STATIC_LIST_PATHS
        ):
            await self.app(scope, receive, send)
            return

        start: Message | None = None
        chunks: list[bytes] = []
        passthrough = False

        async def capture(message: Message) -> None:
            nonlocal start, passthrough
            if message["type"] == "http.response.start":
                if message["status"] != 200:
                    passthrough = True
                    await send(message)
                    return
                start = message
                return
            if passthrough:
                await send(message)
                return
            if message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
                if not message.get("more_body", False):
                    await self._finish(scope, start, b"".join(chunks), send)
                return
            await send(message)  # pragma: no cover - other message types

        await self.app(scope, receive, capture)

    @staticmethod
    async def _finish(scope: Scope, start: Message | None, body: bytes, send: Send) -> None:
        assert start is not None
        tag = etag_for(body)
        headers = [
            (k, v)
            for k, v in start.get("headers", [])
            if k.lower() not in (b"etag", b"cache-control", b"content-length")
        ]
        vary = [v for k, v in headers if k.lower() == b"vary"]
        headers = [(k, v) for k, v in headers if k.lower() != b"vary"]
        vary_values = {p.strip().lower() for v in vary for p in v.decode().split(",") if p.strip()}
        vary_values.add("cookie")
        headers.append((b"vary", ", ".join(sorted(vary_values)).encode()))
        headers.append((b"etag", tag.encode()))
        headers.append((b"cache-control", cache_control().encode()))

        request_tag = None
        for key, value in scope.get("headers", []):
            if key.lower() == b"if-none-match":
                request_tag = value.decode("latin-1")
                break
        if etag_matches(tag, request_tag):
            no_body = [(k, v) for k, v in headers if k.lower() != b"content-type"]
            await send({"type": "http.response.start", "status": 304, "headers": no_body})
            await send({"type": "http.response.body", "body": b""})
            return
        headers.append((b"content-length", str(len(body)).encode()))
        await send({"type": "http.response.start", "status": 200, "headers": headers})
        await send({"type": "http.response.body", "body": body})
