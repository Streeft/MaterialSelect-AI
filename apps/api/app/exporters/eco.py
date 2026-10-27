"""The Eco Audit as a :class:`~app.exporters.report.Report` (D-121, D-172).

This module only arranges. Every number comes from ``EcoAuditResultOut``, which
the deterministic audit already produced, and every datum's origin comes from
``EcoValueRow``, which the service read from the catalogue. Nothing is computed
here, so the file shows the figures the screen shows (principle 2).

Absence is a word, never a blank. A phase that could not be computed leaves the
value cell as ``ausente`` and puts the audit's own written reason next to it; a
podium the audit refused is ``recusado`` with the refusal text. A blank cell in
a table of energy figures reads as zero, which is the one reading this project
refuses (principle 3).

The sheets never hold ``None``: the spreadsheet writers turn it into an empty
cell and the HTML one into ``ausente``, and only the second is acceptable, so
the word is written here, once, for every format.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.calculations.eco_audit import USE_MOBILE, USE_STATIC
from app.exporters.cells import SIGNIFICANT_DIGITS
from app.exporters.report import Sheet
from app.schemas.eco import (
    ComponentOut,
    DominanceOut,
    EcoAuditResultOut,
    PhaseOut,
    TransportLegOut,
    UseIn,
)

MISSING = "ausente"
REFUSED = "recusado"
NOT_APPLICABLE = "não se aplica"
CALCULATED = "calculado"

USE_MODEL_LABELS = {USE_STATIC: "Estático", USE_MOBILE: "Móvel"}


@dataclass(frozen=True)
class EcoValueRow:
    """One datum the audit read, with where it came from.

    ``normalized`` is ``None`` only when the datum is absent; ``note`` then says
    why, in words. ``demo`` is the record's own ``is_demo`` marker, written as
    data in its own column and never as a sentence (D-138).
    """

    scope: str
    datum: str
    normalized: float | None
    unit: str
    original: str
    method: str
    quality: str
    source: str
    license: str
    demo: bool
    registro: str
    note: str


def _n(value: float) -> float:
    """A float without the last-bits residue of a conversion, still a number.

    Twelve significant digits is the project's own rule (``cells.SIGNIFICANT_DIGITS``):
    far beyond any measured property, and it keeps ``0.40800000000000003`` out of
    a file whose reader would take it for a precision the data never had. The
    cell stays numeric, so a spreadsheet can still add it up.
    """
    return float(f"{value:.{SIGNIFICANT_DIGITS}g}")


def _value(value: float | None) -> float | str:
    return MISSING if value is None else _n(value)


def _situation(value: float | None) -> str:
    return MISSING if value is None else CALCULATED


def _reason(value: float | None, reason: str | None) -> str:
    """The written reason for an absent figure; ``—`` only when nothing is absent."""
    if value is not None:
        return "—"
    return reason or "Dado ausente; a razão não foi informada pelo cálculo."


def _quantity_rows(
    prefix: list[object],
    energy: float | None,
    carbon: float | None,
    energy_reason: str | None,
    carbon_reason: str | None,
    *,
    energy_unit: str,
    carbon_unit: str,
    detail: str | None = None,
) -> list[list[object]]:
    """Two rows, energy then carbon, each with its own value, unit and reason."""
    tail = [] if detail is None else [detail]
    return [
        [
            *prefix,
            "Energia",
            _value(energy),
            energy_unit,
            _situation(energy),
            *tail,
            _reason(energy, energy_reason),
        ],
        [
            *prefix,
            "Carbono",
            _value(carbon),
            carbon_unit,
            _situation(carbon),
            *tail,
            _reason(carbon, carbon_reason),
        ],
    ]


def _total_reason(result: EcoAuditResultOut, quantity: str) -> str:
    """Why a total is absent: every phase that could not be computed, named."""
    parts = []
    for phase in result.phases:
        value = phase.energy if quantity == "energy" else phase.carbon
        reason = phase.energy_reason if quantity == "energy" else phase.carbon_reason
        if value is None:
            parts.append(f"{phase.label}: {reason or 'não calculada'}")
    return "; ".join(parts) if parts else "—"


def _dominance_cells(dominance: DominanceOut) -> tuple[str, str]:
    if dominance.phase is None or dominance.label is None:
        return REFUSED, dominance.refusal or "O pódio foi recusado pelo cálculo."
    share = "" if dominance.share is None else f" ({dominance.share * 100:.1f}% do total)"
    return f"{dominance.label}{share}", "—"


def summary_sheet(result: EcoAuditResultOut) -> Sheet:
    """Totals, the two podiums (or their refusal), masses and the method notes."""
    energy_podium, energy_why = _dominance_cells(result.energy_dominance)
    carbon_podium, carbon_why = _dominance_cells(result.carbon_dominance)
    rows: list[list[object]] = [
        [
            "Modelo de uso",
            USE_MODEL_LABELS.get(result.use_model, result.use_model),
            "—",
            "—",
        ],
        ["Componentes", len(result.components), "—", "—"],
        ["Trechos de transporte", len(result.transport_legs), "—", "—"],
        ["Massa na peça", _n(result.mass_in_part), "kg", "Soma de massa unitária × quantidade."],
        [
            "Massa comprada",
            _n(result.mass_bought),
            "kg",
            "Massa na peça mais o refugo do processo de cada componente.",
        ],
        [
            "Energia total",
            _value(result.total_energy),
            result.energy_unit,
            _total_reason(result, "energy"),
        ],
        [
            "Carbono total",
            _value(result.total_carbon),
            result.carbon_unit,
            _total_reason(result, "carbon"),
        ],
        ["Fase dominante em energia", energy_podium, "—", energy_why],
        ["Fase dominante em carbono", carbon_podium, "—", carbon_why],
    ]
    return Sheet(
        name="Resumo",
        header=["Item", "Valor", "Unidade", "Observação"],
        rows=rows,
        notes=[
            result.carbon_unit_note,
            result.recycling_credit_note,
            "Um total só existe quando as cinco fases foram calculadas; uma fase ausente "
            "recusa o total e o pódio, e nunca vale zero.",
        ],
    )


def product_phases_sheet(result: EcoAuditResultOut) -> Sheet:
    """The product's five phases, energy and carbon each on its own row."""
    rows: list[list[object]] = []
    for phase in result.phases:
        rows += _quantity_rows(
            [phase.label],
            phase.energy,
            phase.carbon,
            phase.energy_reason,
            phase.carbon_reason,
            energy_unit=result.energy_unit,
            carbon_unit=result.carbon_unit,
            detail=phase.detail,
        )
    return Sheet(
        name="Fases do produto",
        header=[
            "Fase",
            "Grandeza",
            "Valor",
            "Unidade",
            "Situação",
            "Como foi calculada",
            "Razão da ausência",
        ],
        rows=rows,
        notes=["Cada grandeza tem a sua própria ausência e a sua própria razão."],
    )


