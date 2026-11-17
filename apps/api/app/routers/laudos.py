"""Public, read-only routes for an issued laudo (D-241, D-242).

The one route in the API a stranger is meant to open: the client who scanned
the QR on a signed PDF. It answers *whether the code belongs to an issued laudo
and to which one* — study, version, date and the engineer named on it — and
nothing else: no client, no content, no inputs. A code that matches no version
(or, as a prefix, more than one) is a plain 404.

The second public route is the **read-only copy a client opens from the e-mail**
(D-242): ``/laudos/enviados/{token}`` serves the frozen HTML, and nothing else. The
token is 256 bits from ``secrets`` and only its SHA-256 is stored, so the address
cannot be guessed or read back from the database; a token whose delivery failed
(the link never reached anyone) opens nothing. No cookie, no write, no listing.

D-243 gave that link a life. It **expires** and the owner can **revoke** it: a link that is
either answers **410 Gone** with a friendly Portuguese page and none of the laudo (an unknown
token stays 404). Every opening is **counted** — first time, last time and a number; no address,
no user agent, no pixel in the e-mail, and only the laudo page counts, not the PDF download
nor a link-preview robot. When the engineer uploaded the signed PDF, the page carries a strip
with "Baixar PDF assinado" (added as it is served; the stored document is untouched) and
``/enviados/{token}/pdf`` serves that file under the same rules.

A browser gets a small self-contained page (it asked for ``text/html``, and the
person behind it scanned a QR on paper); anything else gets JSON.
"""

from __future__ import annotations

import re
from html import escape

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import rate_limit
from app.domain.errors import NotFoundError
from app.exporters.laudo import long_date, short_code, signed_pdf_bar, with_signed_pdf_bar
from app.exporters.laudo_theme import css_custom_properties
from app.repositories.issued_report_pdf_repository import IssuedReportPdfRepository
from app.schemas.laudo import IssuedReportVerificationOut
from app.services.laudo_service import verify_code
from app.services.report_delivery_service import (
    LINK_REVOKED,
    PUBLIC_PATH,
    attachment_filename,
    record_link_open,
    resolve_public_link,
)
from app.services.signed_pdf_service import NO_PDF

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
            row(
                "PDF assinado",
                (
                    f"registrado (SHA-256 {result.signed_pdf.short_sha256}, "
                    f"enviado em {result.signed_pdf.uploaded_at.strftime('%d/%m/%Y')})"
                    if result.signed_pdf
                    else "nenhum PDF assinado foi registrado para esta versão"
                ),
            ),
        ]
    )
    signed_hash = (
        f'<p class="hash">SHA-256 do PDF assinado: {escape(result.signed_pdf.sha256)}</p>'
        "<p>Para conferir, calcule o SHA-256 do PDF que você recebeu e compare com o valor acima. "
        "A assinatura em si é verificada no leitor de PDF ou no gov.br: este registro só informa "
        "que o engenheiro anexou um PDF a esta versão e qual é o seu hash.</p>"
        if result.signed_pdf
        else ""
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
        f"{signed_hash}"
        "<p>Confira se o código impresso no laudo é o mesmo desta página. A assinatura é do "
        "responsável técnico, no PDF; este registro confirma a versão emitida.</p>"
        "</main></body></html>"
    )


_NO_STORE = {
    "X-Content-Type-Options": "nosniff",
    # An unlisted address: no search engine, no Referer leak of the token, no shared cache.
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
}

#: User agents of mail scanners and link-preview robots: they follow every link in a message
#: the moment it arrives, so counting them would say "the client opened it" when nobody did.
_ROBOT = re.compile(
    r"bot|crawl|spider|slurp|preview|scanner|fetch|monitor|headless|python-requests|curl|wget"
    r"|safelinks|proofpoint|mimecast|barracuda|googleimageproxy",
    re.IGNORECASE,
)


