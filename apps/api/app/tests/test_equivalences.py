"""Declared equivalence between designations (D-115, TM1).

The rules under test: a group is a source's statement (kind + required source);
only a curator writes it; it is never inferred from a code or a name; demo and
real do not mix; ``clear_demo`` removes the fictitious ones and refuses to rewrite
a real one.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_data
from app.db.seed import DEMO_SOURCE_LABEL
from app.db.seed_demo_equivalences import DEMO_GROUPS, seed_demo_equivalences
from app.db.seed_extended import seed_extended_materials
from app.db.seed_extended_identity import seed_extended_identity
from app.dependencies import can_edit_shared_catalog
from app.domain.equivalence import (
    EquivalenceError,
    MemberCandidate,
    resolve_kind,
    validate_group,
)
from app.main import app
from app.models.enums import DesignationSystem, EquivalenceKind
from app.models.equivalence import EquivalenceGroup, EquivalenceMember
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_designation import MaterialDesignation
from app.models.source import Source


# --- domain ----------------------------------------------------------------
def _cand(i: int, demo: bool = False) -> MemberCandidate:
    return MemberCandidate(designation_id=i, is_demo=demo, material_is_demo=demo)


class TestDomain:
    def test_needs_two_distinct_designations(self) -> None:
        with pytest.raises(EquivalenceError, match="pelo menos duas"):
            validate_group([_cand(1)], source_is_demo=False)
        with pytest.raises(EquivalenceError, match="mais de uma vez"):
            validate_group([_cand(1), _cand(1)], source_is_demo=False)

    def test_demo_and_real_do_not_mix(self) -> None:
        with pytest.raises(EquivalenceError, match="não se misturam"):
            validate_group([_cand(1, True), _cand(2, False)], source_is_demo=True)
        with pytest.raises(EquivalenceError, match="não se misturam"):
            validate_group([_cand(1), _cand(2)], source_is_demo=True)

    def test_fictitious_follows_the_parts(self) -> None:
        assert validate_group([_cand(1, True), _cand(2, True)], source_is_demo=True) is True
        assert validate_group([_cand(1), _cand(2)], source_is_demo=False) is False

    def test_kind_is_a_closed_vocabulary(self) -> None:
        assert resolve_kind(" aproximada ") is EquivalenceKind.APROXIMADA
        with pytest.raises(EquivalenceError, match="equivalente, aproximada e similar"):
            resolve_kind("quase igual")


# --- fixtures --------------------------------------------------------------
@pytest.fixture()
def real_source(db_session: Session) -> Source:
    source = Source(label="Norma real de teste", license_label="Uso autorizado de teste")
    db_session.add(source)
    db_session.flush()
    return source


@pytest.fixture()
def real_designations(db_session: Session, real_source: Source) -> dict[str, MaterialDesignation]:
    klass = db_session.execute(select(MaterialClass)).scalars().first()
    out: dict[str, MaterialDesignation] = {}
    for name, code in (("A", "X-1"), ("B", "Y-1"), ("C", "X-1")):  # A and C share a code
        material = Material(name=f"Liga real {name}", class_id=klass.id, keywords=[], is_demo=False)
        db_session.add(material)
        db_session.flush()
        d = MaterialDesignation(
            material_id=material.id,
            system=DesignationSystem.UNS,
            code=code,
            source_id=real_source.id,
            is_demo=False,
        )
        db_session.add(d)
        db_session.flush()
        out[name] = d
    return out


def _payload(source_id: int, *designations: MaterialDesignation, kind: str = "EQUIVALENTE"):
    return {
        "kind": kind,
        "source_id": source_id,
        "designation_ids": [d.id for d in designations],
        "citation": "Tabela 1",
    }


@pytest.fixture()
def read_only_catalog():
    app.dependency_overrides[can_edit_shared_catalog] = lambda: False
    yield
    app.dependency_overrides.pop(can_edit_shared_catalog, None)


# --- API -------------------------------------------------------------------
class TestApi:
    def test_create_and_read_on_the_sheet(
        self, client: TestClient, real_source: Source, real_designations
    ) -> None:
        a, b = real_designations["A"], real_designations["B"]
        res = client.post("/api/equivalencias", json=_payload(real_source.id, a, b))
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["kind"] == "EQUIVALENTE"
        assert body["kind_label"] == "Equivalente"
        assert body["source_label"] == "Norma real de teste"
        assert body["license_label"] == "Uso autorizado de teste"
        assert body["citation"] == "Tabela 1"
        assert body["is_demo"] is False

        sheet = client.get(f"/api/materials/{a.material_id}/equivalencias").json()
        assert len(sheet["groups"]) == 1
        members = {m["code"]: m for m in sheet["groups"][0]["members"]}
        assert members["X-1"]["is_self"] is True
        assert members["Y-1"]["is_self"] is False
        assert members["Y-1"]["material_id"] == b.material_id

    def test_a_material_with_none_answers_empty_not_404(
        self, client: TestClient, real_designations
    ) -> None:
        res = client.get(f"/api/materials/{real_designations['A'].material_id}/equivalencias")
        assert res.status_code == 200
        assert res.json()["groups"] == []

    def test_unknown_material_is_404(self, client: TestClient) -> None:
        assert client.get("/api/materials/999999/equivalencias").status_code == 404

    def test_source_is_required(self, client: TestClient, real_designations) -> None:
        payload = _payload(0, real_designations["A"], real_designations["B"])
        del payload["source_id"]
        assert client.post("/api/equivalencias", json=payload).status_code == 422

    def test_kind_is_required_and_closed(
        self, client: TestClient, real_source, real_designations
    ) -> None:
        a, b = real_designations["A"], real_designations["B"]
        bad = _payload(real_source.id, a, b, kind="PARECIDA")
        assert client.post("/api/equivalencias", json=bad).status_code == 422
        no_kind = _payload(real_source.id, a, b)
        del no_kind["kind"]
        assert client.post("/api/equivalencias", json=no_kind).status_code == 422

    def test_one_designation_is_refused(
        self, client: TestClient, real_source, real_designations
    ) -> None:
        res = client.post(
            "/api/equivalencias", json=_payload(real_source.id, real_designations["A"])
        )
        assert res.status_code == 422

    def test_real_group_needs_a_licensed_source(
        self, client: TestClient, db_session: Session, real_designations
    ) -> None:
        unlicensed = Source(label="Fonte sem licença")
        db_session.add(unlicensed)
        db_session.flush()
        a, b = real_designations["A"], real_designations["B"]
        res = client.post("/api/equivalencias", json=_payload(unlicensed.id, a, b))
        assert res.status_code == 400
        assert "licença" in res.json()["detail"]

    def test_unknown_source_and_designation(
        self, client: TestClient, real_source, real_designations
    ) -> None:
        a, b = real_designations["A"], real_designations["B"]
        assert client.post("/api/equivalencias", json=_payload(999999, a, b)).status_code == 404
        bad = {**_payload(real_source.id, a, b), "designation_ids": [a.id, 999999]}
        assert client.post("/api/equivalencias", json=bad).status_code == 404

    def test_demo_and_real_mix_is_refused(
        self, client: TestClient, db_session: Session, real_designations
    ) -> None:
        demo_source = db_session.execute(
            select(Source).where(Source.label == DEMO_SOURCE_LABEL)
        ).scalar_one()
        a, b = real_designations["A"], real_designations["B"]
        res = client.post("/api/equivalencias", json=_payload(demo_source.id, a, b))
        assert res.status_code == 400
        assert "não se misturam" in res.json()["detail"]

    def test_only_a_curator_writes(
        self, client: TestClient, read_only_catalog, real_source, real_designations
    ) -> None:
        a, b = real_designations["A"], real_designations["B"]
        assert (
            client.post("/api/equivalencias", json=_payload(real_source.id, a, b)).status_code
            == 403
        )
        assert (
            client.put("/api/equivalencias/1", json=_payload(real_source.id, a, b)).status_code
            == 403
        )
        assert client.delete("/api/equivalencias/1").status_code == 403
        # Reading stays open to any logged-in user.
        assert client.get(f"/api/materials/{a.material_id}/equivalencias").status_code == 200

    def test_update_and_delete(self, client: TestClient, real_source, real_designations) -> None:
        a, b, c = (real_designations[k] for k in "ABC")
        gid = client.post("/api/equivalencias", json=_payload(real_source.id, a, b)).json()["id"]
        res = client.put(
            f"/api/equivalencias/{gid}", json=_payload(real_source.id, a, c, kind="SIMILAR")
        )
        assert res.status_code == 200
        assert res.json()["kind"] == "SIMILAR"
        assert {m["designation_id"] for m in res.json()["members"]} == {a.id, c.id}
        assert client.delete(f"/api/equivalencias/{gid}").status_code == 204
        assert client.get(f"/api/equivalencias/{gid}").status_code == 404

    def test_a_private_record_cannot_be_linked(
        self, client: TestClient, db_session: Session, real_source, real_designations, test_user
    ) -> None:
        a = real_designations["A"]
        mine = db_session.get(Material, real_designations["B"].material_id)
        mine.owner_id = test_user.id
        db_session.flush()
        res = client.post(
            "/api/equivalencias", json=_payload(real_source.id, a, real_designations["B"])
        )
        assert res.status_code == 400


# --- never inferred --------------------------------------------------------
class TestNeverInferred:
    def test_same_code_on_two_materials_is_not_an_equivalence(
        self, client: TestClient, db_session: Session, real_source, real_designations
    ) -> None:
        """A and C carry the identical UNS code X-1; nothing was declared."""
        a, b, c = (real_designations[k] for k in "ABC")
        assert a.code_key == c.code_key and a.material_id != c.material_id
        for d in (a, b, c):
            assert (
                client.get(f"/api/materials/{d.material_id}/equivalencias").json()["groups"] == []
            )
        assert db_session.scalar(select(func.count(EquivalenceGroup.id))) == 0

    def test_declaring_one_pair_does_not_pull_in_a_namesake(
        self, client: TestClient, real_source, real_designations
    ) -> None:
        a, b, c = (real_designations[k] for k in "ABC")
        client.post("/api/equivalencias", json=_payload(real_source.id, a, b))
        # C has A's exact code, but is in no group: only the entered ids count.
        assert client.get(f"/api/materials/{c.material_id}/equivalencias").json()["groups"] == []
        listed = client.get(f"/api/materials/{a.material_id}/equivalencias").json()["groups"][0]
        assert c.material_id not in {m["material_id"] for m in listed["members"]}

    def test_the_domain_has_no_matcher(self) -> None:
        import app.domain.equivalence as module

        public = {n for n in dir(module) if not n.startswith("_")}
        assert not {n for n in public if "match" in n.lower() or "infer" in n.lower()}


# --- demo seed and clear_demo (D-72) ---------------------------------------
@pytest.fixture()
def demo_catalog(db_session: Session) -> dict[str, int]:
    source = db_session.execute(
        select(Source).where(Source.label == DEMO_SOURCE_LABEL)
    ).scalar_one()
    seed_extended_materials(db_session, source)
    seed_extended_identity(db_session, source)
    created = seed_demo_equivalences(db_session, source)
    db_session.flush()
    db_session.expire_all()
    return created


class TestDemoSeed:
    def test_groups_are_fictitious_and_marked(self, db_session: Session, demo_catalog) -> None:
        assert demo_catalog == {"equivalence_groups_created": len(DEMO_GROUPS)}
        groups = list(db_session.execute(select(EquivalenceGroup)).scalars())
        assert len(groups) == len(DEMO_GROUPS)
        assert all(g.is_demo and g.source.is_demo for g in groups)
        assert {g.kind for g in groups} == set(EquivalenceKind)
        for g in groups:
            assert len(g.members) >= 2
            assert all(m.designation.code.startswith("DEMO-") for m in g.members)

    def test_idempotent(self, db_session: Session, demo_catalog) -> None:
        assert seed_demo_equivalences(db_session) == {"equivalence_groups_created": 0}

    def test_seen_on_the_sheet(self, client: TestClient, db_session: Session, demo_catalog) -> None:
        material = db_session.execute(
            select(Material).where(Material.name == "Aço Inoxidável 316L")
        ).scalar_one()
        groups = client.get(f"/api/materials/{material.id}/equivalencias").json()["groups"]
        assert groups and groups[0]["is_demo"] is True
        assert groups[0]["source_label"] == DEMO_SOURCE_LABEL

    def test_clear_demo_removes_them(self, db_session: Session, demo_catalog) -> None:
        removed = clear_demo_data(db_session)
        db_session.flush()
        assert removed["equivalence_groups"] == len(DEMO_GROUPS)
        for model in (EquivalenceGroup, EquivalenceMember):
            assert db_session.scalar(select(func.count()).select_from(model)) == 0
        assert clear_demo_data(db_session)["equivalence_groups"] == 0

    def test_clear_demo_refuses_a_real_group_citing_a_demo_source(
        self, db_session: Session, real_designations
    ) -> None:
        demo_source = db_session.execute(
            select(Source).where(Source.label == DEMO_SOURCE_LABEL)
        ).scalar_one()
        a, b = real_designations["A"], real_designations["B"]
        db_session.add(
            EquivalenceGroup(
                kind=EquivalenceKind.SIMILAR,
                source_id=demo_source.id,
                is_demo=False,
                members=[
                    EquivalenceMember(designation_id=a.id),
                    EquivalenceMember(designation_id=b.id),
                ],
            )
        )
        db_session.flush()
        with pytest.raises(RuntimeError, match="equivalence_groups"):
            clear_demo_data(db_session)

    def test_clear_demo_refuses_a_real_group_with_a_demo_member(
        self, db_session: Session, real_source, real_designations
    ) -> None:
        a, b = real_designations["A"], real_designations["B"]
        a.is_demo = True
        db_session.add(
            EquivalenceGroup(
                kind=EquivalenceKind.SIMILAR,
                source_id=real_source.id,
                is_demo=False,
                members=[
                    EquivalenceMember(designation_id=a.id),
                    EquivalenceMember(designation_id=b.id),
                ],
            )
        )
        db_session.flush()
        with pytest.raises(RuntimeError, match="equivalência real"):
            clear_demo_data(db_session)
