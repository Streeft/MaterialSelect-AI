"""D-245: the three private copies of the XML-illegal regex now share ``xml_text``."""

from __future__ import annotations

import pytest

from app.exporters import studio, studio_pptx
from app.exporters.cae import matml
from app.exporters.xml_text import xml_legal

DIRTY = "Aço\x0b1020\x00 liga\ud800￾ fim"


def test_dropped_by_default_and_replaced_on_request() -> None:
    assert xml_legal(DIRTY) == "Aço1020 liga fim"
    assert xml_legal("a\x0bb", " ") == "a b"
    assert xml_legal("tab\tlf\ncr\r") == "tab\tlf\ncr\r"  # the three legal controls stay


@pytest.mark.parametrize(
    ("render", "expected"),
    [
        (studio._xml, "Aço 1020  liga   fim"),
        (studio_pptx._clean, "Aço1020 liga fim"),
        (matml._text, "Aço 1020 liga fim"),
    ],
)
def test_each_renderer_keeps_its_own_substitution(render, expected) -> None:
    # Studio and MatML keep the words apart with a space (MatML also collapses
    # runs of blanks); the slides drop the
    # character. A lone surrogate, which two of the old copies missed, goes too.
    assert render(DIRTY) == expected
