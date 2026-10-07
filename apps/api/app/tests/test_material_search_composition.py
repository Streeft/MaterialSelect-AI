"""The catalogue search over composition and designation, end to end (D-105, TM2).

Runs against the seeded baseline: "Aço Demo B" (Cr 17,5–19,5; Ni 8–10,5; C ≤
0,07; Mo declared absent; Fe balance) and "Liga Alumínio Demo A" (Cr 0,04–0,35;
Al balance) carry a fictitious composition; the polymer, the ceramic and the
composite carry none — the state the search must count, never read as 0 %.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.composition import RULE_TEXT, build_composition_entry
from app.models.enums import DesignationSystem
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_designation import MaterialDesignation
from app.models.source import Source
from app.models.user import User

STEEL = "Aço Demo B"
ALUMINIUM = "Liga Alumínio Demo A"
POLYMER = "Polímero Demo C"


def _search(client, query: str) -> dict:
    response = client.get("/api/materials/busca", params={"q": query})
    assert response.status_code == 200, response.text
    return response.json()


def _names(body: dict) -> list[str]:
    return [item["name"] for item in body["items"]]


class TestComposition:
    def test_a_threshold_finds_the_range_that_reaches_it(self, client) -> None:
        body = _search(client, "comp:Cr>=12")
        assert _names(body) == [STEEL]

    def test_the_answer_states_the_rule_and_who_was_left_out(self, client) -> None:
        body = _search(client, "comp:Cr>=12")
        report = body["composition"]
        assert report["rule"] == RULE_TEXT
        assert "alcance" in report["rule"]
        # Polymer, ceramic and composite: no composition, so undetermined —
        # excluded, and counted, not failed.
        assert report["without_composition"] == 3
        assert report["undetermined"] == 3
        (condition,) = report["conditions"]
        assert condition["label"] == "Cr ≥ 12 %"
        assert condition["element_name"] == "Cromo"
        assert (condition["satisfied"], condition["not_satisfied"]) == (1, 1)
        assert condition["undetermined"] == 3
        assert condition["undetermined_by_reason"]["sem_composicao"] == 3

    def test_absence_does_not_pass_under_not(self, client) -> None:
        # NOT comp:Cr>=12 is "no conforming heat reaches 12 %": the aluminium
        # alloy, and nobody whose chromium is unknown.
        body = _search(client, "NOT comp:Cr>=12")
        assert _names(body) == [ALUMINIUM]
        assert body["composition"]["undetermined"] == 3

    def test_negating_the_complement_is_the_guarantee(self, client) -> None:
        assert _names(_search(client, "NOT comp:Cr<12")) == [STEEL]

    def test_a_range_condition_overlaps(self, client) -> None:
        assert _names(_search(client, "comp:Ni:8-10")) == [STEEL]
        assert _names(_search(client, "comp:Ni:11-20")) == []

    def test_a_maximum_only_starts_at_zero(self, client) -> None:
        # C ≤ 0,07 admits 0,03.
        assert _names(_search(client, "comp:C<=0,03")) == [STEEL]

    def test_balance_contains_but_cannot_be_compared(self, client) -> None:
        # The steel's iron is "the rest"; the aluminium alloy lists Fe ≤ 0,7,
        # which reaches above zero — both contain iron.
        assert sorted(_names(_search(client, "comp:Fe"))) == sorted([STEEL, ALUMINIUM])
        body = _search(client, "comp:Fe>=50")
        assert _names(body) == []
        reasons = body["composition"]["conditions"][0]["undetermined_by_reason"]
        assert reasons["resto_sem_numero"] == 1
        # Iron is listed (≤ 0,7) in the aluminium alloy, so it is decided there.
        assert reasons["elemento_nao_declarado"] == 0

    def test_a_declared_absent_content_is_not_zero(self, client) -> None:
        body = _search(client, "comp:Mo<=1")
        assert _names(body) == []
        reasons = body["composition"]["conditions"][0]["undetermined_by_reason"]
        assert reasons["declarado_ausente"] == 1
        assert reasons["elemento_nao_declarado"] == 1  # the aluminium alloy lists no Mo

    def test_text_and_composition_combine(self, client) -> None:
        assert sorted(_names(_search(client, "comp:Cr>=12 OR polímero"))) == [STEEL, POLYMER]
        assert sorted(_names(_search(client, "demo AND comp:Si"))) == [STEEL, ALUMINIUM]
        assert _names(_search(client, "(comp:Cr>=12 OR comp:Mg>=1) NOT aço")) == [ALUMINIUM]

    def test_an_or_with_text_decides_a_material_without_composition(self, client) -> None:
        # Kleene: unknown OR true is true, so the polymer passes by its name and
        # is not counted as left out.
        body = _search(client, "comp:Cr>=12 OR polímero")
        assert body["composition"]["undetermined"] == 2

    def test_the_list_endpoint_speaks_the_same_language(self, client) -> None:
        response = client.get("/api/materials", params={"search": "comp:Cr>=12"})
        assert response.status_code == 200
        assert [m["name"] for m in response.json()] == [STEEL]

    def test_a_search_without_composition_reports_nothing_about_it(self, client) -> None:
        assert _search(client, "aço")["composition"] is None
        assert _search(client, "")["total"] == 5


class TestDesignation:
    def test_a_system(self, client) -> None:
        assert sorted(_names(_search(client, "norma:UNS"))) == sorted([STEEL, ALUMINIUM])
        assert _names(_search(client, "norma:SAE")) == [STEEL]
        assert _names(_search(client, "norma:JIS")) == []

    def test_a_code_matches_exactly_ignoring_case(self, client) -> None:
        assert _names(_search(client, "designacao:demo-304")) == [STEEL]
        # Exact: "DEMO-30" is not a code anybody carries.
        assert _names(_search(client, "designacao:DEMO-30")) == []

    def test_a_wildcard_asks_for_the_family(self, client) -> None:
        names = _names(_search(client, "designacao:DEMO-*"))
        assert sorted(names) == sorted([STEEL, ALUMINIUM])
        assert _names(_search(client, 'designacao:"Demolene C"')) == [POLYMER]

    def test_a_bare_word_also_finds_a_code(self, client) -> None:
        assert _names(_search(client, "demoinox")) == [STEEL]

    def test_an_exact_code_ranks_first(self, client) -> None:
        # "demo" is in every name; "DEMO-304" only in the steel's code. The
        # steel must lead a search that names both.
        body = _search(client, "demo OR demo-304")
        assert _names(body)[0] == STEEL

    def test_list_items_carry_their_designations(self, client) -> None:
        body = _search(client, "designacao:DEMO-304")
        codes = {(d["system_label"], d["code"]) for d in body["items"][0]["designations"]}
        assert ("AISI/SAE", "DEMO-304") in codes
        assert ("Nome comercial", "Demoinox B") in codes

    def test_not_a_code_keeps_materials_without_designations(self, client) -> None:
        # A designation is a recorded label, searched like a name: "not named
        # DEMO-304" is decided for every material.
        assert STEEL not in _names(_search(client, "NOT designacao:DEMO-304"))
        assert len(_names(_search(client, "NOT designacao:DEMO-304"))) == 4


class TestErrors:
    @pytest.mark.parametrize(
        ("query", "message"),
        [
            ("comp:Xx>=1", "não é símbolo de elemento químico"),
            ("norma:XYZ", "Norma desconhecida"),
            ("compo:Cr>=1", "Campo de busca desconhecido"),
            ("comp:Cr >= 12", "sem espaços"),
        ],
    )
    def test_a_bad_query_is_400_in_portuguese(self, client, query: str, message: str) -> None:
        response = client.get("/api/materials/busca", params={"q": query})
        assert response.status_code == 400
        assert message in response.text


class TestTheSheet:
    def test_the_sheet_carries_composition_and_designations(
        self, client, db_session: Session
    ) -> None:
        steel = db_session.execute(select(Material).where(Material.name == STEEL)).scalar_one()
        body = client.get(f"/api/materials/{steel.id}").json()

        by_element = {e["element"]: e for e in body["composition"]}
        assert [e["element"] for e in body["composition"]][:2] == ["C", "Mn"]  # source order
        assert by_element["Cr"]["state"] == "faixa"
        assert (by_element["Cr"]["normalized_min"], by_element["Cr"]["normalized_max"]) == (
            17.5,
            19.5,
        )
        assert by_element["C"]["normalized_min"] is None  # "≤ 0,07" has no minimum
        assert by_element["Fe"]["state"] == "resto"
        assert by_element["Fe"]["normalized_nominal"] is None
        assert by_element["Mo"]["state"] == "ausente"
        assert by_element["Cr"]["source_label"] == "Dataset Demo MaterialSelect"
        assert by_element["Cr"]["is_demo"] is True
        assert by_element["Cr"]["element_name"] == "Cromo"

        systems = {d["system"] for d in body["designations"]}
        assert systems == {"UNS", "AISI_SAE", "EN", "COMERCIAL"}
        en = next(d for d in body["designations"] if d["system"] == "EN")
        assert en["region"] == "Europa" and en["citation"]

    def test_ppm_keeps_its_trail_on_the_sheet(self, client, db_session: Session) -> None:
        alloy = db_session.execute(select(Material).where(Material.name == ALUMINIUM)).scalar_one()
        body = client.get(f"/api/materials/{alloy.id}").json()
        titanium = next(e for e in body["composition"] if e["element"] == "Ti")
        assert (titanium["value_max"], titanium["original_unit"]) == (1500, "ppm")
        assert titanium["normalized_max"] == pytest.approx(0.15)
        assert titanium["conversion_method"] == "pint:ppm->percent"

    def test_no_composition_is_an_empty_list_not_zeros(self, client, db_session: Session) -> None:
        polymer = db_session.execute(select(Material).where(Material.name == POLYMER)).scalar_one()
        body = client.get(f"/api/materials/{polymer.id}").json()
        assert body["composition"] == []
        assert [d["code"] for d in body["designations"]] == ["Demolene C"]


@pytest.fixture()
def private_alloy(db_session: Session, other_user: User) -> Material:
    """Another person's own record with 25 % Cr and a distinctive code."""
    klass = db_session.execute(
        select(MaterialClass).where(MaterialClass.slug == "metais")
    ).scalar_one()
    source = db_session.execute(select(Source)).scalars().first()
    material = Material(
        name="Liga particular de Bruno",
        class_id=klass.id,
        keywords=[],
        owner_id=other_user.id,
        is_demo=False,
    )
    db_session.add(material)
    db_session.flush()
    entry = build_composition_entry("Cr", value_min=24.0, value_max=26.0, unit="%")
    db_session.add(
        MaterialCompositionEntry(
            material_id=material.id,
            element=entry.element,
            value_min=entry.value_min,
            value_max=entry.value_max,
            original_unit=entry.original_unit,
            normalized_min=entry.normalized_min,
            normalized_max=entry.normalized_max,
            canonical_unit=entry.canonical_unit,
            conversion_method=entry.conversion_method,
            source_id=source.id,
        )
    )
    db_session.add(
        MaterialDesignation(
            material_id=material.id,
            system=DesignationSystem.COMERCIAL,
            code="BRUNO-25CR",
            source_id=source.id,
        )
    )
    db_session.flush()
    return material


class TestVisibility:
    def test_another_persons_record_never_appears_nor_counts(
        self, client, private_alloy: Material
    ) -> None:
        # D-62: not in the rows, and not in any count either — a count that
        # moved with somebody else's record would reveal that it exists.
        stranger = _search(client, "comp:Cr>=20 OR designacao:BRUNO-25CR")
        assert private_alloy.name not in str(stranger)
        assert _names(stranger) == []
        report = stranger["composition"]
        assert report["conditions"][0]["satisfied"] == 0
        assert report["without_composition"] == 3
        assert report["conditions"][0]["not_satisfied"] == 2

    def test_the_owner_finds_it_and_it_counts(
        self, client, login_as, other_user: User, private_alloy: Material
    ) -> None:
        with login_as(other_user):
            owner = _search(client, "comp:Cr>=20")
            by_code = _search(client, "designacao:bruno-25cr")
        assert _names(owner) == [private_alloy.name]
        assert owner["composition"]["conditions"][0]["satisfied"] == 1
        assert _names(by_code) == [private_alloy.name]
