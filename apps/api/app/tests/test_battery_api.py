"""API integration tests for Battery Designer endpoints (Module S / P4)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_chemistries(client: TestClient) -> None:
    """GET /api/baterias/quimicas returns all 9 catalogued battery chemistries."""
    response = client.get("/api/baterias/quimicas")
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data) == 9
    slugs = {item["slug"] for item in data}
    assert "lfp" in slugs
    assert "nmc_811" in slugs
    assert "sodio_ion" in slugs
    assert "lto" in slugs


def test_get_chemistry_detail(client: TestClient) -> None:
    """GET /api/baterias/quimicas/{slug} returns detailed data or 404."""
    response = client.get("/api/baterias/quimicas/lfp")
    assert response.status_code == 200, response.text
    lfp = response.json()
    assert lfp["slug"] == "lfp"
    assert lfp["nominal_voltage"] == 3.2
    assert lfp["thermal_safety"] == "ALTA"
    assert len(lfp["advantages"]) > 0

    response_404 = client.get("/api/baterias/quimicas/inexistente")
    assert response_404.status_code == 404


def test_list_archetypes(client: TestClient) -> None:
    """GET /api/baterias/arquetipos returns standard presets."""
    response = client.get("/api/baterias/arquetipos")
    assert response.status_code == 200, response.text
    archetypes = response.json()
    assert len(archetypes) == 6
    slugs = {item["slug"] for item in archetypes}
    assert "ve_urbano" in slugs
    assert "drone_uav" in slugs
    assert "bess_industrial" in slugs


def test_design_pack_endpoint_success(client: TestClient) -> None:
    """POST /api/baterias/dimensionar computes pack configuration deterministically."""
    payload = {
        "chemistry_slug": "nmc_622",
        "target_voltage_v": 400.0,
        "target_energy_kwh": 50.0,
        "target_power_kw": 120.0,
        "dod": 0.85,
        "cell_capacity_ah": 50.0,
        "mass_packing_factor": 0.70,
        "volume_packing_factor": 0.60,
    }
    response = client.post("/api/baterias/dimensionar", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()

    assert result["chemistry"]["slug"] == "nmc_622"
    assert result["series_cells_ns"] > 0
    assert result["parallel_strings_np"] > 0
    assert result["total_cells"] == result["series_cells_ns"] * result["parallel_strings_np"]
    assert result["nominal_voltage_v"] >= 400.0
    assert result["usable_energy_kwh"] >= 50.0
    assert result["pack_mass_kg"] > result["cells_mass_kg"]
    assert result["pack_volume_l"] > result["cells_volume_l"]
    assert result["pack_cost_total_usd"] > 0.0
    assert len(result["thermal_guidelines"]) > 0


def test_design_pack_endpoint_validation(client: TestClient) -> None:
    """POST /api/baterias/dimensionar refuses invalid or non-finite inputs."""
    # Unknown chemistry -> 400 (ValidationError)
    response_unknown = client.post(
        "/api/baterias/dimensionar",
        json={
            "chemistry_slug": "quimica_invalida",
            "target_voltage_v": 400.0,
            "target_energy_kwh": 50.0,
            "target_power_kw": 100.0,
        },
    )
    # 404 e não 400: a receita está bem formada; o que não existe é a química.
    # Dizer "inválido" mandaria o leitor conferir o que ele digitou certo.
    assert response_unknown.status_code == 404

    # Non-positive voltage -> 422
    response_neg_v = client.post(
        "/api/baterias/dimensionar",
        json={
            "chemistry_slug": "lfp",
            "target_voltage_v": -400.0,
            "target_energy_kwh": 50.0,
            "target_power_kw": 100.0,
        },
    )
    assert response_neg_v.status_code == 422


def test_compare_chemistries_endpoint(client: TestClient) -> None:
    """POST /api/baterias/comparar evaluates all 9 chemistries under identical requirements."""
    payload = {
        "target_voltage_v": 400.0,
        "target_energy_kwh": 60.0,
        "target_power_kw": 150.0,
        "dod": 0.85,
    }
    response = client.post("/api/baterias/comparar", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert len(data["items"]) == 9
    assert data["lightest_slug"] in ("nmc_811", "nca")
    assert data["safest_slug"] == "lto"
    assert data["technical_summary"]


# --- o catálogo semeado, que é o que o P4 tirou de dentro do código ----------


def test_as_nove_quimicas_vem_do_catalogo_e_nao_do_codigo(client: TestClient) -> None:
    """A razão de existir da tabela: nenhum destes números é literal Python.

    Se alguém reintroduzir um dicionário de químicas na camada de cálculo, este
    teste continua passando — mas o de proveniência abaixo não, porque um
    literal não tem citação nem fonte. Os dois juntos é que fecham a porta.
    """
    response = client.get("/api/baterias/quimicas")

    assert response.status_code == 200, response.text
    body = response.json()
    assert {item["slug"] for item in body} == {
        "lfp",
        "nmc_622",
        "nmc_811",
        "nca",
        "lco",
        "lto",
        "sodio_ion",
        "chumbo_acido",
        "nimh",
    }


def test_toda_quimica_declara_de_onde_veio(client: TestClient) -> None:
    """Princípio 1 + M1: o número tem procedência, e ela chega ao leitor.

    A citação é **por linha** porque as nove não saíram do mesmo lugar; a fonte
    é a do conjunto compilado, e é ela que carrega a licença.
    """
    body = client.get("/api/baterias/quimicas").json()

    for item in body:
        assert item["citation"], item["slug"]
        assert item["source"] == "Literatura de baterias (compilação)", item["slug"]

    # E as citações são de fato distintas — um rótulo único para as nove seria
    # exatamente a informação que este campo existe para não perder.
    assert len({item["citation"] for item in body}) == len(body)


def test_o_catalogo_de_baterias_nao_se_declara_ficticio(client: TestClient) -> None:
    """Estes valores são de literatura pública, e o rótulo precisa dizer isso.

    O resto do seed é `is_demo=True` — dado inventado para demonstração. Marcar
    números reais com aquele rótulo diria ao leitor o contrário do que o M1
    existe para dizer, e é um erro que só aparece lendo a folha de fontes.
    """
    sources = {item["label"]: item for item in client.get("/api/sources").json()}

    compilacao = sources["Literatura de baterias (compilação)"]
    assert compilacao["is_demo"] is False
    assert "literatura" in compilacao["license_label"].lower()


def test_uma_quimica_inexistente_e_404_com_o_slug_escrito(client: TestClient) -> None:
    response = client.get("/api/baterias/quimicas/nao-existe")

    assert response.status_code == 404
    assert "nao-existe" in response.json()["detail"]
