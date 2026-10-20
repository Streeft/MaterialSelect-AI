"""Notas de família de materiais (D-151): o que a família é, e por quê.

Uma nota diz **o que uma família de materiais é, por que se comporta como se
comporta, onde se usa e o que conferir ao escolhê-la** — nunca quanto valem as
suas propriedades. É a irmã do glossário de propriedades (D-130) e segue as
mesmas três regras, cada uma com teste em ``test_family_notes.py``:

1. **Conceitual, nunca numérico.** Faixa típica ou exemplo com número seria dado
   de material inventado (princípio 1). Mais estrito que o glossário: o texto de
   uma nota não leva **algarismo nenhum**, e número seguido de unidade é recusado
   com mensagem própria. A referência normativa fica de fora, porque o número de
   uma norma não é valor.
2. **Estado de revisão declarado.** Toda nota nasce ``rascunho`` e só vira
   ``revisado`` por edição do autor no arquivo; a tela escreve o estado.
3. **Conteúdo versionado, não banco.** As notas vivem em
   ``app/glossary/families.json`` e mudam por PR. Este módulo é lógica pura:
   lê o arquivo, valida e indexa por slug, sem sessão de banco.

Não substitui ``MaterialClass.characteristics``/``applications`` (P1-4): aqueles
são duas frases editáveis pelo curador, no banco; a nota é texto autoral mais
longo, com licença e revisão, igual para todo catálogo que use o mesmo slug.

Família sem nota não é erro de carga: a interface escreve "Sem nota para esta
família", nunca um texto inventado.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.glossary import LICENSE_MAX, NUMBER_WITH_UNIT, REFERENCE_MAX

NOTES_PATH = Path(__file__).resolve().parent.parent / "glossary" / "families.json"

SUMMARY_MAX = 280
#: The body as a whole; it is split into short paragraphs, each capped too.
BODY_MAX = 1200
PARAGRAPH_MAX = 500
BODY_PARAGRAPHS_MAX = 4
#: One line of "quando escolher" or "cuidados na seleção".
ITEM_MAX = 200
ITEMS_MAX = 6

#: Families of the seed that deliberately have **no** note, each with the reason
#: written. Empty today: every family of ``seed.CLASSES`` has one. A new class
#: in the seed fails the coverage canary until it gets a note or a line here —
#: the absence has to be a decision, not an oversight.
FAMILIES_WITHOUT_NOTE: dict[str, str] = {}

ReviewStatus = Literal["rascunho", "revisado"]

_DIGIT = re.compile(r"\d")


class FamilyNote(BaseModel):
    """One authored note. Unknown fields are refused, types are not coerced."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    slug: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9_-]+$")
    summary: str = Field(min_length=1, max_length=SUMMARY_MAX)
    body: list[str] = Field(min_length=1, max_length=BODY_PARAGRAPHS_MAX)
    when_to_use: list[str] = Field(min_length=1, max_length=ITEMS_MAX)
    watch_out: list[str] = Field(min_length=1, max_length=ITEMS_MAX)
    reference: str | None = Field(default=None, min_length=1, max_length=REFERENCE_MAX)
    license: str = Field(min_length=1, max_length=LICENSE_MAX)
    review_status: ReviewStatus
    lang: Literal["pt-BR"]

    def texts(self) -> list[str]:
        """Every reader-facing text that must stay conceptual (not the reference)."""
        return [self.summary, *self.body, *self.when_to_use, *self.watch_out]

    @model_validator(mode="after")
    def _shape_and_no_numbers(self) -> FamilyNote:
        for paragraph in self.body:
            if not paragraph.strip() or len(paragraph) > PARAGRAPH_MAX:
                raise ValueError(f"parágrafo da nota deve ter entre 1 e {PARAGRAPH_MAX} caracteres")
        if sum(len(p) for p in self.body) > BODY_MAX:
            raise ValueError(f"o corpo da nota passa de {BODY_MAX} caracteres")
        for item in (*self.when_to_use, *self.watch_out):
            if not item.strip() or len(item) > ITEM_MAX:
                raise ValueError(f"item da nota deve ter entre 1 e {ITEM_MAX} caracteres")
        for text in self.texts():
            if match := NUMBER_WITH_UNIT.search(text):
                raise ValueError(
                    f"nota é conceitual: número com unidade ({match.group(0)!r}) "
                    "seria valor de material (D-151)"
                )
            if match := _DIGIT.search(text):
                raise ValueError(
                    "nota é conceitual: o texto não leva algarismo "
                    f"(encontrado {match.group(0)!r}; D-151)"
                )
        return self


class FamilyNotesError(ValueError):
    """The notes file is malformed — a build-time failure, never a 500 later."""


def parse_notes(raw: object) -> dict[str, FamilyNote]:
    """Validate a decoded notes list and index it by slug (unique)."""
    if not isinstance(raw, list):
        raise FamilyNotesError("as notas de família devem ser uma lista")
    notes: dict[str, FamilyNote] = {}
    for item in raw:
        note = FamilyNote.model_validate(item)
        if note.slug in notes:
            raise FamilyNotesError(f"slug repetido nas notas de família: {note.slug!r}")
        notes[note.slug] = note
    return notes


def load_notes(path: Path = NOTES_PATH) -> dict[str, FamilyNote]:
    """Read and validate the versioned file at ``path``."""
    return parse_notes(json.loads(path.read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def family_notes() -> dict[str, FamilyNote]:
    """The project's notes, read once per process."""
    return load_notes()
