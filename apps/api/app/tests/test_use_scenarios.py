"""The curated use scenarios (D-224): every limit is real, converts and is plausible.

A scenario number is the second origin a plan limit may have, so this table is
held to what the catalogue can actually answer:

* every property exists in the catalogue's definitions (numeric or ordinal);
* every unit converts to the property's canonical unit through Pint;
* every value lies inside the range the demo catalogue holds — a threshold
  outside it would select everything or nothing, the shape of an invented
  number rather than of a requirement;
* every ordinal level is on its property's scale, and some demo material
  reaches it;
* sources never borrow a standard: a limit without a publication says it is a
  teaching range.
"""

from __future__ import annotations

import collections
import re

import pytest

from app.calculations.units import to_canonical
from app.db.seed import DEMO_MATERIALS, PROPERTIES
from app.db.seed_demo_extended_props import (
    _CORE_READ,
    _READING_UNIT,
    BIOCOMPATIBILITY_SCALE,
    DURABILITY_SCALE,
    ORDINAL_SPECS,
    build_basis,
    compute,
    profile_for,
    trusted_names,
)
from app.db.seed_extended import EXTENDED_DEMO_MATERIALS, TCC_DEMO_MATERIALS
from app.domain import use_scenarios
from app.domain.study_templates import nearest_template
from app.domain.use_scenarios import (
    DIDACTIC_SOURCE,
    NUMERIC_SCENARIO_OPERATORS,
    SCENARIO_OPERATORS,
    SCENARIO_SCOPES,
    USE_SCENARIOS,
    match_scenarios,
    scenario_by_id,
)

CANONICAL = {p["slug"]: p["canonical_unit"] for p in PROPERTIES}
ORDINAL_SCALES = {spec.slug: spec.scale for spec in ORDINAL_SPECS}
ALL_SPECS = [*DEMO_MATERIALS, *EXTENDED_DEMO_MATERIALS, *TCC_DEMO_MATERIALS]


def _number(value: dict) -> float:
    if value["kind"] == "scalar":
        return value["value"]
    return value.get("typical") or (value["min"] + value["max"]) / 2


def _demo_catalogue() -> tuple[dict[str, tuple[float, float]], dict[str, set[int]]]:
    """Observed canonical range per property, and the ranks held per ordinal,
    over every demo material — computed the way the demo seed writes them."""
    values: dict[str, list[float]] = collections.defaultdict(list)
    ranks: dict[str, set[int]] = collections.defaultdict(set)
    trusted = trusted_names()
    for spec in ALL_SPECS:
        own: dict[str, float] = {}
        for value in spec["values"]:
            if value["kind"] == "missing":
                continue
            canonical = to_canonical(_number(value), value["unit"], CANONICAL[value["slug"]])[0]
            values[value["slug"]].append(canonical)
            if value["slug"] in _CORE_READ:
                key, unit = _CORE_READ[value["slug"]]
                own[key] = to_canonical(canonical, CANONICAL[value["slug"]], unit)[0]
        if "a" in own:
            own["a"] *= 1e6
        profile = profile_for(spec["class_slug"], spec.get("subclass"), spec["name"])
        result = compute(
            spec["name"], profile, build_basis(profile, own, trusted=spec["name"] in trusted)
        )
        for slug, value in result.values.items():
            if value is not None:
                values[slug].append(to_canonical(value, _READING_UNIT[slug], CANONICAL[slug])[0])
        for slug, rank in result.ranks.items():
            ranks[slug].add(rank)
    return {slug: (min(v), max(v)) for slug, v in values.items() if v}, ranks


RANGES, RANKS = _demo_catalogue()

LIMITS = [(s, c) for s in USE_SCENARIOS for c in s.constraints]


def _id(item) -> str:
    scenario, constraint = item
    return f"{scenario.id}:{constraint.property_slug}"


