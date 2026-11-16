"""Public, read-only verification of an issued laudo (D-241).

The one route in the API a stranger is meant to open: the client who scanned
the QR on a signed PDF. It answers *whether the code belongs to an issued laudo
and to which one* — study, version, date and the engineer named on it — and
nothing else: no client, no content, no inputs. A code that matches no version
(or, as a prefix, more than one) is a plain 404.

A browser gets a small self-contained page (it asked for ``text/html``, and the
person behind it scanned a QR on paper); anything else gets JSON.
"""

from __future__ import annotations

from html import escape

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.exporters.laudo import long_date
from app.exporters.laudo_theme import css_custom_properties
from app.schemas.laudo import IssuedReportVerificationOut
from app.services.laudo_service import verify_code

router = APIRouter(prefix="/laudos", tags=["laudos"])

HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'"


@router.get("/verificar/{code}", response_model=IssuedReportVerificationOut)
def verify_laudo(code: str, request: Request, db: Session = Depends(get_db)):
    result = verify_code(db, code)
    accept = request.headers.get("accept", "")
    if "text/html" in accept and "application/json" not in accept:
        return Response(
            content=_page(result),
            media_type="text/html; charset=utf-8",
            headers={"Content-Security-Policy": HTML_CSP, "X-Content-Type-Options": "nosniff"},
        )
    return result


def _page(result: IssuedReportVerificationOut) -> str:
    def row(label: str, value: str | None) -> str:
        shown = escape(value) if value else "<em>não informado</em>"
        return f"<dt>{escape(label)}</dt><dd>{shown}</dd>"

    engineer = result.engineer_name
    if result.engineer_title:
        engineer = f"{engineer} — {result.engineer_title}"
    rows = "".join(
        [
            row("Estudo", result.study_name),
            row("Versão", str(result.version)),
            row("Data de emissão", long_date(result.issue_date) if result.issue_date else None),
            row("Emitido em (UTC)", result.issued_at.strftime("%d/%m/%Y %H:%M")),
            row("Responsável técnico", engineer),
            row("Registro profissional", result.engineer_registration),
            row("Código", result.short_code),
        ]
    )
    return (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        "<title>Verificação de laudo</title><style>"
        f"{css_custom_properties()}"
        "body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--font-sans);"
        "line-height:1.5}main{max-width:36rem;margin:2rem auto;padding:1.5rem;"
        "background:var(--surface-raised);border:1px solid var(--edge-subtle);border-radius:12px}"
        ".ok{display:inline-block;padding:.25rem .75rem;border-radius:999px;font-weight:700;"
        "background:var(--success-soft);color:var(--success-fg);border:1px solid var(--success)}"
        "dl{display:grid;grid-template-columns:auto 1fr;gap:.4rem 1rem}"
        "dt{color:var(--ink-muted)}dd{margin:0;font-weight:600}"
        ".hash{font-family:var(--font-mono);font-size:.75rem;word-break:break-all;"
        "color:var(--ink-muted)}"
        "</style></head><body><main>"
        '<p class="ok">✓ Laudo emitido e registrado</p>'
        "<h1>Verificação de laudo de engenharia</h1>"
        f"<dl>{rows}</dl>"
        '<p class="hash">SHA-256 do conteúdo: '
        f"{escape(result.content_sha256)}</p>"
        "<p>Confira se o código impresso no laudo é o mesmo desta página. A assinatura é do "
        "responsável técnico, no PDF; este registro confirma a versão emitida.</p>"
        "</main></body></html>"
    )
