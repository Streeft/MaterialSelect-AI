"""Contracts of the tray (D-258)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

#: Where an item sits. A material is a ``material`` or a ``fixacao`` (the same
#: steel, as a nail); a process and a tool are a ``ferramenta``.
TrayCompartment = Literal["material", "fixacao", "ferramenta"]
TrayKind = Literal["material", "process", "tool"]


class TrayItemIn(BaseModel):
    """One thing to put in the tray: exactly one target, and where it goes."""

    model_config = ConfigDict(extra="forbid")

    material_id: int | None = Field(default=None, gt=0)
    process_id: int | None = Field(default=None, gt=0)
    tool: str | None = Field(default=None, min_length=1, max_length=32)
    #: Omitted: a material goes to ``material``, anything else to ``ferramenta``.
    compartment: TrayCompartment | None = None

    @model_validator(mode="after")
    def _one_target(self) -> TrayItemIn:
        given = [v for v in (self.material_id, self.process_id, self.tool) if v is not None]
        if len(given) != 1:
            raise ValueError("Informe exatamente um: material_id, process_id ou tool.")
        return self


class TrayItemsIn(BaseModel):
    """Several at once — the catalogue's ticked materials go in one request."""

    model_config = ConfigDict(extra="forbid")

    items: list[TrayItemIn] = Field(min_length=1, max_length=40)


class TrayItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    compartment: TrayCompartment | None = None
    position: int | None = Field(default=None, ge=0, le=10_000)


class TrayItemOut(BaseModel):
    id: int
    kind: TrayKind
    compartment: TrayCompartment
    position: int
    #: The record's id (material or process); ``None`` for a tool.
    record_id: int | None = None
    #: The tool's slug; ``None`` for a record.
    tool: str | None = None
    name: str
    #: The record's class ("Metais", "Conformação"); ``None`` for a tool.
    detail: str | None = None
    #: Where the item opens: the sheet of the record, or the tool's screen.
    href: str | None = None
    #: A record that this reader can no longer read. It stays in the tray, named
    #: as such, until the reader takes it out — never dropped in silence.
    unavailable: bool = False


class TrayToolOut(BaseModel):
    slug: str
    label: str
    route: str


class TrayOut(BaseModel):
    items: list[TrayItemOut]
    #: Every calculator that can be carried, so the client keeps no list of its own.
    tools: list[TrayToolOut]
    max_items: int
