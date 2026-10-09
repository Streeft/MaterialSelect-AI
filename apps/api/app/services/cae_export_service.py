"""CAE material cards (D-104): read one visible material, build its card, render.

The service holds the three decisions the router must not: which material the
reader may see (D-62 — another person's record is a 404, never a 403), which
format and unit system were asked for (an unknown one is a 400 naming the
admitted values), and whether the record has what the format demands (a 422
naming what is missing, never a file with a blank the solver would fill).

For an elastoplastic format (D-119, TM5-b) it also picks the series the user
named — never one on its own —, reads E of the same material at that series'
temperature from an exact point of a declared Young's-modulus curve, and asks
``app.domain.plasticity`` for the hardening table. Every reason the table
cannot be built is a 422 that names it.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.domain.curves import KINDS, lower_first
from app.domain.errors import ExportRefusedError, NotFoundError, ValidationError
from app.domain.plasticity import ModulusPoint, PlasticityError, match_temperature, plastic_table
from app.exporters.cae import ALL_FORMATS, PLASTIC_FORMATS, CaeFormat, refusal_reason
from app.exporters.cae.card import (
    CaeCard,
    CatalogueValue,
    CurveProvenance,
    MaterialInput,
    PlasticInput,
    build_card,
    with_plastic,
)
from app.exporters.cae.quantities import QUANTITIES, UNIT_SYSTEMS
from app.models.enums import CurveKind
from app.models.material import Material
from app.models.material_curve import MaterialCurve, MaterialCurveSeries
from app.repositories.curve_repository import CurveRepository
from app.repositories.material_repository import MaterialRepository
from app.services.identity_lines import composition_lines, designation_lines


@dataclass(frozen=True)
class CaeFile:
    """A rendered card, ready for the HTTP layer."""

    body: str
    media_type: str
    #: Stem suffix and extension (``-abaqus.inp``); the router adds the stem.
    suffix: str
    material_name: str


def _material_input(material: Material) -> MaterialInput:
    wanted = {q.slug for q in QUANTITIES}
    values: dict[str, CatalogueValue] = {}
    for row in material.property_values:
        slug = row.property_definition.slug
        if slug not in wanted:
            continue
        source = row.source
        values[slug] = CatalogueValue(
            slug=slug,
            is_missing=row.is_missing,
            normalized_value=row.normalized_value,
            canonical_unit=row.canonical_unit or row.property_definition.canonical_unit,
            value_min=row.value_min,
            value_max=row.value_max,
            original_unit=row.original_unit,
            data_quality=row.data_quality.value if row.data_quality else None,
            source_label=source.label if source else None,
            source_is_demo=bool(source and source.is_demo),
            license_label=source.license_label if source else None,
        )
    return MaterialInput(
        id=material.id,
        name=material.name,
        class_name=material.material_class.name,
        is_demo=material.is_demo,
        is_own_record=material.owner_id is not None,
        is_active=material.is_active,
        values=values,
        composition=tuple(composition_lines(material)),
        designations=tuple(designation_lines(material)),
    )


def _provenance(curve: MaterialCurve) -> CurveProvenance:
    return CurveProvenance(
        curve_id=curve.id,
        title=curve.title,
        source_label=curve.source.label,
        source_is_demo=curve.source.is_demo,
        license_label=curve.source.license_label,
        citation=curve.citation,
        data_quality=curve.data_quality.value,
        is_demo=curve.is_demo,
    )


def _series_name(series: MaterialCurveSeries) -> str:
    text = f"{series.position}"
    if series.parameter_value is not None:
        text += f" ({series.parameter_value:g} {series.parameter_original_unit})"
    return text


class CaeExportService:
    def __init__(self, db: Session, viewer_id: int | None) -> None:
        self.repo = MaterialRepository(db, viewer_id)
        self.curves = CurveRepository(db, viewer_id)

    def material_card(
        self,
        material_id: int,
        fmt_key: str,
        system_key: str,
        curve_id: int | None = None,
        series_position: int | None = None,
    ) -> CaeFile:
        fmt = ALL_FORMATS.get(fmt_key)
        if fmt is None:
            raise ValidationError(
                f"Formato CAE não suportado: '{fmt_key}'. Use {', '.join(ALL_FORMATS)}."
            )
        if fmt.plastic and curve_id is None:
            raise ValidationError(
                f"O formato '{fmt_key}' exige o parâmetro 'curva': o id de uma curva "
                "tensão–deformação deste material. A curva nunca é escolhida pela exportação."
            )
        if not fmt.plastic and (curve_id is not None or series_position is not None):
            raise ValidationError(
                f"O formato '{fmt_key}' não carrega curva plástica; para ela, use "
                f"{', '.join(PLASTIC_FORMATS)}."
            )
        system = UNIT_SYSTEMS.get(system_key)
        if system is None:
            raise ValidationError(
                f"Sistema de unidades CAE não suportado: '{system_key}'. "
                f"Use {', '.join(UNIT_SYSTEMS)}."
            )
        material = self.repo.get_material(material_id)
        if material is None:
            raise NotFoundError(f"Material não encontrado: {material_id}")
        card = build_card(_material_input(material), system)
        if fmt.plastic:
            assert curve_id is not None
            card = self._plastic_card(card, fmt, material, curve_id, series_position)
        reason = refusal_reason(card, fmt)
        if reason is not None:
            raise ExportRefusedError(reason)
        return CaeFile(
            body=fmt.render(card),
            media_type=fmt.media_type,
            suffix=fmt.suffix,
            material_name=material.name,
        )

    # --- elastoplastic (D-119) -------------------------------------------------

    def _plastic_card(
        self,
        card: CaeCard,
        fmt: CaeFormat,
        material: Material,
        curve_id: int,
        series_position: int | None,
    ) -> CaeCard:
        curve = self.curves.get(material.id, curve_id)
        if curve is None:
            raise NotFoundError(f"Curva não encontrada: {curve_id}")
        if curve.kind is not CurveKind.TENSAO_DEFORMACAO:
            raise ValidationError(
                f"A curva {curve_id} é de {KINDS[curve.kind].label.lower()}; a curva plástica "
                "sai de uma curva tensão–deformação."
            )
        series = self._series(curve, series_position)

        def refuse(why: str) -> ExportRefusedError:
            return ExportRefusedError(
                f"Não é possível gerar o cartão {fmt.label} de “{material.name}” com a "
                f"curva “{curve.title}”: {why}"
            )

        if curve.strain_measure is None:
            raise refuse(
                "a curva não declara se é de engenharia ou verdadeira, e a conversão não "
                "presume nenhuma das duas. Declare a medida na curva."
            )
        if curve.parameter_quantity != "temperatura" or series.parameter_normalized is None:
            raise refuse(
                "a série não declara a temperatura, e o módulo de Young que separa a "
                "deformação plástica tem de ser o do material nessa temperatura."
            )
        modulus_curves = [
            c
            for c in self.curves.list_for_material(material.id)
            if c.kind is CurveKind.TEMPERATURA
            and c.y_quantity == "modulo"
            and c.modulus_kind == "young"
        ]
        if not modulus_curves:
            raise refuse(
                "este material não tem curva de módulo de Young × temperatura declarada "
                "(tipo de módulo 'young'), e o E da temperatura da série não é presumido "
                "a partir do valor representativo do catálogo."
            )
        candidates = [
            ModulusPoint(c.id, point.x_normalized, point.y_normalized)
            for c in modulus_curves
            for s in c.series
            for point in s.points
        ]
        try:
            hit = match_temperature(series.parameter_normalized, candidates)
            table = plastic_table(
                [(p.x_normalized, p.y_normalized) for p in series.points],
                strain_measure=curve.strain_measure,
                youngs_modulus=hit.modulus,
            )
        except PlasticityError as exc:
            raise refuse(lower_first(str(exc))) from exc
        modulus_curve = next(c for c in modulus_curves if c.id == hit.curve_id)
        return with_plastic(
            card,
            PlasticInput(
                curve=_provenance(curve),
                series_position=series.position,
                series_label=series.label,
                conditions=series.conditions,
                temperature=series.parameter_normalized,
                modulus_curve=_provenance(modulus_curve),
            ),
            table,
        )

    @staticmethod
    def _series(curve: MaterialCurve, position: int | None) -> MaterialCurveSeries:
        if position is None:
            if len(curve.series) == 1:
                return curve.series[0]
            names = ", ".join(_series_name(s) for s in curve.series)
            raise ValidationError(
                f"A curva {curve.id} tem {len(curve.series)} séries; diga qual exportar com o "
                f"parâmetro 'serie' (posição): {names}. A série nunca é escolhida pela "
                "exportação."
            )
        for series in curve.series:
            if series.position == position:
                return series
        names = ", ".join(_series_name(s) for s in curve.series)
        raise ValidationError(
            f"A curva {curve.id} não tem série na posição {position}. Posições: {names}."
        )
