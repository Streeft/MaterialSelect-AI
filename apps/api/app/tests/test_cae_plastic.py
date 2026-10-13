"""Elastoplastic CAE cards (D-119, TM5-b): golden files, units, E, refusal.

Same fictitious material as ``test_cae_exporters.py`` (``Liga Fictícia CAE-1
(demonstração)``) plus an invented engineering stress–strain series and an
invented E × T curve, both marked fictitious; the golden files therefore open
with the demo warning. Regenerate them, after a deliberate change, with
``UPDATE_CAE_GOLDEN=1 pytest app/tests/test_cae_plastic.py`` and read the diff.
"""

from __future__ import annotations

import os
from dataclasses import replace

import pytest

from app.calculations.units import to_canonical
from app.domain.plasticity import plastic_table
from app.exporters.cae import ALL_FORMATS, CAE_FORMATS, PLASTIC_FORMATS, refusal_reason
from app.exporters.cae.card import (
    CAE_DEMO_NOTICE,
    CAE_NOTICE,
    CAE_PLASTIC_NOTICE,
    CurveProvenance,
    PlasticInput,
    build_card,
    with_plastic,
)
from app.exporters.cae.quantities import UNIT_SYSTEMS
from app.exporters.cae.text import ascii_fold
from app.exporters.report import LIMITATION_NOTICE
from app.tests.test_cae_exporters import FULL, GOLDEN_DIR, _material, _prose, _without

E_AT_T = 2.0e11  # Pa, invented: differs from the catalogue's 2.1e11 on purpose
TEMPERATURE = to_canonical(20, "degC", "K")[0]

#: Invented engineering series (strain, stress in Pa): origin, elastic limit,
#: hardening, then necking after the maximum.
ENGINEERING = [
    (0.0, 0.0),
    (0.00125, 250e6),
    (0.01, 300e6),
    (0.05, 380e6),
    (0.12, 420e6),
    (0.18, 400e6),
]


def _curve(curve_id: int, title: str, **extra) -> CurveProvenance:
    base = {
        "curve_id": curve_id,
        "title": title,
        "source_label": "Fonte fictícia de teste CAE",
        "source_is_demo": True,
        "license_label": "Dado fictício de demonstração",
        "citation": "Curva inventada para teste — não é ensaio.",
        "data_quality": "ESTIMADO",
        "is_demo": True,
    }
    return CurveProvenance(**{**base, **extra})


PLASTIC_INPUT = PlasticInput(
    curve=_curve(41, "Tração fictícia CAE-1 (engenharia)"),
    series_position=0,
    series_label=None,
    conditions="Tração uniaxial, 20 °C (fictício).",
    temperature=TEMPERATURE,
    modulus_curve=_curve(42, "Módulo de Young × temperatura fictício CAE-1"),
)


def _plastic_card(system: str = "mm-t-s", values=None, series=None, **material_flags):
    card = build_card(_material(values, **material_flags), UNIT_SYSTEMS[system])
    table = plastic_table(
        series or ENGINEERING, strain_measure="engineering", youngs_modulus=E_AT_T
    )
    return with_plastic(card, PLASTIC_INPUT, table)


# --- golden files -------------------------------------------------------------


@pytest.mark.parametrize("fmt", sorted(PLASTIC_FORMATS))
def test_each_plastic_format_matches_its_golden_file(fmt: str) -> None:
    rendered = PLASTIC_FORMATS[fmt].render(_plastic_card())
    golden = GOLDEN_DIR / f"liga-ficticia-mm-t-s{PLASTIC_FORMATS[fmt].suffix}"
    if os.environ.get("UPDATE_CAE_GOLDEN"):
        golden.write_text(rendered, encoding="utf-8", newline="\n")
    assert rendered == golden.read_text(encoding="utf-8")


def test_the_plastic_formats_are_apart_from_the_elastic_ones() -> None:
    assert set(PLASTIC_FORMATS) == {
        "mapdl-plastic",
        "abaqus-plastic",
        "nastran-plastic",
        "lsdyna-plastic",
    }
    assert not set(PLASTIC_FORMATS) & set(CAE_FORMATS)
    assert ALL_FORMATS == {**CAE_FORMATS, **PLASTIC_FORMATS}
    assert all(f.plastic for f in PLASTIC_FORMATS.values())
    assert not any(f.plastic for f in CAE_FORMATS.values())


