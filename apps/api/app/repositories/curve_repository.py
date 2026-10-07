"""Reads of material curves, always through the material's visibility (D-62, D-106).

A curve has no owner of its own: it is a fact about a material, so who may read
it is decided by the material row and nothing else. Every statement here joins
``Material`` and applies :func:`visible_materials`, which means a curve of
somebody else's record is not found — the same 404, by the same rule, as the
record's own sheet.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.domain.curves import NormalizedCurve
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.repositories.visibility import visible_materials


class CurveRepository:
    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    def get_material(self, material_id: int) -> Material | None:
        """The material, if this viewer may see it (active or not — like the sheet)."""
        return (
            self.db.execute(
                select(Material)
                .where(Material.id == material_id)
                .where(visible_materials(self.viewer_id))
            )
            .scalars()
            .one_or_none()
        )

    def list_for_material(self, material_id: int) -> list[MaterialCurve]:
        """Every curve of a visible material, with series and points for the counts."""
        stmt = (
            select(MaterialCurve)
            .join(Material, Material.id == MaterialCurve.material_id)
            .where(MaterialCurve.material_id == material_id)
            .where(visible_materials(self.viewer_id))
            .options(
                joinedload(MaterialCurve.source),
                selectinload(MaterialCurve.series).selectinload(MaterialCurveSeries.points),
            )
            .order_by(MaterialCurve.id)
        )
        return list(self.db.execute(stmt).scalars().unique())

    def get(self, material_id: int, curve_id: int) -> MaterialCurve | None:
        """One curve of a visible material; ``None`` for a curve of another material."""
        stmt = (
            select(MaterialCurve)
            .join(Material, Material.id == MaterialCurve.material_id)
            .where(MaterialCurve.id == curve_id)
            .where(MaterialCurve.material_id == material_id)
            .where(visible_materials(self.viewer_id))
            .options(
                joinedload(MaterialCurve.source),
                joinedload(MaterialCurve.material),
                selectinload(MaterialCurve.series).selectinload(MaterialCurveSeries.points),
            )
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()


def curve_rows(
    normalized: NormalizedCurve,
    *,
    material_id: int,
    title: str,
    source_id: int,
    description: str | None = None,
    x_label: str | None = None,
    y_label: str | None = None,
    citation: str | None = None,
    data_quality: DataQuality = DataQuality.IMPORTADO,
    is_demo: bool = False,
    dataset_id: int | None = None,
    external_id: str | None = None,
    raw_sha256: str | None = None,
) -> MaterialCurve:
    """The ORM rows for a curve the domain already built and validated.

    One writer for the seed and the official importer, so neither can store a
    curve the builder would have refused, nor drop a column of the unit trail.
    """
    return MaterialCurve(
        material_id=material_id,
        kind=normalized.kind,
        title=title,
        description=description,
        x_quantity=normalized.x_quantity,
        y_quantity=normalized.y_quantity,
        x_label=x_label,
        y_label=y_label,
        x_original_unit=normalized.x_original_unit,
        y_original_unit=normalized.y_original_unit,
        x_canonical_unit=normalized.x_canonical_unit,
        y_canonical_unit=normalized.y_canonical_unit,
        x_conversion_method=normalized.x_conversion_method,
        y_conversion_method=normalized.y_conversion_method,
        parameter_quantity=normalized.parameter_quantity,
        source_id=source_id,
        citation=citation,
        data_quality=data_quality,
        is_demo=is_demo,
        dataset_id=dataset_id,
        external_id=external_id,
        raw_sha256=raw_sha256,
        series=[
            MaterialCurveSeries(
                position=series.position,
                label=series.label,
                conditions=series.conditions,
                parameter_value=series.parameter_value,
                parameter_original_unit=series.parameter_original_unit,
                parameter_normalized=series.parameter_normalized,
                parameter_canonical_unit=series.parameter_canonical_unit,
                parameter_conversion_method=series.parameter_conversion_method,
                points=[
                    MaterialCurvePoint(
                        position=p.position,
                        x_value=p.x_value,
                        y_value=p.y_value,
                        y_min_value=p.y_min_value,
                        y_max_value=p.y_max_value,
                        x_normalized=p.x_normalized,
                        y_normalized=p.y_normalized,
                        y_min_normalized=p.y_min_normalized,
                        y_max_normalized=p.y_max_normalized,
                    )
                    for p in series.points
                ],
            )
            for series in normalized.series
        ],
    )
