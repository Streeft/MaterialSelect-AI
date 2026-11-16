"""The printed laudo's design tokens: colour, type and number format (D-241).

The interface keeps every colour in ``apps/web/app/globals.css`` as an
``R G B`` triple (D-28). A printed document has no ``:root`` to read those
from, so this module carries the **light-theme values of the same tokens**,
written as hexes, under the same names. ``html.py`` (the laudo's stylesheet)
and ``figures.py`` (the SVG charts) both read from here, so the page and its
figures cannot disagree — the same promise D-28 makes on screen.

``app/tests/test_laudo_theme.py`` parses ``globals.css`` and fails when a value
here drifts from the token it copies. Change the token there first, then here.

Three rules that are not taste:

* **Ink on white.** Only the light theme is copied: a laudo is printed, and a
  dark page wastes toner and photocopies as a black rectangle.
* **Colour is never alone.** Every status colour below has a word and a glyph
  next to it wherever it is used (``STATUS``); a monochrome print loses the hue
  and keeps the meaning.
* **Okabe–Ito for series.** Materials compared side by side use the CVD-safe
  palette the interface uses for classes (``lib/design/palette.ts``), minus the
  yellow, which has no contrast on white paper.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

# --- Colour tokens (light theme of globals.css) -----------------------------

#: name in globals.css → hex. The names are the CSS custom properties without
#: the leading ``--``.
TOKENS: dict[str, str] = {
    "surface": "#f1ede5",
    "surface-raised": "#ffffff",
    "surface-sunken": "#ebe7df",
    "edge": "#ccc6bb",
    "edge-subtle": "#ddd8ce",
    "edge-strong": "#a6a094",
    "edge-control": "#585e6c",
    "ink": "#171a21",
    "ink-muted": "#4a5162",
    "ink-subtle": "#5c6372",
    "brand-50": "#eaf4ff",
    "brand-100": "#d8e9ff",
    "brand-200": "#c0d8ff",
    "brand-300": "#a4c5ff",
    "brand-500": "#5a84d4",
    "brand-600": "#4972c0",
    "brand-700": "#2c4f94",
    "brand-800": "#234077",
    "brand-900": "#162c55",
    "accent": "#4567a8",
    "success": "#188038",
    "success-soft": "#e6f4ea",
    "success-fg": "#137333",
    "warning": "#e8710a",
    "warning-soft": "#feefe3",
    "warning-fg": "#8a4c0c",
    "danger": "#d93025",
    "danger-soft": "#fce8e6",
    "danger-fg": "#a50e0e",
    "info": "#0c7a94",
    "info-soft": "#dbf5fa",
    "info-fg": "#0d6378",
    "quality-ausente": "#5f6368",
    "quality-ausente-soft": "#f1f3f4",
    "diverge-pos": "#0072b2",
    "diverge-neg": "#d55e00",
}

#: Okabe–Ito without the yellow (#F0E442 reads 1,3:1 on white).
SERIES: tuple[str, ...] = (
    "#0072b2",
    "#e69f00",
    "#009e73",
    "#cc79a7",
    "#d55e00",
    "#56b4e9",
)
#: A dash per series, so a monochrome print still tells two curves apart.
SERIES_DASH: tuple[str, ...] = ("", "6 4", "2 3", "8 3 2 3", "10 4", "4 2")


def token(name: str) -> str:
    """The hex of one token; a typo is a ``KeyError``, never a silent black."""
    return TOKENS[name]


def series_colour(position: int) -> str:
    return SERIES[position % len(SERIES)]


def series_dash(position: int) -> str:
    return SERIES_DASH[position % len(SERIES_DASH)]


# --- Status (the traffic light) ---------------------------------------------


@dataclass(frozen=True)
class Status:
    """One state of the traffic light: colour, soft ground, glyph and word."""

    key: str
    word: str
    glyph: str
    colour: str
    soft: str
    ink: str


#: The four states. ``na`` is grey and says "não avaliado": an unevaluated item
#: is neither a pass nor a failure, and drawing it red would accuse the
#: material of what the study simply did not ask.
STATUS: dict[str, Status] = {
    "ok": Status("ok", "Atende", "✓", token("success"), token("success-soft"), token("success-fg")),
    "warn": Status(
        "warn", "Atenção", "!", token("warning"), token("warning-soft"), token("warning-fg")
    ),
    "fail": Status(
        "fail", "Não atende", "✕", token("danger"), token("danger-soft"), token("danger-fg")
    ),
    "na": Status(
        "na",
        "Não avaliado",
        "–",
        token("quality-ausente"),
        token("quality-ausente-soft"),
        token("ink-muted"),
    ),
}


# --- Typography -------------------------------------------------------------

#: The interface's family first (Public Sans, D-23), then system faces: the
#: document makes no network request, so the first one installed wins.
FONT_SANS = 'Public Sans, ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif'
FONT_MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'

#: Type scale in points, for print. Role names follow the interface's
#: ``text-*`` roles (D-91) so a reader of both finds the same hierarchy.
TYPE_SCALE: dict[str, float] = {
    "display": 26.0,
    "title": 17.0,
    "heading": 12.5,
    "body": 9.5,
    "support": 8.5,
    "caption": 7.5,
}


def css_custom_properties() -> str:
    """The tokens as a ``:root`` block, for the laudo's inline stylesheet."""
    colours = "".join(f"--{name}:{value};" for name, value in TOKENS.items())
    series = "".join(f"--series-{i}:{value};" for i, value in enumerate(SERIES))
    sizes = "".join(f"--fs-{role}:{size}pt;" for role, size in TYPE_SCALE.items())
    return f":root{{{colours}{series}{sizes}--font-sans:{FONT_SANS};--font-mono:{FONT_MONO};}}"


# --- Numbers ----------------------------------------------------------------

#: Three significant digits: what a summary card needs, and no more precision
#: than the catalogue's values usually carry (the annex keeps ``format_number``).
SUMMARY_DIGITS = 3


def format_br(
    value: float | None, *, digits: int = SUMMARY_DIGITS, missing: str = "ausente"
) -> str:
    """A number in the pt-BR convention (D-30): ``1.234,5``, ``0,0123``.

    ``None`` is the word ``missing``, never ``0`` (principle 3). Very large or
    very small magnitudes go to ``× 10ⁿ`` instead of a row of zeros.
    """
    if value is None or not isfinite(value):
        return missing
    if value == 0:
        return "0"
    magnitude = abs(value)
    if magnitude >= 1e7 or magnitude < 1e-3:
        mantissa, exponent = f"{value:.{max(digits - 1, 0)}e}".split("e")
        return f"{mantissa.replace('.', ',')} × 10{_superscript(int(exponent))}"
    if magnitude >= 10 ** (digits - 1):
        # Whole numbers keep every integer digit: "1.235", never "1.230".
        text = f"{round(value):,}"
    else:
        # Below that, ``digits`` significant digits; zeros right after the
        # comma are not significant ("0,0123").
        integer_digits = len(str(int(magnitude))) if magnitude >= 1 else 0
        leading_zeros = 0
        probe = magnitude
        while probe < 0.1:
            probe *= 10
            leading_zeros += 1
        decimals = digits - integer_digits + leading_zeros
        text = f"{value:,.{decimals}f}"
        if "." in text:
            text = text.rstrip("0").rstrip(".")
    return text.replace(",", "\u0000").replace(".", ",").replace("\u0000", ".")


_SUPERSCRIPTS = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")


def _superscript(exponent: int) -> str:
    return str(exponent).translate(_SUPERSCRIPTS)
