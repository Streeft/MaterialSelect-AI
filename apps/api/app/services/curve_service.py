"""Material curves for the sheet and for export (D-106, TM4).

The service turns ORM rows into the domain's plain data, asks
``app.domain.curves.draw_curve`` for the geometry, and shapes the answer. It
adds no number of its own: the reading conversion, the band polygon and the
padded domain all come from the domain, and the export reads the same drawn
curve the screen reads, so the file and the figure cannot disagree.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.units import pretty_unit
from app.domain.curve_quantities import QUANTITIES, AxisQuantity
from app.domain.curves import (
    KINDS,
    CurveError,
    DrawnAxis,
    DrawnCurve,
    PointData,
    SeriesData,
    available_scales,
    draw_curve,
    log_refusal,
    lower_first,
)
from app.domain.errors import NotFoundError, ValidationError
from app.exporters.report import Report, Sheet, standard_notices
from app.models.enums import CurveKind
from app.models.material_curve import MaterialCurve
from app.repositories.curve_repository import CurveRepository
from app.schemas.curve import (
    CurveAxisOut,
    CurveKindCount,
    CurveOut,
    CurveParameterOut,
    CurvePointOut,
    CurveSeriesOut,
    CurveSummaryOut,
    MaterialCurvesOut,
    UnitOption,
)

DATA_QUALITY_LABELS = {"MEDIDO": "Medido", "IMPORTADO": "Importado", "ESTIMADO": "Estimado"}


def _unit_label(unit: str) -> str:
    return "" if unit == "dimensionless" else pretty_unit(unit)


def _unit_option_label(unit: str) -> str:
    return "adimensional" if unit == "dimensionless" else pretty_unit(unit)


def _unit_options(quantity: AxisQuantity) -> list[UnitOption]:
    """The units a reader may choose for a quantity, the convention first."""
    units = dict.fromkeys(
        [quantity.reading_unit, *quantity.accepted_units, quantity.canonical_unit]
    )
    return [UnitOption(unit=u, label=_unit_option_label(u)) for u in units]


def _series_data(curve: MaterialCurve) -> list[SeriesData]:
    return [
        SeriesData(
            id=series.id,
            label=series.label,
            conditions=series.conditions,
            parameter=series.parameter_normalized,
            parameter_original=series.parameter_value,
            parameter_original_unit=series.parameter_original_unit,
            points=tuple(
                PointData(
                    x=p.x_normalized,
                    y=p.y_normalized,
                    y_min=p.y_min_normalized,
                    y_max=p.y_max_normalized,
                    x_original=p.x_value,
                    y_original=p.y_value,
                    y_min_original=p.y_min_value,
                    y_max_original=p.y_max_value,
                )
                for p in series.points
            ),
        )
        for series in curve.series
    ]


def _is_demo(curve: MaterialCurve) -> bool:
    # A demo source makes the curve fictitious even on a real material (D-104).
    return curve.is_demo or curve.material.is_demo or curve.source.is_demo


class CurveService:
    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.repo = CurveRepository(db, viewer_id)

    # --- reads ---------------------------------------------------------------

    def list_curves(self, material_id: int) -> MaterialCurvesOut:
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        # The enum's order (stress–strain first, creep last), not the
        # alphabetical order of the stored strings.
        order = {kind: index for index, kind in enumerate(CurveKind)}
        curves = sorted(
            self.repo.list_for_material(material_id), key=lambda c: (order[c.kind], c.id)
        )
        counts = {kind: 0 for kind in CurveKind}
        for curve in curves:
            counts[curve.kind] += 1
        return MaterialCurvesOut(
            material_id=material.id,
            material_name=material.name,
            total=len(curves),
            counts_by_kind=[
                CurveKindCount(kind=kind, label=KINDS[kind].label, count=counts[kind])
                for kind in CurveKind
            ],
            curves=[
                CurveSummaryOut(
                    id=curve.id,
                    kind=curve.kind,
                    kind_label=KINDS[curve.kind].label,
                    title=curve.title,
                    x_quantity=curve.x_quantity,
                    x_quantity_label=curve.x_label or QUANTITIES[curve.x_quantity].name,
                    y_quantity=curve.y_quantity,
                    y_quantity_label=curve.y_label or QUANTITIES[curve.y_quantity].name,
                    parameter_quantity_label=(
                        QUANTITIES[curve.parameter_quantity].name
                        if curve.parameter_quantity
                        else None
                    ),
                    series_count=len(curve.series),
                    point_count=sum(len(s.points) for s in curve.series),
                    source_label=curve.source.label,
                    is_demo=curve.is_demo or material.is_demo or curve.source.is_demo,
                )
                for curve in curves
            ],
        )

    def _load(self, material_id: int, curve_id: int) -> MaterialCurve:
        curve = self.repo.get(material_id, curve_id)
        if curve is None:
            raise NotFoundError(f"Curva não encontrada: {curve_id}")
        return curve

    def _draw(
        self,
        curve: MaterialCurve,
        x_unit: str | None,
        y_unit: str | None,
        scale: str | None,
        parameter_unit: str | None = None,
    ) -> DrawnCurve:
        try:
            return draw_curve(
                curve.kind,
                curve.x_quantity,
                curve.y_quantity,
                curve.parameter_quantity,
                _series_data(curve),
                x_unit=x_unit,
                y_unit=y_unit,
                scale=scale,
                parameter_unit=parameter_unit,
            )
        except CurveError as exc:
            raise ValidationError(str(exc)) from exc

    def get_curve(
        self,
        material_id: int,
        curve_id: int,
        *,
        x_unit: str | None = None,
        y_unit: str | None = None,
        scale: str | None = None,
        parameter_unit: str | None = None,
    ) -> CurveOut:
        curve = self._load(material_id, curve_id)
        drawn = self._draw(curve, x_unit, y_unit, scale, parameter_unit)
        parameter = None
        if curve.parameter_quantity and drawn.parameter_reading is not None:
            quantity = QUANTITIES[curve.parameter_quantity]
            parameter = CurveParameterOut(
                quantity=curve.parameter_quantity,
                quantity_label=quantity.name,
                unit=drawn.parameter_reading.unit,
                unit_label=_unit_label(drawn.parameter_reading.unit),
                canonical_unit=quantity.canonical_unit,
                accepted_units=_unit_options(quantity),
            )
        return CurveOut(
            id=curve.id,
            material_id=curve.material_id,
            material_name=curve.material.name,
            kind=curve.kind,
            kind_label=KINDS[curve.kind].label,
            title=curve.title,
            description=curve.description,
            scale=drawn.scale,
            available_scales=available_scales(
                drawn.x.quantity, drawn.x.reading, drawn.y.quantity, drawn.y.reading
            ),
            x_axis=self._axis(drawn.x, curve, "x"),
            y_axis=self._axis(drawn.y, curve, "y"),
            parameter=parameter,
            series=[
                CurveSeriesOut(
                    id=s.id,
                    position=index,
                    label=s.label,
                    conditions=s.conditions,
                    parameter_value=s.parameter_value,
                    parameter_original=s.parameter_original,
                    parameter_original_unit=s.parameter_original_unit,
                    path=list(s.path),
                    band=list(s.band) if s.band is not None else None,
                    points=[
                        CurvePointOut(
                            position=p.position,
                            x=p.x,
                            y=p.y,
                            y_min=p.y_min,
                            y_max=p.y_max,
                            x_original=p.x_original,
                            y_original=p.y_original,
                            y_min_original=p.y_min_original,
                            y_max_original=p.y_max_original,
                            drawn=p.drawn,
                        )
                        for p in s.points
                    ],
                    excluded=s.excluded,
                )
                for index, s in enumerate(drawn.series)
            ],
            notes=drawn.notes,
            source_label=curve.source.label,
            citation=curve.citation,
            data_quality=curve.data_quality,
            is_demo=_is_demo(curve),
            is_own_record=curve.material.owner_id is not None,
        )

    @staticmethod
    def _axis(axis: DrawnAxis, curve: MaterialCurve, which: str) -> CurveAxisOut:
        quantity = axis.quantity
        return CurveAxisOut(
            quantity=quantity.key,
            quantity_label=quantity.name,
            title=getattr(curve, f"{which}_label"),
            unit=axis.reading.unit,
            unit_label=axis.unit_label,
            canonical_unit=quantity.canonical_unit,
            original_unit=getattr(curve, f"{which}_original_unit"),
            conversion_method=getattr(curve, f"{which}_conversion_method"),
            accepted_units=_unit_options(quantity),
            log=axis.log,
            log_refusal=log_refusal(quantity, axis.reading),
            domain=axis.domain,
        )

    # --- export ----------------------------------------------------------------

    def curve_report(
        self,
        material_id: int,
        curve_id: int,
        *,
        x_unit: str | None = None,
        y_unit: str | None = None,
    ) -> Report:
        """The curve's points as a document: limitation notice, provenance, units.

        Every point leaves, drawn or not — a file is the table, not the figure —
        and the scale does not enter: it is how a figure is drawn, not a fact
        about the data. A band the source did not give is written in words
        ("sem faixa declarada"), never as a blank cell that could read as zero.
        """
        curve = self._load(material_id, curve_id)
        drawn = self._draw(curve, x_unit, y_unit, "linear")
        xq, yq = drawn.x.quantity, drawn.y.quantity
        x_name = curve.x_label or xq.name
        y_name = curve.y_label or yq.name
        x_unit_label = _unit_option_label(drawn.x.reading.unit)
        y_unit_label = _unit_option_label(drawn.y.reading.unit)
        parameter = QUANTITIES[curve.parameter_quantity] if curve.parameter_quantity else None
        parameter_unit = (
            _unit_option_label(drawn.parameter_reading.unit) if drawn.parameter_reading else ""
        )

        about = Sheet(
            name="Curva",
            header=["Campo", "Valor"],
            rows=[
                ["Material", curve.material.name],
                ["Tipo de curva", KINDS[curve.kind].label],
                ["Título", curve.title],
                ["Descrição", curve.description or "não informada pela fonte"],
                ["Eixo x", f"{x_name} — lido em {x_unit_label}"],
                ["Eixo x: unidade original (da fonte)", curve.x_original_unit],
                ["Eixo x: unidade canônica", curve.x_canonical_unit],
                ["Eixo x: método de conversão", curve.x_conversion_method],
                ["Eixo y", f"{y_name} — lido em {y_unit_label}"],
                ["Eixo y: unidade original (da fonte)", curve.y_original_unit],
                ["Eixo y: unidade canônica", curve.y_canonical_unit],
                ["Eixo y: método de conversão", curve.y_conversion_method],
                [
                    "Família de curvas",
                    f"por {lower_first(parameter.name)} ({parameter_unit})" if parameter else "não",
                ],
                ["Fonte", curve.source.label],
                ["Citação", curve.citation or "não informada"],
                ["Qualidade do dado", DATA_QUALITY_LABELS.get(curve.data_quality.value, "")],
                ["Dado fictício", "sim" if _is_demo(curve) else "não"],
            ],
            notes=[
                "Pontos como a fonte os declarou: nada foi interpolado, extrapolado nem "
                "reduzido a um valor único.",
            ],
        )
        header = [
            "Série",
            f"Parâmetro ({parameter_unit})" if parameter else "Parâmetro",
            "Ponto",
            f"{x_name} ({x_unit_label})",
            f"{y_name} ({y_unit_label})",
            f"{y_name} mín. ({y_unit_label})",
            f"{y_name} máx. ({y_unit_label})",
            f"x original ({curve.x_original_unit})",
            f"y original ({curve.y_original_unit})",
            "Condições declaradas",
        ]
        rows: list[list[object]] = []
        for index, series in enumerate(drawn.series):
            name = series.label or f"Série {index + 1}"
            param: object = (
                series.parameter_value if series.parameter_value is not None else "sem família"
            )
            for point in series.points:
                rows.append(
                    [
                        name,
                        param,
                        point.position + 1,
                        point.x,
                        point.y,
                        point.y_min if point.y_min is not None else "sem faixa declarada",
                        point.y_max if point.y_max is not None else "sem faixa declarada",
                        point.x_original,
                        point.y_original,
                        series.conditions or "não informadas",
                    ]
                )
        points = Sheet(name="Pontos", header=header, rows=rows)
        return Report(
            title=f"Curva — {curve.title} — {curve.material.name}",
            subtitle=(
                f"{KINDS[curve.kind].label}; {sum(len(s.points) for s in drawn.series)} pontos em "
                f"{len(drawn.series)} série(s). Valores lidos em {x_unit_label} × {y_unit_label}; "
                f"a fonte os deu em {curve.x_original_unit} × {curve.y_original_unit}."
            ),
            notices=standard_notices(
                includes_demo_data=_is_demo(curve),
                includes_own_records=curve.material.owner_id is not None,
            ),
            sheets=[about, points],
        )
