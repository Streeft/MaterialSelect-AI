"""Rendering a :class:`~app.exporters.report.Report` as printable HTML.

CSV and XLSX are formats for spreadsheets. What gets attached to a monograph is
a document someone reads, and the browser's "print to PDF" turns this file into
exactly that — which is why the project takes on no heavyweight PDF dependency
to get one.

The document is deliberately **self-contained**: styles inline, no scripts, no
external requests. An auditable report has to still open, unchanged, on a
machine that has never heard of this system — offline, years from now, from an
email attachment.

Escaping here is **not** the spreadsheet's escaping, and the difference matters.
:func:`app.exporters.cells.safe_text` prefixes an apostrophe to anything a
spreadsheet would execute; in HTML a leading ``=`` is inert, so that apostrophe
would be a visible corruption of the exported data. What is dangerous *here* is
markup: a material named ``<script>…`` reaches this renderer the same way it
reaches the spreadsheet one. So every value goes through :func:`html.escape`
instead, and the router serves the page under a ``default-src 'none'`` policy so
that a mistake in this module still cannot execute anything.

There is no "generated at" timestamp, on purpose. The report re-runs the
deterministic pipeline, so the same catalogue must produce the same bytes; a
clock reading would break that for no audit value the reproducibility notice
does not already carry.
"""

from __future__ import annotations

from html import escape

from app.exporters.cells import format_number
from app.exporters.report import DEMO_DATA_NOTICE, Report, Sheet

# Kept inline: the report must render identically with no network access.
_STYLES = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  line-height: 1.5;
  color: #0f172a;
  background: #f1f5f9;
  margin: 0;
  padding: 2rem 1rem;
}
main {
  max-width: 62rem;
  margin: 0 auto;
  padding: 2.5rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 0.35rem; }
.subtitle { margin: 0 0 1.75rem; color: #475569; }
.notices {
  margin: 0 0 2.5rem;
  padding: 0.9rem 1.1rem;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #475569;
}
.notice { margin: 0.45rem 0; font-size: 0.875rem; color: #334155; }
.notice-demo { font-weight: 700; color: #9a3412; border-left-color: #ea580c; }
section { margin: 0 0 2.75rem; }
h2 {
  font-size: 1.05rem;
  margin: 0 0 0.5rem;
  padding-bottom: 0.3rem;
  border-bottom: 2px solid #e2e8f0;
}
.note { margin: 0.35rem 0; font-size: 0.8rem; color: #475569; }
.empty { margin: 0.5rem 0; font-size: 0.85rem; font-style: italic; color: #64748b; }
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
th, td {
  border: 1px solid #cbd5e1;
  padding: 0.35rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
th { background: #f1f5f9; font-weight: 600; }
tbody tr:nth-child(even) { background: #f8fafc; }
footer {
  margin-top: 3rem;
  padding-top: 0.85rem;
  border-top: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #64748b;
}

@page { margin: 18mm 14mm; }

@media print {
  body { background: #ffffff; padding: 0; font-size: 10pt; }
  main { max-width: none; padding: 0; border: none; border-radius: 0; }
  .table-scroll { overflow-x: visible; }
  /* A heading stranded at the foot of a page, and a row split across two,
     are the two ways a printed table stops being readable. */
  h2 { break-after: avoid; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .notices { break-inside: avoid; }
}
"""


def _text(value: object) -> str:
    """Render one cell value as escaped, human-readable text.

    ``None`` becomes the word "ausente" rather than an empty cell: a blank in a
    table of numbers reads as zero, which is the one reading the methodology
    refuses.
    """
    if isinstance(value, bool):
        # bool is a subclass of int, so this has to come first.
        return escape("sim" if value else "não")
    if value is None:
        return escape(format_number(None))
    if isinstance(value, (int, float)):
        return escape(format_number(float(value)))
    return escape(str(value))


def _render_sheet(sheet: Sheet, position: int) -> str:
    """One report section: a numbered heading, its notes, and its table.

    Sections are numbered so a reader can cite "section 4" of a printed report
    without page numbers, which the browser controls and we do not.
    """
    parts = [
        "<section>",
        f"<h2>{position}. {escape(sheet.name)}</h2>",
    ]
    parts += [f'<p class="note">{escape(note)}</p>' for note in sheet.notes]

    if sheet.rows:
        parts.append('<div class="table-scroll"><table>')
        if sheet.header:
            head = "".join(f"<th>{escape(column)}</th>" for column in sheet.header)
            parts.append(f"<thead><tr>{head}</tr></thead>")
        parts.append("<tbody>")
        for row in sheet.rows:
            cells = "".join(f"<td>{_text(value)}</td>" for value in row)
            parts.append(f"<tr>{cells}</tr>")
        parts.append("</tbody></table></div>")
    elif not sheet.notes:
        parts.append('<p class="empty">Nenhum registro nesta seção.</p>')

    parts.append("</section>")
    return "".join(parts)


def to_html(report: Report) -> str:
    """Render the whole report as one standalone HTML document."""
    notices = []
    for notice in report.notices:
        # The demo warning is the one a reader who skims must not miss.
        css = "notice notice-demo" if notice == DEMO_DATA_NOTICE else "notice"
        notices.append(f'<p class="{css}">{escape(notice)}</p>')

    sections = [_render_sheet(sheet, i) for i, sheet in enumerate(report.sheets, start=1)]

    subtitle = f'<p class="subtitle">{escape(report.subtitle)}</p>' if report.subtitle else ""

    return (
        "<!doctype html>"
        '<html lang="pt-BR">'
        "<head>"
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(report.title)}</title>"
        f"<style>{_STYLES}</style>"
        "</head>"
        "<body><main>"
        f"<h1>{escape(report.title)}</h1>"
        f"{subtitle}"
        f'<div class="notices">{"".join(notices)}</div>'
        f"{''.join(sections)}"
        "<footer>Gerado por MaterialSelect AI — "
        "seleção de materiais pela metodologia de Ashby, "
        "com cálculo determinístico e proveniência rastreável.</footer>"
        "</main></body></html>"
    )