def components_sheet(result: EcoAuditResultOut) -> Sheet:
    """One row per component: what it is made of and how much of it there is."""
    rows = [
        [
            component.name,
            component.material_name,
            component.process_name,
            component.quantity,
            _n(component.unit_mass),
            _n(component.mass_in_part),
            _n(component.mass_bought),
            _n(component.scrap_fraction),
            _n(component.recycled_fraction),
            component.end_of_life_label,
        ]
        for component in result.components
    ]
    return Sheet(
        name="Componentes",
        header=[
            "Componente",
            "Material",
            "Processo",
            "Quantidade",
            "Massa unitária (kg)",
            "Massa na peça (kg)",
            "Massa comprada (kg)",
            "Fração de refugo",
            "Teor reciclado",
            "Rota de fim de vida",
        ],
        rows=rows,
    )


def _component_phase_rows(
    component: ComponentOut, phase: PhaseOut, energy_unit: str, carbon_unit: str
) -> list[list[object]]:
    return _quantity_rows(
        [component.name, component.material_name, phase.label],
        phase.energy,
        phase.carbon,
        phase.energy_reason,
        phase.carbon_reason,
        energy_unit=energy_unit,
        carbon_unit=carbon_unit,
        detail=phase.detail,
    )


def component_phases_sheet(result: EcoAuditResultOut) -> Sheet:
    """Material, manufatura and fim de vida of each component, by quantity."""
    rows: list[list[object]] = []
    for component in result.components:
        for phase in component.phases:
            rows += _component_phase_rows(component, phase, result.energy_unit, result.carbon_unit)
    return Sheet(
        name="Componentes por fase",
        header=[
            "Componente",
            "Material",
            "Fase",
            "Grandeza",
            "Valor",
            "Unidade",
            "Situação",
            "Como foi calculada",
            "Razão da ausência",
        ],
        rows=rows,
        notes=[
            "Transporte e uso pertencem ao produto inteiro e não são repartidos entre "
            "componentes: repartir exigiria uma regra de alocação que o cálculo não escolhe.",
        ],
    )


