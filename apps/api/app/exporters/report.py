"""The selection report: a computed study rendered as auditable tables.

The report is the artefact the methodology stands or falls on. Anyone holding
it must be able to answer, without the system: which materials were considered,
which constraint removed which of them, what the index was and in what unit,
how each candidate scored and why, who was excluded for missing data, and where
every number originally came from.

Two rules are structural rather than editorial:

* **Every export carries the limitation notice.** The proposal commits to it in
  item 5 — the tool supports teaching and preliminary screening, and does not
  replace experimental validation. A report that travels without that sentence
  can be read as an engineering conclusion, which it is not.
* **Missing data stays missing.** Never a blank cell that reads as zero.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Shown on every export, without exception. Item 5 of the proposal.
LIMITATION_NOTICE = (
    "Esta ferramenta destina-se a apoio didático e à triagem preliminar de "
    "candidatos. Não substitui validação experimental, análise estrutural "
    "detalhada nem julgamento de engenharia."
)

DEMO_DATA_NOTICE = (
    "ATENÇÃO: este relatório inclui materiais marcados como demonstrativos, "
    "cujos valores são fictícios. Não utilizar em projetos reais."
)

REPRODUCIBILITY_NOTICE = (
    "Todos os números deste relatório foram calculados de forma determinística "
    "no backend a partir dos valores cadastrados. Reexecutar o estudo com o "
    "mesmo catálogo reproduz exatamente estes resultados."
)


@dataclass
class Sheet:
    """One titled table. ``header`` is written above ``rows`` when present."""

    name: str
    header: list[str]
    rows: list[list[object]] = field(default_factory=list)
    #: Free-text lines written above the table (context, notices, empty-state).
    notes: list[str] = field(default_factory=list)


@dataclass
class Report:
    """A complete export: a title, the mandatory notices, and its tables.

    ``responsible``, ``figure`` and ``narrative*`` are optional and used only
    by the engineering-report (laudo) renderer in ``exporters/html.py``; the
    CSV and XLSX renderers read only ``sheets`` and ignore them, so a plain
    selection report is unaffected by their presence.
    """

    title: str
    subtitle: str
    notices: list[str]
    sheets: list[Sheet]
    #: The engineer who requested the laudo, declared free text — never
    #: computed, never validated against anything.
    responsible: str | None = None
    #: Raw SVG markup from ``app.exporters.figures``, already escaped
    #: internally by that module — embedded as-is, not re-escaped here.
    figure: str | None = None
    #: AI-authored paragraphs about this same computed result. ``None`` means
    #: no narrative was produced (the layer is off, or the response was
    #: discarded) — ``narrative_note`` then says why, so the absence is
    #: declared rather than silent.
    narrative: list[str] | None = None
    narrative_caveats: list[str] | None = None
    narrative_note: str | None = None

    def sheet(self, name: str) -> Sheet | None:
        """Return a sheet by name, or None."""
        return next((s for s in self.sheets if s.name == name), None)


def standard_notices(*, includes_demo_data: bool) -> list[str]:
    """The notices every export carries, in the order they must be read.

    The demo warning comes first when it applies: a reader who stops after one
    line should stop on the one that says the numbers are fictitious.
    """
    notices = [LIMITATION_NOTICE, REPRODUCIBILITY_NOTICE]
    if includes_demo_data:
        notices.insert(0, DEMO_DATA_NOTICE)
    return notices
