"""Export endpoints: catalogue, selection studies and material sheet as CSV, XLSX,
DOCX, PPTX or HTML, one material as a CAE card (D-104), a material curve's points (D-106),
and what changed between two releases of the official catalogue (D-108).

These return files rather than JSON, so they set their own headers. Three
details matter and are easy to get wrong:

* ``Content-Disposition`` filenames are ASCII-only in the plain form; the
  report titles are Portuguese. The header therefore carries both a sanitised
  ``filename`` and an RFC 5987 ``filename*``, so accented names survive in
  browsers that understand it and degrade cleanly in those that do not.
* ``X-Content-Type-Options: nosniff`` stops a browser from re-interpreting a
  CSV as HTML, which would turn exported material names into markup.
* **HTML is served inline, and only HTML.** The printable report is useful
  precisely because the browser opens it and prints it, so it cannot be an
  attachment. That makes it the one export rendered as markup on the API's own
  origin, so it also carries a ``default-src 'none'`` policy: even if the
  escaping in ``exporters/html.py`` were wrong, nothing on the page can load or
  execute. The two protections are independent on purpose.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.dependencies import (
    get_current_project,
    get_current_user,
    get_unit_choices,
    heavy_request,
    rate_limit,
)
from app.domain.errors import PayloadTooLargeError, ValidationError
from app.exporters.docx import to_docx
from app.exporters.html import to_html
from app.exporters.laudo_docx import render_laudo_docx
from app.exporters.laudo_pptx import render_laudo_pptx
from app.exporters.pptx import to_pptx
from app.exporters.report import Report
from app.exporters.spreadsheet import to_csv, to_xlsx
from app.models.project import Project
from app.models.user import User
from app.schemas.cae_export import CaeFormatOut
from app.schemas.laudo import IssuedReportOut, LaudoInputs, SignedPdfOut
from app.schemas.report_delivery import LaudoEmailPreviewOut, LaudoSendRequest, ReportDeliveryOut
from app.services.cae_export_service import CaeExportService
from app.services.catalog_release_service import CatalogReleaseService
from app.services.curve_service import CurveService
from app.services.export_service import ExportService
from app.services.heavy_request_gate import get_gate
from app.services.laudo_service import LaudoService
from app.services.report_delivery_service import ReportDeliveryService, attachment_filename
from app.services.signed_pdf_service import SignedPdfService

router = APIRouter(prefix="/exports", tags=["exports"])

CSV_MEDIA_TYPE = "text/csv; charset=utf-8"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
HTML_MEDIA_TYPE = "text/html; charset=utf-8"

SUPPORTED_FORMATS = ("csv", "xlsx", "html", "docx", "pptx")
LAUDO_SUPPORTED_FORMATS = ("html", "docx", "pptx")
MATERIAL_SUPPORTED_FORMATS = ("html", "csv", "xlsx")

# The report needs its own inline stylesheet and nothing else whatsoever.
HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'"


def _ascii_filename(name: str) -> str:
    """Fold a Portuguese title into a safe ASCII filename stem."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", folded).strip("-").lower()
    return cleaned or "relatorio"


def _file_response(report: Report, fmt: str) -> Response:
    """Serialise a report in the requested format with the right headers."""
    headers = {"X-Content-Type-Options": "nosniff"}

    body: bytes | str
    if fmt == "xlsx":
        body = to_xlsx(report)
        media_type = XLSX_MEDIA_TYPE
    elif fmt == "docx":
        body = to_docx(report)
        media_type = DOCX_MEDIA_TYPE
    elif fmt == "pptx":
        body = to_pptx(report)
        media_type = PPTX_MEDIA_TYPE
    elif fmt == "html":
        body = to_html(report)
        media_type = HTML_MEDIA_TYPE
        headers["Content-Security-Policy"] = HTML_CSP
    else:
        body = to_csv(report)
        media_type = CSV_MEDIA_TYPE

    response = Response(content=body, media_type=media_type, headers=headers)
    return _download_headers(response, report.title, fmt)


