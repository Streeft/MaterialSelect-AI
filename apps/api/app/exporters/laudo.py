"""The engineering report (laudo) as a printable A4 document (D-241, revising D-41).

D-41 assembled the laudo out of the selection report's tables. It answered an
auditor; the person who actually receives a laudo is a client, who wants the
answer on the first page and the evidence behind it. So the document now reads
in that order: a cover, an **executive summary** (the recommended material, a
handful of key numbers, a traffic light of requirements, the ranking at a
glance and the reasons in short sentences), one section per tool that had data
— comparison, cost, environmental impact, fabrication — the AI's short
interpretation, the signature block, and only then the **technical annex**: the
same audit tables as before, every one of them, untouched.

The rules of ``html.py`` all hold here, and for the same reasons: self-contained
(inline styles, no script, no request), every string escaped with
``html.escape``, served under ``default-src 'none'``, and the figures are this
project's own SVG (``figures.py``), embedded as trusted markup.

What is new is the **seal**. An issued laudo is frozen (``IssuedReport``); its
verification code is the SHA-256 of the rendered document *with its seal slots
empty* — the code cannot be inside what it hashes. ``SEAL_OPEN``/``SEAL_CLOSE``
delimit those slots, :func:`laudo_digest` empties them and hashes, and anyone
holding the stored HTML can recompute the code.

A preview (not issued) has no seal and carries the watermark
"RASCUNHO — não emitido" on every printed page.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from html import escape, unescape

from app.exporters.figures import Light
from app.exporters.html import render_sheet
from app.exporters.laudo_theme import FONT_SANS, STATUS, css_custom_properties, token
from app.exporters.report import Sheet
from app.exporters.xml_text import xml_legal

SEAL_OPEN = "<!--selo-->"
SEAL_CLOSE = "<!--/selo-->"
_SEAL_SLOT = re.compile(re.escape(SEAL_OPEN) + r".*?" + re.escape(SEAL_CLOSE), re.DOTALL)

DRAFT_MARK = "RASCUNHO — não emitido"

_MONTHS = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)


def long_date(value: date) -> str:
    """``16 de novembro de 2026`` — the way a signed document dates itself."""
    return f"{value.day} de {_MONTHS[value.month - 1]} de {value.year}"


# --- The document ------------------------------------------------------------


@dataclass(frozen=True)
class Engineer:
    """The declared signatory. Free text; the system validates none of it."""

    name: str | None = None
    title: str | None = None
    registration: str | None = None
    art: str | None = None
    city: str | None = None
    issue_date: date | None = None


@dataclass(frozen=True)
class KeyFigure:
    """One card of the summary: a label, a formatted value and its unit."""

    label: str
    value: str
    unit: str = ""
    hint: str = ""
    #: ``brand`` for the headline numbers, or a ``STATUS`` key.
    tone: str = "neutral"


@dataclass(frozen=True)
class ScopeItem:
    """One tool of the app and whether this laudo evaluated it."""

    label: str
    status: str
    detail: str = ""


@dataclass
class LaudoSection:
    """One section between the summary and the annex.

    ``unavailable`` set means the section was not evaluated, and says why; the
    section still prints its title and that sentence, because a reader who saw
    nothing would not know whether it was skipped or forgotten (D-41's rule for
    the AI section, extended to every tool).
    """

    key: str
    title: str
    lead: str = ""
    cards: list[KeyFigure] = field(default_factory=list)
    figures: list[str] = field(default_factory=list)
    #: Short lines under the figures (assumptions, premises, absences).
    notes: list[str] = field(default_factory=list)
    #: Labelled groups of chips — the compatible processes, by family.
    chips: list[tuple[str, list[str]]] = field(default_factory=list)
    table: Sheet | None = None
    unavailable: str | None = None
    #: Two figures side by side instead of stacked.
    paired: bool = False
    #: The small table before the figures (the finalists lead their comparison).
    table_first: bool = False


@dataclass
class Recommendation:
    name: str
    class_name: str | None = None
    #: "1º de 7 classificados por soma ponderada", "maior índice entre 12".
    standing: str = ""


@dataclass
class LaudoDocument:
    study_name: str
    description: str = ""
    client_name: str | None = None
    client_project: str | None = None
    engineer: Engineer = field(default_factory=Engineer)
    #: ``None`` when no material could be recommended; ``no_recommendation``
    #: then says why.
    recommendation: Recommendation | None = None
    no_recommendation: str | None = None
    key_figures: list[KeyFigure] = field(default_factory=list)
    why: list[str] = field(default_factory=list)
    traffic_light: str = ""
    #: The rows behind ``traffic_light``, so a format without SVG (the DOCX and the PPTX,
    #: D-243) can write them as a coloured table instead of a picture.
    lights: list[Light] = field(default_factory=list)
    donut: str = ""
    ranking_mini: str = ""
    scope: list[ScopeItem] = field(default_factory=list)
    sections: list[LaudoSection] = field(default_factory=list)
    narrative: list[str] | None = None
    narrative_caveats: list[str] | None = None
    narrative_note: str | None = None
    notices: list[str] = field(default_factory=list)
    annex: list[Sheet] = field(default_factory=list)
    #: The number this version will carry; ``None`` on a preview.
    version: int | None = None


@dataclass(frozen=True)
class Seal:
    """What only an issued laudo has: its code, version and QR to verify it."""

    version: int
    digest: str
    verify_url: str
    qr_svg: str
    issued_at: datetime

    @property
    def short_code(self) -> str:
        return short_code(self.digest)


def short_code(digest: str) -> str:
    """The code printed on paper: the first 12 hex digits, in groups of four."""
    head = digest[:12].upper()
    return "-".join(head[i : i + 4] for i in range(0, len(head), 4))


def laudo_digest(document: str) -> str:
    """SHA-256 of an issued laudo with its seal slots emptied.

    The same function hashes the document at issue time (when the slots are
    still empty) and verifies a stored one (when they are full), so the two
    can never be computed differently.
    """
    unsealed = _SEAL_SLOT.sub(SEAL_OPEN + SEAL_CLOSE, document)
    return hashlib.sha256(unsealed.encode("utf-8")).hexdigest()


def seal_document(document: str, seal: Seal) -> str:
    """Fill the empty seal slots of a rendered laudo, in order (cover, signature)."""
    fills = iter((_cover_seal(seal), _signature_seal(seal)))

    def fill(_match: re.Match[str]) -> str:
        return SEAL_OPEN + next(fills, "") + SEAL_CLOSE

    return _SEAL_SLOT.sub(fill, document)


_RECOMMENDED = re.compile(
    r'<div class="eyebrow">Material recomendado</div><div class="name">(.*?)</div>', re.S
)


def recommended_name(document: str) -> str | None:
    """The recommended material's name, read back out of a rendered laudo (D-242).

    The e-mail that carries an issued laudo summarises it in three lines, and the
    frozen HTML is the one place the issued version keeps its recommendation, so
    the reader lives beside the markup it reads (``_summary``). A laudo with no
    recommendation prints no ``name`` block there and answers ``None``.
    """
    found = _RECOMMENDED.search(document)
    if found is None:
        return None
    text = unescape(re.sub(r"<[^>]+>", "", found.group(1))).strip()
    return text or None


def signed_pdf_bar(href: str, short_hash: str, uploaded_at: datetime) -> str:
    """The strip a client sees above the laudo when a signed PDF exists (D-243).

    It is added **when the page is served**, never to the stored document: the frozen HTML
    and its digest stay exactly as issued, and a copy saved or printed from the link carries
    no bar (``@media print`` hides it). Inline styles only, because the page is served under
    ``default-src 'none'``; ``href`` is a path the server built from its own token.
    """
    style = (
        "display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;"
        f"padding:10px 16px;background:{token('brand-50')};color:{token('ink')};"
        f"border-bottom:1px solid {token('edge-subtle')};font-family:{FONT_SANS};font-size:14px"
    )
    button = (
        f"background:{token('brand-700')};color:#ffffff;text-decoration:none;"
        "font-weight:700;padding:6px 14px;border-radius:6px"
    )
    return (
        "<style>@media print{.signed-pdf-bar{display:none !important}}</style>"
        f'<div class="signed-pdf-bar" style="{_e(style)}">'
        "<span>Este laudo tem PDF assinado pelo engenheiro "
        f"(SHA-256 {_e(short_hash)}, enviado em {_e(uploaded_at.strftime('%d/%m/%Y'))}).</span>"
        f'<a href="{_e(href)}" style="{_e(button)}">Baixar PDF assinado</a></div>'
    )


def with_signed_pdf_bar(document: str, bar: str) -> str:
    """``document`` with ``bar`` right after its opening ``<body>``; unchanged if it has none."""
    marker = "<body>"
    position = document.find(marker)
    if position < 0:
        return document
    cut = position + len(marker)
    return document[:cut] + bar + document[cut:]


# --- Rendering ---------------------------------------------------------------


def _e(value: object) -> str:
    return escape(xml_legal(str(value)), quote=True)


def _css_string(value: str) -> str:
    """A CSS string literal for ``content:``, safe inside ``<style>``."""
    text = xml_legal(value)
    out = []
    for char in text:
        if char in '"\\' or char in "<>&" or ord(char) < 0x20:
            out.append(f"\\{ord(char):x} ")
        else:
            out.append(char)
    return '"' + "".join(out) + '"'


_STYLES = """
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--font-sans);
 font-size:var(--fs-body);line-height:1.5}
