"""Notas de família de materiais (D-151): leitura das notas versionadas.

Sem sessão de banco: as notas são conteúdo de referência em
``app/glossary/families.json``, validadas por ``app.domain.family_notes``.
"""

from __future__ import annotations

from app.domain.errors import NotFoundError
from app.domain.family_notes import FamilyNote, family_notes
from app.schemas.family_notes import FamilyNoteOut


def _out(note: FamilyNote) -> FamilyNoteOut:
    return FamilyNoteOut(**note.model_dump())


class FamilyNoteService:
    def list_notes(self) -> list[FamilyNoteOut]:
        """Every note, in slug order so the response is stable."""
        return [_out(n) for _, n in sorted(family_notes().items())]

    def get_note(self, slug: str) -> FamilyNoteOut:
        note = family_notes().get(slug)
        if note is None:
            raise NotFoundError(f"Sem nota para a família '{slug}'.")
        return _out(note)
