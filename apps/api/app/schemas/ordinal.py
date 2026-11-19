"""Schemas for ordinal material properties (D-126)."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class OrdinalPropertyOut(BaseModel):
    """One ordinal property and its scale, worst level first.

    ``kind`` is always ``"ORDINAL"``: it is what lets the constraint editor tell
    this apart from a numeric property or a discrete process attribute without
    a second lookup.
    """

    slug: str
    name: str
    description: str | None = None
    kind: str = "ORDINAL"
    levels: list[str]
    #: ``Muito pobre < … < Excelente`` — the order as a sentence, from the backend.
    scale_text: str
    is_demo: bool = False


class MaterialOrdinalValueOut(BaseModel):
    """The level a material holds on one ordinal property.

    One row per **defined** property, held or not: a property the material has
    no row for is ``status="sem_dado"`` with ``level`` NULL, exactly as one
    recorded missing is ``status="ausente"``. Neither is ever a level.
    """

    slug: str
    name: str
    status: str  # "nivel" | "ausente" | "sem_dado"
    status_text: str
    level: str | None = None
    rank: int | None = None
    scale: list[str]
    source_label: str | None = None
    data_quality: str | None = None
    measurement_condition: str | None = None
    notes: str | None = None
    is_demo: bool = False


class MaterialOrdinalValuesOut(BaseModel):
    material_id: int
    material_name: str
    values: list[MaterialOrdinalValueOut]


# --- hand-editing the scale (D-251) -------------------------------------------------

#: A scale is an order: at least two levels, and few enough to be read as a list.
MIN_SCALE_LEVELS = 2
MAX_SCALE_LEVELS = 12


class OrdinalLevelOut(BaseModel):
    """One level of a scale, with what depends on it — what the curator must know to edit."""

    id: int
    label: str
    rank: int
    #: Materials that hold exactly this level (a held level cannot be removed).
    value_count: int
    #: Saved studies with a "level at least" limit on this label (it cannot be renamed or removed).
    study_count: int
    #: Use scenarios of the project's table that ask for this label (the table is code).
    scenario_count: int


class OrdinalScaleOut(BaseModel):
    slug: str
    name: str
    description: str | None = None
    levels: list[OrdinalLevelOut]
    scale_text: str
    is_demo: bool = False


class OrdinalLevelIn(BaseModel):
    """A level as the curator left it: an existing one (``id``) or a new one (no ``id``)."""

    id: int | None = Field(default=None, gt=0)
    label: str = Field(min_length=1, max_length=80)

    @field_validator("label")
    @classmethod
    def _trim(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("O nome do nível não pode ficar em branco.")
        return value


class OrdinalScaleIn(BaseModel):
    """The scale as the curator wants it, **in order, worst level first**.

    ``levels`` is the whole scale: an existing level that is missing is removed
    (refused while a material holds it or a study asks for it), one with another
    ``label`` is renamed (refused while a study or a scenario asks for the old
    one), one in another position is moved, one without ``id`` is new. Only the
    fields sent apply to the name and the description: ``description: null``
    clears the text.
    """

    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    levels: list[OrdinalLevelIn] = Field(min_length=MIN_SCALE_LEVELS, max_length=MAX_SCALE_LEVELS)
