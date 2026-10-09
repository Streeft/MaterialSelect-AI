"""The curve routes (D-106): list, drawing, refusals and the points file.

The geometry is proved in ``test_curves_domain.py``; this file proves the
routes reach it, refuse in Portuguese with a 400, hide another person's record
with a 404, and that the exported file carries the notices and the unit trail.
"""

from __future__ import annotations

import csv
import io

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.curves import PointInput, SeriesInput, build_curve
from app.exporters.report import DEMO_DATA_NOTICE, LIMITATION_NOTICE
from app.models.enums import CurveKind
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_curve import MaterialCurve
from app.models.source import Source
from app.models.user import User
from app.repositories.curve_repository import curve_rows


def _material(db: Session, name: str) -> Material:
    return db.execute(select(Material).where(Material.name == name)).scalar_one()


def _curve(db: Session, material: Material, kind: CurveKind) -> MaterialCurve:
    return db.execute(
        select(MaterialCurve).where(
            MaterialCurve.material_id == material.id, MaterialCurve.kind == kind
        )
    ).scalar_one()


def _new_material(db: Session, name: str, owner: User | None = None) -> Material:
    klass = db.execute(select(MaterialClass).where(MaterialClass.slug == "metais")).scalar_one()
    material = Material(
        name=name,
        class_id=klass.id,
        keywords=[],
        is_demo=False,
        owner_id=owner.id if owner else None,
    )
    db.add(material)
    db.flush()
    return material


def _add_temperature_curve(db: Session, material: Material, title: str = "E × T") -> MaterialCurve:
    source = db.execute(select(Source).where(Source.is_demo.is_(False))).scalars().first()
    row = curve_rows(
        build_curve(
            CurveKind.TEMPERATURA,
            x_quantity="temperatura",
            x_unit="degC",
            y_quantity="modulo",
            y_unit="GPa",
            series=[SeriesInput(points=[PointInput(20, 200), PointInput(400, 170)])],
        ),
        material_id=material.id,
        title=title,
        source_id=source.id,
    )
    db.add(row)
    db.flush()
    return row


class TestList:
    def test_a_demo_material_lists_its_curves_with_every_kind_counted(
        self, client, db_session: Session
    ) -> None:
        aluminium = _material(db_session, "Liga Alumínio Demo A")
        body = client.get(f"/api/materials/{aluminium.id}/curvas").json()
        assert body["total"] == 2
        assert [c["kind"] for c in body["curves"]] == ["TENSAO_DEFORMACAO", "FADIGA"]
        counts = {c["kind"]: c["count"] for c in body["counts_by_kind"]}
        assert counts == {
            "TENSAO_DEFORMACAO": 1,
            "TEMPERATURA": 0,
            "TAXA": 0,
            "FADIGA": 1,
            "FLUENCIA": 0,
        }
        stress = body["curves"][0]
        assert stress["series_count"] == 3 and stress["point_count"] == 27
        assert stress["is_demo"] is True
        assert stress["parameter_quantity_label"] == "Temperatura"

    def test_a_material_without_curves_says_zero(self, client, db_session: Session) -> None:
        polymer = _material(db_session, "Polímero Demo C")
        response = client.get(f"/api/materials/{polymer.id}/curvas")
        assert response.status_code == 200
        assert response.json()["total"] == 0 and response.json()["curves"] == []

    def test_an_unknown_material_is_404(self, client) -> None:
        assert client.get("/api/materials/999999/curvas").status_code == 404


