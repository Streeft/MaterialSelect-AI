"""The comment header every solver deck opens with.

One builder for the four decks, so the notices, the provenance and the reason
each field was omitted read the same in MAPDL, Abaqus, Nastran and LS-DYNA. Each
renderer only says which of its fields carries which quantity and wraps the
lines in its own comment marker.
"""

from __future__ import annotations

from collections.abc import Mapping

from app.exporters.cae.card import CaeCard, CardValue
from app.exporters.cae.quantities import QUANTITIES
from app.exporters.cae.text import real

FICTITIOUS_LINE = (
    "MATERIAL FICTICIO: dado de demonstracao, valores inventados para ensino. "
    "Nao usar em projeto real."
)


def _provenance(value: CardValue) -> str:
    source = value.source_label or "sem fonte registrada"
    if value.source_is_demo:
        source += " (FICTICIA, demonstracao)"
    parts = [f"qualidade: {value.data_quality or 'nao informada'}", f"fonte: {source}"]
    if value.license_label:
        parts.append(f"licenca: {value.license_label}")
    return "; ".join(parts)


def header_lines(
    card: CaeCard,
    format_label: str,
    fields: Mapping[str, str],
    outside: Mapping[str, str] | None = None,
) -> list[str]:
    """Plain lines (not yet commented) describing the card.

    ``fields`` maps a quantity key to the field that carries it in this format;
    ``outside`` maps the keys this format cannot carry to the reason why.
    """
    outside = outside or {}
    lines = [
        f"MaterialSelect AI - cartao de material para {format_label}",
        "",
        *card.notices,
        "",
        f"Material: {card.name} (id {card.material_id}; classe {card.class_name})",
    ]
    if card.is_demo:
        lines.append(FICTITIOUS_LINE)
    if card.is_own_record:
        lines.append("Registro proprio do usuario, fora da revisao de fonte do catalogo.")
    if not card.is_active:
        lines.append("Registro desativado no catalogo.")
    lines += [
        f"Sistema de unidades: {card.system.label}",
        f"Unidades base: {card.system.base}",
        "Valores convertidos da unidade canonica do catalogo pelo Pint.",
        "",
        "Propriedades (valor completo; um campo de largura fixa pode arredondar):",
    ]
    for quantity in QUANTITIES:
        value = card.get(quantity)
        if quantity.key in fields:
            field = fields[quantity.key]
            if value.present:
                assert value.value is not None
                lines.append(
                    f"{quantity.label} [{field}] = {real(value.value)} {value.unit}; "
                    f"{_provenance(value)}"
                )
                if value.is_range:
                    assert value.range_low is not None and value.range_high is not None
                    lines.append(
                        f"  faixa cadastrada {real(value.range_low)} a "
                        f"{real(value.range_high)} {value.unit}: exportado o ponto "
                        "representativo da faixa"
                    )
            else:
                lines.append(f"{quantity.label} [{field}]: {value.omitted_reason} - campo omitido")
        elif value.present:
            lines.append(
                f"{quantity.label}: cadastrado, mas fora deste cartao "
                f"({outside.get(quantity.key, 'o formato nao o carrega')})"
            )
    return lines
