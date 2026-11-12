"""Accent- and case-folding shared by Python and SQL (D-215).

The catalogue search compares text in the database, the palette compares it in
Python (D-207). Both must agree that "aco", "AÇO" and "aço" are the same word,
so the table of letters lives here once: ``fold_accents`` applies it in Python
and ``app.repositories.text_sql.folded`` writes the same table into SQL.

Only the Latin letters Portuguese, Spanish and French names carry are folded;
anything else passes through unchanged, which is the safe direction (a letter
left alone can only make a match stricter, never invent one).
"""

from __future__ import annotations

#: Accented letter → plain lowercase letter. Upper and lower case both listed:
#: SQLite's ``lower()`` only folds ASCII, so "Ç" has to be mapped by hand.
_PAIRS: dict[str, str] = {
    **dict.fromkeys("áàâãäåÁÀÂÃÄÅ", "a"),
    **dict.fromkeys("éèêëÉÈÊË", "e"),
    **dict.fromkeys("íìîïÍÌÎÏ", "i"),
    **dict.fromkeys("óòôõöÓÒÔÕÖ", "o"),
    **dict.fromkeys("úùûüÚÙÛÜ", "u"),
    **dict.fromkeys("çÇ", "c"),
    **dict.fromkeys("ñÑ", "n"),
    **dict.fromkeys("ýÿÝ", "y"),
}

#: The two sides of the table, aligned character by character (SQL ``translate``).
ACCENTED = "".join(_PAIRS)
PLAIN = "".join(_PAIRS.values())

_TABLE = str.maketrans(_PAIRS)


def fold_accents(text: str) -> str:
    """Lowercase without the accents above: "Aço Inoxidável" → "aco inoxidavel".

    Whitespace is kept as typed, so a ``LIKE`` pattern built from the result
    lines up with the same column folded in SQL.
    """
    return text.translate(_TABLE).lower()