class TestCurve:
    def test_the_curve_comes_ready_to_draw(self, client, db_session: Session) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        body = client.get(f"/api/materials/{steel.id}/curvas/{curve.id}").json()
        assert body["scale"] == "linear"
        assert body["x_axis"]["unit"] == "%" and body["y_axis"]["unit"] == "MPa"
        assert body["x_axis"]["original_unit"] == "%"
        assert body["y_axis"]["conversion_method"] == "pint:MPa->Pa"
        assert body["parameter"]["unit_label"] == "°C"
        assert [round(s["parameter_value"]) for s in body["series"]] == [20, 300, 500]
        assert body["series"][0]["path"][1] == pytest.approx([0.1, 205])
        assert body["x_axis"]["domain"][0] == 0
        assert body["is_demo"] is True

    def test_the_reader_chooses_units_and_scale(self, client, db_session: Session) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        body = client.get(
            f"/api/materials/{steel.id}/curvas/{curve.id}"
            "?unidade_x=dimensionless&unidade_y=GPa&escala=log-log"
        ).json()
        assert body["series"][0]["path"][0] == pytest.approx([0.001, 0.205])
        assert body["scale"] == "log-log"
        assert body["series"][0]["excluded"] == 1  # the origin cannot sit on a log axis
        assert body["series"][0]["points"][0]["drawn"] is False
        assert body["notes"]

    def test_the_reader_chooses_the_unit_of_the_family_parameter(
        self, client, db_session: Session
    ) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        url = f"/api/materials/{steel.id}/curvas/{curve.id}"
        default = client.get(url).json()
        assert default["parameter"]["unit"] == "degC"
        assert [o["unit"] for o in default["parameter"]["accepted_units"]] == [
            "degC",
            "K",
            "degF",
        ]
        assert default["parameter"]["canonical_unit"] == "K"

        kelvin = client.get(url + "?unidade_parametro=K").json()
        assert kelvin["parameter"]["unit"] == "K" and kelvin["parameter"]["unit_label"] == "K"
        assert [round(s["parameter_value"], 2) for s in kelvin["series"]] == [
            293.15,
            573.15,
            773.15,
        ]
        fahrenheit = client.get(url + "?unidade_parametro=degF").json()
        assert [round(s["parameter_value"]) for s in fahrenheit["series"]] == [68, 572, 932]
        assert fahrenheit["parameter"]["unit_label"] == "°F"
        # What the source wrote does not move with the reading unit.
        assert [round(s["parameter_original"]) for s in fahrenheit["series"]] == [20, 300, 500]
        assert fahrenheit["series"][0]["parameter_original_unit"] == "degC"
        # The axes and the points are untouched by the parameter's unit.
        assert fahrenheit["series"][0]["path"] == default["series"][0]["path"]

    @pytest.mark.parametrize(
        ("query", "fragment"),
        [
            ("unidade_parametro=psi", "parâmetro da família"),
            ("unidade_parametro=furlong", "Admitidas"),
        ],
    )
    def test_a_parameter_unit_the_quantity_refuses_is_400(
        self, client, db_session: Session, query: str, fragment: str
    ) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        response = client.get(f"/api/materials/{steel.id}/curvas/{curve.id}?{query}")
        assert response.status_code == 400
        assert fragment in response.json()["detail"]

    def test_a_parameter_unit_on_a_curve_without_family_is_400(
        self, client, db_session: Session
    ) -> None:
        material = _new_material(db_session, "Aço real sem família")
        curve = _add_temperature_curve(db_session, material)
        response = client.get(f"/api/materials/{material.id}/curvas/{curve.id}?unidade_parametro=K")
        assert response.status_code == 400
        assert "não é uma família" in response.json()["detail"]

    def test_fatigue_opens_in_log_x_with_its_band(self, client, db_session: Session) -> None:
        aluminium = _material(db_session, "Liga Alumínio Demo A")
        curve = _curve(db_session, aluminium, CurveKind.FADIGA)
        body = client.get(f"/api/materials/{aluminium.id}/curvas/{curve.id}").json()
        assert body["scale"] == "log-x" and body["x_axis"]["log"] is True
        band = body["series"][0]["band"]
        assert len(band) == 12 and band[0] == pytest.approx([1e3, 240])
        assert body["x_axis"]["unit_label"] == ""

    @pytest.mark.parametrize(
        ("query", "fragment"),
        [
            ("unidade_y=kg/m**3", "Admitidas"),
            ("unidade_x=furlong", "Admitidas"),
            ("escala=semilog", "desconhecida"),
        ],
    )
    def test_refusals_are_400_in_portuguese(
        self, client, db_session: Session, query: str, fragment: str
    ) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        response = client.get(f"/api/materials/{steel.id}/curvas/{curve.id}?{query}")
        assert response.status_code == 400
        assert fragment in response.json()["detail"]

    def test_log_on_a_temperature_axis_is_refused(self, client, db_session: Session) -> None:
        material = _new_material(db_session, "Aço real com curva E × T")
        curve = _add_temperature_curve(db_session, material)
        url = f"/api/materials/{material.id}/curvas/{curve.id}"
        refused = client.get(url + "?escala=log-x")
        assert refused.status_code == 400
        assert "não admite escala logarítmica" in refused.json()["detail"]
        body = client.get(url + "?unidade_x=K").json()
        assert body["series"][0]["path"][0] == pytest.approx([293.15, 200])
        assert body["available_scales"] == ["linear", "log-y"]
        assert body["x_axis"]["log_refusal"]

    def test_a_curve_of_another_material_is_404(self, client, db_session: Session) -> None:
        steel = _material(db_session, "Aço Demo B")
        aluminium_curve = _curve(
            db_session, _material(db_session, "Liga Alumínio Demo A"), CurveKind.FADIGA
        )
        response = client.get(f"/api/materials/{steel.id}/curvas/{aluminium_curve.id}")
        assert response.status_code == 404

    def test_another_persons_record_is_404_and_its_owner_reads_it(
        self, client, login_as, other_user: User, db_session: Session
    ) -> None:
        private = _new_material(db_session, "Liga privada de Bruno", owner=other_user)
        curve = _add_temperature_curve(db_session, private)
        url = f"/api/materials/{private.id}/curvas"
        assert client.get(url).status_code == 404
        assert client.get(f"{url}/{curve.id}").status_code == 404
        assert (
            client.get(f"/api/exports/materiais/{private.id}/curvas/{curve.id}.csv").status_code
            == 404
        )
        with login_as(other_user):
            assert client.get(url).json()["total"] == 1
            assert client.get(f"{url}/{curve.id}").json()["is_own_record"] is True


