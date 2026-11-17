"""The PDF an engineer signed, attached to an issued laudo (D-243).

The service decides three things and nothing about the laudo's content:

* **What counts as a PDF**: the file must start with the ``%PDF-`` magic bytes (the name
  and the declared type prove nothing), be non-empty and within ``SIGNED_PDF_MAX_BYTES``.
  The system does not open the PDF, check a signature inside it or compare its text with
  the laudo: the signature is the engineer's, checked by whoever opens the file (a PDF
  reader, gov.br). What it does record is the file's SHA-256, who sent it and when.
* **Who may**: only the owner of the issued version (it is looked up in the caller's own
  project; anyone else's id is the same 404 as one that does not exist).
* **Nothing is lost**: a replacement is a new row and the previous ones stay in the
  history, downloadable by the owner. There is no delete. The frozen HTML and its
  ``content_sha256`` are never touched.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.errors import NotFoundError, PayloadTooLargeError, ValidationError
from app.exporters.laudo import short_code
from app.exporters.xml_text import xml_legal
from app.models.enums import AuditAction, AuditEntityType
from app.models.issued_report import IssuedReport
from app.models.issued_report_pdf import IssuedReportPdf
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.issued_report_pdf_repository import IssuedReportPdfRepository
from app.repositories.issued_report_repository import IssuedReportRepository
from app.schemas.laudo import SignedPdfOut, SignedPdfPublicOut
from app.services.audit_service import record_change

PDF_MAGIC = b"%PDF-"
NOT_ISSUED = "Laudo emitido não encontrado. O PDF assinado pertence a uma versão emitida."
NO_PDF = "Esta versão ainda não tem PDF assinado."


def clean_filename(name: str | None) -> str:
    """The uploaded file's name as a label: no path, no control characters, ``.pdf`` at the end."""
    text = unicodedata.normalize("NFC", xml_legal(name or ""))
    text = re.split(r"[\\/]", text)[-1]
    text = "".join(ch for ch in text if ch.isprintable()).strip()
    stem = text[:-4] if text.lower().endswith(".pdf") else text
    stem = stem.strip(" .")[:190] or "laudo-assinado"
    return f"{stem}.pdf"


def check_pdf(data: bytes) -> None:
    """Raise a Portuguese error unless ``data`` is a PDF within the size limit."""
    limit = settings.signed_pdf_max_bytes
    if len(data) > limit:
        raise PayloadTooLargeError(
            f"O PDF excede o limite de {limit / (1024 * 1024):.0f} MB. "
            "Reduza o arquivo (por exemplo, exporte de novo sem imagens extras) e envie outra vez."
        )
    if not data:
        raise ValidationError("O arquivo está vazio. Escolha o PDF que você assinou.")
    if not data.startswith(PDF_MAGIC):
        raise ValidationError(
            "O arquivo não é um PDF: ele não começa com a marca %PDF. "
            "Envie o PDF assinado (a extensão do arquivo não basta)."
        )


def pdf_out(row, *, current: bool) -> SignedPdfOut:
    return SignedPdfOut(
        id=row.id,
        issued_report_id=row.issued_report_id,
        filename=row.filename,
        size_bytes=row.size_bytes,
        sha256=row.sha256,
        short_sha256=short_code(row.sha256),
        uploaded_at=row.created_at,
        uploaded_by=row.uploaded_by_email,
        current=current,
    )


def public_summary(db: Session, issued_report_id: int) -> SignedPdfPublicOut | None:
    """What anyone holding the verification code may read about the signed PDF."""
    row = IssuedReportPdfRepository(db).latest_meta(issued_report_id)
    if row is None:
        return None
    return SignedPdfPublicOut(
        sha256=row.sha256,
        short_sha256=short_code(row.sha256),
        size_bytes=row.size_bytes,
        uploaded_at=row.created_at,
    )


class SignedPdfService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.issued = IssuedReportRepository(db)
        self.pdfs = IssuedReportPdfRepository(db)
        self.audit = AuditRepository(db)

    def _owned(self, project_id: int, issued_id: int) -> IssuedReport:
        report = self.issued.get_owned(project_id, issued_id)
        if report is None:
            raise NotFoundError(NOT_ISSUED)
        return report

    def upload(
        self, project_id: int, issued_id: int, filename: str | None, data: bytes
    ) -> SignedPdfOut:
        report = self._owned(project_id, issued_id)
        check_pdf(data)
        digest = hashlib.sha256(data).hexdigest()
        previous = self.pdfs.latest_meta(report.id)
        row = IssuedReportPdf(
            issued_report_id=report.id,
            project_id=project_id,
            uploaded_by_id=self.user.id,
            uploaded_by_email=self.user.email,
            filename=clean_filename(filename),
            size_bytes=len(data),
            sha256=digest,
            content=data,
            created_at=datetime.now(UTC),
        )
        self.pdfs.add(row)
        self.pdfs.flush()
        record_change(
            self.audit,
            self.user,
            entity_type=AuditEntityType.ISSUED_REPORT,
            entity_id=report.id,
            entity_label=xml_legal(f"Laudo «{report.study_name}» v{report.version}")[:200],
            action=AuditAction.ATUALIZADO,
            changes={
                "pdf_assinado": {
                    "before": previous.sha256 if previous is not None else None,
                    "after": digest,
                }
            },
            project_id=project_id,
        )
        self.pdfs.commit()
        return pdf_out(row, current=True)

    def history(self, project_id: int, issued_id: int) -> list[SignedPdfOut]:
        report = self._owned(project_id, issued_id)
        rows = self.pdfs.history(project_id, report.id)
        return [pdf_out(row, current=position == 0) for position, row in enumerate(rows)]

    def download(
        self, project_id: int, issued_id: int, pdf_id: int | None = None
    ) -> tuple[IssuedReport, IssuedReportPdf]:
        """The report and one of its PDFs: the current one, or an older one by id."""
        report = self._owned(project_id, issued_id)
        if pdf_id is None:
            row = self.pdfs.latest(report.id)
        else:
            row = self.pdfs.get_owned(project_id, report.id, pdf_id)
        if row is None:
            raise NotFoundError(NO_PDF if pdf_id is None else "PDF não encontrado.")
        return report, row

    def summaries(self, project_id: int, report_ids: list[int]) -> dict[int, list[SignedPdfOut]]:
        """For the version list: every upload of each version, newest first, in one query."""
        grouped: dict[int, list[SignedPdfOut]] = {}
        for row in self.pdfs.history_for_many(project_id, report_ids):
            bucket = grouped.setdefault(row.issued_report_id, [])
            bucket.append(pdf_out(row, current=not bucket))
        return grouped
