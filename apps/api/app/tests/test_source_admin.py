"""Creating, deleting and merging sources from Administrar › Fontes (D-249).

All three are the curator's. Create needs a label and a licence (the importer's gate) and
stamps who registered it; delete only removes a source nothing cites and otherwise says what
cites it; merge moves every citation to another source and removes the first, audited on both.
Demonstration sources are never touched from here, and a source flagged as possibly third-party
content never merges into one that is not (the flag would vanish from the data it covers).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.dependencies import can_edit_shared_catalog
from app.main import app
from app.models.audit import AuditEvent
from app.models.enums import DesignationSystem
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_designation import MaterialDesignation
from app.models.material_property_value import MaterialPropertyValue
from app.models.source import Source
from app.repositories.source_repository import CITING


def _source(db_session, label="Fonte A", **kwargs) -> Source:
    kwargs.setdefault("license_label", "Uso autorizado de teste")
    source = Source(label=label, **kwargs)
    db_session.add(source)
    db_session.commit()
    return source


def _cite_with_values(db_session, source: Source, count: int = 2) -> list[int]:
    """Point ``count`` stored property values at ``source``; their ids."""
    rows = list(
        db_session.execute(
            select(MaterialPropertyValue).order_by(MaterialPropertyValue.id).limit(count)
        ).scalars()
    )
    for row in rows:
        row.source_id = source.id
    db_session.commit()
    return [row.id for row in rows]


def _cite_with_designation(db_session, source: Source, code="X-1") -> int:
    klass = db_session.execute(select(MaterialClass)).scalars().first()
    material = Material(name=f"Liga {code}", class_id=klass.id, keywords=[], is_demo=False)
    db_session.add(material)
    db_session.flush()
    row = MaterialDesignation(
        material_id=material.id,
        system=DesignationSystem.UNS,
        code=code,
        source_id=source.id,
        is_demo=False,
    )
    db_session.add(row)
    db_session.commit()
    return row.id


def _events(db_session) -> list[AuditEvent]:
    return list(
        db_session.execute(
            select(AuditEvent).where(AuditEvent.entity_type == "source").order_by(AuditEvent.id)
        ).scalars()
    )


BODY = {"label": "Norma NBR 1234", "license_label": "Uso autorizado pelo editor"}


# --- create --------------------------------------------------------------------


class TestCreate:
    def test_a_source_is_registered_and_stamped_from_the_session(self, client, db_session) -> None:
        resp = client.post(
            "/api/sources",
            json={
                **BODY,
                "license_url": "https://exemplo.org/licenca",
                "title": "Aços estruturais",
                "authors": "ABNT",
                "year": 2018,
                "contains_third_party_data": True,
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["label"] == BODY["label"] and body["citations"] == 0
        assert body["reviewed_by_email"] == "pesquisador@example.com" and body["reviewed_at"]
        assert body["contains_third_party_data"] is True and body["is_demo"] is False
        assert body["abnt"]  # assembled by the backend
        stored = db_session.get(Source, body["id"])
        assert stored.reviewed_by_user_id is not None

    def test_a_body_cannot_say_who_reviewed_or_make_it_demo(self, client, db_session) -> None:
        resp = client.post(
            "/api/sources", json={**BODY, "is_demo": True, "reviewed_by_user_id": 999}
        )
        assert resp.status_code == 201
        stored = db_session.get(Source, resp.json()["id"])
        assert stored.is_demo is False and stored.reviewed_by_user_id != 999

    @pytest.mark.parametrize(
        "body", [{"label": "Só rótulo"}, {"label": "L", "license_label": "  "}]
    )
    def test_the_licence_is_required(self, client, body) -> None:
        resp = client.post("/api/sources", json=body)
        assert resp.status_code in (400, 422)
        if resp.status_code == 400:
            assert "licença" in resp.json()["detail"]

    def test_a_blank_label_is_refused(self, client) -> None:
        resp = client.post("/api/sources", json={**BODY, "label": "   "})
        assert resp.status_code == 400 and "rótulo" in resp.json()["detail"]

    def test_a_repeated_label_is_a_409_that_names_it(self, client, db_session) -> None:
        _source(db_session, label="Já existe")
        resp = client.post("/api/sources", json={**BODY, "label": "Já existe"})
        assert resp.status_code == 409 and "Já existe" in resp.json()["detail"]

    def test_the_bibliography_rules_apply_as_in_an_edit(self, client) -> None:
        assert client.post("/api/sources", json={**BODY, "year": 3000}).status_code == 400
        assert client.post("/api/sources", json={**BODY, "url": "exemplo.org"}).status_code == 400

    def test_it_is_audited_and_listed(self, client, db_session) -> None:
        created = client.post("/api/sources", json=BODY).json()
        (event,) = _events(db_session)
        assert event.action.value == "CRIADO" and event.entity_id == created["id"]
        listed = {s["id"]: s for s in client.get("/api/sources").json()}
        assert listed[created["id"]]["citations"] == 0

    def test_only_a_curator_creates(self, client, db_session) -> None:
        app.dependency_overrides[can_edit_shared_catalog] = lambda: False
        try:
            assert client.post("/api/sources", json=BODY).status_code == 403
        finally:
            app.dependency_overrides.pop(can_edit_shared_catalog, None)
        assert (
            db_session.execute(select(Source).where(Source.label == BODY["label"])).first() is None
        )


# --- delete --------------------------------------------------------------------


class TestDelete:
    def test_a_source_nobody_cites_is_deleted_and_audited(self, client, db_session) -> None:
        source = _source(db_session)
        source_id = source.id
        resp = client.delete(f"/api/sources/{source_id}")
        assert resp.status_code == 204
        db_session.expire_all()
        assert db_session.get(Source, source_id) is None
        (event,) = _events(db_session)
        assert event.action.value == "EXCLUIDO" and event.entity_label == "Fonte A"

    def test_a_cited_source_is_refused_with_what_cites_it(self, client, db_session) -> None:
        source = _source(db_session)
        _cite_with_values(db_session, source, 2)
        _cite_with_designation(db_session, source)
        resp = client.delete(f"/api/sources/{source.id}")
        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert "2 valores de propriedade e 1 designação" in detail
        assert "Mescle-a em outra fonte" in detail
        db_session.expire_all()
        assert db_session.get(Source, source.id) is not None
        assert _events(db_session) == []

    def test_every_kind_of_citation_blocks_the_delete(self, db_session) -> None:
        # The nine tables are the whole list: a new table with a source_id must be added there.
        from sqlalchemy import inspect

        from app.db.base import Base

        cited = set()
        for mapper in Base.registry.mappers:
            table = mapper.local_table
            for fk in table.foreign_keys:
                if fk.column.table.name == "source":
                    cited.add(mapper.class_)
        assert cited == {model for model, _o, _m in CITING}
        assert inspect(db_session.get_bind()) is not None

    def test_a_demo_source_is_not_deleted_here(self, client, db_session) -> None:
        source = _source(db_session, label="Fonte fictícia", is_demo=True)
        resp = client.delete(f"/api/sources/{source.id}")
        assert resp.status_code == 409 and "excluir_demo" in resp.json()["detail"]
        db_session.expire_all()
        assert db_session.get(Source, source.id) is not None

    def test_an_unknown_source_is_a_404(self, client) -> None:
        assert client.delete("/api/sources/999999").status_code == 404

    def test_only_a_curator_deletes(self, client, db_session) -> None:
        source = _source(db_session)
        app.dependency_overrides[can_edit_shared_catalog] = lambda: False
        try:
            assert client.delete(f"/api/sources/{source.id}").status_code == 403
        finally:
            app.dependency_overrides.pop(can_edit_shared_catalog, None)
        assert db_session.get(Source, source.id) is not None


# --- merge ---------------------------------------------------------------------


class TestMerge:
    def _merge(self, client, source_id, target_id):
        return client.post(f"/api/sources/{source_id}/mesclar", json={"target_id": target_id})

    def test_every_citation_moves_and_the_source_goes(self, client, db_session) -> None:
        a, b = _source(db_session, "Origem"), _source(db_session, "Destino")
        a_id, b_id = a.id, b.id
        value_ids = _cite_with_values(db_session, a, 3)
        designation_id = _cite_with_designation(db_session, a)
        own = _cite_with_designation(db_session, b, code="X-2")
        resp = self._merge(client, a_id, b_id)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["moved"] == 4 and body["target"]["id"] == b_id
        assert body["target"]["citations"] == 5
        db_session.expire_all()
        assert db_session.get(Source, a_id) is None
        assert {db_session.get(MaterialPropertyValue, i).source_id for i in value_ids} == {b_id}
        assert db_session.get(MaterialDesignation, designation_id).source_id == b_id
        assert db_session.get(MaterialDesignation, own).source_id == b_id

    def test_both_sources_are_audited(self, client, db_session) -> None:
        a, b = _source(db_session, "Origem"), _source(db_session, "Destino")
        a_id, b_id = a.id, b.id
        _cite_with_values(db_session, a, 2)
        self._merge(client, a_id, b_id)
        into, gone = _events(db_session)
        assert (into.action.value, into.entity_id) == ("ATUALIZADO", b_id)
        assert into.changes["mesclada"] == {"before": "Origem", "after": "Destino"}
        assert into.changes["referencias_movidas"]["after"] == 2
        assert (gone.action.value, gone.entity_id) == ("EXCLUIDO", a_id)
        assert gone.changes["mesclada_em"]["after"] == "Destino"

    def test_a_source_nobody_cites_can_be_merged_too(self, client, db_session) -> None:
        a, b = _source(db_session, "Vazia"), _source(db_session, "Outra")
        resp = self._merge(client, a.id, b.id)
        assert resp.status_code == 200 and resp.json()["moved"] == 0

    def test_a_source_cannot_be_merged_into_itself(self, client, db_session) -> None:
        a = _source(db_session)
        resp = self._merge(client, a.id, a.id)
        assert resp.status_code == 400 and "nela mesma" in resp.json()["detail"]
        assert db_session.get(Source, a.id) is not None

    def test_an_unknown_source_or_target_is_a_404(self, client, db_session) -> None:
        a = _source(db_session)
        assert self._merge(client, a.id, 999999).status_code == 404
        assert self._merge(client, 999999, a.id).status_code == 404

    def test_demo_sources_are_not_merged_from_here(self, client, db_session) -> None:
        demo, real = _source(db_session, "Fictícia", is_demo=True), _source(db_session, "Real")
        for source_id, target_id in ((demo.id, real.id), (real.id, demo.id)):
            resp = self._merge(client, source_id, target_id)
            assert resp.status_code == 409 and "demonstração" in resp.json()["detail"]
        assert _events(db_session) == []

    def test_a_third_party_flag_is_never_dropped_by_a_merge(self, client, db_session) -> None:
        flagged = _source(db_session, "Sinalizada", contains_third_party_data=True)
        plain = _source(db_session, "Comum")
        flagged_id, plain_id = flagged.id, plain.id
        _cite_with_values(db_session, flagged, 1)
        resp = self._merge(client, flagged_id, plain_id)
        assert resp.status_code == 409 and "terceiros" in resp.json()["detail"]
        db_session.expire_all()
        assert db_session.get(Source, flagged_id) is not None
        # The other way round is fine: the flagged one keeps covering what it covered.
        assert self._merge(client, plain_id, flagged_id).status_code == 200

    def test_a_merge_is_all_or_nothing(self, client, db_session, monkeypatch) -> None:
        a, b = _source(db_session, "Origem"), _source(db_session, "Destino")
        ids = _cite_with_values(db_session, a, 2)

        def boom(*_args, **_kwargs):
            raise RuntimeError("falha no meio")

        from app.repositories import source_repository

        monkeypatch.setattr(source_repository.SourceRepository, "delete", boom)
        with pytest.raises(RuntimeError):
            self._merge(client, a.id, b.id)
        db_session.rollback()
        db_session.expire_all()
        assert db_session.get(Source, a.id) is not None
        assert {db_session.get(MaterialPropertyValue, i).source_id for i in ids} == {a.id}

    def test_only_a_curator_merges(self, client, db_session) -> None:
        a, b = _source(db_session, "Origem"), _source(db_session, "Destino")
        app.dependency_overrides[can_edit_shared_catalog] = lambda: False
        try:
            assert self._merge(client, a.id, b.id).status_code == 403
        finally:
            app.dependency_overrides.pop(can_edit_shared_catalog, None)
        assert db_session.get(Source, a.id) is not None


# --- the list ------------------------------------------------------------------


def test_the_list_counts_what_cites_each_source(client, db_session) -> None:
    a, b = _source(db_session, "Citada"), _source(db_session, "Livre")
    _cite_with_values(db_session, a, 2)
    _cite_with_designation(db_session, a)
    listed = {s["id"]: s for s in client.get("/api/sources").json()}
    assert listed[a.id]["citations"] == 3
    assert listed[b.id]["citations"] == 0
