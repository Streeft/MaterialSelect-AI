"""Composition and designations as text, for every export (D-105, TM2-d).

One module so a spreadsheet, an HTML report and a CAE card write the same
sentence for the same row. It holds **no** escaping: ``cells.py`` neutralises a
formula for spreadsheets, ``html.escape`` neutralises markup, and the CAE
renderers fold to ASCII or escape as XML. Each renderer applies its own; none
of that is repeated here (CLAUDE.md, escape per format).

Rules carried from D-105:

* No composition row is "sem composição cadastrada", never 0 % of anything.
* The balance is declared by the source, never ``100 - sum``.
* A bound the source did not write is not written either: ``C <= 0.08`` has no
  minimum, and that is not 0.
* A row the source declared absent says so.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.exporters.cells import format_number
from app.exporters.report import Sheet

NO_COMPOSITION = "sem composição cadastrada"
NO_DESIGNATION = "sem designação cadastrada"
BALANCE_TEXT = "resto (declarado pela fonte, não calculado)"
ABSENT_TEXT = "ausente (declarado pela fonte)"
LE = "≤"
GE = "≥"


@dataclass(frozen=True)
class CompositionLine:
    """One element row, in mass percent (the canonical unit)."""

    element: str
    #: ``faixa``, ``resto`` or ``ausente`` — the states of ``CompositionEntryOut``.
    state: str
    minimum: float | None
    maximum: float | None
    nominal: float | None
    data_quality: str
    source_label: str
    citation: str | None = None
    is_demo: bool = False


@dataclass(frozen=True)
class DesignationLine:
    system_label: str
    code: str
    region: str | None
    source_label: str
    citation: str | None = None
    is_demo: bool = False


def content_text(line: CompositionLine, *, ascii_only: bool = False) -> str:
    """The content of one element in mass percent, as the source stated it."""
    if line.state == "resto":
        return BALANCE_TEXT
    if line.state == "ausente":
        return ABSENT_TEXT
    le, ge = ("<=", ">=") if ascii_only else (LE, GE)
    lo, hi, nom = line.minimum, line.maximum, line.nominal
    if lo is not None and hi is not None:
        text = format_number(lo) if lo == hi else f"{format_number(lo)} a {format_number(hi)}"
    elif hi is not None:
        text = f"{le} {format_number(hi)}"
    elif lo is not None:
        text = f"{ge} {format_number(lo)}"
    else:
        assert nom is not None  # CHECK ck_material_composition_has_number
        return f"nominal {format_number(nom)} %"
    if nom is not None and not (lo is not None and lo == hi):
        text += f"; nominal {format_number(nom)}"
    return f"{text} %"


def composition_summary(lines: Sequence[CompositionLine], *, ascii_only: bool = False) -> str:
    """One line (``ascii_only`` for solver decks, which fold ``≤`` away): ``Fe resto (...); Cr 16 a 18 %``; or the written absence."""
    if not lines:
        return NO_COMPOSITION
    return "; ".join(
        f"{line.element} {content_text(line, ascii_only=ascii_only)}" for line in lines
    )


def designation_summary(lines: Sequence[DesignationLine]) -> str:
    if not lines:
        return NO_DESIGNATION
    out = []
    for line in lines:
        region = f" ({line.region})" if line.region else ""
        out.append(f"{line.system_label} {line.code}{region}")
    return "; ".join(out)


def composition_sheet(
    items: Sequence[tuple[str, Sequence[CompositionLine]]],
) -> Sheet:
    """A material with no row still appears, with the absence written."""
    rows: list[list[object]] = []
    for name, lines in items:
        if not lines:
            rows.append([name, "—", NO_COMPOSITION, "—", "—", "—", "—"])
            continue
        for line in lines:
            rows.append(
                [
                    name,
                    line.element,
                    content_text(line),
                    line.data_quality,
                    line.source_label + (" (demonstrativa)" if line.is_demo else ""),
                    line.citation or "—",
                    line.is_demo,
                ]
            )
    return Sheet(
        name="Composição",
        header=[
            "Material",
            "Elemento",
            "Teor (% em massa)",
            "Qualidade do dado",
            "Fonte",
            "Citação",
            "Demonstrativo",
        ],
        rows=rows,
        notes=[
            "Teor em % em massa, como a fonte o declarou (faixa, limite, nominal). "
            "'resto' é declarado pela fonte, nunca calculado como 100 menos a soma. "
            "Elemento que a composição não lista é desconhecido, não 0 %. "
            "Material sem composição aparece como 'sem composição cadastrada'."
        ],
    )


def designation_sheet(
    items: Sequence[tuple[str, Sequence[DesignationLine]]],
) -> Sheet:
    rows: list[list[object]] = []
    for name, lines in items:
        if not lines:
            rows.append([name, "—", NO_DESIGNATION, "—", "—", "—", "—"])
            continue
        for line in lines:
            rows.append(
                [
                    name,
                    line.system_label,
                    line.code,
                    line.region or "—",
                    line.source_label + (" (demonstrativa)" if line.is_demo else ""),
                    line.citation or "—",
                    line.is_demo,
                ]
            )
    return Sheet(
        name="Designações",
        header=[
            "Material",
            "Sistema",
            "Código",
            "Região",
            "Fonte",
            "Citação",
            "Demonstrativo",
        ],
        rows=rows,
        notes=[
            "Designação pertence a um único registro: dois materiais com o mesmo "
            "código não são declarados o mesmo material."
        ],
    )
