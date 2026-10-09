"""Material curve responses (D-106, TM4).

Everything the figure draws arrives here in **data coordinates and reading
units**, already computed (ADR 0004): the polyline of each series, the band as a
closed polygon, the padded domain of each axis. The client maps data to pixels
and picks tick positions — nothing else.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import CurveKind, DataQuality

ScaleName = Literal["linear", "log-x", "log-y", "log-log"]


class CurveKindCount(BaseModel):
    """How many curves of one kind the material has — zero included (D-24)."""

    kind: CurveKind
    label: str
    count: int


class CurveSummaryOut(BaseModel):
    id: int
    kind: CurveKind
    kind_label: str
    title: str
    x_quantity: str
    x_quantity_label: str
    y_quantity: str
    y_quantity_label: str
    parameter_quantity_label: str | None = None
    series_count: int
    point_count: int
    source_label: str
    is_demo: bool
    #: Carries a dataset identity from the official catalogue (D-102): not edited by hand.
    is_official: bool = False


class MaterialCurvesOut(BaseModel):
    material_id: int
    material_name: str
    total: int
    #: Every kind, in a fixed order, with its count — a kind with no curve says 0
    #: curves, which is a fact about the record, not a value of anything.
    counts_by_kind: list[CurveKindCount]
    curves: list[CurveSummaryOut]


class UnitOption(BaseModel):
    unit: str
    label: str


class CurveAxisOut(BaseModel):
    quantity: str
    quantity_label: str
    #: The source's own axis title, when it gave one.
    title: str | None = None
    unit: str
    #: Empty for a pure number (cycles, stress ratio): the title then carries no unit.
    unit_label: str
    canonical_unit: str
    original_unit: str
    conversion_method: str
    accepted_units: list[UnitOption]
    log: bool
    log_refusal: str | None = None
    #: ``[min, max]`` in reading units, padded; ``None`` when nothing is drawn.
    domain: tuple[float, float] | None = None


class CurveParameterOut(BaseModel):
    quantity: str
    quantity_label: str
    unit: str
    unit_label: str
    canonical_unit: str
    #: The units the reader may choose for the parameter (TM4-e), as for an axis.
    accepted_units: list[UnitOption]


class CurvePointOut(BaseModel):
    """One row of the points table: reading units, the source's own numbers, drawn or not."""

    position: int
    x: float
    y: float
    y_min: float | None = None
    y_max: float | None = None
    x_original: float
    y_original: float
    y_min_original: float | None = None
    y_max_original: float | None = None
    drawn: bool


class CurveSeriesOut(BaseModel):
    id: int
    position: int
    #: The source's label; ``None`` when it gave none (the legend then shows the parameter).
    label: str | None = None
    conditions: str | None = None
    #: The family parameter in its reading unit (``parameter.unit``).
    parameter_value: float | None = None
    parameter_original: float | None = None
    parameter_original_unit: str | None = None
    path: list[tuple[float, float]]
    band: list[tuple[float, float]] | None = None
    points: list[CurvePointOut]
    excluded: int


class CurveOut(BaseModel):
    id: int
    material_id: int
    material_name: str
    kind: CurveKind
    kind_label: str
    title: str
    description: str | None = None
    scale: ScaleName
    available_scales: list[ScaleName]
    x_axis: CurveAxisOut
    y_axis: CurveAxisOut
    parameter: CurveParameterOut | None = None
    series: list[CurveSeriesOut]
    notes: list[str]
    source_label: str
    citation: str | None = None
    data_quality: DataQuality
    #: The curve or its source is fictitious (the D-104 rule).
    is_demo: bool
    is_own_record: bool


class CurveSeriesValueOut(BaseModel):
    """One series at the asked x: a declared point, or the written absence."""

    series_id: int
    label: str | None = None
    conditions: str | None = None
    parameter_value: float | None = None
    parameter_original: float | None = None
    parameter_original_unit: str | None = None
    found: bool
    #: Position of the declared point in the series — the reference to the stored row.
    position: int | None = None
    x_original: float | None = None
    y: float | None = None
    y_min: float | None = None
    y_max: float | None = None
    y_original: float | None = None
    y_min_original: float | None = None
    y_max_original: float | None = None
    #: Written when ``found`` is false; the number is absent, never zero (D-24).
    absence: str | None = None


class CurveValueOut(BaseModel):
    """The value of a curve at a declared x, by the declared rule (TM4-b, D-110)."""

    curve_id: int
    material_id: int
    title: str
    rule: str
    at: float
    at_unit: str
    at_unit_label: str
    x_quantity_label: str
    y_quantity_label: str
    y_unit: str
    y_unit_label: str
    parameter_unit_label: str | None = None
    found_count: int
    series: list[CurveSeriesValueOut]
    source_label: str
    citation: str | None = None
    is_demo: bool


# --- Writing a curve (TM4-d) ---------------------------------------------------


class CurvePointIn(BaseModel):
    """One point as the source wrote it, in the curve's original units."""

    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)
    #: A band has both sides or none; the domain refuses one side only.
    y_min: float | None = Field(default=None, allow_inf_nan=False)
    y_max: float | None = Field(default=None, allow_inf_nan=False)


class CurveSeriesIn(BaseModel):
    label: str | None = Field(default=None, max_length=160)
    conditions: str | None = Field(default=None, max_length=500)
    parameter: float | None = Field(default=None, allow_inf_nan=False)
    parameter_unit: str | None = Field(default=None, max_length=40)
    points: list[CurvePointIn] = Field(max_length=2000)


class CurveIn(BaseModel):
    """A whole curve being written; an update replaces it entirely.

    Validated by ``app.domain.curves.build_curve`` — the builder the seed and the
    official importer use — so a hand-written curve obeys the same rules:
    quantities the kind admits, units through ``units.py``, x strictly
    increasing, no point invented, no series reordered.
    """

    kind: CurveKind
    title: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=1000)
    x_quantity: str
    x_unit: str = Field(min_length=1, max_length=40)
    y_quantity: str
    y_unit: str = Field(min_length=1, max_length=40)
    x_label: str | None = Field(default=None, max_length=160)
    y_label: str | None = Field(default=None, max_length=160)
    parameter_quantity: str | None = None
    series: list[CurveSeriesIn] = Field(max_length=24)
    source_label: str = Field(min_length=1, max_length=160)
    citation: str | None = Field(default=None, max_length=500)
    data_quality: DataQuality = DataQuality.ESTIMADO


class CurveQuantityOut(BaseModel):
    key: str
    name: str
    reading_unit: str
    units: list[UnitOption]


class CurveKindSpecOut(BaseModel):
    kind: CurveKind
    label: str
    x_quantities: list[CurveQuantityOut]
    y_quantities: list[CurveQuantityOut]
    parameter_quantities: list[CurveQuantityOut]