# --- the card ---------------------------------------------------------------------


def test_e_at_the_series_temperature_replaces_the_catalogue_value() -> None:
    card = _plastic_card("m-kg-s")
    assert card.values["young"].value == E_AT_T
    assert card.catalogue_young is not None and card.catalogue_young.value == 2.1e11
    text = _prose(ALL_FORMATS["abaqus-plastic"].render(card))
    assert "NAO usado" in text and "210000000000." in text
    assert "*ELASTIC, TYPE=ISOTROPIC\n200000000000., 0.3\n" in ALL_FORMATS["abaqus-plastic"].render(
        card
    )


def test_the_plastic_notice_replaces_the_elastic_one_and_the_rest_stay() -> None:
    card = _plastic_card()
    assert CAE_PLASTIC_NOTICE in card.notices and CAE_NOTICE not in card.notices
    assert LIMITATION_NOTICE in card.notices
    assert card.notices[0] == CAE_DEMO_NOTICE


def test_a_real_material_with_a_fictitious_curve_is_marked_fictitious() -> None:
    card = _plastic_card(is_demo=False, values=_with_real_sources())
    assert card.is_demo
    assert card.notices[0] == CAE_DEMO_NOTICE


def _with_real_sources():
    return {
        k: replace(v, source_is_demo=False, source_label="Fonte real de teste")
        for k, v in FULL.items()
    }


@pytest.mark.parametrize(
    ("system", "yield_text"),
    [
        ("m-kg-s", "250312500."),
        ("mm-t-s", "250.3125"),
    ],
)
def test_stresses_are_converted_into_the_system_and_strain_is_not(
    system: str, yield_text: str
) -> None:
    card = _plastic_card(system)
    lines = ALL_FORMATS["abaqus-plastic"].render(card).splitlines()
    first = lines[lines.index("*PLASTIC") + 1]
    assert first == f"{yield_text}, 0."
    assert card.plastic is not None
    assert [r.plastic_strain for r in card.plastic.rows] == [
        r.plastic_strain for r in _plastic_card("in-lbf-s").plastic.rows
    ]


def test_us_system_writes_psi() -> None:
    card = _plastic_card("in-lbf-s")
    assert card.plastic is not None and card.plastic.stress_unit == "psi"
    # 250.3125 MPa in psi, through Pint (not a literal factor in the code).
    expected = to_canonical(250.3125, "MPa", "psi")[0]
    assert card.plastic.yield_stress == pytest.approx(expected)


# --- what each format writes ------------------------------------------------------


def test_abaqus_plastic_lines_are_stress_then_plastic_strain_from_zero() -> None:
    card = _plastic_card()
    lines = ALL_FORMATS["abaqus-plastic"].render(card).splitlines()
    i = lines.index("*PLASTIC")
    data = [tuple(float(x) for x in line.split(",")) for line in lines[i + 1 :]]
    assert data[0][1] == 0.0
    assert [d[1] for d in data] == sorted(d[1] for d in data)
    assert len(data) == len(card.plastic.rows)


def test_mapdl_plastic_uses_tb_plas_miso_with_one_point_per_row() -> None:
    card = _plastic_card()
    text = ALL_FORMATS["mapdl-plastic"].render(card)
    n = len(card.plastic.rows)
    assert f"\nTB,PLAS,MATID,1,{n},MISO\n" in text
    assert text.count("\nTBPT,DEFI,") == n
    assert "\nTBPT,DEFI,0.,250.3125\n" in text


def test_nastran_table_starts_at_the_origin_with_slope_e() -> None:
    card = _plastic_card()
    lines = ALL_FORMATS["nastran-plastic"].render(card).splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("TABLES1*"))
    fields: list[str] = []
    for line in lines[start + 1 :]:
        body = line[8:]
        fields += [body[k : k + 16].strip() for k in range(0, len(body), 16)]
    fields = [f for f in fields if f]
    assert fields[-1] == "ENDT"
    numbers = [float(f) for f in fields[:-1]]
    pairs = list(zip(numbers[::2], numbers[1::2], strict=True))
    assert pairs[0] == (0.0, 0.0)
    strain, stress = pairs[1]
    young_mpa = card.values["young"].value
    assert stress / strain == pytest.approx(young_mpa, rel=1e-9)
    mats1 = next(line for line in lines if line.startswith("MATS1*"))
    assert "PLASTIC" in mats1
    assert "MAT1*" in "\n".join(lines)


