"""Schemas for declared equivalence between designations (D-115, TM1)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.enums import DesignationSystem, EquivalenceKind


class EquivalenceGroupIn(BaseModel):
    """A curator's entry: what a source declares, and where it says so.

    ``source_id`` is required and has no default; there is no way to enter a
    correspondence without naming who declared it.
    """

    kind: EquivalenceKind
    source_id: int
    designation_ids: list[int] = Field(min_length=2, max_length=50)
    citation: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=500)


class EquivalenceMemberOut(BaseModel):
    designation_id: int
    system: DesignationSystem
    system_label: str
    code: str
    region: str | None = None
    material_id: int
    material_name: str
    #: The material was withdrawn from the catalogue; the declaration stays.
    material_is_active: bool = True
    #: This is the designation (or one of the designations) of the material whose
    #: sheet is being read.
    is_self: bool = False


class EquivalenceGroupOut(BaseModel):
    id: int
    kind: EquivalenceKind
    #: "Equivalente", "Aproximada" or "Similar".
    kind_label: str
    #: What the word means as the source's claim.
    kind_meaning: str
    source_id: int
    source_label: str
    license_label: str | None = None
    citation: str | None = None
    note: str | None = None
    is_demo: bool = False
    members: list[EquivalenceMemberOut]


class MaterialEquivalencesOut(BaseModel):
    """The groups a material takes part in. Empty means none declared, not "none exist"."""

    material_id: int
    groups: list[EquivalenceGroupOut] = []
