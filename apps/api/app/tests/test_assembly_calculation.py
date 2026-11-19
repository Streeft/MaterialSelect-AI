"""The bill of parts (D-257): what is summed, and what is refused."""

from __future__ import annotations

import pytest

from app.calculations.assembly import (
    CARBON,
    ENERGY,
    MASS,
    MATERIAL_COST,
    MATERIAL_GONE,
    NO_MASS,
    NO_MATERIAL,
    MaterialValue,
    PartInput,
    summarise,
    summarise_part,
)

PINE = {
    "custo_massa": MaterialValue(4.0, "IMPORTADO"),
    "energia_incorporada": MaterialValue(10.0, "MEDIDO"),
    "pegada_co2": MaterialValue(0.5, "ESTIMADO"),
}
STEEL = {
    "custo_massa": MaterialValue(2.0, "MEDIDO"),
    "energia_incorporada": MaterialValue(30.0, "MEDIDO"),
    "pegada_co2": MaterialValue(2.0, "MEDIDO"),
}


def _top(**over) -> PartInput:
    base = {
        "name": "Tampo",
        "quantity": 1,
        "unit_mass": 12.0,
        "material_name": "Pinho",
        "values": PINE,
    }
    base.update(over)
    return PartInput(**base)


def test_a_part_is_its_mass_times_what_the_catalogue_says_per_kilogram():
    legs = summarise_part(_top(name="Perna", quantity=4, unit_mass=1.5))
    assert legs.figures[MASS].value == pytest.approx(6.0)
    assert legs.figures[MATERIAL_COST].value == pytest.approx(24.0)
    assert legs.figures[ENERGY].value == pytest.approx(60.0)
    assert legs.figures[CARBON].value == pytest.approx(3.0)
    # The catalogued value's provenance travels with the figure; the mass is declared.
    assert legs.figures[CARBON].quality == "ESTIMADO"
    assert legs.figures[MASS].quality is None


def test_totals_add_every_part():
    summary = summarise(
        [
            _top(),
            _top(name="Perna", quantity=4, unit_mass=1.5),
            PartInput("Prego", 40, 0.005, "Aço", STEEL),
        ]
    )
    assert summary.totals[MASS].value == pytest.approx(12.0 + 6.0 + 0.2)
    assert summary.totals[MATERIAL_COST].value == pytest.approx(48.0 + 24.0 + 0.4)
    assert summary.totals[ENERGY].value == pytest.approx(120.0 + 60.0 + 6.0)
    assert summary.totals[CARBON].value == pytest.approx(6.0 + 3.0 + 0.4)
    assert summary.totals[MASS].missing_parts == []
    assert summary.totals[MASS].known_parts == 3


def test_a_part_without_material_has_a_mass_and_nothing_else():
    part = summarise_part(_top(material_name=None, values=None))
    assert part.figures[MASS].value == pytest.approx(12.0)
    for quantity in (MATERIAL_COST, ENERGY, CARBON):
        assert part.figures[quantity].value is None
        assert part.figures[quantity].reason == NO_MATERIAL


def test_a_part_without_mass_has_no_figure_at_all_and_never_a_zero():
    part = summarise_part(_top(unit_mass=None))
    assert part.figures[MASS].value is None
    assert part.figures[MASS].reason == NO_MASS
    assert part.figures[ENERGY].value is None
    assert part.figures[ENERGY].reason == NO_MASS


def test_a_material_that_does_not_carry_the_property_is_named_in_the_reason():
    values = {"custo_massa": PINE["custo_massa"]}
    part = summarise_part(_top(values=values))
    assert part.figures[MATERIAL_COST].value == pytest.approx(48.0)
    assert part.figures[ENERGY].value is None
    assert part.figures[ENERGY].reason == "Pinho não tem energia incorporada cadastrada."
    assert part.figures[CARBON].reason == "Pinho não tem pegada de CO₂ cadastrada."


def test_a_chosen_material_that_can_no_longer_be_read_is_its_own_state():
    part = summarise_part(_top(values=None))
    assert part.figures[MASS].value == pytest.approx(12.0)
    assert part.figures[MATERIAL_COST].reason == MATERIAL_GONE


def test_a_total_missing_one_part_is_refused_and_the_partial_sum_is_named_as_partial():
    summary = summarise([_top(), _top(name="Perna", quantity=4, unit_mass=None)])
    mass = summary.totals[MASS]
    assert mass.value is None
    assert mass.known_sum == pytest.approx(12.0)
    assert mass.known_parts == 1
    assert mass.missing_parts == ["Perna"]


def test_each_quantity_is_refused_on_its_own():
    no_energy = {k: v for k, v in PINE.items() if k != "energia_incorporada"}
    summary = summarise([_top(), _top(name="Perna", values=no_energy)])
    assert summary.totals[MASS].value == pytest.approx(24.0)
    assert summary.totals[MATERIAL_COST].value == pytest.approx(96.0)
    assert summary.totals[ENERGY].value is None
    assert summary.totals[ENERGY].missing_parts == ["Perna"]


def test_an_assembly_without_parts_has_no_total_and_nothing_missing():
    summary = summarise([])
    assert summary.parts == []
    for total in summary.totals.values():
        assert total.value is None
        assert total.missing_parts == []
        assert total.known_parts == 0


def test_a_catalogued_zero_is_a_value_not_an_absence():
    free = {**PINE, "custo_massa": MaterialValue(0.0, "MEDIDO")}
    part = summarise_part(_top(values=free))
    assert part.figures[MATERIAL_COST].value == 0.0
    assert part.figures[MATERIAL_COST].reason is None
