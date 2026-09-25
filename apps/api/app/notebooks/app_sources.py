"""A record of this app, written out as a notebook source (D-92).

A datasheet or a saved study becomes plain text a student can ask about. The
text is generated **deterministically** from what the existing services
return — the same values, units, quality and provenance the datasheet shows —
so an answer that quotes it quotes the catalogue, never a paraphrase of it.

Two rules shape the wording:

* **Absence is written, never zero** (D-24). A property with no value reads
  "ausente — sem dado cadastrado", because a model reading "0" would say so.
* **Numbers are written the way the number check can find them again**: a
  decimal comma, no thousands grouping, no scientific notation where a plain
  figure fits. The check reads the model's figure back against this text, and
  a figure written two ways would fail it for being right.
"""

from __future__ import annotations

import math

from app.calculations.units import pretty_unit
from app.schemas.material import MaterialDetail
from app.schemas.property import PropertyValueOut
from app.schemas.selection import RunResultOut, StudyOut

_CATEGORY_LABELS = {
    "FISICA": "Propriedades físicas",
    "MECANICA": "Propriedades mecânicas",
    "TERMICA": "Propriedades térmicas",
    "ELETRICA": "Propriedades elétricas",
    "AMBIENTAL": "Propriedades ambientais",
    "ECONOMICA": "Propriedades econômicas",
}

_QUALITY_LABELS = {
    "MEDIDO": "medido",
    "IMPORTADO": "importado",
    "ESTIMADO": "estimado",
}


def format_number(value: float) -> str:
    """A figure as the text writes it: decimal comma, up to six significant
    digits, scientific notation only past what a plain figure can hold."""
    if not math.isfinite(value):
        return str(value)
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    magnitude = abs(value)
    text = f"{value:.6g}" if 1e-4 <= magnitude < 1e15 else f"{value:.4e}"
    return text.replace(".", ",")


def material_text(detail: MaterialDetail) -> str:
    lines = [f"Ficha do material: {detail.name}", f"Classe: {detail.class_name}"]
    if detail.subclass:
        lines.append(f"Subclasse: {detail.subclass}")
    if detail.is_demo:
        lines.append(
            "Atenção: registro de demonstração, com valores fictícios. Não use em projeto real."
        )
    if detail.is_own_record:
        lines.append("Registro próprio do usuário, fora da revisão do catálogo compartilhado.")
    if detail.description:
        lines.append(f"Descrição: {detail.description}")
    if detail.keywords:
        lines.append(f"Palavras-chave: {', '.join(detail.keywords)}")

    for group in detail.property_groups:
        lines.append("")
        lines.append(_CATEGORY_LABELS.get(group.category.value, group.category.value))
        for value in group.properties:
            lines.append(f"- {_property_line(value)}")

    if detail.processes:
        lines.append("")
        lines.append(
            "Processos de fabricação compatíveis: "
            + ", ".join(process.name for process in detail.processes)
        )
    return "\n".join(lines)


def _property_line(value: PropertyValueOut) -> str:
    name = value.property_name + (f" ({value.symbol})" if value.symbol else "")
    if value.is_missing:
        return f"{name}: ausente — sem dado cadastrado."

    unit = pretty_unit(value.display_unit or value.canonical_unit)
    if value.display_unit:
        scalar, low, high = value.display_value, value.display_min, value.display_max
    else:
        scalar, low, high = value.normalized_value, value.value_min, value.value_max

    if value.is_interval and low is not None and high is not None:
        reading = f"de {format_number(low)} a {format_number(high)}"
    elif scalar is not None:
        reading = format_number(scalar)
    else:
        return f"{name}: ausente — sem dado cadastrado."

    parts = [f"{name}: {reading}{(' ' + unit) if unit and unit != '—' else ''}"]
    parts.append(f"qualidade do dado: {_QUALITY_LABELS.get(value.data_quality.value, '')}")
    if value.source_label:
        parts.append(f"fonte: {value.source_label}")
    if value.measurement_condition:
        parts.append(f"condição: {value.measurement_condition}")
    return "; ".join(parts) + "."


def study_text(study: StudyOut, pipeline: str, result: RunResultOut) -> str:
    universe = "processos" if study.universe == "process" else "materiais"
    lines = [f"Estudo de seleção: {study.name}", f"Universo: {universe}"]
    if study.description:
        lines.append(f"Descrição: {study.description}")
    if study.function_text:
        lines.append(f"Função do componente: {study.function_text}")
    if study.objective_text:
        lines.append(f"Objetivo: {study.objective_text}")
    lines.append(f"Critério de triagem: {pipeline}")
    if study.index is not None:
        goal = "maximizar" if study.index.goal == "maximize" else "minimizar"
        name = study.index.name or "Índice de desempenho"
        lines.append(f"Índice de desempenho: {name} = {study.index.expression} ({goal}).")

    lines.append("")
    lines.append(
        f"Resultado: {result.initial_count} {universe} avaliados, "
        f"{result.final_count} aprovados na triagem."
    )
    for step in result.funnel:
        lines.append(f"- {step.label}: restam {step.remaining}.")

    ranking = result.ranking
    if ranking is not None and ranking.ranked:
        lines.append("")
        lines.append(f"Ranking (método {ranking.method}, normalização {ranking.normalization}):")
        for item in ranking.ranked:
            lines.append(f"{item.rank}. {item.name}: escore {format_number(round(item.score, 4))}")
        for excluded in ranking.excluded:
            lines.append(
                f"Fora do ranking por falta de dado: {excluded.name} "
                f"(falta: {', '.join(excluded.missing_labels)})."
            )
    elif result.candidates:
        lines.append("")
        lines.append("Aprovados: " + ", ".join(c.name for c in result.candidates) + ".")
    return "\n".join(lines)
