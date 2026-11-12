"""Contracts of the saved views (D-207)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

#: The screens that keep views. A new screen joins here, on purpose: a scope
#: is a promise that some screen reads these rows back.
SavedViewScope = Literal["catalogo", "processos", "glossario", "painel"]
SavedViewKind = Literal["table", "gallery", "list", "layout"]

_KEY = r"^[a-z0-9_.:-]{1,64}$"


class ViewSort(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str = Field(pattern=_KEY)
    direction: Literal["asc", "desc"] = "asc"


class SavedViewConfig(BaseModel):
    """What a view remembers. Every list is bounded, every key is a short slug,
    and every value is a string the server itself lists (a class slug, a
    quality state) — never a number about a material."""

    model_config = ConfigDict(extra="forbid")

    filters: dict[str, str | None] = Field(default_factory=dict, max_length=20)
    sort: ViewSort | None = None
    #: Columns of a table view, in order.
    columns: list[str] | None = Field(default=None, max_length=50)
    #: Blocks of a layout, in order, and the ones hidden.
    blocks: list[str] | None = Field(default=None, max_length=50)
    hidden: list[str] | None = Field(default=None, max_length=50)

    @field_validator("filters")
    @classmethod
    def _filter_keys(cls, value: dict[str, str | None]) -> dict[str, str | None]:

        for key, item in value.items():
            if not re.fullmatch(_KEY, key):
                raise ValueError(f"Nome de filtro inválido: {key!r}")
            if item is not None and len(item) > 120:
                raise ValueError(f"Valor do filtro {key!r} longo demais")
        return value

    @field_validator("columns", "blocks", "hidden")
    @classmethod
    def _slugs(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        for item in value:
            if not re.fullmatch(_KEY, item):
                raise ValueError(f"Identificador inválido: {item!r}")
        return value


class SavedViewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope: SavedViewScope
    name: str = Field(min_length=1, max_length=80)
    kind: SavedViewKind
    config: SavedViewConfig = Field(default_factory=SavedViewConfig)


class SavedViewPatch(BaseModel):
    """Every field optional: renaming a tab must not resend its filters."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    kind: SavedViewKind | None = None
    config: SavedViewConfig | None = None
    position: int | None = Field(default=None, ge=0, le=999)


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scope: SavedViewScope
    name: str
    kind: SavedViewKind
    config: SavedViewConfig
    position: int
    created_at: datetime
    updated_at: datetime