.sheet{width:210mm;max-width:100%;margin:12px auto;background:var(--surface-raised);
 border:1px solid var(--edge-subtle);padding:16mm 15mm}
.page{break-before:page}
h1,h2,h3{line-height:1.2;margin:0}
h2{font-size:var(--fs-title);color:var(--brand-900);margin:0 0 4mm;padding-bottom:2mm;
 border-bottom:2px solid var(--brand-200);break-after:avoid}
h2 .num{color:var(--brand-600);margin-right:2mm}
h3{font-size:var(--fs-heading);color:var(--ink);margin:5mm 0 2mm;break-after:avoid}
p{margin:0 0 2.5mm}
.muted{color:var(--ink-muted)}
.support{font-size:var(--fs-support);color:var(--ink-muted)}
.caption{font-size:var(--fs-caption);color:var(--ink-subtle)}
section{margin:0 0 9mm}
figure{margin:0 0 4mm;break-inside:avoid}
figure svg{display:block;width:100%;height:auto}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-items:start}
.pair-wide{display:grid;grid-template-columns:1.6fr 1fr;gap:5mm;align-items:start}
/* cover */
.cover{min-height:255mm;display:flex;flex-direction:column;padding:0;overflow:hidden}
.cover .cards{grid-template-columns:repeat(5,1fr);margin:0}
.cover .card .value{font-size:13pt}
.cover-band{background:var(--brand-900);color:var(--surface-raised);padding:16mm 15mm 12mm}
.eyebrow{font-size:var(--fs-support);letter-spacing:.14em;text-transform:uppercase;
 color:var(--brand-200);font-weight:600}
