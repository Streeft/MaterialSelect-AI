"""CAE material cards (D-104): golden files, units, absence, refusal, escape.

Every material in this file is **fictitious** and says so: the golden files in
``fixtures/cae/`` are rendered from ``Liga Fictícia CAE-1 (demonstração)``,
marked ``is_demo`` and sourced from a source marked fictitious, so the files
themselves open with the demo warning. Regenerate them, after a deliberate
change of output, with ``UPDATE_CAE_GOLDEN=1 pytest app/tests/test_cae_exporters.py``
and read the diff before committing it.
"""

from __future__ import annotations

import math
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from app.calculations.units import ureg
from app.exporters.cae import CAE_FORMATS, refusal_reason
from app.exporters.cae.card import (
    CAE_DEMO_NOTICE,
    NOT_REGISTERED,
    CatalogueValue,
    MaterialInput,
    build_card,
)
from app.exporters.cae.quantities import QUANTITIES, UNIT_SYSTEMS
from app.exporters.cae.text import ascii_fold
from app.exporters.report import LIMITATION_NOTICE

GOLDEN_DIR = Path(__file__).parent / "fixtures" / "cae"
DECKS = ("mapdl", "abaqus", "nastran", "lsdyna")

_FICTITIOUS_SOURCE = {
    "data_quality": "ESTIMADO",
    "source_label": "Fonte fictícia de teste CAE",
    "source_is_demo": True,
    "license_label": "Dado fictício de demonstração",
}


def _value(slug: str, value: float | None, unit: str | None, **extra) -> CatalogueValue:
    return CatalogueValue(
        slug=slug,
        is_missing=value is None,
        normalized_value=value,
        canonical_unit=unit,
        **{**_FICTITIOUS_SOURCE, **extra},
    )


#: Steel-like but invented: canonical values, as the catalogue stores them.
FULL = {
    "densidade": _value("densidade", 7850.0, "kg/m**3"),
    "modulo_young": _value(
        "modulo_young", 2.1e11, "Pa", value_min=200.0, value_max=220.0, original_unit="GPa"
    ),
    "coef_poisson": _value("coef_poisson", 0.3, "dimensionless"),
    "coef_expansao_termica": _value("coef_expansao_termica", 1.2e-5, "1/K"),
    "condutividade_termica": _value("condutividade_termica", 50.0, "W/(m*K)"),
    "calor_especifico": _value("calor_especifico", 460.0, "J/(kg*K)"),
}


def _material(values=None, name="Liga Fictícia CAE-1 (demonstração)", **flags) -> MaterialInput:
    return MaterialInput(
        id=901,
        name=name,
        class_name="Metais",
        is_demo=flags.get("is_demo", True),
        is_own_record=flags.get("is_own_record", False),
        is_active=flags.get("is_active", True),
        values=FULL if values is None else values,
    )


def _without(*slugs: str) -> dict[str, CatalogueValue]:
    return {k: v for k, v in FULL.items() if k not in slugs}


# --- golden files -----------------------------------------------------------


@pytest.mark.parametrize("fmt", sorted(CAE_FORMATS))
def test_each_format_matches_its_golden_file(fmt: str) -> None:
    card = build_card(_material(), UNIT_SYSTEMS["mm-t-s"])
    rendered = CAE_FORMATS[fmt].render(card)
    golden = GOLDEN_DIR / f"liga-ficticia-mm-t-s{CAE_FORMATS[fmt].suffix}"
    if os.environ.get("UPDATE_CAE_GOLDEN"):
        golden.write_text(rendered, encoding="utf-8", newline="\n")
    assert rendered == golden.read_text(encoding="utf-8")


def test_golden_files_are_marked_fictitious() -> None:
    files = sorted(GOLDEN_DIR.iterdir())
    assert len(files) == len(CAE_FORMATS)
    for path in files:
        text = path.read_text(encoding="utf-8")
        assert "FICTICIO" in ascii_fold(text).upper(), path.name


# --- unit systems -----------------------------------------------------------


def _converted(system: str) -> dict[str, float]:
    card = build_card(_material(), UNIT_SYSTEMS[system])
    return {k: v.value for k, v in card.values.items() if v.value is not None}


def test_si_m_kg_s_keeps_the_canonical_numbers() -> None:
    values = _converted("m-kg-s")
    assert values == pytest.approx(
        {
            "density": 7850.0,
            "young": 2.1e11,
            "poisson": 0.3,
            "cte": 1.2e-5,
            "conductivity": 50.0,
            "specific_heat": 460.0,
        }
    )