class TestExport:
    def test_the_csv_carries_notices_units_and_written_absence(
        self, client, db_session: Session
    ) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        response = client.get(
            f"/api/exports/materiais/{steel.id}/curvas/{curve.id}.csv?unidade_y=GPa"
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert response.headers["x-content-type-options"] == "nosniff"
        text_body = response.text
        assert LIMITATION_NOTICE in text_body and DEMO_DATA_NOTICE in text_body
        assert "pint:MPa->Pa" in text_body
        assert "Tensão de engenharia (GPa)" in text_body
        assert "y original (MPa)" in text_body
        assert "sem faixa declarada" in text_body
        rows = list(csv.reader(io.StringIO(text_body.lstrip("﻿"))))
        points = [r for r in rows if r and r[0] == "Série 1"]
        assert len(points) == 11
        assert float(points[1][4]) == pytest.approx(0.205)  # GPa
        assert float(points[1][8]) == pytest.approx(205)  # as the source wrote it

    def test_a_formula_title_leaves_as_text(self, client, db_session: Session) -> None:
        material = _new_material(db_session, "Aço real exportado")
        curve = _add_temperature_curve(db_session, material, title='=HYPERLINK("http://x")')
        text_body = client.get(f"/api/exports/materiais/{material.id}/curvas/{curve.id}.csv").text
        assert "'=HYPERLINK" in text_body
        assert DEMO_DATA_NOTICE not in text_body

    def test_xlsx_and_unsupported_formats(self, client, db_session: Session) -> None:
        steel = _material(db_session, "Aço Demo B")
        curve = _curve(db_session, steel, CurveKind.TENSAO_DEFORMACAO)
        base = f"/api/exports/materiais/{steel.id}/curvas/{curve.id}"
        assert client.get(base + ".xlsx").status_code == 200
        refused = client.get(base + ".docx")
        assert refused.status_code == 400 and "não suportado" in refused.json()["detail"]
