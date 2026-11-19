"""Hygiene for free text typed into a name or a description (D-245, residue of D-177).

The exports already drop what XML cannot carry on the way out
(``app.exporters.xml_text``), so a stray control character no longer breaks a
file. This is the same rule on the way **in**: a NUL, a vertical tab or a lone
surrogate pasted from a spreadsheet never reaches the database, so it cannot
surprise a reader that is not an exporter (a search, a CSV opened by hand, a
log line). TAB, LF and CR stay — a description may have line breaks — and
nothing visible is altered.
"""

from __future__ import annotations

import re

#: C0 controls other than TAB/LF/CR, DEL, lone surrogates and U+FFFE/U+FFFF.
_CONTROL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff￾￿]")


def strip_controls(value: object) -> object:
    """``value`` without control characters when it is text; anything else untouched.

    Meant for a ``mode="before"`` validator, so a wrong type still reaches
    Pydantic's own error, and a name made only of controls becomes empty and
    fails ``min_length`` instead of being stored blank.
    """
    if isinstance(value, str):
        return _CONTROL.sub("", value)
    return value
