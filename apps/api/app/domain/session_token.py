"""The session cookie's token and what the database keeps of it (D-223).

The cookie carries an opaque random token; the ``user_session`` row keeps only
its SHA-256, in hex. Whoever reads the table (a backup, a dump, a logged query)
holds digests, and a digest is not a cookie: logging in still needs the token,
which only the browser has. SHA-256 without salt is enough here because the
token is 48 random bytes, not a password — there is nothing to guess.

A hex digest is 64 characters of ``[0-9a-f]``; a token is ``token_urlsafe``
text. Rows written before D-223 hold the token itself; ``looks_hashed`` tells
the two apart without a schema change.
"""

from __future__ import annotations

import hashlib
import re
import secrets

TOKEN_BYTES = 48
_HEX_DIGEST = re.compile(r"[0-9a-f]{64}")


def new_session_token() -> str:
    """A fresh opaque token for the cookie (64 URL-safe characters)."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_session_token(token: str) -> str:
    """The value stored in ``user_session.id`` for this cookie token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def looks_hashed(stored_id: str) -> bool:
    """Whether a stored id is already a digest (and not a pre-D-223 token)."""
    return _HEX_DIGEST.fullmatch(stored_id) is not None