def legs_sheet(result: EcoAuditResultOut) -> Sheet:
    """Each transport leg: the mode, the distance and what the whole product cost on it."""
    rows: list[list[object]] = []
    for position, leg in enumerate(result.transport_legs, start=1):
        rows += _leg_rows(position, leg, result)
    return Sheet(
        name="Trechos de transporte",
        header=[
            "Trecho",
            "Modal",
            "Distância (km)",
            "Massa transportada (kg)",
            "Grandeza",
            "Valor",
            "Unidade",
            "Situação",
            "Razão da ausência",
        ],
        rows=rows,
    )


def _leg_rows(position: int, leg: TransportLegOut, result: EcoAuditResultOut) -> list[list[object]]:
    prefix = [position, leg.mode.name, _n(leg.distance_km), _n(result.mass_in_part)]
    rows = _quantity_rows(
        prefix,
        leg.energy,
        leg.carbon,
        leg.energy_reason,
        leg.carbon_reason,
        energy_unit=result.energy_unit,
        carbon_unit=result.carbon_unit,
    )
    return rows


def use_sheet(use: UseIn) -> Sheet:
    """The service-phase premises. They are the reader's own numbers, not the catalogue's."""
    own = "Informado pelo usuário"
    rows: list[list[object]] = [
        ["Modelo de uso", USE_MODEL_LABELS.get(use.model, use.model), "—", own],
        ["Vida em serviço", _value(use.life_years), "anos", own],
    ]
    if use.model == USE_STATIC:
        rows += [
            ["Potência", _value(use.power_watts), "W", own],
            ["Ciclo de trabalho", _value(use.duty_cycle), "fração do ano (0 a 1)", own],
        ]
    else:
        rows += [
            ["Distância percorrida", _value(use.distance_km), "km", own],
            ["Intensidade de uso", _value(use.mobile_intensity), "MJ/(kg·km)", own],
        ]
    rows.append(
        [
            "Carbono por energia em serviço",
            _value(use.carbon_per_energy),
            "kg de CO₂/MJ",
            (
                own
                if use.carbon_per_energy is not None
                else "Não informado: a fase de uso fica sem carbono"
            ),
        ]
    )
    return Sheet(
        name="Premissas de uso",
        header=["Premissa", "Valor", "Unidade", "Origem"],
        rows=rows,
        notes=[
            "Estes números não vêm do catálogo: foram digitados na auditoria, sem fonte "
            "nem revisão de licença."
        ],
    )


def provenance_sheet(values: list[EcoValueRow]) -> Sheet:
    """Where each catalogued datum the audit read came from."""
    rows: list[list[object]] = [
        [
            row.scope,
            row.datum,
            _value(row.normalized),
            row.unit,
            row.original,
            row.method,
            row.quality,
            row.source,
            row.license,
            row.demo,
            row.registro,
            row.note,
        ]
        for row in values
    ]
    return Sheet(
        name="Proveniência",
        header=[
            "Escopo",
            "Dado",
            "Valor normalizado",
            "Unidade canônica",
            "Valor original",
            "Método de conversão",
            "Qualidade do dado",
            "Fonte",
            "Licença",
            "Demonstrativo",
            "Registro",
            "Observação",
        ],
        rows=rows,
        notes=[
            "Origem de cada número do catálogo que entrou na conta. Um dado ausente "
            "aparece como 'ausente', com a razão escrita, nunca como zero nem como célula vazia.",
            "'Registro' distingue o catálogo compartilhado de um registro próprio do usuário, "
            "que não passou pela revisão de fonte e licença do catálogo.",
        ],
    )


def eco_sheets(result: EcoAuditResultOut, use: UseIn, values: list[EcoValueRow]) -> list[Sheet]:
    """Every section of the eco-audit export, in reading order."""
    return [
        summary_sheet(result),
        product_phases_sheet(result),
        components_sheet(result),
        component_phases_sheet(result),
        legs_sheet(result),
        use_sheet(use),
        provenance_sheet(values),
    ]