def counts_as_open(request: Request) -> bool:
    """Whether this request is a person opening the link (D-243).

    Only a ``GET`` of the laudo page counts. A prefetch (``Purpose``/``Sec-Purpose``) and the
    robots above do not; neither does the PDF download, which is another route. This is a
    heuristic, said so in the docs: a scanner that hides behind a browser's user agent is
    still counted, which is why the screen says "aberturas do link", not "leituras".
    """
    if request.method != "GET":
        return False
    purpose = f"{request.headers.get('purpose', '')} {request.headers.get('sec-purpose', '')}"
    if "prefetch" in purpose.lower():
        return False
    agent = request.headers.get("user-agent", "")
    return bool(agent) and _ROBOT.search(agent) is None


def _gone_page(state: str) -> Response:
    """The page of a link that no longer opens (410): friendly, and none of the laudo."""
    revoked = state == LINK_REVOKED
    title = "Este link foi cancelado" if revoked else "O prazo deste link terminou"
    reason = (
        "O engenheiro responsável cancelou o acesso a este link."
        if revoked
        else "O prazo de validade deste link chegou ao fim."
    )
    body = (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="robots" content="noindex, nofollow">'
        f"<title>{escape(title)}</title><style>"
        f"{css_custom_properties()}"
        "body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--font-sans);"
        "line-height:1.5}main{max-width:36rem;margin:3rem auto;padding:1.5rem;"
        "background:var(--surface-raised);border:1px solid var(--edge-subtle);border-radius:12px}"
        ".tag{display:inline-block;padding:.25rem .75rem;border-radius:999px;font-weight:700;"
        "background:var(--warning-soft);color:var(--warning-fg);border:1px solid var(--warning)}"
        "</style></head><body><main>"
        '<p class="tag">Link indisponível</p>'
        f"<h1>{escape(title)}</h1>"
        f"<p>{escape(reason)}</p>"
        "<p>Para ver o laudo, peça um novo envio a quem lhe mandou este link. "
        "Se você guardou o PDF que veio anexo ao e-mail, ele continua valendo e pode ser "
        "conferido pelo código impresso nele.</p>"
        "</main></body></html>"
    )
    return Response(
        content=body,
        status_code=410,
        media_type="text/html; charset=utf-8",
        headers={"Content-Security-Policy": HTML_CSP, **_NO_STORE},
    )


@router.get(
    "/enviados/{token}",
    dependencies=[Depends(rate_limit("exports"))],
    response_class=Response,
)
def open_sent_laudo(token: str, request: Request, db: Session = Depends(get_db)) -> Response:
    """The frozen laudo, exactly as issued, for whoever holds the link from the e-mail."""
    link = resolve_public_link(db, token)
    if link.state != "ativo":
        return _gone_page(link.state)
    body = link.report.html
    pdf = IssuedReportPdfRepository(db).latest_meta(link.report.id)
    if pdf is not None:
        body = with_signed_pdf_bar(
            body,
            signed_pdf_bar(
                f"{PUBLIC_PATH}{token}/pdf",
                short_code(pdf.sha256),
                pdf.created_at,
            ),
        )
    if counts_as_open(request):
        record_link_open(db, link.delivery)
    return Response(
        content=body,
        media_type="text/html; charset=utf-8",
        headers={"Content-Security-Policy": HTML_CSP, **_NO_STORE},
    )


@router.get(
    "/enviados/{token}/pdf",
    dependencies=[Depends(rate_limit("exports"))],
    response_class=Response,
)
def download_sent_signed_pdf(token: str, db: Session = Depends(get_db)) -> Response:
    """The signed PDF of the laudo a link opens: same validity and revocation as the page."""
    link = resolve_public_link(db, token)
    if link.state != "ativo":
        return _gone_page(link.state)
    pdf = IssuedReportPdfRepository(db).latest(link.report.id)
    if pdf is None:
        raise NotFoundError(NO_PDF)
    filename = attachment_filename(link.report.study_name, link.report.version, signed_pdf=True)
    return Response(
        content=pdf.content,
        media_type="application/pdf",
        headers={
            # A PDF is data here, never a page: nothing may load or run from it.
            "Content-Security-Policy": "default-src 'none'",
            "Content-Disposition": f'attachment; filename="{filename}"',
            **_NO_STORE,
        },
    )
