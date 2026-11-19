"""The source registry: reading it, correcting a source and, since D-249, creating, deleting
and merging sources (D-236, D-244, D-249).

A source is shared reference data, so correcting one is the curator's
(``require_catalog_curator`` on the router). What may change is only what an ABNT
reference is made of — authors, title, publisher, year, address, access date.
Since D-244 the label, the licence (label and address) and the reference text may
be corrected too; the reviewer and the third-party flag are what the source *is*,
stamped once at registration, and are not reachable from here.

D-249 adds the three the screen lacked, all the curator's:

* **create** — label and licence required (the importer's gate), the registering curator and
  the time stamped from the session; never a demonstration source.
* **delete** — only a source **nothing cites**. One that is cited is refused with the count and
  the kinds, and the way out (merge it into another). A demonstration source is not deleted here:
  ``excluir_demo`` is the one path that removes demo data (docs/15).
* **merge** — every citation of the source moves to a target and the source goes, in one
  transaction, audited on both. Two refusals keep provenance honest: a demo source is not merged
  with a real one (or with anything — see above), and a source flagged as possibly third-party
  content does not move its values into one that is not flagged, which would hide the flag.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.domain.citation import SourceParts, abnt_reference, edit_bibliography, edit_registration
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.enums import AuditAction, AuditEntityType
from app.models.source import Source
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.source_repository import SourceRepository
from app.schemas.sources import SourceCreate, SourceMergeOut, SourceOut, SourcePatch
from app.services.audit_service import diff_fields, record_change

_REGISTRATION_FIELDS = ("label", "reference", "license_label", "license_url")
_BIBLIOGRAPHY_FIELDS = ("authors", "title", "publisher", "year", "url", "accessed_on")
_AUDITED_FIELDS = _BIBLIOGRAPHY_FIELDS + _REGISTRATION_FIELDS


def source_out(source: Source, citations: int | None = None) -> SourceOut:
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
        citations=citations,
    )


def _snapshot(source: Source) -> dict[str, object]:
    return {
        key: (value.isoformat() if hasattr(value, "isoformat") else value)
        for key in _AUDITED_FIELDS
        for value in (getattr(source, key),)
    }


class SourceService:
    def __init__(self, db: Session, user: User | None = None) -> None:
        self.repo = MaterialRepository(db, user.id if user else None)
        self.audit_repo = AuditRepository(db)
        self.sources = SourceRepository(db)
        self.user = user

    def list_sources(self) -> list[SourceOut]:
        counts = self.sources.citation_counts()
        return [source_out(s, counts.get(s.id, 0)) for s in self.repo.list_sources()]

    # --- creating (D-249) ----------------------------------------------------

    def create(self, payload: SourceCreate) -> SourceOut:
        """Register a source by hand: checked like an edit, stamped from the session."""
        sent = {key: getattr(payload, key) for key in payload.model_fields_set}
        registration = edit_registration(
            {key: sent[key] for key in _REGISTRATION_FIELDS if key in sent}
        )
        label = registration["label"]
        if registration.get("license_label") is None:
            raise ValidationError(
                "Informe a licença ou a procedência da fonte: uma fonte só entra no catálogo "
                "dizendo o que permite."
            )
        if self.repo.get_source_by_label(label) is not None:
            raise ConflictError(f"Já existe uma fonte com o rótulo «{label}».")
        bibliography = edit_bibliography(
            SourceParts(label=label), sent, today=datetime.now(UTC).date()
        )
        source = self.repo.create_source(
            label,
            is_demo=False,
            license_label=registration.get("license_label"),
            license_url=registration.get("license_url"),
            contains_third_party_data=payload.contains_third_party_data,
            reviewed_by_user_id=self.user.id if self.user else None,
        )
        source.reference = registration.get("reference")
        for key, value in bibliography.items():
            setattr(source, key, value)
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.SOURCE,
            entity_id=source.id,
            entity_label=source.label[:200],
            action=AuditAction.CRIADO,
            changes={
                "label": {"before": None, "after": source.label},
                "license_label": {"before": None, "after": source.license_label},
            },
        )
        self.repo.commit()
        return source_out(source, 0)

    # --- deleting (D-249) ----------------------------------------------------

    def _require(self, source_id: int) -> Source:
        source = self.repo.get_source(source_id)
        if source is None:
            raise NotFoundError(f"Fonte não encontrada: {source_id}")
        return source

    @staticmethod
    def _spoken(found: list[tuple[str, str, int]]) -> str:
        """ "12 valores de propriedade e 1 designação": what cites a source, in words."""
        parts = [f"{count} {one if count == 1 else many}" for one, many, count in found]
        return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " e " + parts[-1]

    def delete(self, source_id: int) -> None:
        """Remove a source that nothing cites; refuse, saying what cites it, otherwise."""
        source = self._require(source_id)
        if source.is_demo:
            raise ConflictError(
                "Esta é uma fonte de demonstração: ela só sai junto com o dado fictício, pelo "
                "passo «excluir_demo» do banco, nunca por esta tela."
            )
        found = self.sources.citations_of(source.id)
        if found:
            raise ConflictError(
                f"A fonte «{source.label}» é citada por {self._spoken(found)} e não pode ser "
                "apagada: apagá-la deixaria esses dados sem origem. Mescle-a em outra fonte, "
                "que passa a ser a citada."
            )
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.SOURCE,
            entity_id=source.id,
            entity_label=source.label[:200],
            action=AuditAction.EXCLUIDO,
            changes={"license_label": {"before": source.license_label, "after": None}},
        )
        self.sources.delete(source)
        self.repo.commit()

    # --- merging (D-249) -----------------------------------------------------

    def merge(self, source_id: int, target_id: int) -> SourceMergeOut:
        """Move every citation of ``source_id`` to ``target_id`` and remove ``source_id``."""
        source = self._require(source_id)
        if target_id == source_id:
            raise ValidationError(
                "Escolha outra fonte como destino: não dá para mesclar uma fonte nela mesma."
            )
        target = self._require(target_id)
        if source.is_demo or target.is_demo:
            raise ConflictError(
                "Fonte de demonstração não é mesclada por esta tela: o marcador de demonstração é "
                "dado e perderia o sentido. Ela sai junto com o dado fictício («excluir_demo»)."
            )
        if source.contains_third_party_data and not target.contains_third_party_data:
            raise ConflictError(
                f"A fonte «{source.label}» está sinalizada como possível conteúdo de terceiros e "
                f"«{target.label}» não está. Mesclar apagaria o sinal dos dados que passam a "
                "citar o destino: escolha um destino sinalizado."
            )
        moved = self.sources.move_citations(source.id, target.id)
        label = source.label
        license_label = source.license_label
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.SOURCE,
            entity_id=target.id,
            entity_label=target.label[:200],
            action=AuditAction.ATUALIZADO,
            changes={
                "mesclada": {"before": label, "after": target.label},
                "referencias_movidas": {"before": 0, "after": moved},
            },
        )
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.SOURCE,
            entity_id=source.id,
            entity_label=label[:200],
            action=AuditAction.EXCLUIDO,
            changes={
                "mesclada_em": {"before": None, "after": target.label},
                "license_label": {"before": license_label, "after": None},
            },
        )
        self.sources.delete(source)
        self.repo.commit()
        self.repo.db.refresh(target)
        return SourceMergeOut(
            target=source_out(target, self.sources.citation_counts().get(target.id, 0)), moved=moved
        )

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
        registration = edit_registration(
            {key: value for key, value in sent.items() if key in _REGISTRATION_FIELDS}
        )
        new_label = registration.get("label")
        if new_label is not None and new_label != source.label:
            other = self.repo.get_source_by_label(new_label)
            if other is not None and other.id != source.id:
                raise ConflictError(f"Já existe outra fonte com o rótulo «{new_label}».")
        values.update(registration)
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
