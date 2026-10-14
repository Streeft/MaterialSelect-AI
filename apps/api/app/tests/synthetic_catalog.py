"""A fictitious two-release catalogue for the release-diff tests and benchmark (D-123).

Every row is generated here; nothing is read from a real catalogue. Both
datasets are ``is_demo`` and the source and class say "fictícia".
"""

from __future__ import annotations

from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    CatalogDataset,
    CatalogRecordRef,
    Material,
    MaterialClass,
    MaterialPropertyValue,
    PropertyDefinition,
    Source,
)
from app.models.enums import BetterDirection, CurveKind, DataQuality, PropertyCategory
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries

LINEAGE = "bench-ficticio"
ELEMENTS = ("C", "Mn", "Si", "Cr", "Ni")


def build(
    db: Session,
    *,
    records: int,
    properties: int,
    curves_every: int = 4,
    points: int = 20,
) -> None:
    """Write two fictitious releases; ~10% of the records change between them."""
    db.add(Source(id=1, label="Fonte fictícia de benchmark", is_demo=True))
    db.add(MaterialClass(id=1, name="Classe fictícia B", slug="classe-ficticia-b"))
    for n in (1, 2):
        db.add(
            CatalogDataset(
                id=n,
                slug=f"bench-r{n}",
                name="Catálogo fictício de benchmark",
                release=f"R{n}",
                lineage=LINEAGE,
                source_sha256="b" * 64,
                license_label="Fictícia de benchmark",
                is_demo=True,
            )
        )
    db.execute(
        insert(PropertyDefinition),
        [
            dict(
                id=p,
                name=f"Propriedade fictícia {p}",
                slug=f"prop-b-{p}",
                category=PropertyCategory.MECANICA,
                canonical_unit="Pa",
                better_direction=BetterDirection.HIGHER,
            )
            for p in range(1, properties + 1)
        ],
    )
    db.flush()

    materials, refs, values, comps = [], [], [], []
    curves, series, pts = [], [], []
    mid = sid = 0
    for release in (1, 2):
        for r in range(records):
            mid += 1
            changed = release == 2 and r % 10 == 0
            materials.append(
                dict(id=mid, name=f"Liga B {r}", class_id=1, is_demo=True, is_active=True)
            )
            refs.append(
                dict(
                    dataset_id=release,
                    external_table="MaterialUniverse",
                    external_record_id=f"m-{r}",
                    raw_record_sha256=("d" if changed else "c") * 64,
                    material_id=mid,
                )
            )
            for p in range(1, properties + 1):
                v = float(r + p) + (0.5 if changed and p == 1 else 0.0)
                missing = p % 7 == 0
                values.append(
                    dict(
                        material_id=mid,
                        property_id=p,
                        is_missing=missing,
                        value_min=None if missing else v,
                        value_max=None if missing else v * 1.1,
                        value_typical=None if missing else v * 1.05,
                        original_unit=None if missing else "MPa",
                        normalized_value=None if missing else v * 1.05e6,
                        canonical_unit=None if missing else "Pa",
                        source_id=1,
                        data_quality=DataQuality.IMPORTADO,
                    )
                )
            for pos, element in enumerate(ELEMENTS):
                comps.append(
                    dict(
                        material_id=mid,
                        element=element,
                        position=pos,
                        value_min=0.1,
                        value_max=0.2,
                        normalized_min=0.1,
                        normalized_max=0.2,
                        original_unit="wt%",
                        canonical_unit="percent",
                        source_id=1,
                        data_quality=DataQuality.IMPORTADO,
                        is_demo=True,
                    )
                )
            comps.append(
                dict(
                    material_id=mid,
                    element="Fe",
                    position=len(ELEMENTS),
                    is_balance=True,
                    source_id=1,
                    data_quality=DataQuality.IMPORTADO,
                    is_demo=True,
                )
            )
            if r % curves_every == 0:
                curves.append(
                    dict(
                        id=mid,
                        material_id=mid,
                        kind=CurveKind.TENSAO_DEFORMACAO,
                        title="Tração",
                        x_quantity="deformacao",
                        y_quantity="tensao",
                        x_original_unit="%",
                        y_original_unit="MPa",
                        x_canonical_unit="%",
                        y_canonical_unit="Pa",
                        x_conversion_method="identity",
                        y_conversion_method="pint:MPa->Pa",
                        source_id=1,
                        data_quality=DataQuality.IMPORTADO,
                        is_demo=True,
                        dataset_id=release,
                        external_id=f"curve-{r}",
                        raw_sha256="e" * 64,
                    )
                )
                for s in range(2):
                    sid += 1
                    series.append(dict(id=sid, curve_id=mid, position=s, label=f"{20 + s} °C"))
                    for k in range(points):
                        y = 10.0 * k + (1.0 if changed and k == 3 else 0.0)
                        pts.append(
                            dict(
                                series_id=sid,
                                position=k,
                                x_value=float(k),
                                y_value=y,
                                x_normalized=float(k),
                                y_normalized=y * 1e6,
                            )
                        )
    for model, rows in (
        (Material, materials),
        (CatalogRecordRef, refs),
        (MaterialPropertyValue, values),
        (MaterialCompositionEntry, comps),
        (MaterialCurve, curves),
        (MaterialCurveSeries, series),
        (MaterialCurvePoint, pts),
    ):
        for start in range(0, len(rows), 20000):
            db.execute(insert(model), rows[start : start + 20000])
    db.flush()
