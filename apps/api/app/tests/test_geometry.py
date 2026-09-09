"""Tests for the convex hull used to draw class envelopes."""

from __future__ import annotations

import pytest

from app.domain.geometry import bounding_box, convex_hull, fitted_ellipse


class TestConvexHull:
    def test_empty(self) -> None:
        assert convex_hull([]) == []

    def test_single_point(self) -> None:
        assert convex_hull([(1.0, 2.0)]) == [(1.0, 2.0)]

    def test_duplicates_collapse(self) -> None:
        assert convex_hull([(1.0, 2.0), (1.0, 2.0), (1.0, 2.0)]) == [(1.0, 2.0)]

    def test_two_points_yield_a_segment(self) -> None:
        assert convex_hull([(1.0, 1.0), (3.0, 4.0)]) == [(1.0, 1.0), (3.0, 4.0)]

    def test_collinear_points_reduce_to_the_extremes(self) -> None:
        hull = convex_hull([(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (3.0, 3.0)])
        assert set(hull) == {(0.0, 0.0), (3.0, 3.0)}
        assert len(hull) == 2

    def test_interior_point_is_dropped(self) -> None:
        square = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
        hull = convex_hull([*square, (2.0, 2.0)])
        assert set(hull) == set(square)
        assert len(hull) == 4

    def test_edge_point_is_dropped(self) -> None:
        # (2, 0) sits on the bottom edge and adds no information to the outline.
        square = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
        assert set(convex_hull([*square, (2.0, 0.0)])) == set(square)

    def test_hull_is_counter_clockwise(self) -> None:
        hull = convex_hull([(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)])
        area = sum(
            hull[i][0] * hull[(i + 1) % len(hull)][1] - hull[(i + 1) % len(hull)][0] * hull[i][1]
            for i in range(len(hull))
        )
        assert area > 0  # positive shoelace area == counter-clockwise


class TestBoundingBox:
    def test_none_for_empty(self) -> None:
        assert bounding_box([]) is None

    def test_extremes(self) -> None:
        assert bounding_box([(1.0, 5.0), (3.0, 2.0), (-1.0, 4.0)]) == ((-1.0, 2.0), (3.0, 5.0))


class TestFittedEllipse:
    def test_fitted_ellipse_encloses_all_points(self) -> None:
        points = [(0.0, 0.0), (4.0, 0.0), (0.0, 2.0), (4.0, 2.0), (2.0, 1.0)]
        ellipse = fitted_ellipse(points)
        # Every input point must fall inside (or on) the returned polygon's
        # bounding envelope — checked via each point's distance from the
        # ellipse's centroid never exceeding the max radius sampled on the
        # polygon along that direction. A simpler, sufficient check: every input
        # point lies within the convex hull of the ellipse's sampled vertices
        # (an ellipse is convex, so this is exact up to the 48-point sampling
        # error, which is negligible at this scale).
        hull_of_ellipse = convex_hull(ellipse)
        for x, y in points:
            # Point-in-convex-polygon via the same cross-product sign test
            # convex_hull's monotone chain already relies on internally.
            n = len(hull_of_ellipse)
            signs = []
            for i in range(n):
                ax, ay = hull_of_ellipse[i]
                bx, by = hull_of_ellipse[(i + 1) % n]
                cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
                signs.append(cross >= -1e-6)
            assert all(signs) or all(not s for s in signs)

    def test_fitted_ellipse_degenerate_single_point(self) -> None:
        assert fitted_ellipse([(1.0, 1.0)]) == [(1.0, 1.0)]

    def test_fitted_ellipse_degenerate_empty(self) -> None:
        assert fitted_ellipse([]) == []

    def test_fitted_ellipse_collinear_points(self) -> None:
        # A degenerate (zero-area) covariance direction must not divide by zero.
        points = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]
        ellipse = fitted_ellipse(points)
        assert len(ellipse) >= 2


class TestEllipseCloudsForReading:
    """Granta-style clouds: a class with two grades still reads as a family.

    The bounding ellipse is honest but unreadable on a real catalogue — a
    class with one grade collapses to a dot, two to a segment. Padding and a
    floor turn it into the blob an Ashby chart is recognised by. Both default
    to off, so the bounding guarantee above is what a caller gets unless it
    asks otherwise.
    """

    def test_padding_grows_the_ellipse_around_the_same_centre(self) -> None:
        points = [(0.0, 0.0), (2.0, 0.0), (1.0, 1.0), (1.0, -1.0)]
        tight = fitted_ellipse(points)
        padded = fitted_ellipse(points, pad=2.0)

        def extent(poly: list[tuple[float, float]]) -> tuple[float, float]:
            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]
            return max(xs) - min(xs), max(ys) - min(ys)

        tw, th = extent(tight)
        pw, ph = extent(padded)
        assert pw > tw and ph > th
        # The centre must not drift: a cloud that slides off its materials
        # would put a class where it is not.
        assert sum(p[0] for p in padded) / len(padded) == pytest.approx(
            sum(p[0] for p in tight) / len(tight), abs=1e-9
        )

    def test_a_single_material_still_gets_a_visible_cloud(self) -> None:
        poly = fitted_ellipse([(5.0, 5.0)], min_semi_axis=0.5)
        assert len(poly) > 2
        xs = [p[0] for p in poly]
        assert max(xs) - min(xs) == pytest.approx(1.0, abs=1e-6)

    def test_two_materials_do_not_collapse_to_a_segment(self) -> None:
        # Collinear input: without a floor the minor axis is zero and the
        # "ellipse" is a line the reader cannot tell from a stroke.
        poly = fitted_ellipse([(0.0, 0.0), (2.0, 0.0)], min_semi_axis=0.4)
        ys = [p[1] for p in poly]
        assert max(ys) - min(ys) == pytest.approx(0.8, abs=1e-6)

    def test_the_default_is_still_the_bounding_ellipse(self) -> None:
        points = [(0.0, 0.0), (2.0, 0.0), (1.0, 1.0)]
        assert fitted_ellipse(points) == fitted_ellipse(points, pad=1.0, min_semi_axis=0.0)
