"""The curve builder and the curve drawing (D-106, TM4), with no database.

The builder is where a curve is refused before any row exists; the drawing is
where every coordinate the figure uses is computed (ADR 0004). Both are pure,
so the rules are tested here and the API tests only prove they are reached.
"""

from __future__ import annotations

import math

import pytest

from app.domain.curve_quantities import QUANTITIES
from app.domain.curves import (
    CurveError,
    PointData,
    PointInput,
    SeriesData,
    SeriesInput,
    available_scales,
    axis_reading,
    build_curve,
    draw_curve,
)
from app.domain.display_units import DisplayUnitError
from app.models.enums import CurveKind


def _stress_strain(points, **overrides):
    arguments = {
        "x_quantity": "deformacao",
        "x_unit": "%",
        "y_quantity": "tensao",
        "y_unit": "MPa",
        "series": [SeriesInput(points=[PointInput(*p) for p in points])],
    }
    arguments.update(overrides)
    return build_curve(CurveKind.TENSAO_DEFORMACAO, **arguments)


class TestBuilder:
    def test_every_number_keeps_its_unit_trail(self) -> None:
        curve = _stress_strain([(0, 0), (0.1, 200), (1, 300)])
        assert curve.x_original_unit == "%" and curve.x_canonical_unit == "dimensionless"
        assert curve.y_original_unit == "MPa" and curve.y_canonical_unit == "Pa"
        assert curve.x_conversion_method == "pint:%->dimensionless"
        assert curve.y_conversion_method == "pint:MPa->Pa"
        point = curve.series[0].points[1]
        assert point.x_value == 0.1 and point.y_value == 200
        assert point.x_normalized == pytest.approx(0.001)
        assert point.y_normalized == pytest.approx(200e6)

    def test_nothing_is_interpolated_or_resampled(self) -> None:
        points = [(0, 0), (0.1, 200), (0.2, 250), (5, 400)]
        curve = _stress_strain(points)
        assert [(p.x_value, p.y_value) for p in curve.series[0].points] == points
        assert [p.position for p in curve.series[0].points] == [0, 1, 2, 3]

    def test_a_band_is_kept_with_both_sides(self) -> None:
        curve = _stress_strain([(0, 0, 0, 0), (1, 300, 280, 320)])
        point = curve.series[0].points[1]
        assert (point.y_min_value, point.y_max_value) == (280, 320)
        assert point.y_min_normalized == pytest.approx(280e6)

    @pytest.mark.parametrize(
        ("points", "message"),
        [
            ([(0, 0)], "ao menos 2 pontos"),
            ([(0, 0), (math.inf, 1)], "não finito"),
            ([(0, 0), (1, math.nan)], "não finito"),
            ([(0, 0), (True, 1)], "não numérico"),
            ([(0, 0), ("1", 1)], "não numérico"),
            ([(0, 0), (2, 1), (1, 2)], "x tem de crescer"),
            ([(0, 0), (1, 1), (1, 2)], "x tem de crescer"),
            ([(0, 0), (1, 300, 280, None)], "um lado só"),
            ([(0, 0), (1, 300, 310, 320)], "não contém"),
        ],
    )
    def test_refusals_say_why(self, points, message: str) -> None:
        with pytest.raises(CurveError, match=message):
            _stress_strain(points)

    def test_an_axis_the_kind_does_not_admit_is_refused(self) -> None:
        with pytest.raises(CurveError, match="não admitida"):
            _stress_strain([(0, 0), (1, 1)], x_quantity="temperatura", x_unit="K")

    @pytest.mark.parametrize("unit", ["parsecs", "m"])
    def test_an_unknown_or_incompatible_unit_is_refused(self, unit: str) -> None:
        with pytest.raises(CurveError):
            _stress_strain([(0, 0), (1, 1)], y_unit=unit)

    def test_a_family_needs_every_parameter(self) -> None:
        series = [
            SeriesInput(
                points=[PointInput(0, 0), PointInput(1, 1)], parameter=20, parameter_unit="degC"
            ),
            SeriesInput(points=[PointInput(0, 0), PointInput(1, 1)]),
        ]
        with pytest.raises(CurveError, match="não declara o valor"):
            _stress_strain([], series=series, parameter_quantity="temperatura")

    def test_a_parameter_without_a_family_is_refused(self) -> None:
        series = [
            SeriesInput(
                points=[PointInput(0, 0), PointInput(1, 1)], parameter=20, parameter_unit="degC"
            )
        ]
        with pytest.raises(CurveError, match="sem grandeza de família"):
            _stress_strain([], series=series)

    def test_two_series_at_the_same_parameter_are_refused(self) -> None:
        # 20 °C and 293.15 K are the same temperature: compared canonically.
        series = [
            SeriesInput(
                points=[PointInput(0, 0), PointInput(1, 1)], parameter=20, parameter_unit="degC"
            ),
            SeriesInput(
                points=[PointInput(0, 0), PointInput(1, 1)], parameter=293.15, parameter_unit="K"
            ),
        ]
        with pytest.raises(CurveError, match="mesmo valor"):
            _stress_strain([], series=series, parameter_quantity="temperatura")

    def test_the_parameter_keeps_its_own_trail(self) -> None:
        series = [
            SeriesInput(
                points=[PointInput(0, 0), PointInput(1, 1)], parameter=300, parameter_unit="degC"
            )
        ]
        curve = _stress_strain([], series=series, parameter_quantity="temperatura")
        s = curve.series[0]
        assert (s.parameter_value, s.parameter_original_unit) == (300, "degC")
        assert s.parameter_normalized == pytest.approx(573.15)
        assert s.parameter_canonical_unit == "K"
        assert s.parameter_conversion_method == "pint:degC->K"


