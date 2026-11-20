"""The tray (D-258): what a reader is carrying to the bench."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.tray_tools import TOOLS_BY_SLUG, TRAY_TOOLS
from app.models.tray import TrayItem
from app.repositories.tray_repository import TrayRepository
from app.schemas.tray import (
    TrayItemIn,
    TrayItemOut,
    TrayItemPatch,
    TrayItemsIn,
    TrayOut,
    TrayToolOut,
)

#: A tray is what fits on a bench. The cap keeps it a working set and keeps one
#: account from filling the table.
MAX_TRAY_ITEMS = 40

#: The compartments each kind of thing may sit in; the first is its default.
_ADMITS: dict[str, tuple[str, ...]] = {
    "material": ("material", "fixacao"),
    "process": ("ferramenta",),
    "tool": ("ferramenta",),
}
_COMPARTMENT_LABEL = {"material": "Materiais", "fixacao": "Fixações", "ferramenta": "Ferramentas"}
_KIND_LABEL = {"material": "Um material", "process": "Um processo", "tool": "Uma calculadora"}


def _kind(item: TrayItem | TrayItemIn) -> str:
    if item.material_id is not None:
        return "material"
    return "process" if item.process_id is not None else "tool"


class TrayService:
    """Every method is scoped to one user: another reader's item is a 404."""

    def __init__(self, db: Session, user_id: int) -> None:
        self.repo = TrayRepository(db, user_id)
        self.user_id = user_id

    def tray(self) -> TrayOut:
        items = self.repo.list_items()
        readable = self.repo.visible_material_ids(
            [i.material_id for i in items if i.material_id is not None]
        )
        active = self.repo.active_process_ids(
            [i.process_id for i in items if i.process_id is not None]
        )
        out = [self._item_out(item, readable, active) for item in items]
        # A tool that left the closed list is no longer answered.
        return TrayOut(
            items=[item for item in out if item is not None],
            tools=[TrayToolOut(slug=t.slug, label=t.label, route=t.route) for t in TRAY_TOOLS],
            max_items=MAX_TRAY_ITEMS,
        )

    def put(self, payload: TrayItemsIn) -> TrayOut:
        """Puts each thing in the tray. One already there is left where it is
        (idempotent), so sending the catalogue's ticked materials twice changes
        nothing; nothing is written unless every item is valid."""
        existing = self.repo.list_items()
        seen = {self._key(item) for item in existing}
        fresh: list[TrayItemIn] = []
        for wanted in payload.items:
            compartment = self._compartment_for(wanted)
            self._check_target(wanted)
            key = self._key(wanted)
            if key in seen:
                continue
            seen.add(key)
            fresh.append(wanted.model_copy(update={"compartment": compartment}))
        if len(existing) + len(fresh) > MAX_TRAY_ITEMS:
            raise ConflictError(
                f"A bandeja leva até {MAX_TRAY_ITEMS} itens. Tire algum antes de pôr mais."
            )
        last: dict[str, int] = {}
        for item in existing:
            last[item.compartment] = max(last.get(item.compartment, -1), item.position)
        for wanted in fresh:
            position = last.get(wanted.compartment, -1) + 1
            last[wanted.compartment] = position
            self.repo.add(
                TrayItem(
                    user_id=self.user_id,
                    material_id=wanted.material_id,
                    process_id=wanted.process_id,
                    tool=wanted.tool,
                    compartment=wanted.compartment,
                    position=position,
                )
            )
        self.repo.commit()
        return self._reread()

    def update(self, item_id: int, patch: TrayItemPatch) -> TrayOut:
        item = self._own(item_id)
        if patch.compartment is not None and patch.compartment != item.compartment:
            self._refuse_wrong_compartment(_kind(item), patch.compartment)
            item.compartment = patch.compartment
            if patch.position is None:
                # Moved to another compartment with no place named: it goes last.
                siblings = [
                    other.position
                    for other in self.repo.list_items()
                    if other.compartment == patch.compartment and other.id != item.id
                ]
                item.position = max(siblings, default=-1) + 1
        if patch.position is not None:
            item.position = patch.position
        self.repo.commit()
        return self._reread()

    def remove(self, item_id: int) -> TrayOut:
        self.repo.delete(self._own(item_id))
        self.repo.commit()
        return self._reread()

    def clear(self) -> TrayOut:
        self.repo.clear()
        self.repo.commit()
        return self._reread()

    # --- helpers ------------------------------------------------------------

    def _reread(self) -> TrayOut:
        self.repo.expire_all()
        return self.tray()

    def _own(self, item_id: int) -> TrayItem:
        item = self.repo.get(item_id)
        if item is None:
            raise NotFoundError(f"Item da bandeja não encontrado: {item_id}")
        return item

    @staticmethod
    def _key(item: TrayItem | TrayItemIn) -> tuple[str, int | str]:
        kind = _kind(item)
        if kind == "material":
            return (kind, item.material_id)  # type: ignore[return-value]
        if kind == "process":
            return (kind, item.process_id)  # type: ignore[return-value]
        return (kind, item.tool)  # type: ignore[return-value]

    def _compartment_for(self, wanted: TrayItemIn) -> str:
        kind = _kind(wanted)
        if wanted.compartment is None:
            return _ADMITS[kind][0]
        self._refuse_wrong_compartment(kind, wanted.compartment)
        return wanted.compartment

    @staticmethod
    def _refuse_wrong_compartment(kind: str, compartment: str) -> None:
        if compartment not in _ADMITS[kind]:
            allowed = " ou ".join(_COMPARTMENT_LABEL[c] for c in _ADMITS[kind])
            raise ValidationError(
                f"{_KIND_LABEL[kind]} não vai em {_COMPARTMENT_LABEL[compartment]}: vai em {allowed}."
            )

    def _check_target(self, wanted: TrayItemIn) -> None:
        """The same 404 for a record that does not exist and for one this
        reader may not see (D-42)."""
        if wanted.material_id is not None:
            if not self.repo.visible_material_ids([wanted.material_id]):
                raise NotFoundError(f"Material não encontrado: {wanted.material_id}")
        elif wanted.process_id is not None:
            if not self.repo.active_process_ids([wanted.process_id]):
                raise NotFoundError(f"Processo não encontrado: {wanted.process_id}")
        elif wanted.tool not in TOOLS_BY_SLUG:
            raise ValidationError(f"Ferramenta desconhecida: {wanted.tool}.")

    @staticmethod
    def _item_out(item: TrayItem, readable: set[int], active: set[int]) -> TrayItemOut | None:
        base = {"id": item.id, "compartment": item.compartment, "position": item.position}
        if item.material_id is not None:
            ok = item.material_id in readable and item.material is not None
            return TrayItemOut(
                **base,
                kind="material",
                record_id=item.material_id,
                # A material this reader can no longer read is not named either.
                name=item.material.name if ok else "Material indisponível",
                detail=item.material.material_class.name if ok else None,
                href=f"/app/materiais/{item.material_id}" if ok else None,
                unavailable=not ok,
            )
        if item.process_id is not None:
            ok = item.process_id in active and item.process is not None
            return TrayItemOut(
                **base,
                kind="process",
                record_id=item.process_id,
                name=item.process.name if ok else "Processo indisponível",
                detail=item.process.process_class.name if ok else None,
                href=f"/app/processos/{item.process.slug}" if ok else None,
                unavailable=not ok,
            )
        tool = TOOLS_BY_SLUG.get(item.tool or "")
        if tool is None:
            return None
        return TrayItemOut(**base, kind="tool", tool=tool.slug, name=tool.label, href=tool.route)