.cover-band h1{font-size:var(--fs-display);margin:5mm 0 3mm;color:var(--surface-raised)}
.cover-band .lead{color:var(--brand-100);font-size:11pt;max-width:150mm}
.cover-body{padding:10mm 15mm 0;flex:1;display:flex;flex-direction:column;gap:6mm}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:4mm 8mm}
.fact dt{font-size:var(--fs-caption);text-transform:uppercase;letter-spacing:.08em;
 color:var(--ink-subtle);font-weight:600}
.fact dd{margin:1mm 0 0;font-size:11pt;font-weight:600}
.fact dd.absent{font-weight:400;font-style:italic;color:var(--ink-subtle)}
.cover-hero{border:1px solid var(--brand-200);background:var(--brand-50);border-radius:4mm;
 padding:6mm 7mm}
.cover-hero .eyebrow{color:var(--brand-700)}
.cover-hero .name{font-size:20pt;font-weight:700;color:var(--brand-900);margin-top:2mm}
.cover-foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;
 gap:6mm;border-top:1px solid var(--edge-subtle);padding-top:5mm}
.badge{display:inline-block;border-radius:999px;padding:1mm 3.5mm;font-size:var(--fs-support);
 font-weight:700;border:1px solid}
.badge-draft{color:var(--danger-fg);background:var(--danger-soft);border-color:var(--danger)}
.badge-issued{color:var(--success-fg);background:var(--success-soft);border-color:var(--success)}
.code{font-family:var(--font-mono);letter-spacing:.06em}
/* summary */
.hero{display:flex;gap:6mm;align-items:center;background:var(--brand-900);color:var(--surface-raised);
 border-radius:4mm;padding:6mm 7mm;margin-bottom:5mm;break-inside:avoid}