class TestTable:
    def test_the_scenarios_the_assistant_promises_are_there(self) -> None:
        expected = {
            "frio-extremo",
            "calor-moderado",
            "calor-alto",
            "externo-uv",
            "agua-doce",
            "agua-salgada",
            "contato-alimento",
            "contato-pele",
            "estrutural-leve",
            "isolamento-termico",
            "isolamento-eletrico",
            "baixo-custo",
            "acidos-alcalis",
        }
        assert expected <= {s.id for s in USE_SCENARIOS}

    def test_ids_are_unique_slugs(self) -> None:
        ids = [s.id for s in USE_SCENARIOS]
        assert len(ids) == len(set(ids))
        assert all(re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", i) for i in ids)
        assert all(scenario_by_id(i) is not None for i in ids)
        assert scenario_by_id("nao-existe") is None

    def test_every_scenario_has_a_name_triggers_limits_a_source_and_a_scope(self) -> None:
        for scenario in USE_SCENARIOS:
            assert scenario.name and scenario.summary, scenario.id
            assert scenario.triggers, scenario.id
            assert scenario.constraints, scenario.id
            assert scenario.source.strip(), scenario.id
            assert scenario.scope in SCENARIO_SCOPES, scenario.id

    def test_the_summary_the_model_reads_carries_no_number(self) -> None:
        # The model picks scenarios by id and must not copy their numbers.
        for scenario in USE_SCENARIOS:
            assert not re.search(r"\d", scenario.summary), scenario.id

    def test_triggers_are_already_folded(self) -> None:
        for scenario in USE_SCENARIOS:
            for trigger in scenario.triggers:
                assert trigger == use_scenarios.fold(trigger), (scenario.id, trigger)

    def test_sources_are_honest(self) -> None:
        # A teaching range says so; the one publication cited is named in full.
        for scenario in USE_SCENARIOS:
            assert scenario.source.startswith(DIDACTIC_SOURCE) or "Callister" in scenario.source
        cited = [s.id for s in USE_SCENARIOS if not s.source.startswith(DIDACTIC_SOURCE)]
        assert cited == ["isolamento-eletrico"]


class TestLimits:
    @pytest.mark.parametrize("item", LIMITS, ids=_id)
    def test_operator_is_allowed(self, item) -> None:
        _, constraint = item
        assert constraint.operator in SCENARIO_OPERATORS

    @pytest.mark.parametrize(
        "item", [i for i in LIMITS if i[1].operator in NUMERIC_SCENARIO_OPERATORS], ids=_id
    )
    def test_numeric_limit_exists_converts_and_is_plausible(self, item) -> None:
        scenario, constraint = item
        slug = constraint.property_slug
        assert slug in CANONICAL, f"{scenario.id}: '{slug}' não é propriedade do catálogo"
        assert constraint.value is not None and constraint.unit
        value = to_canonical(constraint.value, constraint.unit, CANONICAL[slug])[0]
        low, high = RANGES[slug]
        assert low <= value <= high, (scenario.id, slug, value, low, high)
        assert constraint.level is None

    @pytest.mark.parametrize(
        "item", [i for i in LIMITS if i[1].operator == "level_at_least"], ids=_id
    )
    def test_level_is_on_the_scale_and_reachable(self, item) -> None:
        scenario, constraint = item
        slug = constraint.property_slug
        assert slug in ORDINAL_SCALES, f"{scenario.id}: '{slug}' não é propriedade ordinal"
        scale = ORDINAL_SCALES[slug]
        assert constraint.level in scale
        assert constraint.value is None and constraint.unit is None
        # Some demo material holds that level or a better one.
        assert max(RANKS[slug]) >= scale.index(constraint.level), (scenario.id, slug)

    @pytest.mark.parametrize("item", [i for i in LIMITS if i[1].operator == "exists"], ids=_id)
    def test_existence_names_a_property(self, item) -> None:
        _, constraint = item
        assert constraint.property_slug in CANONICAL or constraint.property_slug in ORDINAL_SCALES

    def test_every_limit_explains_itself(self) -> None:
        for scenario, constraint in LIMITS:
            assert constraint.note.strip(), (scenario.id, constraint.property_slug)

    def test_criteria_rank_by_numeric_properties(self) -> None:
        for scenario in USE_SCENARIOS:
            for criterion in scenario.criteria:
                assert criterion.property_slug in CANONICAL
                assert criterion.direction in ("max", "min")

    def test_the_scales_repeated_here_are_the_seeded_ones(self) -> None:
        assert use_scenarios.DURABILITY_SCALE == DURABILITY_SCALE
        assert use_scenarios.BIOCOMPATIBILITY_SCALE == BIOCOMPATIBILITY_SCALE


class TestTriggers:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("Quero fazer uma roupa de esqui", {"frio-extremo", "contato-pele", "externo-uv"}),
            ("uma garrafa para levar na praia", {"contato-alimento", "agua-salgada"}),
            ("capa de fio de tomada", {"isolamento-eletrico"}),
            ("uma panela barata", {"calor-alto", "contato-alimento", "baixo-custo"}),
            ("caixa térmica para manter frio", {"isolamento-termico", "frio-extremo"}),
        ],
    )
    def test_plain_words_find_the_scenario(self, text: str, expected: set[str]) -> None:
        assert expected <= {s.id for s in match_scenarios(text)}

    @pytest.mark.parametrize(
        ("text", "absent"),
        [
            ("resistente a solvente", "externo-uv"),  # "sol" inside a word
            ("uma marmita", "agua-salgada"),  # "mar" inside a word
            ("isolamento elétrico de um fio", "isolamento-termico"),
        ],
    )
    def test_a_word_inside_another_does_not_fire(self, text: str, absent: str) -> None:
        assert absent not in {s.id for s in match_scenarios(text)}

    def test_accents_and_case_do_not_matter(self) -> None:
        assert [s.id for s in match_scenarios("ÁGUA SALGADA")] == [
            s.id for s in match_scenarios("agua salgada")
        ]

    def test_nothing_in_the_text_triggers_nothing(self) -> None:
        assert match_scenarios("algo legal") == []


class TestNearestTemplate:
    def test_a_building_is_a_beam_and_a_wall_is_a_panel(self) -> None:
        assert nearest_template("um prédio para 50 pessoas").slug == "viga-leve-rigida"
        assert nearest_template("uma parede de casa").slug in {
            "painel-leve-rigido",
            "viga-leve-rigida",
        }
        assert nearest_template("um radiador").slug == "trocador-de-calor"

    def test_no_keyword_is_no_template(self) -> None:
        assert nearest_template("algo legal") is None

    def test_casaco_is_not_casa(self) -> None:
        template = nearest_template("um casaco")
        assert template is None or template.slug != "viga-leve-rigida"
