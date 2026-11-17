"""The e-mail that carries an issued laudo to the client (D-242).

A message, not a document: it says in three lines what the laudo is (the
recommended material, the study, the engineer), offers one button to the
read-only copy, one link to verify the code, and attaches the document: the PDF the
engineer signed when there is one (D-243), else the frozen HTML to open and print as a PDF.
It says until when the link works.

Mail clients ignore CSS custom properties and most of ``<style>``, so this is the
one renderer that cannot read the stylesheet: it writes **inline styles** whose
colours come from the same ``laudo_theme`` tokens the laudo itself uses. Every
value that came from a person (study name, material, engineer, the sender's
message) goes through ``html.escape`` — the HTML rule of the exporters, not the
spreadsheet one — and a line break in the message becomes ``<br>`` after the
escape, never before.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html import escape

from app.exporters.laudo_theme import FONT_SANS, token
from app.exporters.xml_text import xml_legal

#: What the greeting says when the sender writes nothing of their own.
GREETING = "Olá,"


@dataclass(frozen=True)
class LaudoEmail:
    """Everything the message says. No field is optional text the reader sees as 'None'."""

    study_name: str
    version: int
    engineer_name: str
    engineer_title: str | None
    #: ``None`` when the laudo recommends nothing; the line then says so.
    material: str | None
    short_code: str
    #: Where the read-only copy is; ``None`` in the preview, which has no token yet.
    public_url: str | None
    verify_url: str
    #: The sender's own words, plain text (may hold line breaks).
    message: str | None = None
    attachment_name: str = "laudo.html"
    #: ``True`` when the attachment is the engineer's signed PDF (D-243), not the ``.html``.
    signed_pdf: bool = False
    #: The last day the public link opens the laudo; ``None`` says nothing about it.
    valid_until: date | None = None


def default_subject(study_name: str, version: int) -> str:
    return f"Laudo de engenharia — {study_name} (versão {version})"


def _e(value: object) -> str:
    return escape(xml_legal(str(value)), quote=True)


def _valid_until(mail: LaudoEmail) -> str | None:
    if mail.valid_until is None:
        return None
    return f"O link vale até {mail.valid_until.strftime('%d/%m/%Y')}."


def _attachment_sentence(mail: LaudoEmail) -> str:
    if mail.signed_pdf:
        return f"O laudo assinado pelo engenheiro vai em anexo ({mail.attachment_name}), em PDF."
    return (
        f"O laudo vai também em anexo ({mail.attachment_name}): abra no navegador e "
        "imprima em PDF (Ctrl+P ou Cmd+P)."
    )


def _engineer_line(mail: LaudoEmail) -> str:
    if mail.engineer_title:
        return f"{mail.engineer_name} — {mail.engineer_title}"
    return mail.engineer_name


def _material_line(mail: LaudoEmail) -> str:
    return mail.material or "nenhum material recomendado neste estudo"


def render_text(mail: LaudoEmail) -> str:
    """The plain-text alternative: same facts, same links, no markup."""
    lines = [GREETING, ""]
    if mail.message:
        lines += [mail.message.strip(), ""]
    lines += [
        "Segue o laudo de engenharia emitido.",
        "",
        f"Material recomendado: {_material_line(mail)}",
        f"Estudo: {mail.study_name} (versão {mail.version})",
        f"Engenheiro responsável: {_engineer_line(mail)}",
        "",
    ]
    if mail.public_url:
        lines += [f"Abrir o laudo (somente leitura): {mail.public_url}"]
        validity = _valid_until(mail)
        lines += [validity, ""] if validity else [""]
    lines += [
        f"Verificar a autenticidade (código {mail.short_code}): {mail.verify_url}",
        "",
        _attachment_sentence(mail),
        "",
        "Enviado pelo MaterialSelect AI.",
    ]
    return "\n".join(lines)


def render_html(mail: LaudoEmail) -> str:
    """The message as one self-contained HTML document with inline styles."""
    ink = token("ink")
    muted = token("ink-muted")
    brand = token("brand-700")
    ground = token("surface")
    card = token("surface-raised")
    edge = token("edge-subtle")
    hero_ground = token("brand-50")
    font = _e(FONT_SANS)

    def row(label: str, value: str) -> str:
        return (
            f'<tr><td style="padding:6px 12px 6px 0;color:{muted};font-size:13px;'
            f'white-space:nowrap;vertical-align:top">{_e(label)}</td>'
            f'<td style="padding:6px 0;color:{ink};font-size:15px;font-weight:600">'
            f"{_e(value)}</td></tr>"
        )

    own_words = ""
    if mail.message and mail.message.strip():
        text = _e(mail.message.strip()).replace("\r\n", "\n").replace("\n", "<br>")
        own_words = f'<p style="margin:0 0 16px;font-size:15px;line-height:1.5">{text}</p>'

    href = _e(mail.public_url) if mail.public_url else "#"
    validity = _valid_until(mail)
    note = "Somente leitura." + (f" {validity}" if validity else "")
    button = (
        f'<a href="{href}" style="display:inline-block;background:{brand};color:#ffffff;'
        "text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;"
        'border-radius:8px">Abrir o laudo</a>'
        f'<div style="margin-top:6px;font-size:12px;color:{muted}">{_e(note)} '
        + ("" if mail.signed_pdf else "Para guardar em PDF, abra e imprima.")
        + "</div>"
    )
    return (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="color-scheme" content="light">'
        f"<title>{_e(default_subject(mail.study_name, mail.version))}</title></head>"
        f'<body style="margin:0;padding:24px 12px;background:{ground};color:{ink};'
        f'font-family:{font}">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="max-width:600px;margin:0 auto;background:{card};border:1px solid {edge};'
        'border-radius:12px"><tr><td style="padding:28px">'
        f'<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:{brand};'
        'text-transform:uppercase;margin-bottom:12px">Laudo de engenharia</div>'
        f'<p style="margin:0 0 16px;font-size:16px;line-height:1.5">{_e(GREETING)}</p>'
        f"{own_words}"
        '<p style="margin:0 0 16px;font-size:15px;line-height:1.5">'
        "Segue o laudo de engenharia emitido.</p>"
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;'
        f'background:{hero_ground};border-radius:8px;margin:0 0 20px"><tr><td style="padding:12px 16px">'
        '<table role="presentation" cellpadding="0" cellspacing="0">'
        f'{row("Material recomendado", _material_line(mail))}'
        f'{row("Estudo", f"{mail.study_name} (versão {mail.version})")}'
        f'{row("Engenheiro responsável", _engineer_line(mail))}'
        "</table></td></tr></table>"
        f'<div style="margin:0 0 24px">{button}</div>'
        f'<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:{muted}">'
        f'Verificar a autenticidade: código <strong style="color:{ink};'
        f'font-family:ui-monospace,Menlo,Consolas,monospace">{_e(mail.short_code)}</strong> em '
        f'<a href="{_e(mail.verify_url)}" style="color:{brand}">{_e(mail.verify_url)}</a></p>'
        f'<p style="margin:0;font-size:13px;line-height:1.5;color:{muted}">'
        f"{_e(_attachment_sentence(mail))}</p>"
        f'<hr style="border:0;border-top:1px solid {edge};margin:24px 0 12px">'
        f'<p style="margin:0;font-size:12px;color:{muted}">Enviado pelo MaterialSelect AI.</p>'
        "</td></tr></table></body></html>"
    )
