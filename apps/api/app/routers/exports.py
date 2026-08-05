"""Export endpoints: catalogue and selection studies as CSV, XLSX or HTML.

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

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.exporters.html import to_html
from app.exporters.report import Report
from app.exporters.spreadsheet import to_csv, to_xlsx
from app.services.export_service import ExportService

router = APIRouter(prefix="/exports", tags=["exports"])

CSV_MEDIA_TYPE = "text/csv; charset=utf-8"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HTML_MEDIA_TYPE = "text/html; charset=utf-8"

SUPPORTED_FORMATS = ("csv", "xlsx", "html")

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
def export_catalogue(fmt: str, db: Session = Depends(get_db)) -> Response:
    """Export the whole active catalogue with its provenance trail."""
    _require_supported(fmt)
    return _file_response(ExportService(db).catalogue_report(), fmt)


@router.get("/estudos/{study_id}.{fmt}")
def export_study(study_id: int, fmt: str, db: Session = Depends(get_db)) -> Response:
    """Export a saved study as a full selection report.

    The study is re-run server-side, so the file always reflects the current
    catalogue rather than a remembered result.
    """
    _require_supported(fmt)
    return _file_response(ExportService(db).study_report(study_id), fmt)


def _require_supported(fmt: str) -> None:
    from app.domain.errors import ValidationError

    if fmt not in SUPPORTED_FORMATS:
        raise ValidationError(
            f"Formato de exportação não suportado: '{fmt}'. " f"Use {', '.join(SUPPORTED_FORMATS)}."
        )
