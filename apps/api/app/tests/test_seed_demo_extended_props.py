"""The extended catalogue (D-188) and its additive demo seed (D-189).

Two halves. The pure half computes every value of every demo spec — the 5 of
``seed``, the 70 of ``seed_extended`` and the 593 lots of D-185 — without a
database and checks the physics that ties them together. The database half
runs the writer twice and proves it is additive, idempotent, demo-only and
never rewrites a stored value.
"""

from __future__ import annotations

import math

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.calculations.units import to_canonical
from app.db.clear_demo import clear_demo_data
from app.db.demo_extended_data import PROFILES
from app.db.property_catalog_extended import EXTENDED_PROPERTIES, EXTENDED_SLUGS
from app.db.seed import CORE_SLUGS, DEMO_MATERIALS, DEMO_SOURCE_LABEL, PROPERTIES
from app.db.seed_demo_extended_props import (
    _COMPILED,
    _CORE_READ,
    _SUBCLASS_RULES,
    DEMO_NOTE,
    NOT_APPLICABLE,
    ORDINAL_SLUGS,
    ORDINAL_SPECS,
    build_basis,
    compute,
    normalize,
    profile_for,
    resolve_profile,
    seed_demo_extended_properties,
    trusted_names,
)
from app.db.seed_demo_releases import seed_demo_releases
from app.db.seed_extended import (
    EXTENDED_DEMO_MATERIALS,
    TCC_DEMO_MATERIALS,
    seed_demo_catalog_expansion,
    seed_extended_materials,
)
from app.domain.depth_profile import PROPERTY_MIN_LEVEL, DepthLevel
from app.domain.glossary import load_entries
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.ordinal_property import MaterialOrdinalValue, OrdinalPropertyDefinition
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

ALL_SPECS = [*DEMO_MATERIALS, *EXTENDED_DEMO_MATERIALS, *TCC_DEMO_MATERIALS]
TRUSTED = trusted_names()
#: Fictitious names no family rule can recognise; they take the class fallback.
FICTITIOUS = {"Polímero Demo C", "Cerâmica Demo D"}


def _own(spec: dict) -> dict[str, float]:
    """A spec's core values in the profile's reading units (as the writer reads them)."""
    canonical = {p["slug"]: p["canonical_unit"] for p in PROPERTIES}
    own: dict[str, float] = {}
    for value in spec["values"]:
        if value["slug"] not in _CORE_READ or value["kind"] == "missing":
            continue
        if value["kind"] == "scalar":
            number = value["value"]
        else:
            number = value.get("typical") or (value["min"] + value["max"]) / 2
        in_canonical = to_canonical(number, value["unit"], canonical[value["slug"]])[0]
        key, unit = _CORE_READ[value["slug"]]
        own[key] = to_canonical(in_canonical, canonical[value["slug"]], unit)[0]
    if "a" in own:
        own["a"] *= 1e6
    return own


def _run(spec: dict):
    profile = profile_for(spec["class_slug"], spec.get("subclass"), spec["name"])
    basis = build_basis(profile, _own(spec), trusted=spec["name"] in TRUSTED)
    return profile, basis, compute(spec["name"], profile, basis)


RESULTS = {spec["name"]: (spec, *_run(spec)) for spec in ALL_SPECS}


def _close(a: float, b: float, rel: float = 2e-3) -> bool:
    return math.isclose(a, b, rel_tol=rel)


# --- definitions ---------------------------------------------------------------------


