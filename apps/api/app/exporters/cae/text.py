"""Text helpers shared by the solver decks: comments, names and numbers.

The escape is **per format and not interchangeable**, the same rule the rest of
``exporters/`` follows. A solver deck is not markup: what can hurt it is a line
break (which turns the rest of a material name into a command the solver
executes), a separator its parser reads (``,`` and ``=`` on an Abaqus keyword
line, ``$`` between MAPDL commands, ``$``/``*`` at the start of an LS-DYNA
card) and a column count (fixed-field Nastran and LS-DYNA). MatML is XML and is
escaped as XML, in its own module.

Comments are folded to ASCII. Solver decks are read column by column, and a
multi-byte character in a comment shifts what a fixed-field reader sees on
that line; Portuguese without accents stays readable.
"""

from __future__ import annotations

import re
import textwrap
import unicodedata

_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f  ]+")
_SPACES = re.compile(r"\s+")
_NOT_LABEL = re.compile(r"[^A-Za-z0-9_-]+")


def single_line(text: str) -> str:
    """Collapse every control character (line breaks included) into a space."""
    return _SPACES.sub(" ", _CONTROL.sub(" ", text)).strip()


def ascii_fold(text: str) -> str:
    """Single-line ASCII: accents dropped, symbols with no ASCII form removed."""
    folded = unicodedata.normalize("NFKD", single_line(text))
    return single_line(folded.encode("ascii", "ignore").decode("ascii"))


def solver_label(name: str, max_length: int) -> str:
    """A material name a solver keyword line can carry: letters, digits, ``_``, ``-``.

    Starts with a letter (Abaqus requires it) and never exceeds the format's
    limit. Nothing a parser reads as a separator survives.
    """
    label = _NOT_LABEL.sub("_", ascii_fold(name)).strip("_-")
    label = re.sub(r"_+", "_", label)
    if not label or not label[0].isalpha():
        label = f"M_{label}" if label else "MATERIAL"
    return label[:max_length].rstrip("_-") or "MATERIAL"


def comment_block(prefix: str, lines: list[str], width: int = 80) -> list[str]:
    """Wrap free text into comment lines that never exceed ``width`` columns.

    ``prefix`` is the format's comment marker followed by a space. An empty
    string in ``lines`` becomes a bare marker line (a visual separator).
    """
    available = width - len(prefix)
    out: list[str] = []
    for line in lines:
        text = ascii_fold(line)
        if not text:
            out.append(prefix.rstrip())
            continue
        for piece in textwrap.wrap(
            text, width=available, break_long_words=True, break_on_hyphens=False
        ):
            out.append(f"{prefix}{piece}")
    return out


def real(value: float, significant: int = 12) -> str:
    """A real number for a free-format deck, always with a decimal point.

    Twelve significant digits, like ``cells.format_number``: enough to absorb
    the residue of a unit conversion, never a claim of precision the
    measurement did not have. The point matters: Nastran and Abaqus read
    ``7850`` as an integer field.
    """
    text = f"{value:.{significant}G}"
    mantissa, sep, exponent = text.partition("E")
    if "." not in mantissa:
        mantissa += "."
    return f"{mantissa}{sep}{exponent}"


def fixed_real(value: float, width: int) -> str:
    """The most precise :func:`real` of ``value`` that fits ``width`` columns.

    Fixed-field cards (Nastran large field: 16 columns; LS-DYNA: 10) cap the
    digits a number can carry. The full value is always written in the
    comment table above the card, so rounding to fit is declared, not hidden.
    """
    for significant in range(12, 0, -1):
        text = real(value, significant)
        if len(text) <= width:
            return text
    raise ValueError(f"valor {value!r} não cabe em {width} colunas")  # pragma: no cover
