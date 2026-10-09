"""Material curves: a figure, its series and their ordered points (D-106, TM4).

Three tables because a curve has three levels and each has its own facts:

* ``MaterialCurve`` — the figure: what kind of curve it is, the quantity and the
  **original unit** of each axis (one per axis, as a source writes a table), the
  canonical units and the conversion method, the family parameter, the source,
  the quality, ``is_demo`` and — for an official curve — the dataset identity
  that makes a re-import idempotent and a changed curve a refusal (D-102).
* ``MaterialCurveSeries`` — one line of the legend: its declared label, its
  conditions as the source states them, and the value of the family parameter
  (a temperature, a strain rate, a stress ratio) with its own unit trail.
* ``MaterialCurvePoint`` — one point, ordered by ``position``: what the source
  wrote (``*_value``, in the curve's original units) and the canonical numbers
  (``*_normalized``), with an optional band (``y_min``/``y_max``).

The ``CHECK``s repeat ``app.domain.curves`` where a single row can be checked:
the seed, the official importer and a future migration write these tables
without passing through a service. Two of them deserve a note:

* **Finite, portably.** ``col > -1e308 AND col < 1e308`` rejects ±Infinity on
  both engines, and NaN too: PostgreSQL orders NaN above every number, and
  SQLite stores NaN as NULL, which ``NOT NULL`` already refuses.
* **A band has both sides or none**, and contains its line.

What a ``CHECK`` cannot see — x increasing along a series, a parameter repeated
across series, the kind admitting the axis quantity — is the builder's job.

No point row is a number the source did not give: a point is a measured pair,
and "no curve" is the absence of rows, which the sheet writes in words (D-24).
Visibility is the material's (D-62): every read goes through the material.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.curve_quantities import MODULUS_KINDS, QUANTITIES, STRAIN_MEASURES
from app.models.enums import CurveKind, DataQuality


def _utcnow() -> datetime:
    return datetime.now(UTC)


_QUANTITY_LIST = ", ".join(f"'{key}'" for key in sorted(QUANTITIES))
_STRAIN_MEASURE_LIST = ", ".join(f"'{key}'" for key in sorted(STRAIN_MEASURES))
_MODULUS_KIND_LIST = ", ".join(f"'{key}'" for key in sorted(MODULUS_KINDS))
#: Literal bounds, not ``'Infinity'``: the same text must parse on both engines.
_FINITE_BOUND = "1e308"


def _finite(column: str, *, nullable: bool = False) -> str:
    check = f"({column} > -{_FINITE_BOUND} AND {column} < {_FINITE_BOUND})"
    return f"({column} IS NULL OR {check})" if nullable else check


class MaterialCurve(Base):
    __tablename__ = "material_curve"
    __table_args__ = (
        CheckConstraint(f"x_quantity IN ({_QUANTITY_LIST})", name="ck_material_curve_x_quantity"),
        CheckConstraint(f"y_quantity IN ({_QUANTITY_LIST})", name="ck_material_curve_y_quantity"),
        CheckConstraint(
            f"parameter_quantity IS NULL OR parameter_quantity IN ({_QUANTITY_LIST})",
            name="ck_material_curve_parameter_quantity",
        ),
        CheckConstraint("title <> ''", name="ck_material_curve_title_not_blank"),
        # An official curve carries its whole external identity, or none of it.
        CheckConstraint(
            "(dataset_id IS NULL AND external_id IS NULL AND raw_sha256 IS NULL) OR "
            "(dataset_id IS NOT NULL AND external_id IS NOT NULL AND raw_sha256 IS NOT NULL)",
            name="ck_material_curve_external_identity",
        ),
        UniqueConstraint("dataset_id", "external_id", name="uq_material_curve_external"),
        # D-119: declared, never presumed; and only where it means something.
        CheckConstraint(
            f"strain_measure IS NULL OR (strain_measure IN ({_STRAIN_MEASURE_LIST}) "
            "AND kind = 'TENSAO_DEFORMACAO')",
            name="ck_material_curve_strain_measure",
        ),
        CheckConstraint(
            f"modulus_kind IS NULL OR (modulus_kind IN ({_MODULUS_KIND_LIST}) "
            "AND y_quantity = 'modulo')",
            name="ck_material_curve_modulus_kind",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[CurveKind] = mapped_column(
        Enum(CurveKind, native_enum=False, length=20), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    x_quantity: Mapped[str] = mapped_column(String(32), nullable=False)
    y_quantity: Mapped[str] = mapped_column(String(32), nullable=False)
    #: The axis titles as the source words them ("Deformação verdadeira"); the
    #: quantity's own name is the fallback, never an invented title.
    x_label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    y_label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    x_original_unit: Mapped[str] = mapped_column(String(40), nullable=False)
    y_original_unit: Mapped[str] = mapped_column(String(40), nullable=False)
    x_canonical_unit: Mapped[str] = mapped_column(String(40), nullable=False)
    y_canonical_unit: Mapped[str] = mapped_column(String(40), nullable=False)
    x_conversion_method: Mapped[str] = mapped_column(String(120), nullable=False)
    y_conversion_method: Mapped[str] = mapped_column(String(120), nullable=False)
    #: What the family of series varies along, declared by the source. NULL is
    #: a single curve with no family, not a family whose parameter is unknown.
    parameter_quantity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    #: D-119 (TM5-b). Whether a stress–strain curve is engineering or true, as
    #: the source declares it. NULL is "not declared", never a default: the
    #: plastic CAE cards refuse such a curve instead of presuming either.
    strain_measure: Mapped[str | None] = mapped_column(String(12), nullable=True)
    #: D-119. Which modulus a ``modulo`` y axis carries (Young's, shear, bulk),
    #: as declared. NULL is "not declared": the curve is still drawn, but no
    #: CAE card reads E from it.
    modulus_kind: Mapped[str | None] = mapped_column(String(12), nullable=True)

    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"), nullable=False, index=True)
    citation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    data_quality: Mapped[DataQuality] = mapped_column(
        Enum(DataQuality, native_enum=False, length=12),
        default=DataQuality.IMPORTADO,
        nullable=False,
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # D-102: the identity of an official curve inside its release.
    dataset_id: Mapped[int | None] = mapped_column(
        ForeignKey("catalog_dataset.id", ondelete="CASCADE"), nullable=True, index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(240), nullable=True)
    raw_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    material: Mapped[Material] = relationship(back_populates="curves")  # noqa: F821
    source: Mapped[Source] = relationship()  # noqa: F821
    series: Mapped[list[MaterialCurveSeries]] = relationship(
        back_populates="curve",
        cascade="all, delete-orphan",
        order_by="MaterialCurveSeries.position",
    )


class MaterialCurveSeries(Base):
    __tablename__ = "material_curve_series"
    __table_args__ = (
        UniqueConstraint("curve_id", "position", name="uq_material_curve_series_position"),
        CheckConstraint("position >= 0", name="ck_material_curve_series_position"),
        # The parameter's whole trail, or none of it.
        CheckConstraint(
            "(parameter_value IS NULL AND parameter_original_unit IS NULL "
            "AND parameter_normalized IS NULL AND parameter_canonical_unit IS NULL "
            "AND parameter_conversion_method IS NULL) OR "
            "(parameter_value IS NOT NULL AND parameter_original_unit IS NOT NULL "
            "AND parameter_normalized IS NOT NULL AND parameter_canonical_unit IS NOT NULL "
            "AND parameter_conversion_method IS NOT NULL)",
            name="ck_material_curve_series_parameter_trail",
        ),
        CheckConstraint(
            f"{_finite('parameter_value', nullable=True)} AND "
            f"{_finite('parameter_normalized', nullable=True)}",
            name="ck_material_curve_series_parameter_finite",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    curve_id: Mapped[int] = mapped_column(
        ForeignKey("material_curve.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    conditions: Mapped[str | None] = mapped_column(String(500), nullable=True)
    parameter_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    parameter_original_unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    parameter_normalized: Mapped[float | None] = mapped_column(Float, nullable=True)
    parameter_canonical_unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    parameter_conversion_method: Mapped[str | None] = mapped_column(String(120), nullable=True)

    curve: Mapped[MaterialCurve] = relationship(back_populates="series")
    points: Mapped[list[MaterialCurvePoint]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="MaterialCurvePoint.position",
    )


class MaterialCurvePoint(Base):
    __tablename__ = "material_curve_point"
    __table_args__ = (
        UniqueConstraint("series_id", "position", name="uq_material_curve_point_position"),
        CheckConstraint("position >= 0", name="ck_material_curve_point_position"),
        CheckConstraint(
            " AND ".join(
                [
                    _finite("x_value"),
                    _finite("y_value"),
                    _finite("x_normalized"),
                    _finite("y_normalized"),
                    _finite("y_min_value", nullable=True),
                    _finite("y_max_value", nullable=True),
                    _finite("y_min_normalized", nullable=True),
                    _finite("y_max_normalized", nullable=True),
                ]
            ),
            name="ck_material_curve_point_finite",
        ),
        CheckConstraint(
            "(y_min_value IS NULL AND y_max_value IS NULL AND y_min_normalized IS NULL "
            "AND y_max_normalized IS NULL) OR "
            "(y_min_value IS NOT NULL AND y_max_value IS NOT NULL "
            "AND y_min_normalized IS NOT NULL AND y_max_normalized IS NOT NULL)",
            name="ck_material_curve_point_band_both_sides",
        ),
        CheckConstraint(
            "y_min_normalized IS NULL OR "
            "(y_min_normalized <= y_normalized AND y_normalized <= y_max_normalized)",
            name="ck_material_curve_point_band_contains",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(
        ForeignKey("material_curve_series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # As the source wrote them, in the curve's ``x_original_unit``/``y_original_unit``.
    x_value: Mapped[float] = mapped_column(Float, nullable=False)
    y_value: Mapped[float] = mapped_column(Float, nullable=False)
    y_min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    y_max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Canonical.
    x_normalized: Mapped[float] = mapped_column(Float, nullable=False)
    y_normalized: Mapped[float] = mapped_column(Float, nullable=False)
    y_min_normalized: Mapped[float | None] = mapped_column(Float, nullable=True)
    y_max_normalized: Mapped[float | None] = mapped_column(Float, nullable=True)

    series: Mapped[MaterialCurveSeries] = relationship(back_populates="points")
