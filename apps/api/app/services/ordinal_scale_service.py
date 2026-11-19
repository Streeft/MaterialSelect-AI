"""Hand-editing an ordinal scale, with the checks that keep it honest (D-251).

An ordinal property is a closed, *ordered* vocabulary (D-126). Nothing about it is
free text once it is in use: a material holds a level of it (by id), a saved study
asks for "at least *Bom*" (by label), and a use scenario of the project's table
asks for one too (by label, in code). So the curator may reshape the scale, but
never in a way that leaves any of those pointing at a level that is gone, was
silently renamed, or moved to mean something else:

* **add** a level anywhere — nothing holds or asks for it yet;
* **rename** a level — refused while a saved study or a scenario asks for the old
  label (their text would stop matching the scale);
* **remove** a level — refused while a material holds it, a study asks for it or
  a scenario asks for it (a held level is a datum; it is never turned into "sem
  dado" behind the curator's back);
* **reorder** the existing levels — refused while any level of the scale is asked
  for by a study or a scenario, because "at least *Bom*" would change meaning;
* the **name** and the **description** are free text.

Every refusal says which level and how many things depend on it. Every accepted
change is one ``AuditEvent`` with the scale before and after, written in the same
transaction (principle of M2). Nothing here touches a material's value.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.ordinal import describe_scale
from app.domain.use_scenarios import USE_SCENARIOS
from app.models.enums import AuditAction, AuditEntityType
from app.models.ordinal_property import OrdinalPropertyDefinition, OrdinalScaleLevel
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.ordinal_repository import OrdinalRepository
from app.schemas.ordinal import (
    OrdinalLevelOut,
    OrdinalScaleIn,
    OrdinalScaleOut,
)
from app.services.audit_service import diff_fields, record_change

#: Ranks are shifted by this much while a scale is rewritten, so the unique
#: ``(definition, rank)`` and ``(definition, label)`` keys never collide midway.
_SHIFT = 10_000


def _scenario_counts(slug: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for scenario in USE_SCENARIOS:
        for limit in scenario.constraints:
            if (
                limit.operator == "level_at_least"
                and limit.property_slug == slug
                and limit.level is not None
            ):
                counts[limit.level] = counts.get(limit.level, 0) + 1
    return counts


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


class OrdinalScaleService:
    def __init__(self, db: Session, user: User | None = None) -> None:
        self.repo = OrdinalRepository(db)
        self.audit_repo = AuditRepository(db)
        self.user = user

    # --- read ---------------------------------------------------------------

    def get(self, slug: str) -> OrdinalScaleOut:
        return self._out(self._definition(slug))

    # --- write --------------------------------------------------------------

    def update(self, slug: str, payload: OrdinalScaleIn) -> OrdinalScaleOut:
        definition = self._definition(slug)
        existing = {level.id: level for level in definition.levels}
        before = self._snapshot(definition)
        sent = payload.model_fields_set

        # --- the scale as asked -------------------------------------------------
        ids = [item.id for item in payload.levels if item.id is not None]
        if len(ids) != len(set(ids)):
            raise ValidationError("Um nível aparece duas vezes na escala.")
        unknown = [i for i in ids if i not in existing]
        if unknown:
            raise ValidationError(f"Nível que não pertence a esta escala: {unknown[0]}.")
        folded = [item.label.casefold() for item in payload.levels]
        if len(folded) != len(set(folded)):
            raise ValidationError("Dois níveis têm o mesmo nome: cada nível precisa de um nome só.")

        held = self.repo.held_counts(definition.id)
        studies = self.repo.study_label_counts(definition.slug)
        scenarios = _scenario_counts(definition.slug)

        def asked_for(label: str) -> tuple[int, int]:
            return studies.get(label, 0), scenarios.get(label, 0)

        # --- what would be lost, moved or renamed -----------------------------
        kept = {i for i in ids}
        for level_id, level in existing.items():
            n_studies, n_scenarios = asked_for(level.label)
            if level_id not in kept:
                if held.get(level_id, 0):
                    raise ConflictError(
                        f"“{level.label}” é o nível de "
                        f"{_plural(held[level_id], 'material', 'materiais')}: um nível "
                        "em uso não é removido (isso apagaria um dado)."
                    )
                if n_studies or n_scenarios:
                    raise ConflictError(
                        f"“{level.label}” é pedido por {_asked_text(n_studies, n_scenarios)} "
                        "e não pode ser removido."
                    )
        renamed = {
            item.id: item.label
            for item in payload.levels
            if item.id is not None and existing[item.id].label != item.label
        }
        for level_id in renamed:
            level = existing[level_id]
            n_studies, n_scenarios = asked_for(level.label)
            if n_studies or n_scenarios:
                raise ConflictError(
                    f"“{level.label}” é pedido por {_asked_text(n_studies, n_scenarios)}: "
                    "renomeá-lo deixaria esses pedidos sem nível correspondente."
                )
        old_order = [level.id for level in definition.levels if level.id in kept]
        new_order = [i for i in ids]
        if old_order != new_order:
            blocked = [level.label for level in definition.levels if any(asked_for(level.label))]
            if blocked:
                raise ConflictError(
                    "A ordem dos níveis existentes não muda enquanto há estudos ou cenários "
                    f"que pedem um nível desta escala (“{blocked[0]}”): “pelo menos este "
                    "nível” passaria a significar outra coisa."
                )

        # --- apply: free the unique keys, then write the final scale -------------
        if "name" in sent:
            name = (payload.name or "").strip()
            if not name:
                raise ValidationError("O nome da propriedade não pode ficar em branco.")
            if self.repo.name_taken(name, exclude_id=definition.id):
                raise ConflictError(f"Já existe uma propriedade ordinal com o nome: {name}")
            definition.name = name
        if "description" in sent:
            definition.description = (payload.description or "").strip() or None

        for level_id, level in existing.items():
            if level_id not in kept:
                self.repo.delete_level(level)
        self.repo.flush()
        for level_id in kept:
            level = existing[level_id]
            level.rank += _SHIFT
            if level_id in renamed:
                level.label = f"__editando_{level_id}__"
        self.repo.flush()
        for rank, item in enumerate(payload.levels):
            if item.id is None:
                self.repo.add_level(
                    OrdinalScaleLevel(definition_id=definition.id, rank=rank, label=item.label)
                )
            else:
                level = existing[item.id]
                level.rank = rank
                level.label = item.label
        self.repo.flush()
        self.repo.refresh(definition)

        changes = diff_fields(before, self._snapshot(definition))
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.ORDINAL_PROPERTY,
                entity_id=definition.id,
                entity_label=definition.name,
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )
        self.repo.commit()
        return self._out(self._definition(slug))

    # --- shaping --------------------------------------------------------------

    def _definition(self, slug: str) -> OrdinalPropertyDefinition:
        definition = self.repo.get_definition(slug)
        if definition is None:
            raise NotFoundError(f"Propriedade ordinal não encontrada: {slug}")
        return definition

    @staticmethod
    def _snapshot(definition: OrdinalPropertyDefinition) -> dict[str, object]:
        return {
            "name": definition.name,
            "description": definition.description,
            "escala": [level.label for level in definition.levels],
        }

    def _out(self, definition: OrdinalPropertyDefinition) -> OrdinalScaleOut:
        held = self.repo.held_counts(definition.id)
        studies = self.repo.study_label_counts(definition.slug)
        scenarios = _scenario_counts(definition.slug)
        levels = [
            OrdinalLevelOut(
                id=level.id,
                label=level.label,
                rank=level.rank,
                value_count=held.get(level.id, 0),
                study_count=studies.get(level.label, 0),
                scenario_count=scenarios.get(level.label, 0),
            )
            for level in definition.levels
        ]
        return OrdinalScaleOut(
            slug=definition.slug,
            name=definition.name,
            description=definition.description,
            levels=levels,
            scale_text=describe_scale([level.label for level in definition.levels]),
            is_demo=definition.is_demo,
        )


def _asked_text(n_studies: int, n_scenarios: int) -> str:
    parts = []
    if n_studies:
        parts.append(_plural(n_studies, "estudo salvo", "estudos salvos"))
    if n_scenarios:
        parts.append(_plural(n_scenarios, "cenário do projeto", "cenários do projeto"))
    return " e ".join(parts)