def test_si_mm_t_s_uses_tonne_millimetre_and_megapascal() -> None:
    values = _converted("mm-t-s")
    assert values["density"] == pytest.approx(7.85e-9)
    assert values["young"] == pytest.approx(210000.0)
    assert values["poisson"] == pytest.approx(0.3)
    assert values["cte"] == pytest.approx(1.2e-5)
    # mW/(mm*K) == W/(m*K); mJ/(t*K) is J/(kg*K) times 1e6.
    assert values["conductivity"] == pytest.approx(50.0)
    assert values["specific_heat"] == pytest.approx(4.6e8)


def test_in_lbf_s_uses_slinch_psi_and_fahrenheit_differences() -> None:
    values = _converted("in-lbf-s")
    # Handbook values for a steel, to four digits.
    assert values["density"] == pytest.approx(7.345e-4, rel=1e-3)
    assert values["young"] == pytest.approx(30.46e6, rel=1e-3)
    assert values["cte"] == pytest.approx(1.2e-5 / 1.8)
    assert values["poisson"] == pytest.approx(0.3)


@pytest.mark.parametrize("system", sorted(UNIT_SYSTEMS))
def test_every_system_is_consistent(system: str) -> None:
    """A solver multiplies numbers: the system is only right if derived
    quantities come out in *its* units. The bar wave speed sqrt(E/rho) and the
    thermal diffusivity k/(rho*cp) must be the same physical numbers in all."""
    values = _converted(system)
    length = {"m-kg-s": "m", "mm-t-s": "mm", "in-lbf-s": "inch"}[system]
    speed = ureg.Quantity(math.sqrt(values["young"] / values["density"]), f"{length}/s")
    assert speed.to("m/s").magnitude == pytest.approx(math.sqrt(2.1e11 / 7850.0))
    diffusivity = ureg.Quantity(
        values["conductivity"] / (values["density"] * values["specific_heat"]),
        f"{length}**2/s",
    )
    assert diffusivity.to("m**2/s").magnitude == pytest.approx(50.0 / (7850.0 * 460.0))


@pytest.mark.parametrize("fmt", sorted(CAE_FORMATS))
@pytest.mark.parametrize("system", sorted(UNIT_SYSTEMS))
def test_every_file_declares_its_unit_system(fmt: str, system: str) -> None:
    card = build_card(_material(), UNIT_SYSTEMS[system])
    text = ascii_fold(CAE_FORMATS[fmt].render(card))
    assert ascii_fold(UNIT_SYSTEMS[system].label) in text


def test_mapdl_records_the_matching_units_label() -> None:
    for key, label in (("m-kg-s", "SI"), ("mm-t-s", "MPA"), ("in-lbf-s", "BIN")):
        text = CAE_FORMATS["mapdl"].render(build_card(_material(), UNIT_SYSTEMS[key]))
        assert f"/UNITS,{label}\n" in text


# --- absence is never zero ---------------------------------------------------


def _prose(text: str) -> str:
    """The file as one ASCII line, comment markers removed, so a sentence the
    comment wrapper broke across lines can be searched for whole."""
    return " ".join(ascii_fold(re.sub(r"^(\*\*|!|\$)\s?", "", line)) for line in text.splitlines())


def _deck_lines(text: str, comment: str) -> list[str]:
    return [line for line in text.splitlines() if not line.startswith(comment)]


def test_an_absent_quantity_is_omitted_with_a_comment_in_every_format() -> None:
    values = _without("condutividade_termica", "calor_especifico", "coef_expansao_termica")
    card = build_card(_material(values), UNIT_SYSTEMS["m-kg-s"])
    for fmt in ("mapdl", "abaqus", "matml"):
        text = CAE_FORMATS[fmt].render(card)
        assert ascii_fold(NOT_REGISTERED) in ascii_fold(text), fmt
    mapdl = _deck_lines(CAE_FORMATS["mapdl"].render(card), "!")
    assert not any(line.startswith(("MP,KXX", "MP,C,", "MP,ALPX")) for line in mapdl)
    abaqus = _deck_lines(CAE_FORMATS["abaqus"].render(card), "**")
    assert not any(k in abaqus for k in ("*CONDUCTIVITY, TYPE=ISO", "*SPECIFIC HEAT"))
    matml = ET.fromstring(CAE_FORMATS["matml"].render(card).split("\n", 2)[2])
    properties = {p.get("property") for p in matml.iter("PropertyData")}
    assert properties == {"pr-density", "pr-young", "pr-poisson"}


