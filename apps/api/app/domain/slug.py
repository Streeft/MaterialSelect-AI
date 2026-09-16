"""Slug generation for classes and property definitions.

Produces a stable, URL-friendly identifier from a human name (accents stripped,
lowercased, non-alphanumeric runs collapsed to a single hyphen).
"""

from __future__ import annotations

import re
import unicodedata


def slugify(text: str) -> str:
    """Return a slug for ``text``.

    Examples::

        slugify("Módulo de Young")  -> "modulo-de-young"
        slugify("Custo por massa")  -> "custo-por-massa"
    """
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower().strip()
    ascii_text = re.sub(r"[^a-z0-9]+", "-", ascii_text)
    return ascii_text.strip("-")
