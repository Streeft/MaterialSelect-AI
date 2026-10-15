"""Glossário de propriedades (D-129): verbetes conceituais, com fonte e licença.

Um verbete diz **o que uma grandeza significa e como se mede** — nunca quanto
ela vale. Três regras, cada uma com teste em ``test_glossary.py``:

1. **Conceitual, nunca numérico.** Faixa típica ou exemplo com número e unidade
   seria dado de material inventado (princípio 1). O validador recusa um número
   seguido de unidade em qualquer campo de texto do verbete; a referência
   normativa fica de fora porque o número de uma norma não é um valor.
2. **Estado de revisão declarado.** Todo verbete nasce ``rascunho`` e só vira
   ``revisado`` por edição do autor no arquivo; a tela escreve o estado.
3. **Conteúdo versionado, não banco.** Os verbetes vivem em
   ``app/glossary/entries.json`` e mudam por PR, como os ``PROPERTIES`` do seed.
   Este módulo é lógica pura: lê o arquivo, valida e indexa por slug, sem
   sessão de banco.

Slug sem verbete não é erro de carga: a interface escreve "Sem verbete no
glossário", nunca um texto inventado.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ENTRIES_PATH = Path(__file__).resolve().parent.parent / "glossary" / "entries.json"

SUMMARY_MAX = 280
DEFINITION_MAX = 900
HOW_MEASURED_MAX = 600
REFERENCE_MAX = 300
LICENSE_MAX = 200

ReviewStatus = Literal["rascunho", "revisado"]

# A number followed by a unit token: "200 GPa", "7,8 g/cm³", "25 °C", "0,3 %".
# Deliberately broad — a false alarm costs a rewording, a miss lets a typical
# value into a text that promises to have none.
_UNIT_TOKENS = (
    r"%|°\s?[CF]|K\b|[kMG]?Pa\b|psi\b|ksi\b|[kmµ]?g\b|t\b|[kmcµn]?m\b|[mc]?m[²³23]"
    r"|[kM]?J\b|kWh\b|W\b|HV\b|HB\b|HRC\b|USD|US\$|R\$|€|\$|kg\b|ppm\b|[mµ]?s\b|L\b"
)
NUMBER_WITH_UNIT = re.compile(rf"\d(?:[\d.,]*\d)?\s*(?:{_UNIT_TOKENS})")


class GlossaryEntry(BaseModel):
    """One authored entry. Unknown fields are refused, types are not coerced."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    summary: str = Field(min_length=1, max_length=SUMMARY_MAX)
    definition: str = Field(min_length=1, max_length=DEFINITION_MAX)
    how_measured: str | None = Field(default=None, min_length=1, max_length=HOW_MEASURED_MAX)
    reference: str | None = Field(default=None, min_length=1, max_length=REFERENCE_MAX)
    license: str = Field(min_length=1, max_length=LICENSE_MAX)
    review_status: ReviewStatus
    lang: Literal["pt-BR"]

    @field_validator("summary", "definition", "how_measured")
    @classmethod
    def _no_number_with_unit(cls, value: str | None) -> str | None:
        if value is not None and (match := NUMBER_WITH_UNIT.search(value)):
            raise ValueError(
                f"verbete é conceitual: número com unidade ({match.group(0)!r}) "
                "seria valor de material (D-129)"
            )
        return value


class GlossaryError(ValueError):
    """The entries file is malformed — a build-time failure, never a 500 later."""


def parse_entries(raw: object) -> dict[str, GlossaryEntry]:
    """Validate a decoded entries list and index it by slug (unique)."""
    if not isinstance(raw, list):
        raise GlossaryError("o glossário deve ser uma lista de verbetes")
    entries: dict[str, GlossaryEntry] = {}
    for item in raw:
        entry = GlossaryEntry.model_validate(item)
        if entry.slug in entries:
            raise GlossaryError(f"slug repetido no glossário: {entry.slug!r}")
        entries[entry.slug] = entry
    return entries


def load_entries(path: Path = ENTRIES_PATH) -> dict[str, GlossaryEntry]:
    """Read and validate the versioned file at ``path``."""
    return parse_entries(json.loads(path.read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def glossary() -> dict[str, GlossaryEntry]:
    """The project's entries, read once per process."""
    return load_entries()
