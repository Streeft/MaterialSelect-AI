"""G, K and Tm on the CAE card (D-255, catálogo ampliado item 4).

The extended catalogue (D-188) holds the shear and bulk moduli and the melting
temperature. The card now carries them: a catalogued value as it is; G and K
derived from E and ν by the isotropic relations **only** when the material has
no row for them (never over a declared absence), marked as derived, with the
worse quality of the two inputs; Tm only when catalogued, as an absolute
temperature. No deck writes them in a solver field — an isotropic card is E and ν.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

import pytest

from app.calculations.elastic_constants import bulk_modulus, shear_modulus
from app.exporters.cae import CAE_FORMATS
from app.exporters.cae.card import CatalogueValue, MaterialInput, build_card
from app.exporters.cae.quantities import BULK, MELTING, SHEAR, UNIT_SYSTEMS


def _value(slug: str, value: float | None, unit: str | None, **extra) -> CatalogueValue:
    base = {
        "data_quality": "IMPORTADO",
        "source_label": "Fonte de teste CAE",
        "source_is_demo": True,
        "license_label": None,
    }
    return CatalogueValue(
        slug=slug,
        is_missing=value is None,
        normalized_value=value,
        canonical_unit=unit,
        **{**base, **extra},
    )


BASE = {
    "modulo_young": _value("modulo_young", 2.0e11, "Pa"),
    "coef_poisson": _value("coef_poisson", 0.25, "dimensionless"),
}


def _card(values: dict[str, CatalogueValue], system: str = "m-kg-s"):
    material = MaterialInput(
        id=902,
        name="Liga Exemplo CAE-2",
        class_name="Metais",
        is_demo=True,
        is_own_record=False,
        is_active=True,
        values=values,
    )
    return build_card(material, UNIT_SYSTEMS[system])


class TestElasticConstants:
    def test_the_isotropic_relations(self) -> None:
        assert shear_modulus(2.0e11, 0.25) == pytest.approx(8.0e10)
        assert bulk_modulus(2.0e11, 0.25) == pytest.approx(2.0e11 / 1.5)

    @pytest.mark.parametrize("nu", [0.5, 0.6, -1.0, float("nan")])
    def test_out_of_range_poisson_gives_nothing_never_infinity(self, nu: float) -> None:
        assert bulk_modulus(2.0e11, nu) is None

    def test_no_modulus_without_a_positive_young(self) -> None:
        assert shear_modulus(0.0, 0.3) is None and bulk_modulus(-1.0, 0.3) is None


class TestCard:
    def test_a_catalogued_g_is_used_as_is(self) -> None:
        card = _card({**BASE, "modulo_cisalhamento": _value("modulo_cisalhamento", 7.0e10, "Pa")})
        shear = card.get(SHEAR)
        assert shear.value == pytest.approx(7.0e10)  # not the 8e10 the relation gives
        assert shear.derivation is None and shear.source_label == "Fonte de teste CAE"

    def test_g_and_k_are_derived_and_marked_when_there_is_no_row(self) -> None:
        values = {
            **BASE,
            "coef_poisson": _value("coef_poisson", 0.25, "dimensionless", data_quality="ESTIMADO"),
        }
        card = _card(values, "mm-t-s")
        shear, bulk = card.get(SHEAR), card.get(BULK)
        assert shear.value == pytest.approx(8.0e4)  # MPa
        assert bulk.value == pytest.approx(2.0e5 / 1.5)
        assert "G = E/2(1+nu)" in (shear.derivation or "")
        assert shear.source_label is None
        # The worse of the two inputs (E IMPORTADO, nu ESTIMADO).
        assert shear.data_quality == bulk.data_quality == "ESTIMADO"

    def test_a_declared_absence_is_never_overwritten_by_the_relation(self) -> None:
        values = {**BASE, "modulo_volumetrico": _value("modulo_volumetrico", None, None)}
        bulk = _card(values).get(BULK)
        assert bulk.value is None and "declarado ausente" in (bulk.omitted_reason or "")

    def test_nothing_is_derived_without_poisson(self) -> None:
        card = _card({"modulo_young": BASE["modulo_young"]})
        assert not card.get(SHEAR).present and not card.get(BULK).present
        assert card.get(SHEAR).omitted_reason == "não cadastrado"

    def test_an_incompressible_poisson_derives_g_but_not_k(self) -> None:
        card = _card({**BASE, "coef_poisson": _value("coef_poisson", 0.5, "dimensionless")})
        assert not card.get(BULK).present  # K would be infinite: never written
        assert card.get(SHEAR).value == pytest.approx(2.0e11 / 3)

    def test_melting_is_an_absolute_temperature(self) -> None:
        values = {**BASE, "temp_fusao": _value("temp_fusao", 1000.0, "kelvin")}
        assert _card(values).get(MELTING).value == pytest.approx(1000.0)
        assert _card(values, "in-lbf-s").get(MELTING).value == pytest.approx(1340.33, abs=0.01)

    def test_melting_is_never_derived(self) -> None:
        assert not _card(BASE).get(MELTING).present


class TestFormats:
    def test_matml_carries_the_three_with_their_trail(self) -> None:
        values = {**BASE, "temp_fusao": _value("temp_fusao", 1700.0, "kelvin")}
        text = CAE_FORMATS["matml"].render(_card(values))
        doc = ET.fromstring(text.split("\n", 2)[2])
        properties = {p.get("property") for p in doc.iter("PropertyData")}
        assert {"pr-shear", "pr-bulk", "pr-melting"} <= properties
        names = {d.findtext("Name") for d in doc.iter("PropertyDetails")}
        assert {"Shear Modulus", "Bulk Modulus", "Melting Point"} <= names
        assert "Derivado, não cadastrado" in text

    @pytest.mark.parametrize("fmt", ["mapdl", "abaqus", "nastran", "lsdyna"])
    def test_no_deck_writes_them_in_a_field(self, fmt: str) -> None:
        values = {**BASE, "temp_fusao": _value("temp_fusao", 1700.0, "kelvin")}
        text = CAE_FORMATS[fmt].render(_card(values))
        commands = [
            line for line in text.splitlines() if line and not line.startswith(("!", "**", "$"))
        ]
        assert not any("1700" in line for line in commands)
        assert "informativo" in text and "temperatura de fusao = 1700." in text