class TestDefinitions:
    def test_thirty_three_new_numeric_and_twelve_ordinal_definitions(self) -> None:
        assert len(EXTENDED_SLUGS) == 33
        assert len(set(EXTENDED_SLUGS)) == 33
        assert not set(EXTENDED_SLUGS) & CORE_SLUGS
        assert len(PROPERTIES) == len(CORE_SLUGS) + 33 == 48
        assert len(ORDINAL_SLUGS) == 12

    def test_every_unit_is_pint_and_the_reading_unit_is_accepted(self) -> None:
        for spec in EXTENDED_PROPERTIES:
            assert spec["canonical_unit"] in spec["accepted_units"], spec["slug"]
            for unit in spec["accepted_units"]:
                to_canonical(1.0, unit, spec["canonical_unit"])
            if spec.get("display_unit"):
                assert spec["display_unit"] in spec["accepted_units"], spec["slug"]

    def test_a_temperature_difference_is_never_read_in_celsius(self) -> None:
        shock = next(p for p in EXTENDED_PROPERTIES if p["slug"] == "resistencia_choque_termico")
        assert shock["canonical_unit"] == "kelvin"
        assert shock.get("display_unit") is None

    def test_only_four_new_quantities_sit_at_level_one(self) -> None:
        level_one = {s for s in EXTENDED_SLUGS if s not in PROPERTY_MIN_LEVEL}
        assert level_one == {
            "tenacidade_fratura",
            "alongamento",
            "resistencia_fadiga",
            "temp_fusao",
        }
        assert all(
            PROPERTY_MIN_LEVEL[s] in (DepthLevel.L2, DepthLevel.L3)
            for s in EXTENDED_SLUGS
            if s in PROPERTY_MIN_LEVEL
        )

    def test_every_new_slug_has_a_glossary_entry(self) -> None:
        entries = load_entries()
        missing = (set(EXTENDED_SLUGS) | set(ORDINAL_SLUGS)) - set(entries)
        assert not missing, sorted(missing)


# --- classification and profiles ------------------------------------------------------


def test_every_profile_resolves_with_its_group_keys() -> None:
    for key in PROFILES:
        profile = resolve_profile(key)
        assert len(profile["DUR"]) == 9, key
        assert {"TRANS", "BIO", "ETA", "TMIN", "WAT", "REC", "PROC", "CO2P"} <= set(profile), key
        assert "RES" in profile or "RES_FOAM_OF" in profile, key


def test_every_demo_spec_is_recognised_by_a_rule() -> None:
    unknown = []
    for spec in ALL_SPECS:
        if spec["name"] in FICTITIOUS:
            continue
        sub = normalize(spec.get("subclass"))
        name = normalize(spec["name"])
        by_sub = any(c == spec["class_slug"] and p.search(sub) for c, p, _ in _SUBCLASS_RULES)
        by_name = any(c == spec["class_slug"] and p.search(name) for c, p, _ in _COMPILED)
        if not (by_sub or by_name):
            unknown.append(spec["name"])
    assert not unknown


@pytest.mark.parametrize(
    ("name", "profile"),
    [
        ("Concreto Estrutural Classe C30", "concrete"),
        ("BFRP UD Fibra de Basalto / Epóxi", "bfrp"),
        ("CMC SiC/SiC por Infiltração Química em Vapor (CVI)", "cmc_sic"),
        ("Liga Níquel-Cobre-Alumínio K-500 Envelhecida", "nickel"),
        ("Bronze Alumínio CuAl10Fe3 Fundido", "al_bronze"),
        ("Aço ARBL ASTM A572 Grau 50", "steel_low_alloy"),
    ],
)
def test_the_name_decides_where_the_subclass_names_several_families(name, profile) -> None:
    from app.db.seed_demo_extended_props import classify

    spec = next(s for s in ALL_SPECS if s["name"] == name)
    assert classify(spec["class_slug"], spec.get("subclass"), name) == profile


# --- coverage --------------------------------------------------------------------------


def test_every_spec_gets_every_slug_and_absence_only_where_it_does_not_apply() -> None:
    for name, (_, _, _, result) in RESULTS.items():
        assert set(result.values) == set(EXTENDED_SLUGS), name
        assert set(result.ranks) == set(ORDINAL_SLUGS), name
        for slug, value in result.values.items():
            if value is None:
                assert slug in NOT_APPLICABLE, (name, slug)
            else:
                assert math.isfinite(value), (name, slug)


def test_the_quantities_every_material_has_are_never_absent() -> None:
    always = {
        "tenacidade_fratura",
        "tenacidade_gc",
        "alongamento",
        "resistencia_fadiga",
        "modulo_cisalhamento",
        "coef_perda_mecanica",
        "temp_min_servico",
        "difusividade_termica",
        "resistividade_eletrica",
        "condutividade_eletrica",
        "absorcao_agua",
        "custo_volume",
        "pegada_hidrica",
        "fracao_reciclada",
        "energia_processamento",
        "co2_processamento",
    }
    for name, (*_, result) in RESULTS.items():
        for slug in always:
            assert result.values[slug] is not None, (name, slug)


