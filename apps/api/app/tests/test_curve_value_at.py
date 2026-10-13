"""Reading a curve at a declared x (TM4-b, D-110): the point the source gave, or an absence.

The rule is conservative on purpose: the value is read only where the source
declared that exact x, after converting both through ``units.py``. Between two
points, beyond the ends, or at a nearby x there is **no value** — written, never
a number made up by interpolation, extrapolation or a nearest neighbour.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.domain.curves import (
    READ_RULE,
    CurveError,
    PointData,
    SeriesData,
    read_at_declared_x,
)
from app.tests.test_curves_api import _add_temperature_curve, _new_material


def _pt(x_k: float, x_original: float, y_pa: float, y_original: float) -> PointData:
    return PointData(
        x=x_k,
        y=y_pa,
        y_min=None,
        y_max=None,
        x_original=x_original,
        y_original=y_original,
        y_min_original=None,
        y_max_original=None,
    )


SERIES = SeriesData(
    id=1,
    label=None,
    conditions=None,
    parameter=None,
    parameter_original=None,
    parameter_original_unit=None,
    points=(
        _pt(293.15, 20, 200e9, 200),
        _pt(673.15, 400, 170e9, 170),
    ),
)


def _read(at: float, unit: str = "degC", **kw):
    return read_at_declared_x("temperatura", "modulo", None, [SERIES], at=at, at_unit=unit, **kw)[
        0
    ][0]


class TestDomain:
    def test_a_declared_point_is_read_with_the_sources_own_numbers(self) -> None:
        reading = _read(20)
        assert reading.found and reading.position == 0
        assert reading.y == pytest.approx(200)  # GPa by convention
        assert reading.y_original == 200 and reading.x_original == 20

    def test_the_asked_unit_is_converted_by_units_py(self) -> None:
        assert _read(293.15, "K").found
        assert _read(68, "degF").found
        assert _read(20, y_unit="MPa").y == pytest.approx(200_000)

    @pytest.mark.parametrize("at", [21, 19.999, 100, 200, 399.9, 400.1, 0, 1000, -273.15])
    def test_nothing_is_interpolated_extrapolated_or_snapped(self, at: float) -> None:
        reading = _read(at)
        assert not reading.found
        assert reading.y is None and reading.y_min is None and reading.position is None

    def test_a_wrong_dimension_or_unit_is_refused(self) -> None:
        with pytest.raises(Exception, match="Admitidas"):
            _read(20, "psi")
        with pytest.raises(CurveError):
            _read(float("nan"))

    def test_the_rule_says_no_interpolation(self) -> None:
        assert "interpolado" in READ_RULE and "ausente" in READ_RULE


class TestApi:
    def _url(self, material, curve, query: str) -> str:
        return f"/api/materials/{material.id}/curvas/{curve.id}/valor?{query}"

    def test_a_declared_temperature_gives_the_value_and_its_trail(
        self, client, db_session: Session
    ) -> None:
        material = _new_material(db_session, "Aço real E × T valor")
        curve = _add_temperature_curve(db_session, material)
        body = client.get(self._url(material, curve, "em=20&unidade_em=degC")).json()
        assert body["found_count"] == 1 and body["rule"] == READ_RULE
        reading = body["series"][0]
        assert reading["found"] is True and reading["absence"] is None
        assert reading["y"] == pytest.approx(200) and body["y_unit"] == "GPa"
        assert reading["x_original"] == 20 and reading["y_original"] == 200
        assert reading["position"] == 0
        assert body["source_label"]

    @pytest.mark.parametrize("at", ["20.5", "250", "500", "-10"])
    def test_without_a_declared_point_the_absence_is_written_never_zero(
        self, client, db_session: Session, at: str
    ) -> None:
        material = _new_material(db_session, "Aço real E × T ausência")
        curve = _add_temperature_curve(db_session, material)
        body = client.get(self._url(material, curve, f"em={at}&unidade_em=degC")).json()
        reading = body["series"][0]
        assert body["found_count"] == 0 and reading["found"] is False
        assert reading["y"] is None and reading["y_original"] is None
        assert "Sem ponto declarado" in reading["absence"]
        assert "nada foi interpolado" in reading["absence"]

    def test_refusals_are_400(self, client, db_session: Session) -> None:
        material = _new_material(db_session, "Aço real E × T recusa")
        curve = _add_temperature_curve(db_session, material)
        assert client.get(self._url(material, curve, "em=20&unidade_em=psi")).status_code == 400
        assert client.get(self._url(material, curve, "em=20")).status_code == 422
        assert client.get(self._url(material, curve, "em=nan&unidade_em=degC")).status_code in (
            400,
            422,
        )

    def test_an_unknown_curve_is_404(self, client, db_session: Session) -> None:
        material = _new_material(db_session, "Aço real E × T 404")
        assert (
            client.get(
                self._url(material, type("C", (), {"id": 999999}), "em=20&unidade_em=degC")
            ).status_code
            == 404
        )
