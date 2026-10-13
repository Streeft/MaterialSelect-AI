"""ORM rows of composition and designation -> the export value objects (TM2-d)."""

from __future__ import annotations

from app.domain.designation import system_label
from app.exporters.identity import CompositionLine, DesignationLine
from app.models.material import Material


def composition_lines(material: Material) -> list[CompositionLine]:
    lines: list[CompositionLine] = []
    for entry in material.composition:
        if entry.is_balance:
            state = "resto"
        elif entry.is_missing:
            state = "ausente"
        else:
            state = "faixa"
        lines.append(
            CompositionLine(
                element=entry.element,
                state=state,
                minimum=entry.normalized_min,
                maximum=entry.normalized_max,
                nominal=entry.normalized_nominal,
                data_quality=entry.data_quality.value,
                source_label=entry.source.label,
                citation=entry.citation,
                # A demo source makes the row fictitious too (D-104 rule).
                is_demo=entry.is_demo or entry.source.is_demo,
            )
        )
    return lines


def designation_lines(material: Material) -> list[DesignationLine]:
    return [
        DesignationLine(
            system_label=system_label(d.system),
            code=d.code,
            region=d.region,
            source_label=d.source.label,
            citation=d.citation,
            is_demo=d.is_demo or d.source.is_demo,
        )
        for d in material.designations
    ]
