"""The provenance of every datum an eco audit read (D-172).

``EcoService.run`` hands back the audit's numbers but not where its inputs came
from: it deliberately reduces each catalogue value to a bare float before the
calculation sees it. The export owes the reader the rest — original value and
unit, conversion method, quality, source, licence, the record's ``is_demo``
marker — so this module reads the same rows again and describes them.

It decides nothing about the method. Which data a brief needs is the
calculation's call (``app.calculations.eco_audit``); this only looks up the
slugs that call is known to read, and writes down what it finds. A slug the
catalogue does not hold becomes a row that says so in words, never a skipped
row and never a zero (principle 3).
"""

from __future__ import annotations

from collections.abc import Mapping

from app.calculations.eco_audit import (
    CO2_FOOTPRINT,
    EMBODIED_ENERGY,
    EOL_ROUTE_TABLE,
    PROCESS_CO2,
    PROCESS_ENERGY,
    RECYCLE_CO2,
    RECYCLE_ENERGY,
    SCRAP_FRACTION,
)
from app.calculations.units import pretty_unit
from app.exporters.cells import format_number
from app.exporters.eco import NOT_APPLICABLE, EcoValueRow
from app.schemas.eco import EcoComponentIn

NO_SOURCE = "sem fonte registrada"
NO_LICENSE = "licença não registrada"
CATALOGUE = "Catálogo"
OWN = "Próprio"

_ABSENT_NOT_REGISTERED = (
    "Não cadastrado para este registro: a fase que depende dele fica ausente, "
    "e o dado não foi tratado como zero."
)
_ABSENT_FLAGGED = (
    "Cadastrado como ausente na fonte: a fase que depende dele fica ausente, "
    "e o dado não foi tratado como zero."
)

_CARBON_UNIT_WORDS = "kg de CO₂ por kg (declarado; adimensional no catálogo)"


def _is_carbon(slug: str) -> bool:
    return slug in (CO2_FOOTPRINT, PROCESS_CO2, RECYCLE_CO2) or slug.startswith("co2_")


def _unit_text(slug: str, canonical_unit: str | None) -> str:
    """The canonical unit in words; the dimensionless carbon figures say what they are."""
    text = pretty_unit(canonical_unit)
    if text and text != "—":
        return text
    if _is_carbon(slug):
        return _CARBON_UNIT_WORDS
    return "adimensional" if canonical_unit == "dimensionless" else "—"


def _source_cells(source: object | None) -> tuple[str, str, bool]:
    if source is None:
        return NO_SOURCE, NO_LICENSE, False
    label = getattr(source, "label", None) or NO_SOURCE
    license_label = getattr(source, "license_label", None) or NO_LICENSE
    return label, license_label, bool(getattr(source, "is_demo", False))


def _original_text(value: object) -> str:
    scalar = getattr(value, "value_scalar", None)
    if scalar is None:
        scalar = getattr(value, "value_typical", None)
    if scalar is None:
        return "—"
    unit = pretty_unit(getattr(value, "original_unit", None))
    number = format_number(scalar)
    # A dimensionless original has no unit to print; the em dash would read as a
    # second value ("12.5 —").
    return number if unit in ("", "—") else f"{number} {unit}"


def _row(
    *,
    scope: str,
    slug: str,
    name: str,
    value: object | None,
    fallback_unit: str | None,
    record_is_demo: bool,
    registro: str,
) -> EcoValueRow:
    """One datum of a record: present, flagged missing, or not registered at all."""
    datum = f"{name} ({slug})"
    if value is None:
        return EcoValueRow(
            scope=scope,
            datum=datum,
            normalized=None,
            unit=_unit_text(slug, fallback_unit),
            original="—",
            method="—",
            quality="ausente",
            source="—",
            license="—",
            demo=record_is_demo,
            registro=registro,
            note=_ABSENT_NOT_REGISTERED,
        )
    source, license_label, source_is_demo = _source_cells(getattr(value, "source", None))
    normalized = getattr(value, "normalized_value", None)
    missing = bool(getattr(value, "is_missing", False)) or normalized is None
    canonical = getattr(value, "canonical_unit", None) or fallback_unit
    return EcoValueRow(
        scope=scope,
        datum=datum,
        normalized=None if missing else float(normalized),
        unit=_unit_text(slug, canonical),
        original="—" if missing else _original_text(value),
        method="—" if missing else (getattr(value, "conversion_method", None) or "—"),
        quality=value.data_quality.value,
        source=source,
        license=license_label,
        demo=record_is_demo or source_is_demo,
        registro=registro,
        note=_ABSENT_FLAGGED if missing else "—",
    )


