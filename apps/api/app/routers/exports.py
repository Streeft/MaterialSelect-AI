"""Export endpoints: catalogue and selection studies as CSV, XLSX, DOCX, PPTX or HTML,
one material as a CAE card (D-104), and a material curve's points (D-106).

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
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_project, get_current_user, get_unit_choices
from app.domain.errors import ValidationError
from app.exporters.docx import to_docx
from app.exporters.html import to_html
from app.exporters.pptx import to_pptx
from app.exporters.report import Report
from app.exporters.spreadsheet import to_csv, to_xlsx
from app.models.project import Project
from app.models.user import User
from app.services.cae_export_service import CaeExportService
from app.services.curve_service import CurveService
from app.services.export_service import ExportService

router = APIRouter(prefix="/exports", tags=["exports"])

CSV_MEDIA_TYPE = "text/csv; charset=utf-8"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
HTML_MEDIA_TYPE = "text/html; charset=utf-8"

SUPPORTED_FORMATS = ("csv", "xlsx", "html", "docx", "pptx")
LAUDO_SUPPORTED_FORMATS = ("html", "docx", "pptx")

# The report needs its own inline stylesheet and nothing else whatsoever.
HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'"


def _ascii_filename(name: str) -> str:
    """Fold a Portuguese title into a safe ASCII filename stem."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", folded).strip("-").lower()
    return cleaned or "relatorio"


def _file_response(report: Report, fmt: str) -> Response:
    """Serialise a report in the requested format with the right headers."""
    stem = _ascii_filename(report.title)
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

    # HTML opens in the browser so it can be printed; everything else downloads.
    kind = "inline" if fmt == "html" else "attachment"
    filename = f"{stem}.{fmt}"
    headers["Content-Disposition"] = (
        f'{kind}; filename="{filename}"; ' f"filename*=UTF-8''{quote(filename, safe='')}"
    )
    return Response(content=body, media_type=media_type, headers=headers)


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
    return _file_response(ExportService(db, user, unit_choices).catalogue_report(), fmt)


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
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
    unit_choices: dict[str, str] = Depends(get_unit_choices),
) -> Response:
    """The engineering report: a document distinct from the selection report,
    combining a ranking figure, the same audit tables, and — when the AI
    layer is on — an interpretive narrative. Available in HTML, DOCX and PPTX.
    """
    if fmt not in LAUDO_SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de laudo não suportado: '{fmt}'. Use {', '.join(LAUDO_SUPPORTED_FORMATS)}."
        )
    report = ExportService(db, user, unit_choices).study_laudo(
        study_id, project.id, responsible=responsavel
    )
    return _file_response(report, fmt)


@router.get("/materiais/{material_id}/cae")
def export_material_cae(
    material_id: int,
    formato: str = Query(description="mapdl, matml, abaqus, nastran ou lsdyna."),
    unidades: str = Query(
        description=(
            "Sistema de unidades CAE consistente: m-kg-s, mm-t-s ou in-lbf-s. Não é a "
            "unidade de leitura por propriedade do D-70: um solver precisa de um "
            "sistema inteiro, e não de uma escolha por grandeza."
        )
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """A material card for a CAE solver or MatML (D-104).

    Always an attachment: a deck is a file to be read by a solver, and the
    MatML is XML that must not render on the API's origin.
    """
    card = CaeExportService(db, user.id).material_card(material_id, formato, unidades)
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """A material curve's points as CSV or XLSX (D-106).

    The limitation notice, the provenance and the three units of each axis
    (reading, original, canonical) travel in the file; every cell goes through
    ``cells.py``, so a curve title written as a formula leaves as text.
    """
    if fmt not in CURVE_SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação de curva não suportado: '{fmt}'. "
            f"Use {', '.join(CURVE_SUPPORTED_FORMATS)}."
        )
    report = CurveService(db, user.id).curve_report(
        material_id, curve_id, x_unit=unidade_x, y_unit=unidade_y
    )
    return _file_response(report, fmt)


def _require_supported(fmt: str) -> None:
    if fmt not in SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação não suportado: '{fmt}'. " f"Use {', '.join(SUPPORTED_FORMATS)}."
        )
