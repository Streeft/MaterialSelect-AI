"""Declared equivalence between designations (D-115, TM1).

Reading answers for a material the groups a source has declared for its
designations, with the kind and the source written out. Writing is the curator's
(``require_catalog_curator`` on the router) and always names a source.

Nothing in this service looks at a code to decide anything: a group exists
because its ``designation_ids`` were entered, and the only text comparison in the
whole feature is none. See ``app.domain.equivalence``.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.designation import system_label
from app.domain.equivalence import (
    EquivalenceError,
    MemberCandidate,
    kind_label,
    kind_meaning,
    validate_group,
)
from app.domain.errors import NotFoundError, ValidationError
from app.models.enums import AuditAction, AuditEntityType
from app.models.equivalence import EquivalenceGroup, EquivalenceMember
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.equivalence_repository import EquivalenceRepository
from app.schemas.equivalence import (
    EquivalenceGroupIn,
    EquivalenceGroupOut,
    EquivalenceMemberOut,
    MaterialEquivalencesOut,
)
from app.services.audit_service import record_change


class EquivalenceService:
    def __init__(self, db: Session, user: User | None = None) -> None:
        self.repo = EquivalenceRepository(db, user.id if user else None)
        self.audit_repo = AuditRepository(db)
        self.user = user

    # --- reads -------------------------------------------------------------
    def for_material(self, material_id: int) -> MaterialEquivalencesOut:
        """The groups this material takes part in; empty when none was declared."""
        if self.repo.get_visible_material(material_id) is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        groups = self.repo.list_for_material(material_id)
        return MaterialEquivalencesOut(
            material_id=material_id,
            groups=[self._to_out(g, viewed_material_id=material_id) for g in groups],
        )

    def get(self, group_id: int) -> EquivalenceGroupOut:
        return self._to_out(self._require(group_id))

    # --- writes (curator) --------------------------------------------------
    def create(self, payload: EquivalenceGroupIn) -> EquivalenceGroupOut:
        group = EquivalenceGroup()
        self._apply(group, payload)
        self.repo.add(group)
        self.repo.flush()
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.EQUIVALENCE_GROUP,
            entity_id=group.id,
            entity_label=self._label(group),
            action=AuditAction.CRIADO,
        )
        self.repo.commit()
        return self._to_out(group)

    def update(self, group_id: int, payload: EquivalenceGroupIn) -> EquivalenceGroupOut:
        group = self._require(group_id)
        before = self._snapshot(group)
        self._apply(group, payload)
        self.repo.flush()
        after = self._snapshot(group)
        if before != after:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.EQUIVALENCE_GROUP,
                entity_id=group.id,
                entity_label=self._label(group),
                action=AuditAction.ATUALIZADO,
                changes={
                    k: {"before": before[k], "after": after[k]}
                    for k in after
                    if before[k] != after[k]
                },
            )
        self.repo.commit()
        return self._to_out(group)

    def delete(self, group_id: int) -> None:
        group = self._require(group_id)
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.EQUIVALENCE_GROUP,
            entity_id=group.id,
            entity_label=self._label(group),
            action=AuditAction.EXCLUIDO,
        )
        self.repo.delete(group)
        self.repo.commit()

    # --- internals ---------------------------------------------------------
    def _require(self, group_id: int) -> EquivalenceGroup:
        group = self.repo.get_group(group_id)
        if group is None:
            raise NotFoundError(f"Equivalência não encontrada: {group_id}")
        return group

    def _apply(self, group: EquivalenceGroup, payload: EquivalenceGroupIn) -> None:
        source = self.repo.get_source(payload.source_id)
        if source is None:
            raise NotFoundError(f"Fonte não encontrada: {payload.source_id}")
        ids = list(payload.designation_ids)
        found = {d.id: d for d in self.repo.get_designations(ids)}
        missing = [i for i in ids if i not in found]
        if missing:
            raise NotFoundError(f"Designação não encontrada: {missing[0]}")
        for d in found.values():
            if d.material.owner_id is not None:
                # A group is shared-catalogue data; a person's own record is not.
                raise ValidationError(
                    "Equivalência só liga designações do catálogo compartilhado, "
                    "não de um registro próprio."
                )
        candidates = [
            MemberCandidate(
                designation_id=i,
                is_demo=found[i].is_demo,
                material_is_demo=found[i].material.is_demo,
            )
            for i in ids
        ]
        try:
            is_demo = validate_group(candidates, source_is_demo=source.is_demo)
        except EquivalenceError as exc:
            raise ValidationError(str(exc)) from exc
        if not is_demo and not (source.license_label or "").strip():
            raise ValidationError(
                "A fonte citada não tem licença registrada; registre a licença da fonte "
                "antes de declarar equivalências a partir dela."
            )

        group.kind = payload.kind
        group.source_id = source.id
        group.source = source
        group.citation = _clean(payload.citation)
        group.note = _clean(payload.note)
        group.is_demo = is_demo
        # Diff the members instead of replacing them: dropping and re-adding the
        # same designation inside one flush would trip the unique constraint.
        keep = set(ids)
        group.members = [m for m in group.members if m.designation_id in keep]
        present = {m.designation_id for m in group.members}
        group.members.extend(EquivalenceMember(designation_id=i) for i in ids if i not in present)

    def _snapshot(self, group: EquivalenceGroup) -> dict:
        return {
            "kind": group.kind.value,
            "source_id": group.source_id,
            "citation": group.citation,
            "note": group.note,
            "designation_ids": sorted(m.designation_id for m in group.members),
        }

    def _label(self, group: EquivalenceGroup) -> str:
        codes = " ~ ".join(m.designation.code for m in group.members if m.designation)
        return f"Equivalência: {codes}"[:200]

    def _to_out(
        self, group: EquivalenceGroup, viewed_material_id: int | None = None
    ) -> EquivalenceGroupOut:
        shown = self.repo.visible_material_ids({m.designation.material_id for m in group.members})
        members = [
            EquivalenceMemberOut(
                designation_id=m.designation_id,
                system=m.designation.system,
                system_label=system_label(m.designation.system),
                code=m.designation.code,
                region=m.designation.region,
                material_id=m.designation.material_id,
                material_name=m.designation.material.name,
                material_is_active=m.designation.material.is_active,
                is_self=m.designation.material_id == viewed_material_id,
            )
            for m in group.members
            if m.designation.material_id in shown
        ]
        return EquivalenceGroupOut(
            id=group.id,
            kind=group.kind,
            kind_label=kind_label(group.kind),
            kind_meaning=kind_meaning(group.kind),
            source_id=group.source_id,
            source_label=group.source.label,
            license_label=group.source.license_label,
            citation=group.citation,
            note=group.note,
            is_demo=group.is_demo,
            members=members,
        )


def _clean(text: str | None) -> str | None:
    if text is None:
        return None
    text = text.strip()
    return text or None
