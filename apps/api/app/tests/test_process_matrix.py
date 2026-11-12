"""Material family × process matrix and its capability filters (D-219).

Runs on the seeded demo universe: the assertions are properties of the answer
(every kept process reaches the value, the counts add up, a unit is converted
by ``units.py``), not statements about particular seed numbers.
"""

from __future__ import annotations


def _matrix(client, **params):
    resp = client.get("/api/processes/matrix", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_the_matrix_counts_materials_per_root_family(client) -> None:
    data = _matrix(client)
    listed = client.get("/api/processes").json()

    assert data["columns"], "the matrix needs material families as columns"
    assert len(data["rows"]) == len(listed)
    slugs = {c["slug"] for c in data["columns"]}
    for row in data["rows"]:
        assert set(row["counts"]) <= slugs
        # Every cell is a count of materials; the row total is the process's own join.
        assert sum(row["counts"].values()) == row["process"]["material_count"]
    assert any(row["counts"] for row in data["rows"])


def test_a_mass_filter_keeps_only_processes_whose_envelope_reaches_it(client) -> None:
    everything = _matrix(client)
    data = _matrix(client, massa=5)

    assert 0 < len(data["rows"]) < len(everything["rows"])
    for row in data["rows"]:
        assert row["mass"]["minimum"] <= 5 <= row["mass"]["maximum"]
        assert row["mass"]["unit"] == "kg"
    dropped = len(everything["rows"]) - len(data["rows"])
    # Dropped = out of range + without data; the latter is reported, never read as 0.
    assert data["without_data"].get("massa", 0) <= dropped


def test_the_unit_is_converted_by_the_backend(client) -> None:
    in_kg = _matrix(client, massa=5)
    in_g = _matrix(client, massa=5000, massa_unidade="g")
    assert [r["process"]["slug"] for r in in_g["rows"]] == [
        r["process"]["slug"] for r in in_kg["rows"]
    ]

    in_mm = _matrix(client, espessura=2)
    in_cm = _matrix(client, espessura=0.2, espessura_unidade="cm")
    assert [r["process"]["slug"] for r in in_mm["rows"]] == [
        r["process"]["slug"] for r in in_cm["rows"]
    ]


def test_the_economic_batch_filter_means_pays_off_from_at_most_n(client) -> None:
    data = _matrix(client, lote=1000)
    assert data["rows"]
    for row in data["rows"]:
        assert row["batch"] is not None and row["batch"] <= 1000


def test_a_missing_value_is_not_zero(client) -> None:
    # A filter asking for the smallest possible batch must not admit a process
    # whose batch nobody recorded.
    data = _matrix(client, lote=0)
    assert all(row["batch"] is not None for row in data["rows"])


def test_a_wrong_unit_or_a_negative_value_is_refused(client) -> None:
    assert (
        client.get("/api/processes/matrix", params={"massa": 1, "massa_unidade": "m"}).status_code
        == 400
    )
    assert client.get("/api/processes/matrix", params={"massa": -1}).status_code == 422


def test_the_matrix_needs_a_session(anon_client) -> None:
    assert anon_client.get("/api/processes/matrix").status_code == 401