def _series(points, *, parameter=None, sid=1) -> SeriesData:
    return SeriesData(
        id=sid,
        label=None,
        conditions=None,
        parameter=parameter,
        parameter_original=None,
        parameter_original_unit=None,
        points=tuple(
            PointData(
                x=x,
                y=y,
                y_min=lo,
                y_max=hi,
                x_original=x,
                y_original=y,
                y_min_original=lo,
                y_max_original=hi,
            )
            for x, y, lo, hi in (p if len(p) == 4 else (*p, None, None) for p in points)
        ),
    )


def _flat(pairs) -> list[float]:
    return [value for pair in pairs for value in pair]


# Canonical: strain dimensionless, stress Pa.
SS = [(0.0, 0.0), (0.001, 200e6), (0.05, 400e6)]


class TestAxisPadding:
    """TM4-h: the air around the data respects what zero means in the unit."""

    def test_celsius_axis_is_not_pulled_down_to_zero(self) -> None:
        from app.domain.curves import _padded

        low, high = _padded([20.0, 600.0], False, zero_is_floor=False)  # type: ignore[misc]
        assert low < 0 and high > 600

    def test_a_ratio_unit_still_starts_at_zero(self) -> None:
        from app.domain.curves import _padded

        low, _ = _padded([20.0, 600.0], False)  # type: ignore[misc]
        assert low == 0.0

    def test_draw_curve_in_celsius_gets_air_below_the_first_point(self) -> None:
        # 293.15 K .. 873.15 K read in degC is 20 .. 600.
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO,
            "temperatura",
            "tensao",
            None,
            [_series([(293.15, 100e6), (873.15, 50e6)])],
            x_unit="degC",
        )
        assert drawn.x.domain is not None and drawn.x.domain[0] < 0
        # In kelvin the same data never goes below the origin of the unit.
        kelvin = draw_curve(
            CurveKind.TENSAO_DEFORMACAO,
            "temperatura",
            "tensao",
            None,
            [_series([(293.15, 100e6), (873.15, 50e6)])],
            x_unit="K",
        )
        assert kelvin.x.domain is not None and kelvin.x.domain[0] > 0