def _download_headers(response: Response, title: str, fmt: str) -> Response:
    """Name the file and say whether the browser shows it or saves it."""
    # HTML opens in the browser so it can be printed; everything else downloads.
    kind = "inline" if fmt == "html" else "attachment"
    filename = f"{_ascii_filename(title)}.{fmt}"
    response.headers["Content-Disposition"] = (
        f'{kind}; filename="{filename}"; ' f"filename*=UTF-8''{quote(filename, safe='')}"
    )
    return response


@router.get("/catalogo.{fmt}")
def export_catalogue(
    fmt: str,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> Response:
    """Export the whole active catalogue with its provenance trail."""
    _require_supported(fmt)
    service = ExportService(db, user, unit_choices)
    if fmt == "csv":
        # The one export that is read batch by batch and sent as it is written
        # (D-237): the text of the whole catalogue is never held at once.
        title, chunks = service.catalogue_csv_stream()
        return _download_headers(
            StreamingResponse(
                chunks,
                media_type=CSV_MEDIA_TYPE,
                headers={"X-Content-Type-Options": "nosniff"},
            ),
            title,
            fmt,
        )
    return _file_response(service.catalogue_report(), fmt)


@router.get("/estudos/{study_id}.{fmt}")
def export_study(
    study_id: int,
    fmt: str,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> Response:
    """Export a saved study as a full selection report.

    The study is re-run server-side, so the file always reflects the current
    catalogue rather than a remembered result.
    """
    _require_supported(fmt)
    return _file_response(
        ExportService(db, user, unit_choices).study_report(study_id, project.id), fmt
    )


@router.get("/estudos/{study_id}/laudo.{fmt}")
def export_study_laudo(
    study_id: int,
    fmt: str,
    responsavel: str | None = Query(default=None, max_length=160),
    titulo: str | None = Query(default=None, max_length=120),
    registro: str | None = Query(default=None, max_length=60),
    art: str | None = Query(default=None, max_length=60),
    cidade: str | None = Query(default=None, max_length=80),
    data: date | None = Query(default=None),
    cliente: str | None = Query(default=None, max_length=160),
    projeto: str | None = Query(default=None, max_length=160),
    massa: float | None = Query(default=None, gt=0, le=1e6, description="Massa da peça, kg."),
    lote: float | None = Query(default=None, ge=1, le=1e9, description="Lote, peças."),
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> Response:
    """The engineering report. HTML is the preview of the visual laudo (D-241), with the
    "RASCUNHO — não emitido" watermark. DOCX and PPTX (D-243) are the editable twins of that
    same document — cover, executive summary, one section per tool, signature and (Word only)
    the technical annex, with the charts as images — without a seal: they are not the issued
    laudo.

    The query parameters are the same declared fields the issue form sends, so the file a
    reader downloads has the fields they typed and, for HTML, is the document "Emitir" would
    freeze.
    """
    if fmt not in LAUDO_SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de laudo não suportado: '{fmt}'. Use {', '.join(LAUDO_SUPPORTED_FORMATS)}."
        )
    inputs = LaudoInputs(
        engineer_name=responsavel,
        engineer_title=titulo,
        engineer_registration=registro,
        art_number=art,
        city=cidade,
        issue_date=data,
        client_name=cliente,
        client_project=projeto,
        part_mass_kg=massa,
        batch_size=lote,
    )
    service = LaudoService(db, user, unit_choices)
    if fmt == "html":
        title, body = service.preview_html(study_id, project.id, inputs)
        return _html_response(body, title)
    # Word and PowerPoint re-run the study and rasterise every chart: heavy, so one slot
    # of the gate (D-231) is held until the bytes exist.
    with get_gate().slot():
        document = service.document(study_id, project.id, inputs)
        if fmt == "docx":
            body_bytes = render_laudo_docx(document)
            media_type = DOCX_MEDIA_TYPE
        else:
            body_bytes = render_laudo_pptx(document)
            media_type = PPTX_MEDIA_TYPE
    response = Response(
        content=body_bytes,
        media_type=media_type,
        headers={"X-Content-Type-Options": "nosniff"},
    )
    return _download_headers(response, f"Laudo de engenharia — {document.study_name}", fmt)


@router.post(
    "/estudos/{study_id}/laudo/emitir",
    response_model=IssuedReportOut,
    status_code=201,
    dependencies=[Depends(heavy_request)],
)
def issue_study_laudo(
    study_id: int,
    payload: LaudoInputs,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> IssuedReportOut:
    """Freeze the laudo as a new version (D-241): HTML, inputs and digest stored.

    Only the study's owner reaches it (the study is looked up in the caller's
    project; anyone else gets the same 404 a missing study does).
    """
    service = LaudoService(db, user, unit_choices)
    return service.out(service.issue(study_id, project.id, payload))


@router.get("/estudos/{study_id}/laudo/versoes", response_model=list[IssuedReportOut])
def list_study_laudo_versions(
    study_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> list[IssuedReportOut]:
    """The issued versions of one study's laudo, newest first."""
    return LaudoService(db, user).versions(study_id, project.id)


@router.get("/estudos/{study_id}/laudo/versoes/{version}.html")
def get_study_laudo_version(
    study_id: int,
    version: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    """One issued version, exactly as it was frozen — never re-rendered."""
    report = LaudoService(db, user).version(study_id, project.id, version)
    return _html_response(
        report.html, f"Laudo de engenharia — {report.study_name} — versão {report.version}"
    )


@router.post(
    "/laudos/{issued_id}/enviar",
    response_model=ReportDeliveryOut,
    status_code=201,
)
def send_issued_laudo(
    issued_id: int,
    payload: LaudoSendRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> ReportDeliveryOut:
    """E-mail an issued laudo to the client (D-242): the owner only.

    A plain ``def`` on purpose: FastAPI runs it in its worker thread pool, so the
    ``smtplib`` call inside (with its own short timeout and a small concurrency
    gate) holds one pool thread and never the event loop. It is not behind the heavy
    gate (D-231): that one protects memory, and this reads one stored document.
    Every attempt, failed ones included, is recorded and audited.
    """
    return ReportDeliveryService(db, user).send(project.id, issued_id, payload)


@router.post("/laudos/{issued_id}/enviar/previa", response_model=LaudoEmailPreviewOut)
def preview_issued_laudo_email(
    issued_id: int,
    payload: LaudoSendRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> LaudoEmailPreviewOut:
    """The message as it would go (subject, HTML, text), with nothing sent or written."""
    return ReportDeliveryService(db, user).preview(project.id, issued_id, payload)


@router.get("/laudos/{issued_id}/envios", response_model=list[ReportDeliveryOut])
def list_issued_laudo_deliveries(
    issued_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> list[ReportDeliveryOut]:
    """Every e-mailing of one issued version, newest first."""
    return ReportDeliveryService(db, user).history(project.id, issued_id)


@router.post(
    "/laudos/{issued_id}/pdf",
    response_model=SignedPdfOut,
    status_code=201,
    dependencies=[Depends(rate_limit("exports"))],
)
async def upload_signed_pdf(
    issued_id: int,
    request: Request,
    nome: str | None = Query(default=None, max_length=300, description="Nome do arquivo."),
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> SignedPdfOut:
    """The PDF the engineer signed, attached to an issued version (D-243): owner only.

    The body is the PDF itself (``Content-Type: application/pdf``), not a multipart form, so
    the size limit is enforced **while it is read**: a body past ``SIGNED_PDF_MAX_BYTES`` is
    refused with 413 at the first chunk that crosses the line, never buffered or spooled to
    disk first. The bytes must start with ``%PDF-``; the file is stored beside the version
    (never inside it) with its SHA-256, and an earlier PDF stays in the history.
    """
    limit = settings.signed_pdf_max_bytes
    too_big = PayloadTooLargeError(
        f"O PDF excede o limite de {limit / (1024 * 1024):.0f} MB. "
        "Reduza o arquivo (por exemplo, exporte de novo sem imagens extras) e envie outra vez."
    )
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_big
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise too_big
        chunks.append(chunk)
    data = b"".join(chunks)
    return await run_in_threadpool(
        SignedPdfService(db, user).upload, project.id, issued_id, nome, data
    )


@router.get("/laudos/{issued_id}/pdf/versoes", response_model=list[SignedPdfOut])
def list_signed_pdfs(
    issued_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> list[SignedPdfOut]:
    """Every upload of the signed PDF of one issued version, newest (current) first."""
    return SignedPdfService(db, user).history(project.id, issued_id)


@router.get("/laudos/{issued_id}/pdf")
def download_signed_pdf(
    issued_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    """The current signed PDF of an issued version, byte for byte."""
    report, pdf = SignedPdfService(db, user).download(project.id, issued_id)
    return _pdf_response(pdf.content, report.study_name, report.version)


@router.get("/laudos/{issued_id}/pdf/{pdf_id}")
def download_signed_pdf_upload(
    issued_id: int,
    pdf_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    """One earlier (or the current) upload of the signed PDF, by its id: the history is kept."""
    report, pdf = SignedPdfService(db, user).download(project.id, issued_id, pdf_id)
    return _pdf_response(pdf.content, report.study_name, report.version)


def _pdf_response(content: bytes, study_name: str, version: int) -> Response:
    filename = attachment_filename(study_name, version, signed_pdf=True)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "X-Content-Type-Options": "nosniff",
            # A PDF is data here, never a page: nothing may load or run from it.
            "Content-Security-Policy": "default-src 'none'",
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post("/envios/{delivery_id}/revogar", response_model=ReportDeliveryOut)
def revoke_laudo_delivery(
    delivery_id: int,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> ReportDeliveryOut:
    """End the client link of one send (D-243): from then on it answers 410. Owner only."""
    return ReportDeliveryService(db, user).revoke(project.id, delivery_id)


def _html_response(body: str, title: str) -> Response:
    response = Response(
        content=body,
        media_type=HTML_MEDIA_TYPE,
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": HTML_CSP},
    )
    return _download_headers(response, title, "html")


@router.get("/materiais/{material_id}.{fmt}")
def export_material(
    material_id: int,
    fmt: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> Response:
    """Ficha técnica detalhada do material (D-125).

    Exportação completa em HTML (para impressão em PDF nativa do navegador via
    window.print com CSS @media print inline), CSV ou XLSX. Respeita as unidades
    de leitura escolhidas (D-70) e a regra de ausência explícita (D-24).
    """
    if fmt not in MATERIAL_SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de ficha técnica não suportado: '{fmt}'. "
            f"Use {', '.join(MATERIAL_SUPPORTED_FORMATS)}."
        )
    report = ExportService(db, user, unit_choices).material_report(material_id)
    return _file_response(report, fmt)


@router.get("/cae/formatos", response_model=list[CaeFormatOut])
def list_cae_formats(_user: User = Depends(get_current_user)) -> list[CaeFormatOut]:
    """The CAE formats and what each requires, in the registry's own words (D-171)."""
    return CaeExportService.formats()


@router.get("/materiais/{material_id}/cae")
def export_material_cae(
    material_id: int,
    formato: str = Query(
        description=(
            "mapdl, matml, abaqus, nastran, lsdyna, nastran-thermal, lsdyna-thermal, ou um "
            "cartão elastoplástico: mapdl-plastic, abaqus-plastic, nastran-plastic, "
            "lsdyna-plastic (D-119)."
        )
    ),
    unidades: str = Query(
        description=(
            "Sistema de unidades CAE consistente: m-kg-s, mm-t-s ou in-lbf-s. Não é a "
            "unidade de leitura por propriedade do D-70: um solver precisa de um "
            "sistema inteiro, e não de uma escolha por grandeza."
        )
    ),
    curva: int | None = Query(
        default=None,
        description=(
            "Só nos formatos *-plastic, e obrigatório neles: id da curva tensão–deformação "
            "do material que vira a tabela plástica (D-119)."
        ),
    ),
    serie: int | None = Query(
        default=None,
        description=(
            "Posição da série dentro da curva (0 = primeira), obrigatória quando a curva "
            "tem mais de uma; a exportação nunca escolhe a série."
        ),
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """A material card for a CAE solver or MatML (D-104).

    Always an attachment: a deck is a file to be read by a solver, and the
    MatML is XML that must not render on the API's origin.
    """
    card = CaeExportService(db, user.id).material_card(
        material_id, formato, unidades, curve_id=curva, series_position=serie
    )
    filename = f"{_ascii_filename(card.material_name)}{card.suffix}"
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": (
            f'attachment; filename="{filename}"; ' f"filename*=UTF-8''{quote(filename, safe='')}"
        ),
    }
    return Response(content=card.body, media_type=card.media_type, headers=headers)


CURVE_SUPPORTED_FORMATS = ("csv", "xlsx")


@router.get("/materiais/{material_id}/curvas/{curve_id}.{fmt}")
def export_material_curve(
    material_id: int,
    curve_id: int,
    fmt: str,
    unidade_x: str | None = Query(default=None, description="Unidade de leitura do eixo x."),
    unidade_y: str | None = Query(default=None, description="Unidade de leitura do eixo y."),
    unidade_parametro: str | None = Query(
        default=None,
        description=(
            "Unidade de leitura do parâmetro da família (TM4-e); omitida, a convenção da "
            "grandeza. Recusada (400) numa curva sem família."
        ),
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """A material curve's points as CSV or XLSX (D-106).

    The notices, the provenance and the three units of each axis
    (reading, original, canonical) travel in the file; every cell goes through
    ``cells.py``, so a curve title written as a formula leaves as text.
    """
    if fmt not in CURVE_SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação de curva não suportado: '{fmt}'. "
            f"Use {', '.join(CURVE_SUPPORTED_FORMATS)}."
        )
    report = CurveService(db, user.id).curve_report(
        material_id,
        curve_id,
        x_unit=unidade_x,
        y_unit=unidade_y,
        parameter_unit=unidade_parametro,
    )
    return _file_response(report, fmt)


RELEASE_DIFF_SUPPORTED_FORMATS = ("csv", "xlsx")


@router.get("/catalogo/releases/{base}/diff/{target}.{fmt}")
def export_release_diff(
    base: str,
    target: str,
    fmt: str,
    tipo: str | None = Query(default=None, description="Filtro: tipo de mudança."),
    classe: str | None = Query(default=None, description="Filtro: slug da classe."),
    universo: str | None = Query(default=None, description="Filtro: material, processo ou modal."),
    pagina: int | None = Query(
        default=None,
        description="Página dos registros, a partir de 1; sem `pagina` nem `por_pagina`, o diff inteiro.",
    ),
    por_pagina: int | None = Query(
        default=None,
        description="Registros por página (1–5000; padrão 1000 quando o arquivo é paginado).",
    ),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> Response:
    """What changed between two releases of the official catalogue (D-108).

    The whole diff with the filters applied — or, with ``pagina``/``por_pagina``,
    one page of its records (TM7-d-resid, D-162): the releases and their
    provenance (slug, licence, hashes, the sources the values cite), the counts,
    one row per record and one per changed field, with the three units of every
    number. Every cell goes through ``cells.py``.
    """
    if fmt not in RELEASE_DIFF_SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação do diff não suportado: '{fmt}'. "
            f"Use {', '.join(RELEASE_DIFF_SUPPORTED_FORMATS)}."
        )
    report = CatalogReleaseService(db, unit_choices).diff_report(
        base,
        target,
        tipo=tipo,
        classe=classe,
        universo=universo,
        page=pagina,
        page_size=por_pagina,
    )
    return _file_response(report, fmt)


def _require_supported(fmt: str) -> None:
    if fmt not in SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação não suportado: '{fmt}'. " f"Use {', '.join(SUPPORTED_FORMATS)}."
        )