def test_positive_where_the_quantity_is_a_magnitude() -> None:
    signed = {
        "temp_fusao",
        "temp_transicao_vitrea",
        "temp_min_servico",
        "temp_deflexao_termica",
        "absorcao_agua",
    }
    for name, (*_, result) in RESULTS.items():
        for slug, value in result.values.items():
            if value is not None and slug not in signed:
                assert value > 0, (name, slug, value)


def test_a_metal_glass_or_dense_ceramic_absorbs_a_real_zero_not_a_missing() -> None:
    for name in (
        "Aço Carbono SAE 1020 Normalizado",
        "Vidro Soda-Cal Float Recozido",
        "Alumina 99,5% Sinterizada",
    ):
        assert RESULTS[name][3].values["absorcao_agua"] == 0.0


# --- physics: checked on the 593 lots, whose core values are always the basis -----------


def _trusted():
    for name, (spec, profile, basis, result) in RESULTS.items():
        if name in TRUSTED:
            yield name, spec, profile, basis, result


class TestCoherence:
    def test_the_lots_use_their_own_core_values(self) -> None:
        for name, spec, _, basis, _ in _trusted():
            own = _own(spec)
            assert _close(basis.E, own["E"], 1e-9), name
            assert _close(basis.rho, own["rho"], 1e-9), name

    def test_isotropic_shear_and_bulk_moduli_follow_e_and_poisson(self) -> None:
        for name, _, profile, b, r in _trusted():
            v = r.values
            if profile.get("GMOD") == "iso":
                assert _close(v["modulo_cisalhamento"], b.E / (2 * (1 + b.nu))), name
            if profile.get("KMOD") == "iso" and b.nu < 0.49:
                assert _close(v["modulo_volumetrico"], b.E / (3 * (1 - 2 * b.nu))), name
            if v["modulo_cisalhamento"] is not None:
                assert v["modulo_cisalhamento"] <= b.E / 2 * 1.002, name

    def test_toughness_energy_is_k_squared_over_e(self) -> None:
        for name, _, _, b, r in _trusted():
            k = r.values["tenacidade_fratura"] * 1e6
            gc = r.values["tenacidade_gc"] * 1e3
            assert _close(gc, k * k / (b.E * 1e9), 5e-3), name

    def test_diffusivity_is_k_over_rho_cp(self) -> None:
        for name, _, _, b, r in _trusted():
            assert _close(r.values["difusividade_termica"], b.k / (b.rho * b.cp) * 1e6), name

    def test_conductivity_is_the_inverse_of_resistivity(self) -> None:
        for name, *_, r in _trusted():
            v = r.values
            assert _close(v["condutividade_eletrica"] * v["resistividade_eletrica"], 1.0), name

    def test_thermal_shock_follows_the_brittle_criterion(self) -> None:
        for name, _, profile, b, r in _trusted():
            shock = r.values["resistencia_choque_termico"]
            if shock is None:
                continue
            sigma = b.sy if profile["SHOCK"] == "sy" and b.sy is not None else b.su
            expected = sigma * 1e6 * (1 - b.nu) / (b.E * 1e9 * b.a * 1e-6)
            assert _close(shock, expected), name

    def test_temperatures_are_ordered(self) -> None:
        for name, _, _, b, r in _trusted():
            v = r.values
            if v["temp_fusao"] is not None and v["temp_transicao_vitrea"] is not None:
                assert v["temp_transicao_vitrea"] < v["temp_fusao"], name
            if v["temp_fusao"] is not None:
                assert b.tmax is None or b.tmax < v["temp_fusao"], name
                if v["temp_deflexao_termica"] is not None:
                    assert v["temp_deflexao_termica"] < v["temp_fusao"], name
            assert b.tmax is None or v["temp_min_servico"] < b.tmax, name
            assert v["temp_min_servico"] >= -273.15, name

    def test_strengths_are_ordered(self) -> None:
        for name, _, profile, b, r in _trusted():
            v = r.values
            assert v["resistencia_fadiga"] < b.su, name
            if profile["group"] == "metal" and profile.get("COMP_BASE") == "sy":
                assert v["resistencia_compressao"] <= 1.1 * (b.sy or b.su) * 1.001, name
            if profile["group"] in ("ceramic", "glass") and v["resistencia_compressao"]:
                assert v["resistencia_compressao"] > b.su, name

    def test_a_brittle_solid_elongates_by_its_elastic_strain(self) -> None:
        for name, _, profile, b, r in _trusted():
            if profile.get("A_BRITTLE"):
                elastic = b.su / (b.E * 1000) * 100
                assert elastic * 0.99 <= r.values["alongamento"] <= elastic * 1.41, name

    def test_cost_per_litre_and_processing_co2_are_derived(self) -> None:
        for name, _, _, b, r in _trusted():
            v = r.values
            assert _close(v["custo_volume"], b.cm * b.rho / 1000), name
            ratio = v["co2_processamento"] / v["energia_processamento"]
            assert 0.059 <= ratio <= 0.091, name

    def test_flammability_follows_the_oxygen_index(self) -> None:
        for name, _, profile, _, r in _trusted():
            loi = r.values["indice_oxigenio_limite"]
            rank = r.ranks["inflamabilidade"]
            if loi is None:
                assert rank == (profile.get("INFL") if profile.get("INFL") is not None else 4)
            else:
                expected = (
                    0 if loi < 19 else 1 if loi < 21 else 2 if loi < 26 else (3 if loi < 60 else 4)
                )
                assert rank == expected, name


