"""Checking what a model wrote against the passages it cites (D-92, D-94).

One rule, shared by the chat and the Studio: **a figure must be in a passage
the item that writes it cites** — or in the student's own words (the question,
the topic, the instructions). A figure found only in some *other* passage of
the same answer is still ungrounded: the item would be telling the student
where to check, and pointing at the wrong place.

What counts as "an item" is the caller's business — a paragraph of an answer, a
flashcard (front and back together), a quiz question (its prompt, **every**
option — a distractor with an invented figure is an invented figure — and its
explanation), one cell of a data table, one node of a mind map. This module
only answers, for a group of texts and the passages they cite, which figures
have no footing.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from app.ai.guardrails import numbers_in, ungrounded_numbers
from app.ai.notebook import Passage
from app.notebooks import app_sources

#: A citation marker the model wrote into its prose ("… [2]" or "[1, 3]"). The
#: screen draws citations from the list, so the marker is moved there.
INLINE_CITATION = re.compile(r"\s*\[(\d+(?:\s*,\s*\d+)*)\]")


def take_citations(text: str, cited: object, count: int) -> tuple[str, list[int]]:
    """Move inline markers out of ``text`` and keep only real passage numbers.

    ``cited`` is whatever the model put in its ``citations`` field; anything
    that is not a plain integer between 1 and ``count`` — the passages handed
    over — is dropped (D-47: a citation names a passage that was handed over).
    Order is the model's, duplicates removed.
    """
    numbers = [
        n
        for n in (cited if isinstance(cited, list) else [])
        if isinstance(n, int) and not isinstance(n, bool)
    ]
    for marker in INLINE_CITATION.findall(text):
        numbers.extend(int(n) for n in marker.split(","))
    text = INLINE_CITATION.sub("", text).strip()
    return text, list(dict.fromkeys(n for n in numbers if 1 <= n <= count))


def ungrounded(
    texts: Iterable[str],
    cited: Iterable[int],
    passages: Sequence[Passage],
    extra: set[float],
) -> list[float]:
    """Figures in ``texts`` found neither in the cited passages nor in ``extra``.

    ``cited`` holds 1-based passage numbers already filtered by
    :func:`take_citations`. Small integers are exempt, as everywhere in the
    guardrails — "3 de 5" is the shape of a list, not a measurement.
    """
    allowed = set(extra)
    for number in cited:
        allowed |= numbers_in(passages[number - 1].text)
    invented: set[float] = set()
    for text in texts:
        invented.update(ungrounded_numbers(text, allowed))
    return sorted(invented)


def format_figures(values: Iterable[float]) -> list[str]:
    """Figures as the text writes them, for a message that names them."""
    return [app_sources.format_number(value) for value in values]
