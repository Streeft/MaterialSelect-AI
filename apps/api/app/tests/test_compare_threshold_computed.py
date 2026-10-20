"""Highlight threshold and computed section of the comparison (D-128)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.spread import exceeds, spread_pct
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.schemas.charts import CompareRequest

# --- pure ------------------------------------------------------------------


def test_spread_is_relative_to_the_largest_magnitude() -> None:
    # 100 vs 50: half of the largest, in either order.
    assert spread_pct([100.0, 50.0], ratio_scale=True) == (50.0, "calculada")
    assert spread_pct([50.0, 100.0], ratio_scale=True) == (50.0, "calculada")


def test_spread_names_every_absence() -> None:
    assert spread_pct([1.0, 2.0], ratio_scale=False) == (None, "escala_sem_zero")
    assert spread_pct([1.0], ratio_scale=True) == (None, "valores_insuficientes")
    assert spread_pct([], ratio_scale=True) == (None, "valores_insuficientes")
    assert spread_pct([0.0, 0.0], ratio_scale=True) == (None, "base_zero")


def test_exceeds_is_strict_and_absent_stays_absent() -> None:
    assert exceeds(10.0, 10.0) is False
    assert exceeds(10.1, 10.0) is True
    assert exceeds(-30.0, 10.0) is True
    assert exceeds(None, 10.0) is None
    assert exceeds(5.0, None) is None


@pytest.mark.parametrize("bad", [0, -5, 1000.5, float("inf")])
def test_threshold_out_of_range_is_refused_not_clamped(bad: float) -> None:
    with pytest.raises(PydanticValidationError):
        CompareRequest(material_ids=[1], property_slugs=["a"], highlight_threshold_pct=bad)


def test_threshold_in_range_is_kept_as_given() -> None:
    req = CompareRequest(material_ids=[1], property_slugs=["a"], highlight_threshold_pct=10)
    assert req.highlight_threshold_pct == 10


# --- API -------------------------------------------------------------------


def _ids(db_session: Session, n: int = 3) -> list[int]:
    return list(db_session.execute(select(Material.id).order_by(Material.id).limit(n)).scalars())


def _post(client: TestClient, **payload: object):
    base: dict[str, object] = {"property_slugs": ["densidade", "modulo_young"]}
    base.update(payload)
    return client.post("/api/charts/compare", json=base)


def test_axis_carries_spread_and_flag_only_with_threshold(
    client: TestClient, db_session: Session
) -> None:
    ids = _ids(db_session)
    without = _post(client, material_ids=ids).json()
    assert without["threshold_pct"] is None
    for axis in without["properties"]:
        assert axis["exceeds_threshold"] is None

    tiny = _post(client, material_ids=ids, highlight_threshold_pct=0.001).json()
    huge = _post(client, material_ids=ids, highlight_threshold_pct=1000).json()
    assert tiny["threshold_pct"] == 0.001
    for axis_t, axis_h in zip(tiny["properties"], huge["properties"], strict=True):
        assert axis_t["spread_state"] == "calculada"
        assert axis_t["spread_pct"] == axis_h["spread_pct"]
        assert 0 <= axis_t["spread_pct"] <= 100
        assert axis_t["exceeds_threshold"] is True
        assert axis_h["exceeds_threshold"] is False


def test_spread_matches_max_min_of_canonical_values(
    client: TestClient, db_session: Session
) -> None:
    body = _post(client, material_ids=_ids(db_session)).json()
    axis = body["properties"][0]
    expected = (axis["max_value"] - axis["min_value"]) / abs(axis["max_value"]) * 100
    assert axis["spread_pct"] == pytest.approx(expected)


def test_single_material_has_no_spread_and_says_why(
    client: TestClient, db_session: Session
) -> None:
    body = _post(client, material_ids=_ids(db_session, 1), highlight_threshold_pct=10).json()
    axis = body["properties"][0]
    assert axis["spread_pct"] is None
    assert axis["spread_state"] == "valores_insuficientes"
    assert axis["exceeds_threshold"] is None


def _celsius_on_first(db_session: Session, ids: list[int], unit: str = "degC") -> None:
    """A temperature property valued on the first two materials only."""
    celsius = PropertyDefinition(
        name="Temperatura de ensaio",
        slug="temp_ensaio_celsius",
        category="TERMICA",
        physical_dimension="[temperature]",
        canonical_unit=unit,
        accepted_units=[unit],
    )
    db_session.add(celsius)
    db_session.flush()
    for mid, value in zip(ids[:2], (10.0, 20.0), strict=False):
        db_session.add(
            MaterialPropertyValue(
                material_id=mid,
                property_id=celsius.id,
                value_scalar=value,
                normalized_value=value,
                canonical_unit=unit,
                original_unit=unit,
                is_missing=False,
            )
        )
    db_session.flush()


def test_offset_scale_never_gets_a_spread(client: TestClient, db_session: Session) -> None:
    ids = _ids(db_session)
    _celsius_on_first(db_session, ids)
    body = _post(
        client,
        material_ids=ids,
        property_slugs=["temp_ensaio_celsius"],
        highlight_threshold_pct=10,
    ).json()
    axis = body["properties"][0]
    assert axis["spread_state"] == "escala_sem_zero"
    assert axis["spread_pct"] is None
    assert axis["exceeds_threshold"] is None


def test_computed_with_a_missing_input_is_written_absence(
    client: TestClient, db_session: Session
) -> None:
    ids = _ids(db_session)
    _celsius_on_first(db_session, ids, unit="K")
    body = _post(
        client,
        material_ids=ids,
        property_slugs=["densidade"],
        computed=[{"expression": "temp_ensaio_celsius / densidade"}],
    ).json()
    values = {v["material_id"]: v for v in body["computed"][0]["values"]}
    assert values[ids[0]]["value"] is not None
    # The third material has no test temperature: absent, written, never 0.
    third = values[ids[2]]
    assert third["value"] is None
    assert "temp_ensaio_celsius" in third["undefined_reason"]
    assert body["computed"][0]["undefined_count"] >= 1


def test_cell_flag_follows_the_reference_difference(
    client: TestClient, db_session: Session
) -> None:
    ids = _ids(db_session)
    body = _post(
        client, material_ids=ids, reference_id=ids[0], highlight_threshold_pct=0.001
    ).json()
    for row in body["materials"]:
        cell = row["cells"][0]
        if cell["difference_state"] == "calculada":
            assert cell["exceeds_threshold"] is (abs(cell["difference_pct"]) > 0.001)
        else:
            assert cell["exceeds_threshold"] is None


def test_computed_ratio_is_evaluated_in_the_backend(
    client: TestClient, db_session: Session
) -> None:
    ids = _ids(db_session)
    body = _post(
        client,
        material_ids=ids,
        computed=[{"name": "E/ρ", "expression": "modulo_young / densidade"}],
    ).json()
    column = body["computed"][0]
    assert column["name"] == "E/ρ"
    assert column["variables"] == ["densidade", "modulo_young"]
    assert column["dimension"] != "dimensionless"
    assert len(column["values"]) == len(ids)
    # Each value is the canonical E / canonical rho of that very row.
    by_row = {
        m["material_id"]: {c["property_slug"]: c for c in m["cells"]} for m in body["materials"]
    }
    for item in column["values"]:
        cells = by_row[item["material_id"]]
        e, rho = cells["modulo_young"]["value"], cells["densidade"]["value"]
        if e is None or rho is None:
            assert item["value"] is None
            assert item["undefined_reason"]
        else:
            assert item["value"] == pytest.approx(e / rho)
            assert item["undefined_reason"] is None


def test_computed_carries_its_own_spread_and_flag(client: TestClient, db_session: Session) -> None:
    ids = _ids(db_session)
    expression = [{"expression": "modulo_young / densidade"}]
    plain = _post(client, material_ids=ids, computed=expression).json()["computed"][0]
    flagged = _post(
        client, material_ids=ids, computed=expression, highlight_threshold_pct=0.001
    ).json()["computed"][0]
    # Without a threshold the spread is there and the flag is not.
    assert plain["exceeds_threshold"] is None
    assert plain["spread_state"] == "calculada"
    defined = [v["value"] for v in plain["values"] if v["value"] is not None]
    assert plain["spread_pct"] == pytest.approx(
        (max(defined) - min(defined)) / max(abs(v) for v in defined) * 100
    )
    assert flagged["spread_pct"] == plain["spread_pct"]
    assert flagged["exceeds_threshold"] is True
    huge = _post(
        client, material_ids=ids, computed=expression, highlight_threshold_pct=1000
    ).json()["computed"][0]
    assert huge["exceeds_threshold"] is False


def test_computed_with_a_sum_gets_no_spread_and_says_why(
    client: TestClient, db_session: Session
) -> None:
    # A difference can move the zero: a percentage of it would be a made-up claim.
    body = _post(
        client,
        material_ids=_ids(db_session),
        computed=[{"expression": "densidade - densidade / 2"}],
        highlight_threshold_pct=10,
    ).json()["computed"][0]
    assert body["spread_pct"] is None
    assert body["spread_state"] == "escala_sem_zero"
    assert body["exceeds_threshold"] is None


def test_computed_with_one_defined_value_has_no_spread(
    client: TestClient, db_session: Session
) -> None:
    ids = _ids(db_session)
    body = _post(
        client, material_ids=ids[:1], computed=[{"expression": "modulo_young / densidade"}]
    ).json()["computed"][0]
    assert body["spread_pct"] is None
    assert body["spread_state"] == "valores_insuficientes"


def test_expression_errors_are_written_in_portuguese(
    client: TestClient, db_session: Session
) -> None:
    ids = _ids(db_session)
    for expression, expected in [
        ("densidade /", "Sintaxe inválida"),
        ("densidade > 3", "Construção não permitida"),
        ("inexistente / densidade", "Variáveis desconhecidas"),
        ("densidade + modulo_young", "dimensionalmente inconsistente"),
    ]:
        res = _post(client, material_ids=ids, computed=[{"expression": expression}])
        assert res.status_code == 400, expression
        detail = res.json()["detail"]
        assert expected in detail
        assert "invalid syntax" not in detail
        assert "Compare" not in detail


def test_computed_unknown_property_is_refused(client: TestClient, db_session: Session) -> None:
    res = _post(
        client, material_ids=_ids(db_session), computed=[{"expression": "inexistente / densidade"}]
    )
    assert res.status_code == 400


def test_computed_is_capped() -> None:
    with pytest.raises(PydanticValidationError):
        CompareRequest(
            material_ids=[1],
            property_slugs=["a"],
            computed=[{"expression": "a"}] * 11,
        )


def test_ceiling_is_unchanged() -> None:
    from app.schemas.charts import MAX_COMPARE_MATERIALS, MAX_COMPARE_PROPERTIES

    assert (MAX_COMPARE_MATERIALS, MAX_COMPARE_PROPERTIES) == (60, 20)
