"""Schemas for the material taxonomy (classes)."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class MaterialClassIn(BaseModel):
    """Payload to create or update a material class.

    ``slug`` is optional on input; when omitted it is derived from ``name``.
    ``parent_id`` enables the hierarchical taxonomy.
    """

    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    parent_id: int | None = None
    description: str | None = Field(default=None, max_length=500)
    #: The family record's own prose (P1-4). Editable through the same PUT the
    #: rest of the class is, so it lands in the audit trail like every other
    #: field — family text that changed with no record of who changed it would
    #: be the one part of the catalogue M2 could not answer for.
    applications: str | None = Field(default=None, max_length=1000)
    characteristics: str | None = Field(default=None, max_length=1000)


class MaterialClassPatch(BaseModel):
    """Payload to edit a class from the Admin's tree: any of ``parent_id``,
    ``name`` and ``description``, and only the ones sent (D-233 moved; D-238
    also renames and describes).

    Like the move (D-233) it never touches the slug — the class's address, in
    links and saved views — nor the family prose, so editing a name in the
    table cannot wipe the text a ``PUT`` would. An empty body is still refused:
    there must be something to change. ``parent_id: null`` means "to the root",
    and ``description: null`` (or blank) clears the description.
    """

    parent_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _something_to_change(self) -> MaterialClassPatch:
        if not self.model_fields_set:
            raise ValueError("Diga o que mudar: pai, nome ou descrição.")
        if "name" in self.model_fields_set and (self.name is None or not self.name.strip()):
            raise ValueError("O nome da classe não pode ficar vazio.")
        return self


class MaterialClassOut(BaseModel):
    """A material class as returned by the API.

    Deliberately **without** the family prose, which lives on
    :class:`MaterialClassDetailOut`. This is the shape a picker and a tree are
    drawn from, and attaching two paragraphs per class to it would send the whole
    editorial text of the taxonomy to render a dropdown — the same reason
    ``ProcessDetailOut`` is separate from ``ProcessOut``.
    """

    id: int
    name: str
    slug: str
    parent_id: int | None = None
    description: str | None = None
    #: Materials filed **directly** here, so an empty branch reads as empty
    #: instead of borrowing its children's contents. The subtree total is
    #: ``MaterialClassDetailOut.descendant_material_count``.
    material_count: int = 0


class ClassRefOut(BaseModel):
    """A folder named just enough to link to it — one step of a breadcrumb."""

    id: int
    name: str
    slug: str


class MaterialClassDetailOut(MaterialClassOut):
    """One family, read as a **record** rather than as a label (P1-4).

    Three things a label cannot carry, and each answers a question the browse
    step actually asks:

    * ``applications``/``characteristics`` — what this family *is* and where it
      is used. NULL means nobody wrote it, and the interface says so in words
      (D-24); it is never an empty panel.
    * ``ancestors`` — root→parent, **self excluded**, which is the breadcrumb.
      Excluded because the page the reader is on is not a link back to itself.
    * ``children`` — the direct subfolders, each with its own direct count.

    ``descendant_material_count`` is what makes the tree navigable: a pure branch
    has ``material_count`` 0 by design, and without the subtree total a reader
    could not tell "empty folder" from "folder whose contents are one level
    down".

    Materials are **not** here. The catalogue already lists them through
    ``/api/materials``, and duplicating that list into the folder record would be
    a second truth about how a material is summarised.
    """

    applications: str | None = None
    characteristics: str | None = None
    ancestors: list[ClassRefOut] = []
    children: list[MaterialClassOut] = []
    descendant_material_count: int = 0
