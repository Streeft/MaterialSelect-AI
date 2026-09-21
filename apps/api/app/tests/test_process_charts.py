"""Testes unitários e de integração para o Mapa de Atributos de Processo (Ashby para processos).

Verifica:
- Plotagem de processos nos eixos X e Y a partir de ProcessAttributeValue
- Tratamento de valores escalares e envelopes (mínimo, máximo e típico)
- Regra D-59: rejeição de atributos DISCRETO em eixos contínuos de dispersão
- Rejeição de índices de mérito analíticos no universo de processos
- Ausência de valor (D-24): processos sem valor para qualquer dos eixos são excluídos com
  justificativa descritiva, nunca plotados na origem
- Filtros por família de processo (ProcessClass) e por process_ids
- Envelopes por família de processo
- Não regressão do universo de materiais
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models.enums import BetterDirection, DataQuality, ProcessAttributeKind
from app.models.process import Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue

MAP_URL = "/api/charts/property-map"
NS = "teste-proc-map"

MASSA_SLUG = f"{NS}-massa"
LOTE_SLUG = f"{NS}-lote"
FORMA_SLUG = f"{NS}-forma"


@pytest.fixture()
def process_map_fixture(db_session) -> dict[str, int]:
    """Cria uma taxonomia de teste com 2 famílias, 3 processos e 3 atributos:
    - MASSA_SLUG: ENVELOPE (kg)
    - LOTE_SLUG: ESCALAR (adimensional)
    - FORMA_SLUG: DISCRETO (rótulos)
    """
    family1 = ProcessClass(name="Família Conformação", slug=f"{NS}-conformacao")
    family2 = ProcessClass(name="Família Usinagem", slug=f"{NS}-usinagem")
    db_session.add_all([family1, family2])
    db_session.flush()

    injecao = Process(name="Injeção Termoplástica", slug=f"{NS}-injecao", class_id=family1.id)
    soprada = Process(name="Moldagem por Sopro", slug=f"{NS}-sopro", class_id=family1.id)
    fresamento = Process(name="Fresamento CNC", slug=f"{NS}-fresamento", class_id=family2.id)
    sem_dados = Process(
        name="Processo Experimental", slug=f"{NS}-experimental", class_id=family2.id
    )
    db_session.add_all([injecao, soprada, fresamento, sem_dados])
    db_session.flush()

    massa_attr = ProcessAttributeDefinition(
        name="Faixa de massa",
        slug=MASSA_SLUG,
        kind=ProcessAttributeKind.ENVELOPE,
        physical_dimension="[mass]",
        canonical_unit="kg",
        accepted_units=["kg", "g"],
        allowed_labels=[],
        better_direction=BetterDirection.NEUTRAL,
    )
    lote_attr = ProcessAttributeDefinition(
        name="Lote econômico",
        slug=LOTE_SLUG,
        kind=ProcessAttributeKind.ESCALAR,
        physical_dimension="",
        canonical_unit="dimensionless",
        accepted_units=["dimensionless"],
        allowed_labels=[],
        better_direction=BetterDirection.LOWER,
    )
    forma_attr = ProcessAttributeDefinition(
        name="Forma do componente",
        slug=FORMA_SLUG,
        kind=ProcessAttributeKind.DISCRETO,
        physical_dimension="",
        canonical_unit=None,
        accepted_units=[],
        allowed_labels=["Maciço 3D", "Oco 3D", "Prismático"],
        better_direction=BetterDirection.NEUTRAL,
    )
    db_session.add_all([massa_attr, lote_attr, forma_attr])
    db_session.flush()

    db_session.add_all(
        [
            # Injeção: massa 0.1 a 10 kg (typical 5.0), lote 10000
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=massa_attr.id,
                value_min=0.1,
                value_max=10.0,
                value_typical=5.0,
                normalized_value=5.0,
                normalized_min=0.1,
                normalized_max=10.0,
                original_unit="kg",
                canonical_unit="kg",
                conversion_method="identity:kg",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=lote_attr.id,
                value_scalar=10000.0,
                normalized_value=10000.0,
                original_unit="dimensionless",
                canonical_unit="dimensionless",
                conversion_method="identity:dimensionless",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=injecao.id,
                attribute_id=forma_attr.id,
                labels=["Maciço 3D", "Oco 3D"],
                data_quality=DataQuality.ESTIMADO,
            ),
            # Sopro: massa 0.05 a 5 kg (typical 2.5), lote 5000
            ProcessAttributeValue(
                process_id=soprada.id,
                attribute_id=massa_attr.id,
                value_min=0.05,
                value_max=5.0,
                value_typical=2.5,
                normalized_value=2.5,
                normalized_min=0.05,
                normalized_max=5.0,
                original_unit="kg",
                canonical_unit="kg",
                conversion_method="identity:kg",
                data_quality=DataQuality.ESTIMADO,
            ),
            ProcessAttributeValue(
                process_id=soprada.id,
                attribute_id=lote_attr.id,
                value_scalar=5000.0,
                normalized_value=5000.0,
                original_unit="dimensionless",
                canonical_unit="dimensionless",
                conversion_method="identity:dimensionless",
                data_quality=DataQuality.ESTIMADO,
            ),
            # Fresamento: massa 0.01 a 50 kg (typical 10.0), lote 10
            ProcessAttributeValue(
                process_id=fresamento.id,
                attribute_id=massa_attr.id,
                value_min=0.01,
                value_max=50.0,
                value_typical=10.0,
                normalized_value=10.0,
                normalized_min=0.01,
                normalized_max=50.0,
                original_unit="kg",
                canonical_unit="kg",
                conversion_method="identity:kg",
                data_quality=DataQuality.MEDIDO,
            ),
            ProcessAttributeValue(
                process_id=fresamento.id,
                attribute_id=lote_attr.id,
                value_scalar=10.0,
                normalized_value=10.0,
                original_unit="dimensionless",
                canonical_unit="dimensionless",
                conversion_method="identity:dimensionless",
                data_quality=DataQuality.MEDIDO,
            ),
            # sem_dados tem massa explicitamente ausente e sem linha de lote
            ProcessAttributeValue(
                process_id=sem_dados.id,
                attribute_id=massa_attr.id,
                is_missing=True,
                data_quality=DataQuality.ESTIMADO,
            ),
        ]
    )
    db_session.flush()

    return {
        "injecao_id": injecao.id,
        "soprada_id": soprada.id,
        "fresamento_id": fresamento.id,
        "sem_dados_id": sem_dados.id,
    }


class TestProcessPropertyMap:
    def test_plots_processes_with_both_axes(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["plotted_count"] == 3
        # Considered count inclui os 4 da fixture mais quaisquer outros processos ativos já semeados
        assert data["considered_count"] >= 4

        # O processo sem_dados deve estar em excluded com justificativa descritiva
        excluded = next(
            (
                e
                for e in data["excluded"]
                if e["material_id"] == process_map_fixture["sem_dados_id"]
            ),
            None,
        )
        assert excluded is not None
        assert "Sem valor para" in excluded["reason"]

    def test_axes_carry_canonical_units_and_correct_bounds(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
        }
        data = client.post(MAP_URL, json=payload).json()
        assert data["x_axis"]["property_slug"] == MASSA_SLUG
        assert data["x_axis"]["unit"] == "kg"
        assert data["y_axis"]["property_slug"] == LOTE_SLUG
        assert data["y_axis"]["unit"] == "dimensionless"

        injecao_pt = next(
            p
            for p in data["points"]
            if p["material_id"] == process_map_fixture["injecao_id"]
        )
        assert injecao_pt["material_name"] == "Injeção Termoplástica"
        assert injecao_pt["record_id"] == process_map_fixture["injecao_id"]
        assert injecao_pt["x"] == 5.0
        assert injecao_pt["x_min"] == 0.1
        assert injecao_pt["x_max"] == 10.0
        assert injecao_pt["x_is_interval"] is True
        assert injecao_pt["y"] == 10000.0
        assert injecao_pt["y_is_interval"] is False

    def test_rejects_discrete_attribute_rule_d59(
        self, client: TestClient, process_map_fixture
    ) -> None:
        """Regra D-59: Atributos discretos não podem compor eixos contínuos de dispersão."""
        payload = {
            "universe": "process",
            "x": FORMA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 400
        assert "DISCRETO" in res.json()["detail"]
        assert "Regra D-59" in res.json()["detail"]

        payload_y = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": FORMA_SLUG,
            "scale": "linear",
        }
        res_y = client.post(MAP_URL, json=payload_y)
        assert res_y.status_code == 400
        assert "DISCRETO" in res_y.json()["detail"]

    def test_rejects_indices_in_process_universe(
        self, client: TestClient, process_map_fixture
    ) -> None:
        """Fórmulas analíticas de Ashby aplicam-se a materiais; o plano de processos não suporta índices."""
        payload_overlay = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "log",
            "index": {"expression": "x / y", "goal": "maximize"},
        }
        res = client.post(MAP_URL, json=payload_overlay)
        assert res.status_code == 400
        assert (
            "Índices de mérito não são suportados no universo de processos"
            in res.json()["detail"]
        )

        payload_axis_index = {
            "universe": "process",
            "x_index": {"expression": "x / y", "goal": "maximize"},
            "y": LOTE_SLUG,
            "scale": "log",
        }
        res_axis = client.post(MAP_URL, json=payload_axis_index)
        assert res_axis.status_code == 400
        assert (
            "Índices de mérito não são suportados no universo de processos"
            in res_axis.json()["detail"]
        )

    def test_filters_by_process_class(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
            "class_slugs": [f"{NS}-conformacao"],
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["plotted_count"] == 2
        assert {p["material_id"] for p in data["points"]} == {
            process_map_fixture["injecao_id"],
            process_map_fixture["soprada_id"],
        }

    def test_unknown_process_class_is_404(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
            "class_slugs": ["classe-fantasma"],
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 404

    def test_filters_by_process_ids(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
            "process_ids": [process_map_fixture["fresamento_id"]],
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["plotted_count"] == 1
        assert data["points"][0]["material_id"] == process_map_fixture["fresamento_id"]

    def test_unknown_process_attribute_is_404(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": "atributo-inexistente",
            "scale": "linear",
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 404
        assert "não encontrado" in res.json()["detail"]

    def test_material_property_in_process_universe_is_404(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": "densidade",
            "y": LOTE_SLUG,
            "scale": "linear",
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 404

    def test_envelopes_calculated_for_process_classes(
        self, client: TestClient, process_map_fixture
    ) -> None:
        payload = {
            "universe": "process",
            "x": MASSA_SLUG,
            "y": LOTE_SLUG,
            "scale": "linear",
            "include_envelopes": True,
        }
        res = client.post(MAP_URL, json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert len(data["envelopes"]) >= 2
        envelopes_by_slug = {e["class_slug"]: e for e in data["envelopes"]}
        assert f"{NS}-conformacao" in envelopes_by_slug
        assert envelopes_by_slug[f"{NS}-conformacao"]["point_count"] == 2