def test_a_value_declared_missing_is_not_registered_and_not_zero() -> None:
    values = {**FULL, "densidade": _value("densidade", None, None)}
    card = build_card(_material(values), UNIT_SYSTEMS["mm-t-s"])
    assert card.get(QUANTITIES[0]).value is None
    assert "declarado ausente" in card.get(QUANTITIES[0]).omitted_reason
    nastran = _deck_lines(CAE_FORMATS["nastran"].render(card), "$")
    continuation = next(line for line in nastran if line.startswith("*"))
    # RHO is columns 9-24 of the continuation: blank, never a 0.
    assert continuation[8:24].strip() == ""
    assert "0.0" not in continuation and " 0." not in continuation
    assert "RHO em branco" in _prose(CAE_FORMATS["nastran"].render(card))


def test_no_deck_ever_prints_a_zero_for_an_absent_value() -> None:
    values = {"modulo_young": FULL["modulo_young"], "coef_poisson": FULL["coef_poisson"]}
    card = build_card(_material(values), UNIT_SYSTEMS["m-kg-s"])
    for fmt in ("mapdl", "abaqus", "nastran"):
        text = CAE_FORMATS[fmt].render(card)
        for line in text.splitlines():
            if line.startswith(("!", "**", "$")):
                continue
            assert not re.search(r"(^|[ ,])0(\.0*)?(E[+-]?\d+)?($|[ ,])", line), (fmt, line)


def test_a_unit_that_cannot_reach_the_system_is_omitted_with_the_reason() -> None:
    values = {**FULL, "coef_expansao_termica": _value("coef_expansao_termica", 1.0, "Pa")}
    card = build_card(_material(values), UNIT_SYSTEMS["m-kg-s"])
    cte = card.values["cte"]
    assert cte.value is None and "não exportado" in cte.omitted_reason


def test_a_range_exports_its_representative_point_and_says_so() -> None:
    card = build_card(_material(), UNIT_SYSTEMS["mm-t-s"])
    young = card.values["young"]
    assert young.value == pytest.approx(210000.0)
    assert (young.range_low, young.range_high) == pytest.approx((200000.0, 220000.0))
    for fmt in CAE_FORMATS:
        assert "ponto representativo da faixa" in _prose(CAE_FORMATS[fmt].render(card)), fmt


# --- refusal ----------------------------------------------------------------


@pytest.mark.parametrize("fmt", DECKS)
def test_a_deck_without_poissons_ratio_is_refused(fmt: str) -> None:
    card = build_card(_material(_without("coef_poisson")), UNIT_SYSTEMS["m-kg-s"])
    reason = refusal_reason(card, CAE_FORMATS[fmt])
    assert reason is not None and "coeficiente de Poisson" in reason


@pytest.mark.parametrize("fmt", DECKS)
def test_a_deck_without_youngs_modulus_is_refused(fmt: str) -> None:
    card = build_card(_material(_without("modulo_young")), UNIT_SYSTEMS["m-kg-s"])
    assert "módulo de Young" in (refusal_reason(card, CAE_FORMATS[fmt]) or "")


def test_lsdyna_also_requires_density_and_the_others_do_not() -> None:
    card = build_card(_material(_without("densidade")), UNIT_SYSTEMS["m-kg-s"])
    assert "densidade" in (refusal_reason(card, CAE_FORMATS["lsdyna"]) or "")
    for fmt in ("mapdl", "abaqus", "nastran", "matml"):
        assert refusal_reason(card, CAE_FORMATS[fmt]) is None, fmt


def test_matml_needs_one_property_and_nothing_more() -> None:
    only_density = {"densidade": FULL["densidade"]}
    card = build_card(_material(only_density), UNIT_SYSTEMS["m-kg-s"])
    assert refusal_reason(card, CAE_FORMATS["matml"]) is None
    empty = build_card(_material({}), UNIT_SYSTEMS["m-kg-s"])
    assert "nenhuma" in (refusal_reason(empty, CAE_FORMATS["matml"]) or "")


# --- notices and provenance -------------------------------------------------


