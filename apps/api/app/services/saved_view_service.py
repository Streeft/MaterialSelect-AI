"""Saved views: one reader's tabs on a database screen (D-209)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.saved_view import SavedView
from app.repositories.saved_view_repository import SavedViewRepository
from app.schemas.saved_view import SavedViewIn, SavedViewOut, SavedViewPatch

#: Tabs per screen. A bar with more than this many tabs is not a view list
#: any more, and the cap keeps one account from filling the table.
MAX_VIEWS_PER_SCOPE = 20


#: The screens whose blocks a reader rearranges (D-209 the dashboard, F6 the home page).
LAYOUT_SCOPES = frozenset({"painel", "inicio"})
#: Screens with blocks and no views: a layout is all they keep.
LAYOUT_ONLY_SCOPES = frozenset({"inicio"})


class SavedViewService:
    """Every method is scoped to one user: another reader's view is a 404,
    never a 403, so its existence is not disclosed (same as D-42)."""

    def __init__(self, db: Session, user_id: int) -> None:
        self.repo = SavedViewRepository(db)
        self.user_id = user_id

    def list_views(self, scope: str) -> list[SavedViewOut]:
        return [SavedViewOut.model_validate(v) for v in self.repo.list_for(self.user_id, scope)]

    def create_view(self, payload: SavedViewIn) -> SavedViewOut:
        existing = self.repo.list_for(self.user_id, payload.scope)
        if len(existing) >= MAX_VIEWS_PER_SCOPE:
            raise ConflictError(
                f"Limite de {MAX_VIEWS_PER_SCOPE} visões nesta tela. Apague uma antes de criar outra."
            )
        if payload.kind == "layout" and any(v.kind == "layout" for v in existing):
            raise ConflictError("Esta tela já tem um layout salvo; altere o existente.")
        if payload.kind == "layout" and payload.scope not in LAYOUT_SCOPES:
            raise ValidationError("Só o Painel e o Início guardam layout de blocos.")
        if payload.kind != "layout" and payload.scope in LAYOUT_ONLY_SCOPES:
            raise ValidationError("O Início guarda só o layout dos blocos, não visões.")
        view = SavedView(
            user_id=self.user_id,
            scope=payload.scope,
            name=payload.name.strip(),
            kind=payload.kind,
            config=payload.config.model_dump(exclude_none=True),
            position=max((v.position for v in existing), default=-1) + 1,
        )
        self.repo.add(view)
        self.repo.commit()
        self.repo.refresh(view)
        return SavedViewOut.model_validate(view)

    def update_view(self, view_id: int, patch: SavedViewPatch) -> SavedViewOut:
        view = self._own(view_id)
        if patch.kind is not None and (patch.kind == "layout") != (view.kind == "layout"):
            raise ValidationError("Uma visão não vira layout, nem um layout vira visão.")
        if patch.name is not None:
            view.name = patch.name.strip()
        if patch.kind is not None:
            view.kind = patch.kind
        if patch.config is not None:
            view.config = patch.config.model_dump(exclude_none=True)
        if patch.position is not None:
            view.position = patch.position
        self.repo.commit()
        self.repo.refresh(view)
        return SavedViewOut.model_validate(view)

    def delete_view(self, view_id: int) -> None:
        view = self._own(view_id)
        self.repo.delete(view)
        self.repo.commit()

    def _own(self, view_id: int) -> SavedView:
        view = self.repo.get(view_id, self.user_id)
        if view is None:
            raise NotFoundError(f"Visão não encontrada: {view_id}")
        return view
