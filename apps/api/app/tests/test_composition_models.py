"""Composition and designation rows in the database (D-105): what the schema refuses.

The domain builder refuses all of this first; these tests prove the database
refuses it too, because the seed, the official importer and a future migration
write these tables without passing through the service. Raw SQL, so the ORM
validators cannot be what stops the row.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_data, clear_demo_identity
from app.db.seed import DEMO_COMPOSITIONS, DEMO_DESIGNATIONS, _seed_demo_identity
from app.models.enums import DesignationSystem
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_designation import MaterialDesignation
from app.models.source import Source


@pytest.fixture()
def material_and_source(db_session: Session) -> tuple[int, int]:
    klass = db_session.execute(select(MaterialClass)).scalars().first()
    source = db_session.execute(select(Source)).scalars().first()
    material = Material(name="Liga real de teste", class_id=klass.id, keywords=[], is_demo=False)
    db_session.add(material)
    db_session.flush()
    return material.id, source.id


def _insert(db: Session, material_id: int, source_id: int, **columns) -> None:
    row = {
        "material_id": material_id,
        "element": "Cr",
        "position": 0,
        "is_balance": False,
        "is_missing": False,
        "normalized_max": 1.0,
        "source_id": source_id,
        "data_quality": "IMPORTADO",
        "is_demo": False,
        "created_at": "2026-10-07",
        **columns,
    }
    names = ", ".join(row)
    params = ", ".join(f":{k}" for k in row)
    with db.begin_nested():
        db.execute(text(f"INSERT INTO material_composition ({names}) VALUES ({params})"), row)


class TestCompositionConstraints:
    def test_a_valid_row_is_accepted(self, db_session: Session, material_and_source) -> None:
        _insert(db_session, *material_and_source)

    @pytest.mark.parametrize(
        "columns",
        [
            {"element": "Xx"},
            {"element": "CR"},  # the canonical capitalisation is part of the rule
            {"is_balance": True},  # balance with a number
            {"is_missing": True},  # absent with a number
            {"is_balance": True, "is_missing": True, "normalized_max": None},
            {"normalized_max": None},  # a numeric row with no number
            {"normalized_min": 20.0, "normalized_max": 18.0},
            {"normalized_max": 120.0},
            {"normalized_min": -1.0, "normalized_max": 1.0},
            {"normalized_min": 1.0, "normalized_max": 2.0, "normalized_nominal": 3.0},
        ],
    )
    def test_the_database_refuses(
        self, db_session: Session, material_and_source, columns: dict
    ) -> None:
        with pytest.raises(IntegrityError):
            _insert(db_session, *material_and_source, **columns)

    def test_one_row_per_element(self, db_session: Session, material_and_source) -> None:
        _insert(db_session, *material_and_source)
        with pytest.raises(IntegrityError):
            _insert(db_session, *material_and_source, normalized_max=2.0)

    def test_one_balance_per_material(self, db_session: Session, material_and_source) -> None:
        _insert(
            db_session, *material_and_source, element="Fe", is_balance=True, normalized_max=None
        )
        with pytest.raises(IntegrityError):
            _insert(
                db_session, *material_and_source, element="Ni", is_balance=True, normalized_max=None
            )

    def test_the_orm_canonicalises_the_symbol_and_refuses_an_unknown_one(self) -> None:
        assert MaterialCompositionEntry(element="cr").element == "Cr"
        with pytest.raises(ValueError, match="não é símbolo"):
            MaterialCompositionEntry(element="Xx")


class TestDesignationConstraints:
    def test_the_key_follows_the_code(self, db_session: Session, material_and_source) -> None:
        material_id, source_id = material_and_source
        row = MaterialDesignation(
            material_id=material_id,
            system=DesignationSystem.UNS,
            code=" s 30400 ",
            source_id=source_id,
        )
        assert (row.code, row.code_key) == ("s 30400", "S30400")

    def test_the_same_code_twice_in_one_system_is_refused(
        self, db_session: Session, material_and_source
    ) -> None:
        material_id, source_id = material_and_source
        for code in ("S30400", "s30400"):
            db_session.add(
                MaterialDesignation(
                    material_id=material_id,
                    system=DesignationSystem.UNS,
                    code=code,
                    source_id=source_id,
                )
            )
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_the_same_code_in_another_system_is_another_designation(
        self, db_session: Session, material_and_source
    ) -> None:
        material_id, source_id = material_and_source
        for system in (DesignationSystem.AISI_SAE, DesignationSystem.ABNT):
            db_session.add(
                MaterialDesignation(
                    material_id=material_id, system=system, code="304", source_id=source_id
                )
            )
        db_session.flush()

    def test_a_designation_needs_a_source(self, db_session: Session, material_and_source) -> None:
        material_id, _ = material_and_source
        db_session.add(
            MaterialDesignation(material_id=material_id, system=DesignationSystem.UNS, code="X1")
        )
        with pytest.raises(IntegrityError):
            db_session.flush()


class TestDemoRows:
    def test_the_seed_attaches_the_declared_rows_and_is_idempotent(
        self, db_session: Session
    ) -> None:
        designations = db_session.scalar(select(func.count(MaterialDesignation.id)))
        entries = db_session.scalar(select(func.count(MaterialCompositionEntry.id)))
        assert designations == sum(len(v) for v in DEMO_DESIGNATIONS.values()) == 8
        assert entries == sum(len(v) for v in DEMO_COMPOSITIONS.values()) == 19

        demo_source = db_session.execute(
            select(Source).where(Source.is_demo.is_(True))
        ).scalar_one()
        again = _seed_demo_identity(db_session, demo_source)
        assert again == {"designations_created": 0, "composition_entries_created": 0}

    def test_every_seeded_row_is_marked_demo(self, db_session: Session) -> None:
        for model in (MaterialDesignation, MaterialCompositionEntry):
            assert (
                db_session.scalar(select(func.count(model.id)).where(model.is_demo.is_(False))) == 0
            )

    def test_every_seeded_code_says_it_is_fictitious(self) -> None:
        for specs in DEMO_DESIGNATIONS.values():
            for spec in specs:
                assert (
                    spec["code"].startswith("DEMO-")
                    or spec["system"] is DesignationSystem.COMERCIAL
                )

    def test_the_seed_refills_rows_on_existing_demo_materials(self, db_session: Session) -> None:
        # Production already holds the five demo materials: the next semear_demo
        # must add the new rows rather than skip the material.
        clear_demo_identity(db_session)
        db_session.flush()
        db_session.expire_all()
        demo_source = db_session.execute(
            select(Source).where(Source.is_demo.is_(True))
        ).scalar_one()
        created = _seed_demo_identity(db_session, demo_source)
        assert created == {"designations_created": 8, "composition_entries_created": 19}

    def test_clear_demo_removes_demo_rows_on_a_real_material(
        self, db_session: Session, material_and_source
    ) -> None:
        material_id, source_id = material_and_source
        real_source = Source(label="Fonte real de teste D-105", is_demo=False)
        db_session.add(real_source)
        db_session.flush()
        db_session.add(
            MaterialDesignation(
                material_id=material_id,
                system=DesignationSystem.UNS,
                code="REAL-1",
                source_id=real_source.id,
            )
        )
        db_session.add(
            MaterialDesignation(
                material_id=material_id,
                system=DesignationSystem.COMERCIAL,
                code="Fictício",
                source_id=real_source.id,
                is_demo=True,
            )
        )
        db_session.flush()

        removed = clear_demo_data(db_session)
        db_session.flush()

        assert removed["designations"] == 9  # 8 seeded + the demo row on the real material
        remaining = db_session.execute(select(MaterialDesignation)).scalars().all()
        assert [d.code for d in remaining] == ["REAL-1"]
        assert db_session.scalar(select(func.count(MaterialCompositionEntry.id))) == 0

    def test_a_real_row_citing_the_demo_source_stops_the_cleanup(
        self, db_session: Session, material_and_source
    ) -> None:
        material_id, _ = material_and_source
        demo_source = db_session.execute(
            select(Source).where(Source.is_demo.is_(True))
        ).scalar_one()
        db_session.add(
            MaterialDesignation(
                material_id=material_id,
                system=DesignationSystem.UNS,
                code="REAL-2",
                source_id=demo_source.id,
                is_demo=False,
            )
        )
        db_session.flush()
        with pytest.raises(RuntimeError, match="preservar proveniência"):
            clear_demo_data(db_session)