# --- literature anchors for well-known grades --------------------------------------------


@pytest.mark.parametrize(
    ("name", "slug", "low", "high"),
    [
        ("Aço Inoxidável Austenítico AISI 304 Recozido", "alongamento", 40, 65),
        ("Aço Carbono SAE 1020 Normalizado", "temp_fusao", 1480, 1530),
        ("Aço Carbono SAE 1020 Normalizado", "resistividade_eletrica", 1.4e-7, 2.0e-7),
        ("Cobre Isento de Oxigênio (OF) Recozido", "resistividade_eletrica", 1.7e-8, 1.73e-8),
        ("Policarbonato Uso Geral Injeção", "temp_transicao_vitrea", 140, 150),
        ("Policarbonato Uso Geral Injeção", "indice_refracao", 1.58, 1.59),
        ("PMMA Grau Injeção", "indice_refracao", 1.48, 1.50),
        ("PTFE Virgem Moldado por Compressão", "indice_oxigenio_limite", 90, 96),
        ("Alumina 99,5% Sinterizada", "temp_fusao", 2000, 2080),
        ("Alumina 99,5% Sinterizada", "tenacidade_fratura", 3, 5),
        ("Vidro Soda-Cal Float Recozido", "indice_refracao", 1.50, 1.53),
        ("Sílica Fundida (Vidro de Quartzo)", "resistencia_choque_termico", 500, 5000),
        ("Concreto Estrutural Classe C30", "resistencia_compressao", 36, 40),
        ("Liga de Titânio Ti-6Al-4V ELI Recozida (Grau 23)", "temp_fusao", 1590, 1670),
        ("Borracha Natural Goma Pura 40 Shore A", "dureza_shore_a", 40, 40),
        ("Poliéter-bloco-amida 35 Shore D", "dureza_shore_d", 35, 35),
    ],
)
def test_known_grades_sit_where_the_open_literature_puts_them(name, slug, low, high) -> None:
    value = RESULTS[name][3].values[slug]
    assert value is not None and low <= value <= high, value


def test_quantities_that_do_not_apply_are_declared_absent() -> None:
    steel = RESULTS["Aço Carbono SAE 1020 Normalizado"][3].values
    assert steel["temp_transicao_vitrea"] is None
    assert steel["constante_dieletrica"] is None
    assert steel["indice_oxigenio_limite"] is None
    epoxy = RESULTS["Epóxi DGEBA Curada com Anidrido"][3].values
    assert epoxy["temp_fusao"] is None


# --- the database half --------------------------------------------------------------------

SLICE = [m["name"] for m in TCC_DEMO_MATERIALS[::40]]


def _source(db: Session) -> Source:
    return db.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL)).scalar_one()


def _counts(db: Session) -> tuple[int, int, int]:
    return (
        db.scalar(select(func.count(MaterialPropertyValue.id))),
        db.scalar(select(func.count(MaterialOrdinalValue.id))),
        db.scalar(select(func.count(OrdinalPropertyDefinition.id))),
    )


def _extended_rows(db: Session, material_id: int) -> list[MaterialPropertyValue]:
    return list(
        db.execute(
            select(MaterialPropertyValue)
            .join(PropertyDefinition)
            .where(
                MaterialPropertyValue.material_id == material_id,
                PropertyDefinition.slug.in_(EXTENDED_SLUGS),
            )
        ).scalars()
    )


