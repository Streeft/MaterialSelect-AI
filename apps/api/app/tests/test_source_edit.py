"""Correcting a source's bibliographic fields: ``PATCH /api/sources/{id}`` (D-236).

The edit is the curator's, touches only what an ABNT reference is made of, refuses
what is not plausible (a year from the future, an address that is not one) with
the reason in Portuguese, and never fills in what nobody typed. The sheet's list of
sources now also names the sources of its curves and declared equivalences.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select

from app.dependencies import can_edit_shared_catalog
from app.domain.citation import SourceParts, edit_bibliography
from app.domain.errors import ValidationError
from app.main import app
from app.models.enums import DesignationSystem
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_designation import MaterialDesignation
from app.models.source import Source

TODAY = date(2026, 11, 13)


def _source(db_session, label="Fonte editável") -> Source:
    source = Source(label=label, license_label="Uso autorizado de teste")
    db_session.add(source)
    db_session.commit()
    return source


def _patch(client, source_id, **body):
    return client.patch(f"/api/sources/{source_id}", json=body)


# --- domain -------------------------------------------------------------------


class TestEditBibliography:
    def test_a_key_left_out_stays_and_a_blank_one_clears(self) -> None:
        current = SourceParts(label="L", authors="SILVA, A.", title="Livro", year=2019)
        out = edit_bibliography(
            current, {"authors": "  ", "title": "  Outro   livro "}, today=TODAY
        )
        assert out == {"authors": None, "title": "Outro livro"}
        assert "year" not in out and "url" not in out

    def test_the_year_must_be_plausible(self) -> None:
        current = SourceParts(label="L")
        for bad in (999, 0, -5, TODAY.year + 1):
            with pytest.raises(ValidationError, match="O ano deve estar entre"):
                edit_bibliography(current, {"year": bad}, today=TODAY)
        assert edit_bibliography(current, {"year": TODAY.year}, today=TODAY) == {"year": 2026}
        assert edit_bibliography(current, {"year": 1000}, today=TODAY) == {"year": 1000}
        assert edit_bibliography(current, {"year": None}, today=TODAY) == {"year": None}

    @pytest.mark.parametrize(
        "bad",
        [
            "exemplo.org",
            "ftp://exemplo.org/a",
            "https://",
            "javascript:alert(1)",
            "https://a b.org",
        ],
    )
    def test_the_address_must_be_an_http_address_and_is_never_completed(self, bad) -> None:
        with pytest.raises(ValidationError, match="http:// ou https://"):
            edit_bibliography(SourceParts(label="L"), {"url": bad}, today=TODAY)

    def test_a_good_address_is_kept_as_typed(self) -> None:
        out = edit_bibliography(
            SourceParts(label="L"), {"url": " https://exemplo.org/a?b=1 "}, today=TODAY
        )
        assert out == {"url": "https://exemplo.org/a?b=1"}

    def test_the_access_date_is_not_in_the_future_nor_before_the_year(self) -> None:
        with pytest.raises(ValidationError, match="futuro"):
            edit_bibliography(
                SourceParts(label="L"), {"accessed_on": date(2026, 11, 14)}, today=TODAY
            )
        with pytest.raises(ValidationError, match="anterior ao ano"):
            edit_bibliography(
                SourceParts(label="L", year=2020), {"accessed_on": date(2019, 5, 1)}, today=TODAY
            )
        # The rule looks at the result, so changing only the year trips it too.
        with pytest.raises(ValidationError, match="anterior ao ano"):
            edit_bibliography(
                SourceParts(label="L", accessed_on=date(2019, 5, 1)), {"year": 2020}, today=TODAY
            )

    def test_too_long_a_text_is_refused_not_cut(self) -> None:
        with pytest.raises(ValidationError, match="passa de 300 caracteres"):
            edit_bibliography(SourceParts(label="L"), {"title": "x" * 301}, today=TODAY)

    def test_nothing_is_inferred(self) -> None:
        out = edit_bibliography(SourceParts(label="L"), {"url": "https://exemplo.org"}, today=TODAY)
        assert out == {"url": "https://exemplo.org"}  # no access date came with the address


# --- API ----------------------------------------------------------------------


def test_the_fields_are_saved_and_the_citation_follows(client, db_session) -> None:
    source = _source(db_session)
    resp = _patch(
        client,
        source.id,
        authors="ASHBY, Michael F.",
        title="Materials selection in mechanical design",
        publisher="Butterworth-Heinemann",
        year=2011,
        url="https://exemplo.org/livro",
        accessed_on="2026-11-13",
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["year"] == 2011 and body["accessed_on"] == "2026-11-13"
    assert body["abnt"].startswith("ASHBY, Michael F. Materials selection in mechanical design.")
    assert body["abnt"].endswith("Acesso em: 13 nov. 2026.")
    # What the label, licence and reviewer say is untouched.
    assert body["label"] == "Fonte editável"
    assert body["license_label"] == "Uso autorizado de teste"
    row = next(r for r in client.get("/api/sources").json() if r["id"] == source.id)
    assert row["abnt"] == body["abnt"]


def test_only_the_fields_sent_change_and_null_clears(client, db_session) -> None:
    source = _source(db_session)
    _patch(client, source.id, authors="SILVA, A.", title="Livro", year=2019)

    resp = _patch(client, source.id, title=None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] is None
    assert body["authors"] == "SILVA, A." and body["year"] == 2019


def test_the_label_the_licence_and_the_reviewer_cannot_be_changed_here(client, db_session) -> None:
    source = _source(db_session)
    resp = _patch(client, source.id, label="Outro rótulo", license_label="Livre", title="T")
    assert resp.status_code == 200
    db_session.expire_all()
    stored = db_session.get(Source, source.id)
    assert stored.label == "Fonte editável"
    assert stored.license_label == "Uso autorizado de teste"
    assert stored.title == "T"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"year": 3000}, "O ano deve estar entre"),
        ({"year": 12}, "O ano deve estar entre"),
        ({"url": "exemplo.org"}, "http:// ou https://"),
        ({"accessed_on": "2999-01-01"}, "futuro"),
        ({"title": "x" * 400}, "passa de 300 caracteres"),
    ],
)
def test_an_implausible_value_is_refused_with_the_reason_and_nothing_is_saved(
    client, db_session, body, message
) -> None:
    source = _source(db_session)
    resp = _patch(client, source.id, publisher="Editora X", **body)
    assert resp.status_code == 400
    assert message in resp.json()["detail"]
    db_session.expire_all()
    # All or nothing: the valid publisher in the same request was not kept.
    assert db_session.get(Source, source.id).publisher is None


def test_a_year_that_is_not_a_number_is_a_422(client, db_session) -> None:
    source = _source(db_session)
    assert _patch(client, source.id, year="dois mil").status_code == 422


def test_an_unknown_source_is_a_404(client) -> None:
    assert _patch(client, 999_999, title="T").status_code == 404


def test_a_reader_without_curator_rights_cannot_edit(client, db_session) -> None:
    source = _source(db_session)
    app.dependency_overrides[can_edit_shared_catalog] = lambda: False
    try:
        resp = _patch(client, source.id, title="Não deve gravar")
    finally:
        app.dependency_overrides.pop(can_edit_shared_catalog, None)
    assert resp.status_code == 403
    db_session.expire_all()
    assert db_session.get(Source, source.id).title is None


def test_the_edit_is_in_the_audit_trail_and_a_no_op_writes_nothing(client, db_session) -> None:
    source = _source(db_session)
    _patch(client, source.id, year=2011, accessed_on="2026-01-05")

    events = client.get(
        "/api/audit", params={"entity_type": "source", "entity_id": source.id}
    ).json()
    assert len(events) == 1
    assert events[0]["action"] == "ATUALIZADO"
    assert events[0]["changes"] == {
        "year": {"before": None, "after": 2011},
        "accessed_on": {"before": None, "after": "2026-01-05"},
    }

    _patch(client, source.id, year=2011)
    again = client.get(
        "/api/audit", params={"entity_type": "source", "entity_id": source.id}
    ).json()
    assert len(again) == 1


# --- the sheet also cites the sources of curves and equivalences ---------------


def _own_material(db_session, name):
    klass = db_session.execute(select(MaterialClass)).scalars().first()
    material = Material(name=name, class_id=klass.id, keywords=[], is_demo=False)
    db_session.add(material)
    db_session.flush()
    return material


def test_the_sheet_lists_the_source_of_a_curve(client, db_session) -> None:
    material = db_session.execute(
        select(Material).where(Material.name == "Aço Demo B")
    ).scalar_one()
    sheet = client.get(f"/api/materials/{material.id}").json()
    assert "Fonte só da curva" not in {s["label"] for s in sheet["sources"]}

    resp = client.post(
        f"/api/materials/{material.id}/curvas",
        json={
            "kind": "TENSAO_DEFORMACAO",
            "title": "Ensaio",
            "x_quantity": "deformacao",
            "x_unit": "%",
            "y_quantity": "tensao",
            "y_unit": "MPa",
            "source_label": "Fonte só da curva",
            "series": [{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 300}]}],
        },
    )
    assert resp.status_code == 201, resp.text

    sheet = client.get(f"/api/materials/{material.id}").json()
    entry = next(s for s in sheet["sources"] if s["label"] == "Fonte só da curva")
    assert entry["abnt"]
    # Once each, even when the same source also backs a value.
    labels = [s["label"] for s in sheet["sources"]]
    assert len(labels) == len(set(labels))


def test_the_sheet_lists_the_source_of_a_declared_equivalence(client, db_session) -> None:
    source = Source(label="Norma da equivalência", license_label="Uso autorizado de teste")
    db_session.add(source)
    db_session.flush()
    ids = []
    for name, code in (("Liga E1", "Z-1"), ("Liga E2", "Z-2")):
        material = _own_material(db_session, name)
        designation = MaterialDesignation(
            material_id=material.id,
            system=DesignationSystem.UNS,
            code=code,
            source_id=source.id,
            is_demo=False,
        )
        db_session.add(designation)
        db_session.flush()
        ids.append((material.id, designation.id))
    db_session.commit()

    resp = client.post(
        "/api/equivalencias",
        json={
            "kind": "EQUIVALENTE",
            "source_id": source.id,
            "designation_ids": [d for _, d in ids],
        },
    )
    assert resp.status_code == 201, resp.text

    for material_id, _ in ids:
        sheet = client.get(f"/api/materials/{material_id}").json()
        # The designations' own source is the same one: it is listed once.
        assert [s["label"] for s in sheet["sources"]].count("Norma da equivalência") == 1


def test_a_group_source_other_than_the_designations_is_listed_too(client, db_session) -> None:
    designation_source = Source(label="Fonte das designações", license_label="Uso de teste")
    group_source = Source(label="Fonte do grupo", license_label="Uso de teste")
    db_session.add_all([designation_source, group_source])
    db_session.flush()
    rows = []
    for name, code in (("Liga G1", "G-1"), ("Liga G2", "G-2")):
        material = _own_material(db_session, name)
        designation = MaterialDesignation(
            material_id=material.id,
            system=DesignationSystem.UNS,
            code=code,
            source_id=designation_source.id,
            is_demo=False,
        )
        db_session.add(designation)
        db_session.flush()
        rows.append((material.id, designation.id))
    db_session.commit()
    resp = client.post(
        "/api/equivalencias",
        json={
            "kind": "EQUIVALENTE",
            "source_id": group_source.id,
            "designation_ids": [d for _, d in rows],
        },
    )
    assert resp.status_code == 201, resp.text

    sheet = client.get(f"/api/materials/{rows[0][0]}").json()
    labels = {s["label"] for s in sheet["sources"]}
    assert {"Fonte das designações", "Fonte do grupo"} <= labels


def test_today_is_read_in_utc(client, db_session) -> None:
    """The year ceiling is the current UTC year, so the test cannot rot on New Year's Eve."""
    source = _source(db_session)
    year = datetime.now(UTC).year
    assert _patch(client, source.id, year=year).status_code == 200
    assert _patch(client, source.id, year=year + 1).status_code == 400
