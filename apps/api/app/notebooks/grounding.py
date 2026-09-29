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

A statistic — the big figure of an infographic, read alone and out of context
— is held to a stricter rule (:func:`strict_ungrounded`, :func:`foreign_unit`):
every figure must be in the text of a passage it cites, small integers
included, and its unit must be there too. "45%" is a measurement, not the
shape of a list; and "210 MPa" beside a passage that says "210 GPa" copies the
number and changes the claim by a factor of a thousand.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from app.ai.guardrails import (
    _NUMBER_TOKEN,
    is_grounded,
    numbers_in,
    numeric_tokens,
    ungrounded_numbers,
)
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
    :func:`take_citations`. A cited passage lends its text **and its labels** —
    the section heading and the source title the model saw beside it — so
    "a seção 3.2" is grounded by the passage headed "3.2 Ligas". Small integers
    are exempt, as everywhere in the guardrails — "3 de 5" is the shape of a
    list, not a measurement.
    """
    allowed = set(extra)
    for number in cited:
        allowed |= passage_numbers(passages[number - 1])
    invented: set[float] = set()
    for text in texts:
        invented.update(ungrounded_numbers(text, allowed))
    return sorted(invented)


def passage_numbers(passage: Passage) -> set[float]:
    """Every figure one passage states, in its text or in its labels."""
    # Read one by one: joined, "Tabela 3" and "5 ligas" could read as "3 5",
    # a thousands-grouped figure nobody wrote.
    found = numbers_in(passage.text) | numbers_in(passage.source_title)
    return found | numbers_in(passage.heading) if passage.heading else found


def strict_ungrounded(
    texts: Iterable[str], cited: Iterable[int], passages: Sequence[Passage]
) -> list[float]:
    """Figures in ``texts`` not stated in the **text** of a cited passage.

    :func:`ungrounded` without its two allowances. No small-integer exemption:
    "45%" and "12 ciclos" are measurements however small. No ``extra``: the
    student's topic or instruction names what to look for, it cannot be the
    source of a figure shown as a finding. And only the passage's text lends
    figures, not its labels — "Tabela 45" or "3.2 Ligas" is where a figure is,
    never a figure itself.
    """
    allowed: set[float] = set()
    for number in cited:
        allowed |= numbers_in(passages[number - 1].text)
    invented: set[float] = set()
    for text in texts:
        for readings in numeric_tokens(text):
            if not any(is_grounded(reading, allowed) for reading in readings):
                invented.add(min(readings, key=abs))
    return sorted(invented)


#: Stands in for every written numeral when a value and a passage are compared
#: for their unit: "210 GPa" and "7 850 kg/m³" become "# GPa" and "# kg/m³".
_FIGURE = "#"
#: Any run of spaces — NBSP and the narrow ones included, which ``\s`` covers.
_SPACES = re.compile(r"\s+")
#: The ways a source writes the degree sign, read as one: the masculine ordinal
#: "º" that pt-BR keyboards type, the spacing ring "˚" and the one-glyph "℃"/"℉".
_DEGREES = str.maketrans({"º": "°", "˚": "°", "℃": "°C", "℉": "°F"})
#: Neither side of a unit may run on into a letter: "Pa" is not in "GPa".
_NOT_AFTER_LETTER = r"(?<![^\W\d_])"
_NOT_BEFORE_LETTER = r"(?![^\W\d_])"


def _unit_shape(text: str) -> str:
    """Numerals replaced by :data:`_FIGURE`, degree signs made one, spaces made
    one. Case is kept: it is the SI prefix — "mPa" is milli, "MPa" mega."""
    return _SPACES.sub(" ", _NUMBER_TOKEN.sub(_FIGURE, text.translate(_DEGREES))).strip()


def value_unit(value: str) -> str:
    """What a value writes besides its figures — its unit and signs — or ``""``.

    Spaces are dropped, so the result is a shape to look for, not to show:
    ``"210 GPa"`` → ``"#GPa"``; ``"45 %"`` → ``"#%"``; ``"1.200"`` → ``""``.
    """
    shape = _unit_shape(value).replace(" ", "")
    return shape if shape.strip(_FIGURE) else ""


def foreign_unit(value: str, cited: Iterable[int], passages: Sequence[Passage]) -> bool:
    """True when ``value``'s unit is written in none of the passages it cites.

    The comparison is by shape: numerals stand in for any figure (whether the
    figure itself is there is :func:`strict_ungrounded`'s question), a space —
    NBSP included — may or may not separate any two characters ("210GPa",
    "210 GPa"), "ºC" reads as "°C", and the unit may not run on into a letter on
    either side — "#Pa" is not found in "# GPa", nor "#m" in "# mm". Letters are
    compared exactly, because case is the SI prefix: "210 mPa" is not
    "210 MPa". Everything besides the figures counts: "≈ 45%" asks for the "≈"
    too, because the model was told to copy value and unit exactly.
    """
    unit = value_unit(value)
    if not unit:
        return False
    pattern = re.compile(
        _NOT_AFTER_LETTER + " ?".join(re.escape(char) for char in unit) + _NOT_BEFORE_LETTER
    )
    return not any(pattern.search(_unit_shape(passages[n - 1].text)) for n in cited)


def format_figures(values: Iterable[float]) -> list[str]:
    """Figures as the text writes them, for a message that names them."""
    return [app_sources.format_number(value) for value in values]
