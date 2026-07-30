"""Tests for the convex hull used to draw class envelopes."""

from __future__ import annotations

from app.domain.geometry import bounding_box, convex_hull


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