.hero .eyebrow{color:var(--brand-200)}
.hero .name{font-size:19pt;font-weight:700;line-height:1.15;margin:1mm 0}
.hero .standing{color:var(--brand-100);font-size:var(--fs-support)}
.hero-mark{flex:none;width:16mm;height:16mm;border-radius:50%;background:var(--brand-600);
 display:flex;align-items:center;justify-content:center;font-size:18pt;font-weight:700}
.hero.none{background:var(--quality-ausente-soft);color:var(--ink);border:1px solid var(--edge)}
.hero.none .eyebrow{color:var(--ink-subtle)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(34mm,1fr));gap:3mm;
 margin-bottom:5mm}
.card{border:1px solid var(--edge-subtle);border-top:3px solid var(--brand-500);
 border-radius:2.5mm;padding:3mm 3.5mm;background:var(--surface-raised);break-inside:avoid}
.card .label{font-size:var(--fs-caption);text-transform:uppercase;letter-spacing:.06em;
 color:var(--ink-muted);font-weight:600}
.card .value{font-size:16pt;font-weight:700;color:var(--ink);line-height:1.15;margin-top:1.5mm}
.card .unit{font-size:var(--fs-support);font-weight:600;color:var(--ink-muted);margin-left:1mm}
.card .hint{font-size:var(--fs-caption);color:var(--ink-subtle);margin-top:1mm}
.card.tone-brand{border-top-color:var(--brand-700)}
.card.tone-ok{border-top-color:var(--success)}
.card.tone-warn{border-top-color:var(--warning)}
.card.tone-fail{border-top-color:var(--danger)}
.card.tone-na{border-top-color:var(--quality-ausente)}
.card.tone-na .value{font-size:11pt;font-style:italic;color:var(--ink-subtle);font-weight:600}
.why{margin:0;padding:0;list-style:none}
.why li{position:relative;padding:1.5mm 0 1.5mm 7mm;border-bottom:1px solid var(--edge-subtle)}
.why li::before{content:"";position:absolute;left:1mm;top:3.1mm;width:2.6mm;height:2.6mm;
 border-radius:50%;background:var(--brand-600)}
.scope{display:flex;flex-wrap:wrap;gap:1.5mm;margin:0;padding:0;list-style:none}
.scope li{border:1px solid;border-radius:999px;padding:.8mm 3mm;font-size:var(--fs-support)}
.scope .glyph{font-weight:700;margin-right:1.2mm}
.unavailable{border:1px dashed var(--edge-strong);background:var(--quality-ausente-soft);
 border-radius:2.5mm;padding:3mm 4mm;color:var(--ink-muted)}
.unavailable strong{color:var(--ink)}
.chips{margin:0 0 3mm}
.chips .group{font-size:var(--fs-caption);text-transform:uppercase;letter-spacing:.06em;
 color:var(--ink-subtle);font-weight:600;margin:2mm 0 1mm}
.chip{display:inline-block;border:1px solid var(--brand-200);background:var(--brand-50);
 color:var(--brand-900);border-radius:999px;padding:.6mm 3mm;margin:0 1.5mm 1.5mm 0;
 font-size:var(--fs-support)}
.notes{margin:2mm 0 0;padding-left:4mm;font-size:var(--fs-support);color:var(--ink-muted)}
.narrative{border-left:3px solid var(--info);background:var(--info-soft);padding:3mm 4mm;
 border-radius:0 2.5mm 2.5mm 0}
.narrative p{max-width:160mm}
.narrative .caveats{font-size:var(--fs-support);color:var(--ink-muted);margin:2mm 0 0}
.narrative-note{font-size:var(--fs-support);color:var(--ink-muted);margin-top:2mm}
/* signature */
.signature{display:grid;grid-template-columns:1fr 46mm;gap:6mm;border:1px solid var(--edge);
 border-radius:3mm;padding:6mm;break-inside:avoid}
