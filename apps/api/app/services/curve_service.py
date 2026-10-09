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
    READ_RULE,
    CurveError,
    DrawnAxis,
    DrawnCurve,
    PointData,
    PointInput,
    SeriesData,
    SeriesInput,
    available_scales,
    build_curve,
    draw_curve,
    log_refusal,
    lower_first,
    read_at_declared_x,
)
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.exporters.report import Report, Sheet, standard_notices
from app.models.enums import AuditAction, AuditEntityType, CurveKind
from app.models.material_curve import MaterialCurve
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.curve_repository import CurveRepository, curve_rows
from app.schemas.curve import (
    CurveAxisOut,
    CurveIn,
    CurveKindCount,
    CurveKindSpecOut,
    CurveOut,
    CurveParameterOut,
    CurvePointOut,
    CurveQuantityOut,
    CurveSeriesOut,
    CurveSeriesValueOut,
    CurveSummaryOut,
    CurveValueOut,
    MaterialCurvesOut,
    UnitOption,
)
from app.services.audit_service import diff_fields, record_change
from app.services.record_permissions import OFFICIAL_READ_ONLY, ensure_identity_writable

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
    def __init__(
        self,
        db: Session,
        viewer_id: int | None = None,
        *,
        user: User | None = None,
        can_edit_shared: bool = True,
    ) -> None:
        self.repo = CurveRepository(db, viewer_id)
        self.audit_repo = AuditRepository(db)
        # Only the writes below read these; the reads are unchanged. Same
        # defaults as MaterialService: callers outside the router act as curators.
        self.user = user
        self.can_edit_shared = can_edit_shared

    # --- writes (TM4-d) -------------------------------------------------------

    @staticmethod
    def kind_specs() -> list[CurveKindSpecOut]:
        """What each kind of curve admits, for the form — the same table the builder reads."""

        def quantity(key: str) -> CurveQuantityOut:
            q = QUANTITIES[key]
            units = list(dict.fromkeys([q.reading_unit, *q.accepted_units, q.canonical_unit]))
            return CurveQuantityOut(
                key=q.key,
                name=q.name,
                reading_unit=q.reading_unit,
                units=[UnitOption(unit=u, label=_unit_option_label(u)) for u in units],
            )

        return [
            CurveKindSpecOut(
                kind=kind,
                label=spec.label,
                x_quantities=[quantity(k) for k in spec.x_quantities],
                y_quantities=[quantity(k) for k in spec.y_quantities],
                parameter_quantities=[quantity(k) for k in spec.parameter_quantities],
            )
            for kind, spec in KINDS.items()
        ]

    def _writable_material(self, material_id: int):
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        ensure_identity_writable(
            material,
            can_edit_shared=self.can_edit_shared,
            is_official=self.repo.is_official(material.id),
        )
        return material

    @staticmethod
    def _summary(curve: MaterialCurve) -> str:
        points = sum(len(s.points) for s in curve.series)
        return (
            f"{KINDS[curve.kind].label}; x em {curve.x_original_unit}, y em "
            f"{curve.y_original_unit}; {len(curve.series)} série(s); {points} ponto(s); "
            f"fonte {curve.source.label}"
        )

    def _build_rows(self, material, payload: CurveIn) -> MaterialCurve:
        try:
            normalized = build_curve(
                payload.kind,
                x_quantity=payload.x_quantity,
                x_unit=payload.x_unit,
                y_quantity=payload.y_quantity,
                y_unit=payload.y_unit,
                parameter_quantity=payload.parameter_quantity,
                series=[
                    SeriesInput(
                        label=s.label,
                        conditions=s.conditions,
                        parameter=s.parameter,
                        parameter_unit=s.parameter_unit,
                        points=[PointInput(p.x, p.y, p.y_min, p.y_max) for p in s.points],
                    )
                    for s in payload.series
                ],
            )
        except CurveError as exc:
            raise ValidationError(str(exc)) from exc
        source = self.repo.get_or_create_source(
            payload.source_label.strip(), is_demo=material.is_demo
        )
        return curve_rows(
            normalized,
            material_id=material.id,
            title=payload.title.strip(),
            source_id=source.id,
            description=payload.description,
            x_label=payload.x_label,
            y_label=payload.y_label,
            citation=payload.citation,
            data_quality=payload.data_quality,
            is_demo=material.is_demo,
        )

    def _audit(self, material, changes: dict) -> None:
        if changes:
            record_change(
                self.audit_repo,
                self.user,
                entity_type=AuditEntityType.MATERIAL,
                entity_id=material.id,
                entity_label=material.name,
                action=AuditAction.ATUALIZADO,
                changes=changes,
            )

    def create_curve(self, material_id: int, payload: CurveIn) -> CurveSummaryOut:
        material = self._writable_material(material_id)
        curve = self._build_rows(material, payload)
        self.repo.add(curve)
        self.repo.flush()
        self._audit(
            material, {f"curva {curve.title}": {"before": None, "after": self._summary(curve)}}
        )
        self.repo.commit()
        return self._summary_out(self._load(material_id, curve.id), material)

    def replace_curve(self, material_id: int, curve_id: int, payload: CurveIn) -> CurveSummaryOut:
        """Replace one curve in place (same id), refusing an official one."""
        material = self._writable_material(material_id)
        current = self._load(material_id, curve_id)
        self._ensure_hand_written(current)
        before = {f"curva {current.title}": self._summary(current)}
        fresh = self._build_rows(material, payload)
        # Delete and re-insert under the same id rather than patching the rows:
        # the series and their points are replaced whole anyway, and a curve the
        # builder accepted is exactly the rows ``curve_rows`` writes.
        fresh.id = current.id
        fresh.created_at = current.created_at
        self.repo.delete(current)
        self.repo.flush()
        self.repo.add(fresh)
        self.repo.flush()
        current = fresh
        after = {f"curva {current.title}": self._summary(current)}
        self._audit(material, diff_fields(before, after))
        self.repo.commit()
        return self._summary_out(self._load(material_id, curve_id), material)

    def delete_curve(self, material_id: int, curve_id: int) -> None:
        material = self._writable_material(material_id)
        current = self._load(material_id, curve_id)
        self._ensure_hand_written(current)
        before = {f"curva {current.title}": self._summary(current)}
        self.repo.delete(current)
        self._audit(material, diff_fields(before, {}))
        self.repo.commit()

    @staticmethod
    def _ensure_hand_written(curve: MaterialCurve) -> None:
        # An official curve is identified by its dataset identity and hash, which
        # a re-import compares: editing it here would make the next import read a
        # changed curve and refuse it (D-102).
        if curve.dataset_id is not None:
            raise ConflictError(OFFICIAL_READ_ONLY)

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
                    is_official=curve.dataset_id is not None,
                )
                for curve in curves
            ],
        )

    @staticmethod
    def _summary_out(curve: MaterialCurve, material) -> CurveSummaryOut:
        return CurveSummaryOut(
            id=curve.id,
            kind=curve.kind,
            kind_label=KINDS[curve.kind].label,
            title=curve.title,
            x_quantity=curve.x_quantity,
            x_quantity_label=curve.x_label or QUANTITIES[curve.x_quantity].name,
            y_quantity=curve.y_quantity,
            y_quantity_label=curve.y_label or QUANTITIES[curve.y_quantity].name,
            parameter_quantity_label=(
                QUANTITIES[curve.parameter_quantity].name if curve.parameter_quantity else None
            ),
            series_count=len(curve.series),
            point_count=sum(len(s.points) for s in curve.series),
            source_label=curve.source.label,
            is_demo=curve.is_demo or material.is_demo or curve.source.is_demo,
            is_official=curve.dataset_id is not None,
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

    def read_value(
        self,
        material_id: int,
        curve_id: int,
        *,
        at: float,
        at_unit: str,
        y_unit: str | None = None,
        parameter_unit: str | None = None,
    ) -> CurveValueOut:
        """The curve at a declared x, by the rule of D-110 (never interpolated)."""
        curve = self._load(material_id, curve_id)
        try:
            readings, ry, rp = read_at_declared_x(
                curve.x_quantity,
                curve.y_quantity,
                curve.parameter_quantity,
                _series_data(curve),
                at=at,
                at_unit=at_unit,
                y_unit=y_unit,
                parameter_unit=parameter_unit,
            )
        except CurveError as exc:
            raise ValidationError(str(exc)) from exc
        at_label = _unit_option_label(at_unit)
        shown = f"{at:g} {at_label}".strip()
        series = [
            CurveSeriesValueOut(
                **r.__dict__,
                absence=(
                    None
                    if r.found
                    else f"Sem ponto declarado em {shown} nesta série; nada foi interpolado."
                ),
            )
            for r in readings
        ]
        return CurveValueOut(
            curve_id=curve.id,
            material_id=curve.material_id,
            title=curve.title,
            rule=READ_RULE,
            at=at,
            at_unit=at_unit,
            at_unit_label=at_label,
            x_quantity_label=curve.x_label or QUANTITIES[curve.x_quantity].name,
            y_quantity_label=curve.y_label or QUANTITIES[curve.y_quantity].name,
            y_unit=ry.unit,
            y_unit_label=_unit_option_label(ry.unit),
            parameter_unit_label=_unit_label(rp.unit) if rp else None,
            found_count=sum(1 for r in readings if r.found),
            series=series,
            source_label=curve.source.label,
            citation=curve.citation,
            is_demo=_is_demo(curve),
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
