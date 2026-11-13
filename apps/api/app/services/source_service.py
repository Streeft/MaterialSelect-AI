"""The source registry: reading it and correcting a source's bibliographic fields (D-236).

A source is shared reference data, so correcting one is the curator's
(``require_catalog_curator`` on the router). What may change is only what an ABNT
reference is made of — authors, title, publisher, year, address, access date.
The label, the licence and the reviewer are what the source *is*, set once when
it was registered, and they are not reachable from here.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.domain.citation import SourceParts, abnt_reference, edit_bibliography
from app.domain.errors import NotFoundError
from app.models.enums import AuditAction, AuditEntityType
from app.models.source import Source
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.material_repository import MaterialRepository
from app.schemas.sources import SourceOut, SourcePatch
from app.services.audit_service import diff_fields, record_change

_BIBLIOGRAPHY_FIELDS = ("authors", "title", "publisher", "year", "url", "accessed_on")


def source_out(source: Source) -> SourceOut:
    return SourceOut(
        id=source.id,
        label=source.label,
        reference=source.reference,
        authors=source.authors,
        title=source.title,
        publisher=source.publisher,
        year=source.year,
        url=source.url,
        accessed_on=source.accessed_on,
        is_demo=source.is_demo,
        license_label=source.license_label,
        license_url=source.license_url,
        contains_third_party_data=source.contains_third_party_data,
        reviewed_by_email=source.reviewed_by.email if source.reviewed_by else None,
        reviewed_at=source.reviewed_at,
        abnt=abnt_reference(SourceParts.from_source(source)),
    )


def _snapshot(source: Source) -> dict[str, object]:
    return {
        key: (value.isoformat() if hasattr(value, "isoformat") else value)
        for key in _BIBLIOGRAPHY_FIELDS
        for value in (getattr(source, key),)
    }


class SourceService:
    def __init__(self, db: Session, user: User | None = None) -> None:
        self.repo = MaterialRepository(db, user.id if user else None)
        self.audit_repo = AuditRepository(db)
        self.user = user

    def list_sources(self) -> list[SourceOut]:
        return [source_out(s) for s in self.repo.list_sources()]

    def patch(self, source_id: int, payload: SourcePatch) -> SourceOut:
        """Apply the fields that were sent, or refuse the whole edit with the reason.

        All or nothing: every field is checked before any is written, so a
        refused year leaves the title as it was.
        """
        source = self.repo.get_source(source_id)
        if source is None:
            raise NotFoundError(f"Fonte não encontrada: {source_id}")
        sent = {key: getattr(payload, key) for key in payload.model_fields_set}
        values = edit_bibliography(
            SourceParts.from_source(source), sent, today=datetime.now(UTC).date()
        )
        before = _snapshot(source)
        for key, value in values.items():
            setattr(source, key, value)
        changes = diff_fields(before, _snapshot(source))
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.SOURCE,
                entity_id=source.id,
                entity_label=source.label[:200],
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )
        self.repo.commit()
        return source_out(source)
