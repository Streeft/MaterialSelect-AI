"""Axis domains and the run's winner are computed here, not in React (ADR 0004).

The front used to derive four things on its own: the box plot's padded domain,
the cost curve's log-log domain, the open sides of the Ashby selection box and
the winner of a run. Each is a number (or a name picked by a numeric rule), so
each lives in `domain`/`calculations` with a test.
"""

from __future__ import annotations

import math

import pytest

from app.calculations.part_cost import CostCurvePoint, curve_domains
from app.domain.axis_domain import box_domains, open_selection_bounds, padded_domain
from app.domain.winner import pick_winner


class TestPaddedDomain:
    def test_linear_pads_five_percent_each_side(self):
        lo, hi = padded_domain(10.0, 20.0, log=False)
        assert lo == pytest.approx(9.5)
        assert hi == pytest.approx(20.5)

    def test_linear_single_value_gets_ten_percent_of_magnitude(self):
        assert padded_domain(5.0, 5.0, log=False) == pytest.approx((4.5, 5.5))

    def test_linear_single_zero_gets_unit_air(self):
        assert padded_domain(0.0, 0.0, log=False) == (-1.0, 1.0)

    def test_log_pads_in_decades(self):
        lo, hi = padded_domain(1.0, 1000.0, log=True)
        pad = 3 * 0.05
        assert lo == pytest.approx(10**-pad)
        assert hi == pytest.approx(10 ** (3 + pad))

    def test_log_has_a_minimum_pad(self):
        lo, hi = padded_domain(10.0, 10.0, log=True)
        assert lo == pytest.approx(10 ** (1 - 0.05))
        assert hi == pytest.approx(10 ** (1 + 0.05))

    def test_non_finite_extent_is_a_neutral_unit_interval(self):
        assert padded_domain(math.inf, -math.inf, log=False) == (0.0, 1.0)


class TestBoxDomains:
    def test_positive_values_offer_both_domains(self):
        domains = box_domains([2.0, 5.0], [8.0, 40.0])
        assert domains is not None
        assert domains.linear[0] < 2.0 and domains.linear[1] > 40.0
        assert domains.log is not None
        assert domains.log[0] < 2.0 and domains.log[1] > 40.0

    def test_non_positive_minimum_withholds_the_log_domain(self):
        domains = box_domains([0.0, 5.0], [8.0, 40.0])
        assert domains is not None
        assert domains.log is None

    def test_nothing_to_draw_is_none(self):
        assert box_domains([], []) is None


class TestCurveDomains:
    def test_log_log_domain_spans_curve_and_current_batch(self):
        points = [
            CostCurvePoint(batch_size=1.0, cost=100.0),
            CostCurvePoint(batch_size=1000.0, cost=10.0),
        ]
        domains = curve_domains([points], current_batch=50.0)
        assert domains.x == (1.0, 1000.0)
        assert domains.y[0] < 10.0 and domains.y[1] > 100.0
        assert domains.batch_sizes == [1.0, 50.0, 1000.0]

    def test_current_batch_outside_the_curve_widens_x(self):
        points = [
            CostCurvePoint(batch_size=10.0, cost=5.0),
            CostCurvePoint(batch_size=100.0, cost=4.0),
        ]
        domains = curve_domains([points], current_batch=5000.0)
        assert domains.x == (10.0, 5000.0)

    def test_no_curve_falls_back_to_a_stated_default_y(self):
        domains = curve_domains([], current_batch=10.0)
        assert domains.y == (1.0, 1000.0)
        assert domains.x == (10.0, 10.0)


class TestOpenSelectionBounds:
    def test_log_opens_two_decades_beyond_the_data(self):
        bounds = open_selection_bounds([2.0, 10.0], [100.0, 900.0], log=True)
        assert bounds.x == pytest.approx((0.02, 1000.0))
        assert bounds.y == pytest.approx((1.0, 90000.0))

    def test_linear_opens_half_the_span(self):
        bounds = open_selection_bounds([2.0, 10.0], [100.0, 300.0], log=False)
        assert bounds.x == pytest.approx((-2.0, 14.0))
        assert bounds.y == pytest.approx((0.0, 400.0))

    def test_no_points_gives_the_default_square(self):
        bounds = open_selection_bounds([], [], log=True)
        assert bounds.x == (1.0, 1000.0) and bounds.y == (1.0, 1000.0)