def component_rows(
    *,
    scope: str,
    item: EcoComponentIn,
    material: object,
    process: object,
    property_names: Mapping[str, object],
) -> list[EcoValueRow]:
    """The catalogue data one component's three phases read, with their origin."""
    registro = OWN if getattr(material, "owner_id", None) is not None else CATALOGUE
    material_demo = bool(getattr(material, "is_demo", False))
    process_demo = bool(getattr(process, "is_demo", False))
    by_property = {v.property_definition.slug: v for v in material.property_values}
    by_attribute = {v.attribute.slug: v for v in process.attribute_values}

    material_slugs = [EMBODIED_ENERGY, CO2_FOOTPRINT]
    if item.recycled_fraction > 0:
        # Read only when the brief asks for recycled content — the audit does the same.
        material_slugs += [RECYCLE_ENERGY, RECYCLE_CO2]
    route = EOL_ROUTE_TABLE[item.end_of_life]
    material_slugs += [s for s in (route.energy_slug, route.carbon_slug) if s is not None]

    rows: list[EcoValueRow] = []
    for slug in material_slugs:
        definition = property_names.get(slug)
        rows.append(
            _row(
                scope=scope,
                slug=slug,
                name=getattr(definition, "name", slug),
                value=by_property.get(slug),
                fallback_unit=getattr(definition, "canonical_unit", None),
                record_is_demo=material_demo,
                registro=registro,
            )
        )
    for slug in (PROCESS_ENERGY, PROCESS_CO2, SCRAP_FRACTION):
        present = by_attribute.get(slug)
        definition = present.attribute if present is not None else None
        rows.append(
            _row(
                scope=f"{scope} — processo {getattr(process, 'name', '')}",
                slug=slug,
                name=getattr(definition, "name", slug),
                value=present,
                fallback_unit=getattr(definition, "canonical_unit", None),
                record_is_demo=process_demo,
                registro=CATALOGUE,
            )
        )
    return rows


def leg_rows(*, scope: str, mode: object) -> list[EcoValueRow]:
    """A transport mode's two intensities. The row carries a source, not a quality scale."""
    source, license_label, source_is_demo = _source_cells(getattr(mode, "source", None))
    demo = bool(getattr(mode, "is_demo", False)) or source_is_demo
    rows = []
    for name, slug, value, unit in (
        (
            "Intensidade de energia do modal",
            "intensidade-energia-do-modal",
            mode.energy_intensity,
            "MJ/(t·km)",
        ),
        (
            "Intensidade de carbono do modal",
            "intensidade-carbono-do-modal",
            mode.carbon_intensity,
            "kg de CO₂/(t·km)",
        ),
    ):
        rows.append(
            EcoValueRow(
                scope=scope,
                datum=f"{name} ({slug})",
                normalized=value,
                unit=unit,
                original=NOT_APPLICABLE,
                method=NOT_APPLICABLE,
                quality="ausente" if value is None else "não registrada",
                source=source,
                license=license_label,
                demo=demo,
                registro=CATALOGUE,
                note=(
                    _ABSENT_NOT_REGISTERED
                    if value is None
                    else "Valor canônico gravado pelo catálogo; o modal não guarda qualidade."
                ),
            )
        )
    return rows