.sign-line{margin-top:16mm;border-top:1px solid var(--ink);padding-top:1.5mm;max-width:95mm}
.sign-line .name{font-weight:700}
.seal{text-align:center;font-size:var(--fs-caption);color:var(--ink-muted)}
.seal svg{width:34mm;height:34mm;display:block;margin:0 auto 1.5mm}
.seal .code{font-size:10pt;color:var(--ink);font-weight:700;display:block}
.seal .url{font-family:var(--font-mono);font-size:6.5pt;word-break:break-all}
#assinatura{break-inside:avoid}
.seal-empty{border:1px dashed var(--edge-strong);border-radius:2mm;padding:6mm 2mm;
 color:var(--ink-subtle);font-style:italic}
/* annex */
.annex-intro{margin-bottom:5mm}
.annex section h2{font-size:var(--fs-heading);border-bottom-width:1px}
.notices{border:1px solid var(--edge);border-left:3px solid var(--ink-muted);padding:2.5mm 4mm;
 margin-bottom:5mm;font-size:var(--fs-support);color:var(--ink-muted)}
.notice{margin:1mm 0}
.note{margin:1mm 0;font-size:var(--fs-support);color:var(--ink-muted)}
.empty{font-style:italic;color:var(--ink-subtle);font-size:var(--fs-support)}
.table-scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:var(--fs-caption)}
th,td{border:1px solid var(--edge);padding:1.2mm 1.8mm;text-align:left;vertical-align:top;
 white-space:pre-line}
th{background:var(--surface-sunken);font-weight:600}
tbody tr:nth-child(even){background:var(--surface)}
.mini-table td.num,.mini-table th.num{text-align:right}
footer.colophon{margin-top:8mm;padding-top:3mm;border-top:1px solid var(--edge-subtle);
 font-size:var(--fs-caption);color:var(--ink-subtle)}
.watermark{position:fixed;top:42%;left:-10%;right:-10%;text-align:center;
 transform:rotate(-28deg);font-size:38pt;font-weight:800;letter-spacing:.04em;
 color:var(--danger);opacity:.13;pointer-events:none;z-index:50;white-space:nowrap}
