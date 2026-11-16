"""The laudo's tokens are the interface's light-theme tokens (D-241, D-28)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.exporters.laudo_theme import TOKENS, css_custom_properties

GLOBALS = Path(__file__).resolve().parents[3] / "web" / "app" / "globals.css"


def _light_root() -> dict[str, str]:
    """The first ``:root`` block of globals.css, as name → hex."""
    text = GLOBALS.read_text(encoding="utf-8")
    start = text.index(":root")
    block = text[start : text.index("}", start)]
    values = {}
    for name, r, g, b in re.findall(r"--([a-z0-9-]+):\s*(\d+) (\d+) (\d+);", block):
        values[name] = f"#{int(r):02x}{int(g):02x}{int(b):02x}"
    return values


@pytest.mark.skipif(not GLOBALS.exists(), reason="checkout sem apps/web")
def test_every_token_matches_globals_css() -> None:
    root = _light_root()
    drift = {
        name: (hex_, root.get(name)) for name, hex_ in TOKENS.items() if root.get(name) != hex_
    }
    assert not drift, f"tokens do laudo fora de globals.css: {drift}"


def test_the_stylesheet_exposes_every_token() -> None:
    css = css_custom_properties()
    for name, value in TOKENS.items():
        assert f"--{name}:{value};" in css