@pytest.fixture()
def demo(db_session: Session) -> Source:
    source = _source(db_session)
    seed_extended_materials(db_session, source)
    seed_demo_catalog_expansion(
        db_session, source, specs=[m for m in TCC_DEMO_MATERIALS if m["name"] in SLICE]
    )
    seed_demo_releases(db_session)
    return source


def test_seed_twice_gives_the_same_counts_and_covers_every_demo(
    db_session: Session, demo: Source
) -> None:
    first = seed_demo_extended_properties(db_session, demo)
    materials = db_session.scalar(
        select(func.count(Material.id)).where(
            Material.is_demo.is_(True), Material.owner_id.is_(None)
        )
    )
    assert first["extended_values_created"] + first["extended_missing_declared"] == 33 * materials
    assert first["extended_ordinal_values_created"] == 12 * materials
    assert first["extended_ordinal_definitions_created"] == 12
    after_first = _counts(db_session)

    second = seed_demo_extended_properties(db_session, demo)
    assert set(second.values()) == {0}
    assert _counts(db_session) == after_first

    for material in db_session.execute(
        select(Material).where(Material.is_demo.is_(True))
    ).scalars():
        rows = _extended_rows(db_session, material.id)
        assert len(rows) == 33, material.name
        for row in rows:
            assert row.data_quality == DataQuality.ESTIMADO
            assert row.source.is_demo
            assert row.is_missing == (row.normalized_value is None)
            if not row.is_missing:
                assert row.notes == DEMO_NOTE


def test_a_stored_value_is_never_rewritten(db_session: Session, demo: Source) -> None:
    material = db_session.execute(
        select(Material).where(Material.name == DEMO_MATERIALS[0]["name"])
    ).scalar_one()
    prop = db_session.execute(
        select(PropertyDefinition).where(PropertyDefinition.slug == "temp_fusao")
    ).scalar_one()
    db_session.add(
        MaterialPropertyValue(
            material_id=material.id,
            property_id=prop.id,
            value_scalar=999.0,
            original_unit="kelvin",
            normalized_value=999.0,
            canonical_unit="kelvin",
            conversion_method="identity:kelvin",
            source_id=demo.id,
            data_quality=DataQuality.MEDIDO,
            is_missing=False,
        )
    )
    db_session.flush()
    seed_demo_extended_properties(db_session, demo, names=[material.name])
    rows = [r for r in _extended_rows(db_session, material.id) if r.property_id == prop.id]
    assert len(rows) == 1 and rows[0].normalized_value == 999.0
    assert rows[0].data_quality == DataQuality.MEDIDO


def test_a_real_material_with_a_demo_name_is_never_touched(
    db_session: Session, demo: Source
) -> None:
    metais = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()
    real = Material(name=DEMO_MATERIALS[0]["name"], class_id=metais.id, is_demo=False)
    db_session.add(real)
    db_session.flush()
    seed_demo_extended_properties(db_session, demo)
    assert _extended_rows(db_session, real.id) == []
    assert not db_session.scalar(
        select(func.count(MaterialOrdinalValue.id)).where(
            MaterialOrdinalValue.material_id == real.id
        )
    )


def test_ordinal_definitions_are_demo_and_clear_demo_removes_them(
    db_session: Session, demo: Source
) -> None:
    seed_demo_extended_properties(db_session, demo)
    definitions = list(
        db_session.execute(
            select(OrdinalPropertyDefinition).where(
                OrdinalPropertyDefinition.slug.in_(ORDINAL_SLUGS)
            )
        ).scalars()
    )
    assert len(definitions) == len(ORDINAL_SPECS)
    assert all(d.is_demo for d in definitions)
    clear_demo_data(db_session)
    assert not db_session.scalar(
        select(func.count(OrdinalPropertyDefinition.id)).where(
            OrdinalPropertyDefinition.slug.in_(ORDINAL_SLUGS)
        )
    )
    # The numeric definitions are reference data and stay (D-24, clear_demo).
    assert (
        db_session.scalar(
            select(func.count(PropertyDefinition.id)).where(
                PropertyDefinition.slug.in_(EXTENDED_SLUGS)
            )
        )
        == 33
    )