@media screen and (max-width:820px){
 .sheet{padding:8mm 5mm}.pair,.pair-wide,.facts,.signature{grid-template-columns:1fr}
}
@page{size:A4;margin:16mm 14mm 18mm}
@media print{
 body{background:var(--surface-raised)}
 .sheet{width:auto;margin:0;border:0;padding:0}
 .cover{min-height:0;height:262mm}
 .cover-band{margin:0}
 .table-scroll{overflow:visible}
 tr{break-inside:avoid}
 thead{display:table-header-group}
 .print-page{break-before:page}
}
"""


def _css_font() -> str:
    return FONT_SANS


def _page_rules(doc: LaudoDocument, draft: bool) -> str:
    """Running footer with page numbers; the cover has none."""
    left = f"Laudo de engenharia · {doc.study_name}"
    right = DRAFT_MARK if draft else f"Versão {doc.version}"
    return (
        "@page{"
        "@bottom-left{content:"
        + _css_string(left)
        + ";font-size:7pt;color:"
        + token("ink-subtle")
        + ";font-family:"
        + _css_font()
        + "}"
        '@bottom-center{content:"Página " counter(page) " de " counter(pages);'
        "font-size:7pt;color:" + token("ink-subtle") + ";font-family:" + _css_font() + "}"
        "@bottom-right{content:"
        + _css_string(right)
        + ";font-size:7pt;color:"
        + token("ink-subtle")
        + ";font-family:"
        + _css_font()
        + "}"
        "}"
        "@page:first{@bottom-left{content:none}@bottom-center{content:none}"
        "@bottom-right{content:none}}"
    )


def _fact(label: str, value: str | None, absent: str = "não informado") -> str:
    if value:
        return f'<div class="fact"><dt>{_e(label)}</dt><dd>{_e(value)}</dd></div>'
    return f'<div class="fact"><dt>{_e(label)}</dt><dd class="absent">{_e(absent)}</dd></div>'


def _cover(doc: LaudoDocument, draft: bool) -> str:
    engineer = doc.engineer
    engineer_line = engineer.name
    if engineer.name and engineer.title:
        engineer_line = f"{engineer.name} — {engineer.title}"
    when = long_date(engineer.issue_date) if engineer.issue_date else None
    place = ", ".join(p for p in (engineer.city, when) if p) or None
    hero = (
        '<div class="cover-hero"><div class="eyebrow">Material recomendado</div>'
        f'<div class="name">{_e(doc.recommendation.name)}</div>'
        f'<div class="support">{_e(doc.recommendation.standing)}</div></div>'
        if doc.recommendation
        else '<div class="cover-hero"><div class="eyebrow">Material recomendado</div>'
        f'<div class="support">{_e(doc.no_recommendation or "Nenhum material recomendado.")}'
        "</div></div>"
    )
    status = (
        f'<span class="badge badge-draft">{_e(DRAFT_MARK)}</span>'
        if draft
        else f'<span class="badge badge-issued">Emitido · versão {_e(doc.version)}</span>'
    )
    return (
        '<div class="sheet cover">'
        '<div class="cover-band">'
        '<div class="eyebrow">Laudo de engenharia · seleção de materiais</div>'
        f"<h1>Laudo de engenharia — {_e(doc.study_name)}</h1>"
        + (f'<p class="lead">{_e(doc.description)}</p>' if doc.description else "")
        + "</div>"
        '<div class="cover-body">'
        '<dl class="facts">'
        + _fact("Cliente", doc.client_name)
        + _fact("Projeto", doc.client_project)
        + _fact("Responsável técnico", engineer_line)
        + _fact("Registro profissional", engineer.registration)
        + _fact("Local e data de emissão", place)
        + _fact("ART", engineer.art, "não informada")
        + "</dl>"
        + hero
        + (
            f'<div class="cards">{"".join(_card(c) for c in doc.key_figures[:5])}</div>'
            if doc.key_figures
            else ""
        )
        + '<div class="cover-foot">'
        f"<div>{status}"
        f'<p class="caption" style="margin-top:2mm">Gerado por MaterialSelect AI — cálculo '
        "determinístico, proveniência rastreável.</p></div>"
        f'<div class="seal">{SEAL_OPEN}{SEAL_CLOSE}</div>'
        "</div></div></div>"
    )


def _cover_seal(seal: Seal) -> str:
    return (
        f'<span class="caption">Código de verificação</span>'
        f'<span class="code">{_e(seal.short_code)}</span>'
    )


def _signature_seal(seal: Seal) -> str:
    # Trusted markup: segno's SVG, generated from a URL we built.
    return (
        f"{seal.qr_svg}"
        f'<span class="code">{_e(seal.short_code)}</span>'
        f"Versão {_e(seal.version)} · emitido em "
        f"{_e(seal.issued_at.strftime('%d/%m/%Y %H:%M'))} (UTC)<br>"
        f'Verifique em <span class="url">{_e(seal.verify_url)}</span>'
    )


def _card(card: KeyFigure) -> str:
    unit = f'<span class="unit">{_e(card.unit)}</span>' if card.unit else ""
    hint = f'<div class="hint">{_e(card.hint)}</div>' if card.hint else ""
    return (
        f'<div class="card tone-{_e(card.tone)}"><div class="label">{_e(card.label)}</div>'
        f'<div class="value">{_e(card.value)}{unit}</div>{hint}</div>'
    )


def _scope(items: list[ScopeItem]) -> str:
    parts = []
    for item in items:
        status = STATUS.get(item.status, STATUS["na"])
        title = f' title="{_e(item.detail)}"' if item.detail else ""
        parts.append(
            f'<li style="border-color:{status.colour};background:{status.soft};'
            f'color:{status.ink}"{title}><span class="glyph">{_e(status.glyph)}</span>'
            f"{_e(item.label)}: {_e(status.word.lower())}</li>"
        )
    return f'<ul class="scope" aria-label="Escopo deste laudo">{"".join(parts)}</ul>'


def _summary(doc: LaudoDocument, number: int) -> str:
    if doc.recommendation:
        rec = doc.recommendation
        cls = f" · {rec.class_name}" if rec.class_name else ""
        hero = (
            '<div class="hero"><div class="hero-mark" aria-hidden="true">1º</div><div>'
            '<div class="eyebrow">Material recomendado</div>'
            f'<div class="name">{_e(rec.name)}</div>'
            f'<div class="standing">{_e(rec.standing)}{_e(cls)}</div></div></div>'
        )
    else:
        hero = (
            '<div class="hero none"><div><div class="eyebrow">Material recomendado</div>'
            f'<div class="name" style="font-size:12pt">'
            f'{_e(doc.no_recommendation or "Nenhum material recomendado.")}</div></div></div>'
        )
    cards = "".join(_card(card) for card in doc.key_figures[:5])
    why = (
        '<h3>Por que este material</h3><ul class="why">'
        + "".join(f"<li>{_e(line)}</li>" for line in doc.why)
        + "</ul>"
        if doc.why
        else ""
    )
    lights = f"<figure>{doc.traffic_light}</figure>" if doc.traffic_light else ""
    donut = f"<figure>{doc.donut}</figure>" if doc.donut else ""
    ranking = f"<figure>{doc.ranking_mini}</figure>" if doc.ranking_mini else ""
    return (
        '<div class="sheet page"><section id="resumo">'
        f'<h2><span class="num">{number}.</span>Resumo executivo</h2>'
        f"{hero}"
        f'<div class="cards">{cards}</div>'
        f'<div class="pair-wide"><div>{why}</div><div>{donut}'
        f"<h3>Escopo deste laudo</h3>{_scope(doc.scope)}</div></div>"
        f"{lights}{ranking}"
        "</section></div>"
    )


def _mini_table(sheet: Sheet) -> str:
    head = "".join(f"<th>{_e(column)}</th>" for column in sheet.header)
    body = "".join(
        "<tr>" + "".join(f"<td>{_e('ausente' if v is None else v)}</td>" for v in row) + "</tr>"
        for row in sheet.rows
    )
    return (
        f'<div class="table-scroll"><table class="mini-table"><thead><tr>{head}</tr></thead>'
        f"<tbody>{body}</tbody></table></div>"
    )


def _section(section: LaudoSection, number: int, *, new_page: bool = False) -> str:
    page = ' class="print-page"' if new_page else ""
    parts = [
        f'<section id="{_e(section.key)}"{page}>',
        f'<h2><span class="num">{number}.</span>{_e(section.title)}</h2>',
    ]
    if section.lead:
        parts.append(f'<p class="muted">{_e(section.lead)}</p>')
    if section.unavailable:
        parts.append(
            f'<p class="unavailable"><strong>Não avaliado.</strong> {_e(section.unavailable)}</p>'
        )
    if section.cards:
        parts.append(f'<div class="cards">{"".join(_card(c) for c in section.cards)}</div>')
    if section.table_first and section.table is not None and section.table.rows:
        parts.append(_mini_table(section.table))
    if section.figures:
        figures = "".join(f"<figure>{svg}</figure>" for svg in section.figures)
        if section.paired and len(section.figures) > 1:
            parts.append(f'<div class="pair">{figures}</div>')
        else:
            parts.append(figures)
    for group, chips in section.chips:
        items = "".join(f'<span class="chip">{_e(chip)}</span>' for chip in chips)
        parts.append(f'<div class="chips"><div class="group">{_e(group)}</div>{items}</div>')
    if not section.table_first and section.table is not None and section.table.rows:
        parts.append(_mini_table(section.table))
    if section.notes:
        parts.append(
            '<ul class="notes">' + "".join(f"<li>{_e(n)}</li>" for n in section.notes) + "</ul>"
        )
    parts.append("</section>")
    return "".join(parts)


def _narrative(doc: LaudoDocument, number: int) -> str:
    parts = [
        '<section id="interpretacao">',
        f'<h2><span class="num">{number}.</span>Interpretação técnica (IA)</h2>',
        '<div class="narrative">',
    ]
    if doc.narrative:
        parts += [f"<p>{_e(p)}</p>" for p in doc.narrative]
        if doc.narrative_caveats:
            parts.append(
                '<ul class="caveats">'
                + "".join(f"<li>{_e(c)}</li>" for c in doc.narrative_caveats)
                + "</ul>"
            )
    else:
        parts.append('<p class="empty">Interpretação por IA não disponível.</p>')
    if doc.narrative_note:
        parts.append(f'<p class="narrative-note">{_e(doc.narrative_note)}</p>')
    parts.append(
        '</div><p class="caption">A IA só interpreta: todo número deste laudo foi calculado '
        "pelo servidor, de forma determinística.</p></section>"
    )
    return "".join(parts)


def _signature(doc: LaudoDocument, number: int, draft: bool) -> str:
    engineer = doc.engineer
    when = long_date(engineer.issue_date) if engineer.issue_date else "data não informada"
    place = f"{engineer.city}, {when}" if engineer.city else when
    lines = [
        f'<div class="name">{_e(engineer.name or "Responsável técnico não informado")}</div>',
    ]
    if engineer.title:
        lines.append(f"<div>{_e(engineer.title)}</div>")
    lines.append(
        f"<div>Registro: {_e(engineer.registration or 'não informado')} · "
        f"ART: {_e(engineer.art or 'não informada')}</div>"
    )
    seal = (
        f'<div class="seal-empty">{_e(DRAFT_MARK)}: sem código de verificação.</div>'
        if draft
        else ""
    )
    return (
        '<section id="assinatura">'
        f'<h2><span class="num">{number}.</span>Responsabilidade técnica e assinatura</h2>'
        '<p class="support">Este laudo é assinado pelo responsável técnico sobre o PDF, à mão, '
        "pela assinatura gov.br ou com certificado digital. O código e o QR identificam esta "
        "versão: qualquer alteração no conteúdo muda o código.</p>"
        '<div class="signature"><div>'
        f'<p>{_e(place)}.</p><div class="sign-line">{"".join(lines)}</div></div>'
        f'<div class="seal">{seal}{SEAL_OPEN}{SEAL_CLOSE}</div>'
        "</div></section>"
    )


def _annex(doc: LaudoDocument, first_number: int) -> str:
    notices = "".join(f'<p class="notice">{_e(n)}</p>' for n in doc.notices)
    sheets = "".join(
        render_sheet(sheet, f"A{position}") for position, sheet in enumerate(doc.annex, start=1)
    )
    return (
        '<div class="sheet page annex">'
        f'<h2><span class="num">{first_number}.</span>Anexo técnico</h2>'
        '<p class="annex-intro support">As tabelas completas do estudo, para auditoria: '
        "o problema, os limites e o funil, os candidatos, as contribuições, os excluídos "
        "por dado ausente, a sensibilidade e a proveniência de cada valor.</p>"
        f'<div class="notices">{notices}</div>'
        f"{sheets}"
        '<footer class="colophon">Gerado por MaterialSelect AI — seleção de materiais pela '
        "metodologia de Ashby, com cálculo determinístico e proveniência rastreável.</footer>"
        "</div>"
    )


def render_laudo(doc: LaudoDocument, *, draft: bool) -> str:
    """The whole laudo as one standalone HTML document.

    ``draft=True`` is the preview: watermark on every page, no seal. An issue
    renders with ``draft=False`` and empty seal slots, hashes that
    (:func:`laudo_digest`), then fills them (:func:`seal_document`).
    """
    number = 1
    body = [_cover(doc, draft), _summary(doc, number)]
    number += 1
    middle = ['<div class="sheet page">']
    for position, section in enumerate(doc.sections):
        # Each tool opens a page of its own when printed: a client reads "Custo"
        # as a page, and a heading never strands at the foot of the previous one.
        rich = not section.unavailable and bool(section.figures)
        middle.append(_section(section, number, new_page=position > 0 and rich))
        number += 1
    middle.append(_narrative(doc, number))
    number += 1
    middle.append(_signature(doc, number, draft))
    number += 1
    middle.append("</div>")
    body.append("".join(middle))
    body.append(_annex(doc, number))
    watermark = f'<div class="watermark" aria-hidden="true">{_e(DRAFT_MARK)}</div>' if draft else ""
    title = f"Laudo de engenharia — {doc.study_name}"
    return (
        "<!doctype html>"
        '<html lang="pt-BR">'
        "<head>"
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{_e(title)}</title>"
        f"<style>{css_custom_properties()}{_STYLES}{_page_rules(doc, draft)}</style>"
        "</head>"
        f"<body>{watermark}<main>{''.join(body)}</main></body></html>"
    )
