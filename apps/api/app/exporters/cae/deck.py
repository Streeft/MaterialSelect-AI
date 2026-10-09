"""The comment header every solver deck opens with.

One builder for the four decks, so the notices, the provenance and the reason
each field was omitted read the same in MAPDL, Abaqus, Nastran and LS-DYNA. Each
renderer only says which of its fields carries which quantity and wraps the
lines in its own comment marker.
"""

from __future__ import annotations

from collections.abc import Mapping

from app.exporters.cae.card import CaeCard, CardValue, CurveProvenance
from app.exporters.cae.quantities import QUANTITIES
from app.exporters.cae.text import real
from app.exporters.identity import composition_summary, designation_summary

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
        f"Designacoes: {designation_summary(card.designations)}",
        f"Composicao quimica (% em massa): {composition_summary(card.composition, ascii_only=True)}",
        "Composicao e designacoes sao informativas: nenhum campo do cartao as le.",
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
    if card.plastic is not None:
        lines += plastic_lines(card)
    return lines


_MEASURES = {
    "engineering": "engenharia (tensao e deformacao nominais)",
    "true": "verdadeira (tensao verdadeira, deformacao logaritmica)",
}


def _curve_provenance(curve: CurveProvenance) -> str:
    source = curve.source_label
    if curve.source_is_demo:
        source += " (FICTICIA, demonstracao)"
    parts = [
        f'curva id {curve.curve_id} "{curve.title}"',
        f"qualidade: {curve.data_quality}",
        f"fonte: {source}",
    ]
    if curve.license_label:
        parts.append(f"licenca: {curve.license_label}")
    if curve.citation:
        parts.append(f"citacao: {curve.citation}")
    if curve.is_demo:
        parts.append("CURVA FICTICIA")
    return "; ".join(parts)


def plastic_lines(card: CaeCard) -> list[str]:
    """The trail of an elastoplastic card: what was read, which rule, what was dropped."""
    plastic = card.plastic
    assert plastic is not None
    src = plastic.source
    catalogue = card.catalogue_young
    lines = [
        "",
        "Curva plastica (D-119):",
        f"Curva tensao-deformacao: {_curve_provenance(src.curve)}",
        f"Serie exportada: posicao {src.series_position}"
        + (f" ({src.series_label})" if src.series_label else "")
        + f"; condicoes declaradas: {src.conditions or 'nao informadas'}",
        f"Temperatura da serie: {plastic.temperature_label}. O cartao vale nesta "
        "temperatura; a tabela nao tem coluna de temperatura.",
        f"Medida declarada pela fonte: {_MEASURES[plastic.strain_measure]}.",
        f"Modulo de Young na temperatura da serie (ponto exato, sem interpolacao): "
        f"{_curve_provenance(src.modulus_curve)}",
    ]
    if catalogue is not None and catalogue.present:
        assert catalogue.value is not None
        lines.append(
            f"Modulo de Young representativo do catalogo ({real(catalogue.value)} "
            f"{catalogue.unit}) NAO usado: o cartao usa o E da temperatura da serie, "
            "o mesmo que separa a deformacao plastica."
        )
    if plastic.strain_measure == "engineering":
        lines.append(
            "Conversao engenharia -> verdadeira: sigma_t = sigma*(1+eps), "
            "eps_t = ln(1+eps), valida so ate a tensao maxima de engenharia (estriccao)."
        )
        lines.append(
            f"Pontos depois da tensao maxima de engenharia descartados: "
            f"{plastic.discarded_after_necking}."
        )
    lines += [
        "Deformacao plastica: eps_p = eps_t - sigma_t/E, com o E acima.",
        f"Pontos do trecho elastico antes do limite elastico descartados: "
        f"{plastic.discarded_elastic}.",
        f"Limite elastico (ponto {plastic.rows[0].source_position + 1} da serie) ancorado "
        f"em eps_p = 0; eps_p calculado antes da ancoragem: {real(plastic.anchor_residual, 6)}.",
        f"Pontos depois do escoamento com eps_p < 0 descartados: {plastic.discarded_negative}.",
        f"Tabela plastica ({len(plastic.rows)} pontos; tensao verdadeira em "
        f"{plastic.stress_unit}, deformacao plastica adimensional):",
    ]
    for row in plastic.rows:
        lines.append(
            f"  ponto {row.source_position + 1} da serie: eps_p = {real(row.plastic_strain)}; "
            f"sigma_t = {real(row.stress)} {plastic.stress_unit}"
        )
    return lines
