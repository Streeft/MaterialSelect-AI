"""Glossário de propriedades (D-129): leitura dos verbetes versionados.

Sem sessão de banco: os verbetes são conteúdo de referência em
``app/glossary/entries.json``, validados por ``app.domain.glossary``.
"""

from __future__ import annotations

from app.domain.errors import NotFoundError
from app.domain.glossary import GlossaryEntry, glossary
from app.schemas.glossary import GlossaryEntryOut


def _out(entry: GlossaryEntry) -> GlossaryEntryOut:
    return GlossaryEntryOut(**entry.model_dump())


class GlossaryService:
    def list_entries(self) -> list[GlossaryEntryOut]:
        """Every entry, in slug order so the response is stable."""
        return [_out(e) for _, e in sorted(glossary().items())]

    def get_entry(self, slug: str) -> GlossaryEntryOut:
        entry = glossary().get(slug)
        if entry is None:
            raise NotFoundError(f"Sem verbete no glossário para a propriedade '{slug}'.")
        return _out(entry)
