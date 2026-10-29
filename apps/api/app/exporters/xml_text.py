"""Removing the characters XML 1.0 cannot hold, for every Report renderer (D-177).

XLSX, DOCX and PPTX are XML inside a zip. XML 1.0 forbids the C0 controls
other than TAB, LF and CR, the lone surrogates and U+FFFE/U+FFFF; openpyxl
raises ``IllegalCharacterError`` on one, python-docx raises ``ValueError``, and
python-pptx writes ``_x0001_`` into the slide. A single material renamed
``"Aço\\x0b1020"`` in the shared catalogue was enough to turn
``/exports/catalogo.xlsx`` into a 500 for every user.

This is not one of the per-format escapes (``cells.py``'s apostrophe,
``html.escape``) and does not replace them: those neutralise *meaning* —
a formula, a tag — and stay as they are. This only drops bytes no XML reader
can accept and no reader of the document could see, so nothing visible is
altered. The stored value is untouched: the strip happens on the way out.
"""

from __future__ import annotations

import re
from dataclasses import replace

from app.exporters.report import Report, Sheet

#: Not allowed anywhere in an XML 1.0 document. TAB, LF and CR are kept.
XML_ILLEGAL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff￾￿]")


def xml_legal(text: str) -> str:
    """``text`` without the characters XML 1.0 forbids."""
    return XML_ILLEGAL.sub("", text)


def _value(value: object) -> object:
    return xml_legal(value) if isinstance(value, str) else value


def _optional(text: str | None) -> str | None:
    return None if text is None else xml_legal(text)


def _lines(lines: list[str] | None) -> list[str] | None:
    return None if lines is None else [xml_legal(line) for line in lines]


def xml_legal_report(report: Report) -> Report:
    """A copy of ``report`` whose every string is XML-legal; numbers untouched."""
    sheets = [
        Sheet(
            name=xml_legal(sheet.name),
            header=[xml_legal(column) for column in sheet.header],
            rows=[[_value(value) for value in row] for row in sheet.rows],
            notes=[xml_legal(note) for note in sheet.notes],
        )
        for sheet in report.sheets
    ]
    return replace(
        report,
        title=xml_legal(report.title),
        subtitle=xml_legal(report.subtitle),
        notices=[xml_legal(notice) for notice in report.notices],
        sheets=sheets,
        responsible=_optional(report.responsible),
        figures=[xml_legal(figure) for figure in report.figures],
        narrative=_lines(report.narrative),
        narrative_caveats=_lines(report.narrative_caveats),
        narrative_note=_optional(report.narrative_note),
    )