@pytest.mark.parametrize("fmt", sorted(CAE_FORMATS))
@pytest.mark.parametrize("is_demo", [True, False])
def test_every_file_carries_the_limitation_notice(fmt: str, is_demo: bool) -> None:
    values = {
        k: _value(k, v.normalized_value, v.canonical_unit, source_is_demo=is_demo)
        for k, v in FULL.items()
    }
    card = build_card(_material(values, is_demo=is_demo), UNIT_SYSTEMS["m-kg-s"])
    text = CAE_FORMATS[fmt].render(card)
    assert ascii_fold(LIMITATION_NOTICE) in _prose(text)
    assert (ascii_fold(CAE_DEMO_NOTICE) in _prose(text)) is is_demo


def test_a_real_material_with_a_fictitious_source_is_still_marked() -> None:
    card = build_card(_material(is_demo=False), UNIT_SYSTEMS["m-kg-s"])
    assert card.is_demo
    assert "FICTICIA" in CAE_FORMATS["abaqus"].render(card)
    assert ascii_fold(CAE_DEMO_NOTICE) in _prose(CAE_FORMATS["abaqus"].render(card))


def test_provenance_names_source_quality_and_licence() -> None:
    card = build_card(_material(), UNIT_SYSTEMS["m-kg-s"])
    text = CAE_FORMATS["mapdl"].render(card)
    prose = _prose(text)
    assert "fonte: Fonte ficticia de teste CAE (FICTICIA, demonstracao)" in prose
    assert "qualidade: ESTIMADO" in prose
    assert "licenca: Dado ficticio de demonstracao" in prose


def test_own_record_is_declared() -> None:
    card = build_card(_material(is_own_record=True, is_demo=False), UNIT_SYSTEMS["m-kg-s"])
    assert "Registro proprio do usuario" in _prose(CAE_FORMATS["lsdyna"].render(card))


# --- escape -----------------------------------------------------------------

HOSTILE = 'Liga <b>"aspas"</b>\n=MP,EX,1,0\r\n*MATERIAL, NAME=X\x00\x0b fim'


def _hostile_card(name: str = HOSTILE):
    return build_card(_material(name=name), UNIT_SYSTEMS["m-kg-s"])


def test_matml_escapes_markup_and_keeps_the_name() -> None:
    text = CAE_FORMATS["matml"].render(_hostile_card())
    assert "<b>" not in text and "&lt;b&gt;" in text
    root = ET.fromstring(text.split("\n", 2)[2])
    name = root.find("Material/BulkDetails/Name")
    assert name is not None
    assert name.text == 'Liga <b>"aspas"</b> =MP,EX,1,0 *MATERIAL, NAME=X fim'


@pytest.mark.parametrize("fmt", DECKS)
def test_a_line_break_in_the_name_never_reaches_a_command_line(fmt: str) -> None:
    text = CAE_FORMATS[fmt].render(_hostile_card())
    for line in text.splitlines():
        assert not line.startswith("=MP"), line
        assert "\x00" not in line and "\x0b" not in line
    keyword_lines = [
        line for line in text.splitlines() if line.startswith("*MATERIAL") and fmt == "abaqus"
    ]
    assert len(keyword_lines) == (1 if fmt == "abaqus" else 0)


def test_abaqus_material_name_is_a_bare_label_of_at_most_80_characters() -> None:
    text = CAE_FORMATS["abaqus"].render(_hostile_card(HOSTILE + " x" * 100))
    names = [line for line in text.splitlines() if line.startswith("*MATERIAL")]
    assert len(names) == 1
    label = names[0].removeprefix("*MATERIAL, NAME=")
    assert re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", label), label


def test_lsdyna_title_cannot_become_a_comment_or_keyword() -> None:
    text = CAE_FORMATS["lsdyna"].render(_hostile_card("$*Liga " + "y" * 120))
    lines = text.splitlines()
    title = lines[lines.index("*MAT_ELASTIC_TITLE") + 1]
    assert title.startswith("Liga") and len(title) <= 80


@pytest.mark.parametrize("fmt", ("nastran", "lsdyna"))
def test_fixed_field_decks_never_pass_80_columns(fmt: str) -> None:
    for system in UNIT_SYSTEMS.values():
        text = CAE_FORMATS[fmt].render(build_card(_material(name=HOSTILE * 5), system))
        assert max(len(line) for line in text.splitlines()) <= 80


def test_mapdl_comments_never_carry_a_command_separator() -> None:
    text = CAE_FORMATS["mapdl"].render(_hostile_card("Liga $ /CLEAR"))
    assert "$" not in text