class TestPickWinner:
    ROW = {"record_id": 1, "name": "Liga A", "score": 0.9, "rank": 1, "contributions": []}

    def test_no_candidates(self):
        w = pick_winner(candidate_count=0, ranked=[], method=None, index_goal=None, index_values=[])
        assert (w.kind, w.reason) == ("none", "no_candidates")

    def test_no_objective(self):
        w = pick_winner(candidate_count=3, ranked=[], method=None, index_goal=None, index_values=[])
        assert (w.kind, w.reason) == ("none", "no_objective")

    def test_ranked_names_every_rank_one_row(self):
        ranked = [
            {**self.ROW},
            {**self.ROW, "record_id": 2, "name": "Liga B"},
            {**self.ROW, "record_id": 3, "name": "Liga C", "rank": 2, "score": 0.1},
        ]
        w = pick_winner(
            candidate_count=3,
            ranked=ranked,
            method="topsis",
            index_goal=None,
            index_values=[(1, 12.0), (2, None)],
        )
        assert w.kind == "ranked"
        assert w.names == ["Liga A", "Liga B"]
        assert w.score == 0.9 and w.method == "topsis"
        assert w.index_value == 12.0

    def test_index_only_maximize_ignores_undefined(self):
        w = pick_winner(
            candidate_count=3,
            ranked=[],
            method=None,
            index_goal="maximize",
            index_values=[(1, 3.0), (2, None), (3, 7.0)],
            names={1: "A", 2: "B", 3: "C"},
        )
        assert (w.kind, w.names, w.value, w.maximize) == ("index", ["C"], 7.0, True)

    def test_index_only_minimize_picks_the_lowest_and_keeps_ties(self):
        w = pick_winner(
            candidate_count=3,
            ranked=[],
            method=None,
            index_goal="minimize",
            index_values=[(1, 3.0), (2, 3.0), (3, 7.0)],
            names={1: "A", 2: "B", 3: "C"},
        )
        assert (w.names, w.value, w.maximize) == (["A", "B"], 3.0, False)

    def test_index_with_no_defined_value_names_nobody(self):
        w = pick_winner(
            candidate_count=2,
            ranked=[],
            method=None,
            index_goal="maximize",
            index_values=[(1, None), (2, None)],
            names={1: "A", 2: "B"},
        )
        assert (w.kind, w.reason) == ("none", "no_defined_index")


class TestResponsesCarryTheDomains:
    """The endpoints that feed each figure attach what the figure needs (ADR 0004)."""

    def test_distribution_sends_the_box_domain_around_every_whisker(self, client):
        data = client.get("/api/dashboard/distribution/densidade").json()
        lows = [b["minimum"] for b in data["boxes"]]
        highs = [b["maximum"] for b in data["boxes"]]
        domain = data["domain"]
        assert domain["linear"][0] < min(lows) and domain["linear"][1] > max(highs)
        assert domain["log"][0] < min(lows) and domain["log"][1] > max(highs)

    def test_property_map_sends_open_bounds_for_both_scales_in_the_points_unit(self, client):
        data = client.post(
            "/api/charts/property-map", json={"x": "densidade", "y": "modulo_young", "scale": "log"}
        ).json()
        xs = [p["x"] for p in data["points"]]
        bounds = data["open_bounds"]
        assert bounds["log"]["x"][0] == pytest.approx(min(xs) * 0.01)
        assert bounds["log"]["x"][1] == pytest.approx(max(xs) * 100)
        span = max(xs) - min(xs)
        assert bounds["linear"]["x"][0] == pytest.approx(min(xs) - span / 2)
        assert bounds["linear"]["x"][1] == pytest.approx(max(xs) + span / 2)

    def test_run_names_the_winner_by_index_when_there_is_no_ranking(self, client):
        body = client.post(
            "/api/selection/run",
            json={"index": {"expression": "modulo_young / densidade", "goal": "maximize"}},
        ).json()
        assert body["winner"]["kind"] == "index"
        assert body["winner"]["names"] == ["Cerâmica Demo D"]
        assert body["winner"]["maximize"] is True

    def test_run_with_nothing_to_rank_declares_no_winner(self, client):
        body = client.post("/api/selection/run", json={}).json()
        assert body["winner"] == {
            **body["winner"],
            "kind": "none",
            "reason": "no_objective",
        }

    def test_cost_estimate_sends_the_log_log_domain(self, client, db_session):
        from sqlalchemy import select

        from app.models.material import Material

        material_id = (
            db_session.execute(select(Material.id).where(Material.name.like("%Alumínio%")))
            .scalars()
            .first()
        )
        body = client.post(
            "/api/custo/estimar",
            json={
                "material_id": material_id,
                "part_mass": 2.0,
                "batch_size": 1000.0,
                "write_off_years": 5.0,
                "load_factor": 0.5,
            },
        ).json()
        domain = body["domain"]
        sizes = [pt["batch_size"] for p in body["costed"] for pt in p["curve"]]
        costs = [pt["cost"] for p in body["costed"] for pt in p["curve"]]
        assert domain["x"] == [min(sizes), max(sizes)]
        assert domain["y"][0] < min(costs) and domain["y"][1] > max(costs)
        assert 1000.0 in domain["batch_sizes"]
