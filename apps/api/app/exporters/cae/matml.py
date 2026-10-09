"""MatML 3.1: the open XML format for material property data.

Written from the public description of the MatML schema (NIST/OASIS): a
``MatML_Doc`` holds ``Material/BulkDetails`` (``Name``, ``Class``, then one
``PropertyData`` per property, each pointing by ``property=`` and ``source=``
at a ``PropertyDetails`` and a ``DataSourceDetails`` in ``Metadata``). A
``PropertyDetails`` names the property and its ``Units`` as a product of
``Unit`` elements with a ``power`` — the same terms ``quantities.py`` converts
with, so the declared unit and the converted number cannot disagree.

MatML is XML, so it is escaped as XML and **only** as XML: ``ElementTree``
escapes markup in text and attributes, and characters XML 1.0 cannot carry at
all (control characters) are removed first. The apostrophe of ``cells.py``
would show as data corruption here — the escape is per format (CLAUDE.md).

Unlike the solver decks, MatML has no minimum: any one property makes a valid
document. A record with none of the six is refused, because an empty
``BulkDetails`` would read as "this material has no data" in a file that
travels without the catalogue around it.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from app.exporters.cae.card import CaeCard, CardValue
from app.exporters.cae.quantities import (
    CONDUCTIVITY,
    CTE,
    DENSITY,
    POISSON,
    SPECIFIC_HEAT,
    YOUNG,
)
from app.exporters.cae.text import real, single_line
from app.exporters.identity import composition_summary, designation_summary

LABEL = "MatML 3.1 (XML aberto)"
REQUIRED = ()
SUPPORTED = (DENSITY, YOUNG, POISSON, CTE, CONDUCTIVITY, SPECIFIC_HEAT)

#: The property names written in ``PropertyDetails/Name`` (English, as the
#: schema's own examples and most consumers expect).
_NAMES = {
    DENSITY.key: "Density",
    YOUNG.key: "Young's Modulus",
    POISSON.key: "Poisson's Ratio",
    CTE.key: "Coefficient of Thermal Expansion",
    CONDUCTIVITY.key: "Thermal Conductivity",
    SPECIFIC_HEAT.key: "Specific Heat",
}

# Characters XML 1.0 forbids outright (escaping cannot represent them).
_XML_FORBIDDEN = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")


def _text(value: str) -> str:
    return single_line(_XML_FORBIDDEN.sub(" ", value))


def _sub(parent: ET.Element, tag: str, text: str | None = None, **attrs: str) -> ET.Element:
    element = ET.SubElement(parent, tag, {k: _text(v) for k, v in attrs.items()})
    if text is not None:
        element.text = _text(text)
    return element


def _value_notes(value: CardValue) -> str:
    source = value.source_label or "sem fonte registrada"
    if value.source_is_demo:
        source += " (FICTÍCIA, demonstração)"
    parts = [f"Qualidade do dado: {value.data_quality or 'não informada'}", f"Fonte: {source}"]
    if value.license_label:
        parts.append(f"Licença: {value.license_label}")
    if value.is_range:
        assert value.range_low is not None and value.range_high is not None
        parts.append(
            f"Faixa cadastrada {real(value.range_low)} a {real(value.range_high)} "
            f"{value.unit}; exportado o ponto representativo da faixa"
        )
    return ". ".join(parts) + "."


def render(card: CaeCard) -> str:
    root = ET.Element("MatML_Doc")
    material = _sub(root, "Material")
    bulk = _sub(material, "BulkDetails")
    _sub(bulk, "Name", card.name)
    klass = _sub(bulk, "Class")
    _sub(klass, "Name", card.class_name)

    metadata_sources: dict[str, str] = {}
    present = [q for q in SUPPORTED if card.get(q).present]
    for quantity in present:
        value = card.get(quantity)
        assert value.value is not None
        label = value.source_label or "sem fonte registrada"
        source_id = metadata_sources.setdefault(label, f"ds{len(metadata_sources) + 1}")
        data = _sub(
            bulk,
            "PropertyData",
            property=f"pr-{quantity.key}",
            source=source_id,
        )
        _sub(data, "Data", real(value.value), format="float")
        _sub(data, "Notes", _value_notes(value))

    omitted = [
        f"{q.label}: {card.get(q).omitted_reason}" for q in SUPPORTED if not card.get(q).present
    ]
    notes = list(card.notices)
    if card.is_demo:
        notes.insert(0, "MATERIAL FICTÍCIO: dado de demonstração, valores inventados para ensino.")
    if card.is_own_record:
        notes.append("Registro próprio do usuário, fora da revisão de fonte do catálogo.")
    if not card.is_active:
        notes.append("Registro desativado no catálogo.")
    # Free text in Notes, the one place the schema admits it: a structured
    # ChemicalComposition needs the mandatory Formula and a content model this
    # module could not check against the public schema (TM2-d residue).
    notes.append(f"Designações: {designation_summary(card.designations)}.")
    notes.append(f"Composição química (% em massa): {composition_summary(card.composition)}.")
    notes.append(f"Sistema de unidades: {card.system.label}.")
    notes.append(f"Material {card.material_id} exportado pelo MaterialSelect AI.")
    if omitted:
        notes.append("Omitidas, nunca preenchidas com zero: " + "; ".join(omitted) + ".")
    _sub(bulk, "Notes", " ".join(notes))

    metadata = _sub(root, "Metadata")
    for label, source_id in metadata_sources.items():
        details = _sub(metadata, "DataSourceDetails", id=source_id)
        _sub(details, "Name", label)
    for quantity in present:
        details = _sub(metadata, "PropertyDetails", id=f"pr-{quantity.key}")
        _sub(details, "Name", _NAMES[quantity.key])
        terms = card.system.terms[quantity.key]
        if terms:
            units = _sub(details, "Units", name=card.get(quantity).unit)
            for term in terms:
                unit = _sub(
                    units, "Unit", **({"power": str(term.power)} if term.power != 1 else {})
                )
                _sub(unit, "Name", term.symbol)
        else:
            _sub(details, "Unitless")

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    # A comment for whoever opens the file in a text editor; constant text only,
    # so nothing a user typed can close it.
    header = (
        "<!-- MaterialSelect AI - cartão MatML. "
        + ("MATERIAL FICTÍCIO. " if card.is_demo else "")
        + "Leia as Notes de BulkDetails: aviso de limitação de uso e proveniência. -->"
    )
    assert "--" not in header[4:-3]
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{header}\n{body}\n'