def test_lsdyna_plastic_points_lcss_to_a_curve_of_plastic_strain() -> None:
    card = _plastic_card()
    lines = ALL_FORMATS["lsdyna-plastic"].render(card).splitlines()
    assert lines[0] == "*KEYWORD" and lines[-1] == "*END"
    assert "*MAT_PIECEWISE_LINEAR_PLASTICITY_TITLE" in lines
    i = lines.index("*DEFINE_CURVE")
    points = [line for line in lines[i + 1 :] if line and not line.startswith(("$", "*"))][1:]
    assert len(points) == len(card.plastic.rows)
    assert float(points[0][:20]) == 0.0
    card2 = lines[lines.index("$#       c         p      lcss      lcsr        vp") + 1]
    assert card2[20:30].strip() == "1"


@pytest.mark.parametrize("fmt", sorted(PLASTIC_FORMATS))
@pytest.mark.parametrize("system", sorted(UNIT_SYSTEMS))
def test_every_plastic_file_keeps_the_notices_and_80_columns(fmt: str, system: str) -> None:
    raw = ALL_FORMATS[fmt].render(_plastic_card(system))
    text = _prose(raw)
    assert ascii_fold(LIMITATION_NOTICE) in text
    assert "FICTICI" in text.upper()
    assert "D-119" in text
    assert "Medida declarada pela fonte: engenharia" in text
    assert "sigma_t = sigma*(1+eps)" in text
    assert all(len(line) <= 80 for line in raw.splitlines()), fmt


def test_the_trail_counts_what_was_dropped_and_the_anchor() -> None:
    text = _prose(ALL_FORMATS["abaqus-plastic"].render(_plastic_card()))
    assert "tensao maxima de engenharia descartados: 1" in text
    assert "antes do limite elastico descartados: 1" in text
    assert "ancorado em eps_p = 0" in text
    assert "ponto exato, sem interpolacao" in text


# --- refusal ------------------------------------------------------------------------


@pytest.mark.parametrize("fmt", sorted(PLASTIC_FORMATS))
def test_a_plastic_format_without_a_table_is_refused(fmt: str) -> None:
    card = build_card(_material(), UNIT_SYSTEMS["mm-t-s"])
    reason = refusal_reason(card, PLASTIC_FORMATS[fmt]) or ""
    assert "falta a curva plástica" in reason


@pytest.mark.parametrize("fmt", sorted(PLASTIC_FORMATS))
def test_a_plastic_card_without_poisson_is_refused(fmt: str) -> None:
    card = _plastic_card(values=_without("coef_poisson"))
    assert "coeficiente de Poisson" in (refusal_reason(card, PLASTIC_FORMATS[fmt]) or "")


def test_lsdyna_plastic_also_requires_density() -> None:
    card = _plastic_card(values=_without("densidade"))
    assert "densidade" in (refusal_reason(card, PLASTIC_FORMATS["lsdyna-plastic"]) or "")
    for fmt in ("mapdl-plastic", "abaqus-plastic", "nastran-plastic"):
        assert refusal_reason(card, PLASTIC_FORMATS[fmt]) is None, fmt


def test_a_plastic_card_without_the_catalogue_e_still_has_e_at_temperature() -> None:
    card = _plastic_card(values=_without("modulo_young"))
    for fmt in PLASTIC_FORMATS.values():
        assert refusal_reason(card, fmt) is None, fmt.key


def test_mapdl_refuses_a_table_longer_than_its_limit() -> None:
    eps_y = 250e6 / E_AT_T
    series = [(eps_y, 250e6)] + [(0.01 + 0.001 * i, 300e6 + 1e5 * i) for i in range(100)]
    table = plastic_table(series, strain_measure="true", youngs_modulus=E_AT_T)
    card = with_plastic(build_card(_material(), UNIT_SYSTEMS["mm-t-s"]), PLASTIC_INPUT, table)
    assert len(card.plastic.rows) == 101
    reason = refusal_reason(card, PLASTIC_FORMATS["mapdl-plastic"]) or ""
    assert "admite até 100" in reason
    assert refusal_reason(card, PLASTIC_FORMATS["abaqus-plastic"]) is None
