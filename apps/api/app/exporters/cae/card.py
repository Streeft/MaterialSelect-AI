"""The material card every CAE renderer reads: values already in the chosen system.

A renderer never converts and never decides what is missing. This module does
both, once, so five formats cannot disagree about the number they print or the
reason a field is absent.

The rules it holds:

* **The source is the canonical value.** ``normalized_value`` (the catalogue's
  representative point) in the canonical unit, converted by
  ``app.calculations.units.from_canonical`` into the chosen system — never a
  literal factor (principle 4).
* **Absence never becomes zero** (principle 3, D-24). A quantity the material
  has no row for is "não cadastrado"; a row declared missing says so; a value
  whose canonical unit cannot reach the target unit is reported, not guessed.
  In every case ``value`` is ``None`` and the renderer omits the field with
  the reason written as a comment.
* **A range is exported at its representative point**, and the card says so,
  with the bounds converted alongside.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from app.calculations.units import UnitError, from_canonical, to_canonical
from app.exporters.cae.quantities import QUANTITIES, CaeQuantity, UnitSystem
from app.exporters.report import LIMITATION_NOTICE, OWN_RECORD_NOTICE

#: The one phrase for a quantity the catalogue has no value for.
NOT_REGISTERED = "não cadastrado"

#: First line of a card whose numbers are fictitious, like ``DEMO_DATA_NOTICE``
#: in a report: a reader who stops after one line stops on this one.
CAE_DEMO_NOTICE = (
    "ATENÇÃO: este cartão contém valores marcados como demonstrativos, que são "
    "fictícios. Não utilizar em projetos reais."
)

#: Specific to a CAE card, after the limitation notice.
CAE_NOTICE = (
    "Cartão de material para pré-processamento CAE. Os valores são pontos "
    "representativos de catálogo, independentes de temperatura, sem curvas de "
    "plasticidade, fadiga ou fluência. Propriedade não cadastrada foi omitida, "
    "nunca preenchida com zero nem com valor padrão. Confira cada valor e o "
    "sistema de unidades antes de usar o cartão num modelo."
)


@dataclass(frozen=True)
class CatalogueValue:
    """One stored property value, as the service read it from the database."""

    slug: str
    is_missing: bool
    normalized_value: float | None
    canonical_unit: str | None
    value_min: float | None = None
    value_max: float | None = None
    original_unit: str | None = None
    data_quality: str | None = None
    source_label: str | None = None
    source_is_demo: bool = False
    license_label: str | None = None


@dataclass(frozen=True)
class MaterialInput:
    """The record being exported, already filtered by visibility (D-62)."""

    id: int
    name: str
    class_name: str
    is_demo: bool
    is_own_record: bool
    is_active: bool
    values: Mapping[str, CatalogueValue]


@dataclass(frozen=True)
class CardValue:
    """One quantity on the card: a number in the chosen system, or a reason."""

    quantity: CaeQuantity
    unit: str
    value: float | None = None
    #: Why ``value`` is None. Always set when it is.
    omitted_reason: str | None = None
    #: The range's bounds in the chosen system, when the catalogue holds one.
    range_low: float | None = None
    range_high: float | None = None
    data_quality: str | None = None
    source_label: str | None = None
    source_is_demo: bool = False
    license_label: str | None = None

    @property
    def present(self) -> bool:
        return self.value is not None

    @property
    def is_range(self) -> bool:
        return self.range_low is not None and self.range_high is not None


@dataclass(frozen=True)
class CaeCard:
    """Everything a renderer needs, in the order it is read."""

    material_id: int
    name: str
    class_name: str
    is_active: bool
    is_own_record: bool
    #: True when the material **or any source behind a value** is fictitious.
    is_demo: bool
    system: UnitSystem
    values: dict[str, CardValue]
    notices: list[str] = field(default_factory=list)

    def get(self, quantity: CaeQuantity) -> CardValue:
        return self.values[quantity.key]


def _card_value(quantity: CaeQuantity, system: UnitSystem, stored: CatalogueValue | None):
    unit = system.symbol(quantity.key)
    if stored is None:
        return CardValue(quantity=quantity, unit=unit, omitted_reason=NOT_REGISTERED)
    provenance = {
        "data_quality": stored.data_quality,
        "source_label": stored.source_label,
        "source_is_demo": stored.source_is_demo,
        "license_label": stored.license_label,
    }
    if stored.is_missing or stored.normalized_value is None or not stored.canonical_unit:
        return CardValue(
            quantity=quantity,
            unit=unit,
            omitted_reason=f"{NOT_REGISTERED} (declarado ausente no catálogo)",
            **provenance,
        )
    target = system.pint_unit(quantity.key)
    try:
        value = from_canonical(stored.normalized_value, stored.canonical_unit, target)
    except UnitError:
        return CardValue(
            quantity=quantity,
            unit=unit,
            omitted_reason=(
                f"não exportado: a unidade canônica '{stored.canonical_unit}' "
                f"não se converte em {unit}"
            ),
            **provenance,
        )
    low = high = None
    if (
        stored.value_min is not None
        and stored.value_max is not None
        and stored.original_unit
        and stored.value_min != stored.value_max
    ):
        # The bounds are stored in the *original* unit; bring them to the
        # canonical one first, so the trail is canonical -> chosen system like
        # the representative point itself.
        try:
            low = from_canonical(
                to_canonical(stored.value_min, stored.original_unit, stored.canonical_unit)[0],
                stored.canonical_unit,
                target,
            )
            high = from_canonical(
                to_canonical(stored.value_max, stored.original_unit, stored.canonical_unit)[0],
                stored.canonical_unit,
                target,
            )
        except UnitError:
            low = high = None
    return CardValue(
        quantity=quantity,
        unit=unit,
        value=value,
        range_low=low,
        range_high=high,
        **provenance,
    )


def build_card(material: MaterialInput, system: UnitSystem) -> CaeCard:
    """Convert every quantity of ``material`` into ``system``, or say why not."""
    values = {q.key: _card_value(q, system, material.values.get(q.slug)) for q in QUANTITIES}
    is_demo = material.is_demo or any(v.source_is_demo for v in values.values() if v.present)
    # The report's notices, in the report's order, minus the reproducibility
    # one: it speaks of re-running a study, and a card re-runs nothing.
    notices = [LIMITATION_NOTICE, CAE_NOTICE]
    if material.is_own_record:
        notices.insert(0, OWN_RECORD_NOTICE)
    if is_demo:
        notices.insert(0, CAE_DEMO_NOTICE)
    return CaeCard(
        material_id=material.id,
        name=material.name,
        class_name=material.class_name,
        is_active=material.is_active,
        is_own_record=material.is_own_record,
        is_demo=is_demo,
        system=system,
        values=values,
        notices=notices,
    )