class TestDrawing:
    def test_default_reading_is_the_convention(self) -> None:
        drawn = draw_curve(CurveKind.TENSAO_DEFORMACAO, "deformacao", "tensao", None, [_series(SS)])
        assert drawn.x.reading.unit == "%" and drawn.y.reading.unit == "MPa"
        assert _flat(drawn.series[0].path) == pytest.approx(_flat(((0, 0), (0.1, 200), (5, 400))))
        assert drawn.scale == "linear"

    def test_the_reader_chooses_the_unit(self) -> None:
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO,
            "deformacao",
            "tensao",
            None,
            [_series(SS)],
            x_unit="dimensionless",
            y_unit="GPa",
        )
        assert drawn.series[0].path[1] == pytest.approx((0.001, 0.2))
        # The table keeps what the source wrote, untouched by the reading.
        assert drawn.series[0].points[1].y_original == 200e6

    def test_a_unit_outside_the_axis_list_is_refused(self) -> None:
        with pytest.raises(DisplayUnitError, match="Admitidas"):
            draw_curve(
                CurveKind.TENSAO_DEFORMACAO,
                "deformacao",
                "tensao",
                None,
                [_series(SS)],
                y_unit="kg/m**3",
            )

    def test_the_default_domain_never_crosses_zero_when_the_data_does_not(self) -> None:
        drawn = draw_curve(CurveKind.TENSAO_DEFORMACAO, "deformacao", "tensao", None, [_series(SS)])
        assert drawn.x.domain is not None and drawn.x.domain[0] == 0.0
        assert drawn.x.domain[1] == pytest.approx(5 + 5 * 0.04)

    def test_log_drops_non_positive_points_from_the_figure_only(self) -> None:
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO,
            "deformacao",
            "tensao",
            None,
            [_series(SS)],
            scale="log-log",
        )
        assert len(drawn.series[0].path) == 2
        assert [p.drawn for p in drawn.series[0].points] == [False, True, True]
        assert drawn.series[0].excluded == 1
        assert any("1 ponto(s)" in note for note in drawn.notes)
        lo, hi = drawn.x.domain  # type: ignore[misc]
        assert 0.05 < lo < 0.1 and 5 < hi < 6

    def test_a_temperature_axis_refuses_log(self) -> None:
        series = [_series([(293.15, 200e9), (573.15, 180e9)])]
        with pytest.raises(CurveError, match="não admite escala logarítmica"):
            draw_curve(CurveKind.TEMPERATURA, "temperatura", "modulo", None, series, scale="log-x")
        drawn = draw_curve(CurveKind.TEMPERATURA, "temperatura", "modulo", None, series)
        assert _flat(drawn.series[0].path) == pytest.approx(_flat(((20, 200), (300, 180))))

    def test_the_kind_default_falls_back_rather_than_refusing(self) -> None:
        # Fatigue opens in log-x; that never makes a GET fail.
        drawn = draw_curve(
            CurveKind.FADIGA, "ciclos", "tensao", None, [_series([(1e3, 2e8), (1e6, 1e8)])]
        )
        assert drawn.scale == "log-x" and drawn.x.log and not drawn.y.log

    def test_an_unknown_scale_is_refused(self) -> None:
        with pytest.raises(CurveError, match="desconhecida"):
            draw_curve(
                CurveKind.FADIGA,
                "ciclos",
                "tensao",
                None,
                [_series([(1, 1), (2, 2)])],
                scale="semilog",
            )

    def test_the_band_is_a_closed_polygon_lower_forward_upper_back(self) -> None:
        points = [
            (1e3, 2.6e8, 2.4e8, 2.8e8),
            (1e4, 2.0e8, 1.8e8, 2.2e8),
            (1e5, 1.6e8, 1.4e8, 1.8e8),
        ]
        drawn = draw_curve(CurveKind.FADIGA, "ciclos", "tensao", None, [_series(points)])
        band = drawn.series[0].band
        assert band is not None
        assert _flat(band) == pytest.approx(
            _flat(((1e3, 240), (1e4, 180), (1e5, 140), (1e5, 180), (1e4, 220), (1e3, 280)))
        )
        # The domain covers the band, not only the line.
        assert drawn.y.domain[0] < 140 and drawn.y.domain[1] > 280  # type: ignore[index]

    def test_a_series_without_band_has_none(self) -> None:
        drawn = draw_curve(CurveKind.TENSAO_DEFORMACAO, "deformacao", "tensao", None, [_series(SS)])
        assert drawn.series[0].band is None
        assert drawn.series[0].points[0].y_min is None

    def test_the_family_parameter_is_read_in_its_convention(self) -> None:
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO,
            "deformacao",
            "tensao",
            "temperatura",
            [_series(SS, parameter=573.15)],
        )
        assert drawn.parameter_reading is not None and drawn.parameter_reading.unit == "degC"
        assert drawn.series[0].parameter_value == pytest.approx(300)

    def test_series_order_is_the_sources(self) -> None:
        series = [_series(SS, parameter=773.15, sid=7), _series(SS, parameter=293.15, sid=3)]
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO, "deformacao", "tensao", "temperatura", series
        )
        assert [s.id for s in drawn.series] == [7, 3]


def test_available_scales_follow_the_log_rule() -> None:
    t, m = QUANTITIES["temperatura"], QUANTITIES["modulo"]
    assert available_scales(t, axis_reading(t, None, "x"), m, axis_reading(m, None, "y")) == [
        "linear",
        "log-y",
    ]
