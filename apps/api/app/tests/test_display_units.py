"""A unidade de leitura: o que ela resolve e o que ela não pode tocar.

O eixo destes testes é a assimetria entre guardar e ler. Guardar produz
proveniência; ler não produz fato nenhum. Cada teste abaixo fixa uma das
consequências disso.
"""

import math

import pytest

from app.calculations.units import from_canonical, to_canonical
from app.domain.display_units import (
    DisplayUnitError,
    Reading,
    parse_choices,
    reading_for,
    readings_for,
)


class _Definition:
    """O mínimo que `readings_for` pede — os quatro campos que as duas
    definições do sistema (propriedade e atributo de processo) têm em comum."""

    def __init__(self, slug, canonical_unit, display_unit=None, accepted_units=None):
        self.slug = slug
        self.canonical_unit = canonical_unit
        self.display_unit = display_unit
        self.accepted_units = accepted_units or []


def test_a_convencao_da_propriedade_vale_quando_ninguem_pede_nada():
    """Sem escolha do leitor, lê-se pela convenção da grandeza.

    É o caso que justifica a coluna existir: ninguém lê módulo de Young em
    pascal, e a tela mostrava 210000000000.
    """
    reading = reading_for(
        canonical_unit="Pa", display_unit="GPa", accepted_units=["MPa", "GPa"], requested=None
    )
    assert reading.unit == "GPa"
    assert reading.value(210e9) == pytest.approx(210.0)
    assert not reading.is_canonical


def test_sem_convencao_le_se_na_canonica():
    """`display_unit` nulo é resposta legítima, não configuração faltando.

    É o caso das adimensionais: `dureza` e `custo_massa` se leem como estão
    guardadas, e inventar uma unidade para elas seria pior que não ter nenhuma.
    """
    reading = reading_for(
        canonical_unit="dimensionless", display_unit=None, accepted_units=[], requested=None
    )
    assert reading.is_canonical
    assert reading.value(3.5) == 3.5


def test_a_escolha_do_leitor_vence_a_convencao():
    reading = reading_for(
        canonical_unit="Pa", display_unit="GPa", accepted_units=["MPa", "GPa"], requested="MPa"
    )
    assert reading.unit == "MPa"
    assert reading.value(210e9) == pytest.approx(210_000.0)


def test_unidade_fora_do_conjunto_admitido_e_recusada_com_as_admitidas_escritas():
    """Recusar, nunca ignorar — a regra do D-56.

    Ignorar devolveria a tabela na unidade errada sem avisar, e o leitor leria
    os números como se fossem os que pediu. A mensagem nomeia o que serve, para
    que a recusa seja acionável.
    """
    with pytest.raises(DisplayUnitError, match="não é admitida"):
        reading_for(canonical_unit="Pa", display_unit=None, accepted_units=["MPa"], requested="kg")

    with pytest.raises(DisplayUnitError, match="MPa"):
        reading_for(
            canonical_unit="Pa", display_unit=None, accepted_units=["MPa"], requested="furlong"
        )


def test_convencao_dimensionalmente_incompativel_e_recusada_no_catalogo():
    """Um `display_unit` semeado errado falha alto, e não em silêncio.

    Sem esta checagem, uma linha errada no seed imprimiria números plausíveis e
    falsos em toda a aplicação — a ficha, o mapa, o relatório e o laudo —, e
    nenhum deles teria como suspeitar.
    """
    with pytest.raises(DisplayUnitError, match="incompat"):
        reading_for(canonical_unit="Pa", display_unit="kg", accepted_units=[], requested=None)


def test_ausencia_atravessa_a_conversao_como_ausencia():
    """`None` entra, `None` sai — nunca `0`.

    Um zero produzido por uma camada de apresentação é ainda pior que os outros
    que o D-24 proíbe: não há proveniência nenhuma que o desminta, porque não há
    valor nenhum por trás dele.
    """
    reading = reading_for(
        canonical_unit="Pa", display_unit="GPa", accepted_units=[], requested=None
    )
    assert reading.value(None) is None


def test_escala_com_offset_converte_certo():
    """`temp_max_servico` é canônica em kelvin, e se lê em °C.

    É a única propriedade semeada cuja conversão de leitura não é uma
    multiplicação, e por isso é a que qualquer atalho quebraria.
    """
    reading = reading_for(
        canonical_unit="kelvin", display_unit="degC", accepted_units=["degC"], requested=None
    )
    assert reading.value(573.15) == pytest.approx(300.0)
    assert reading.value(273.15) == pytest.approx(0.0)


@pytest.mark.parametrize(
    ("value", "unit", "canonical"),
    [
        (210.0, "GPa", "Pa"),
        (7.85, "g/cm**3", "kg/m**3"),
        (300.0, "degC", "kelvin"),
        (450.0, "MPa", "Pa"),
    ],
)
def test_ler_e_o_inverso_exato_de_guardar(value, unit, canonical):
    """Guardar e ler o mesmo número devolve o mesmo número.

    Inclui a escala com offset de propósito: é onde um inverso escrito à mão
    erraria, e o erro seria de 273 unidades — grande demais para passar
    despercebido num teste e pequeno demais para parecer absurdo numa tela.
    """
    stored, _ = to_canonical(value, unit, canonical)
    assert from_canonical(stored, canonical, unit) == pytest.approx(value)


def test_ler_nao_produz_metodo_de_conversao():
    """A assimetria que o módulo inteiro existe para manter.

    `to_canonical` devolve um par — valor e trilha —, porque guardar cria
    proveniência. `from_canonical` devolve só o número, porque ler não cria fato
    nenhum sobre o material. Se algum dia devolvesse uma trilha, um leitor que
    troca Pa por MPa pareceria ter aplicado uma segunda conversão ao dado.
    """
    stored, method = to_canonical(210.0, "GPa", "Pa")
    assert method == "pint:GPa->Pa"
    read = from_canonical(stored, "Pa", "GPa")
    assert isinstance(read, float)


def test_o_rotulo_sai_embelezado_mas_a_unidade_permanece_a_do_pint():
    """`label` é para a tela; `unit` é o que o Pint sabe reler.

    Misturar os dois foi exatamente o erro que o B11 registrou: `kg/m³` é
    ilegível para o Pint, e um campo que precisasse ser reprocessado nunca pode
    recebê-lo.
    """
    reading = Reading(unit="kg/m**3", canonical_unit="kg/m**3")
    assert reading.label == "kg/m³"
    assert reading.unit == "kg/m**3"


def test_parse_de_escolhas_da_url():
    assert parse_choices(None) == {}
    assert parse_choices("") == {}
    assert parse_choices("modulo_young:GPa") == {"modulo_young": "GPa"}
    assert parse_choices("modulo_young:GPa, densidade:g/cm**3") == {
        "modulo_young": "GPa",
        "densidade": "g/cm**3",
    }


def test_par_malformado_na_url_e_recusado():
    """Uma URL truncada não pode virar "leia tudo em canônico" em silêncio."""
    with pytest.raises(DisplayUnitError, match="malformado"):
        parse_choices("modulo_young")
    with pytest.raises(DisplayUnitError, match="malformado"):
        parse_choices("modulo_young:")


def test_resolve_varias_definicoes_de_uma_vez():
    definitions = [
        _Definition("modulo_young", "Pa", "GPa", ["MPa", "GPa"]),
        _Definition("densidade", "kg/m**3", "g/cm**3", ["g/cm**3"]),
        _Definition("dureza", "dimensionless"),
    ]
    readings = readings_for(definitions, {"modulo_young": "MPa"})

    assert readings["modulo_young"].unit == "MPa"
    assert readings["densidade"].unit == "g/cm**3"
    assert readings["dureza"].is_canonical
    assert readings["densidade"].value(7850.0) == pytest.approx(7.85)


def test_um_valor_nao_finito_nao_atravessa_a_leitura():
    """A mesma recusa que `to_canonical` faz, pela mesma razão.

    Um infinito convertido continuaria infinito e chegaria a um eixo de gráfico,
    onde o Plotly o desenharia como nada — a figura ficaria vazia sem erro.
    """
    reading = reading_for(
        canonical_unit="Pa", display_unit="GPa", accepted_units=[], requested=None
    )
    from app.calculations.units import UnitError

    with pytest.raises(UnitError):
        reading.value(math.inf)


def test_toda_convencao_semeada_e_valida():
    """O seed não pode registrar uma convenção que o Pint não saiba converter.

    Este é o teste que a checagem dimensional de `reading_for` protege por
    dentro; aqui ele roda contra o catálogo real, que é onde um erro de digitação
    entraria. Uma convenção fora de `accepted_units` também é erro: é dela que o
    seletor da tela se alimenta, e uma unidade que o leitor vê aplicada mas não
    pode escolher de volta seria um caminho sem volta.
    """
    from app.db.seed import PROPERTIES

    conventions = [p for p in PROPERTIES if p.get("display_unit")]
    # Cinco grandezas têm convenção de leitura; as outras se leem como estão
    # guardadas. O número está fixado para que acrescentar uma passe por aqui.
    assert len(conventions) == 5

    for spec in conventions:
        reading = reading_for(
            canonical_unit=spec["canonical_unit"],
            display_unit=spec["display_unit"],
            accepted_units=spec.get("accepted_units", []),
            requested=None,
        )
        assert reading.unit == spec["display_unit"]
        assert reading.value(1.0) is not None
        assert spec["display_unit"] in spec.get("accepted_units", []), spec["slug"]


def test_o_modulo_de_young_deixa_de_ser_ilegivel():
    """O caso concreto que motivou o item, com o número que a tela mostrava."""
    from app.db.seed import PROPERTIES

    spec = next(p for p in PROPERTIES if p["slug"] == "modulo_young")
    reading = reading_for(
        canonical_unit=spec["canonical_unit"],
        display_unit=spec["display_unit"],
        accepted_units=spec["accepted_units"],
        requested=None,
    )
    assert reading.value(210_000_000_000.0) == pytest.approx(210.0)
    assert reading.label == "GPa"


def test_uma_incerteza_nao_converte_como_um_valor_absoluto():
    """±5 K lidos em °C são ±5 °C, e não ±(−268,15).

    O número errado apareceria ao lado de uma temperatura que converteu certo,
    e nada na tela pareceria fora do lugar. É a mesma razão pela qual
    `to_canonical_delta` existe na direção da entrada, e a simetria é o que
    mantém as duas contas honestas.
    """
    reading = reading_for(
        canonical_unit="kelvin", display_unit="degC", accepted_units=["degC"], requested=None
    )
    assert reading.value(573.15) == pytest.approx(300.0)
    assert reading.delta(5.0) == pytest.approx(5.0)

    # E numa escala sem offset a diferença e o valor coincidem, que é o caso
    # onde um atalho passaria despercebido.
    pressao = reading_for(
        canonical_unit="Pa", display_unit="MPa", accepted_units=["MPa"], requested=None
    )
    assert pressao.value(2e6) == pytest.approx(2.0)
    assert pressao.delta(2e6) == pytest.approx(2.0)


class _Value:
    """Uma linha de valor, na forma que `Reading.read` lê."""

    def __init__(self, **kwargs):
        self.original_unit = kwargs.get("original_unit")
        self.value_scalar = kwargs.get("value_scalar")
        self.value_min = kwargs.get("value_min")
        self.value_max = kwargs.get("value_max")
        self.value_typical = kwargs.get("value_typical")
        self.uncertainty = kwargs.get("uncertainty")


def test_a_leitura_e_acrescentada_e_nao_substitui_o_registro():
    """O contrato central do D-70, no formato em que ele chega ao schema.

    `read` devolve só os campos `display_*`. O que a fonte disse — valor e
    unidade originais — e o trilho até o canônico ficam onde estavam, porque é
    a única coisa que eles servem para dizer.
    """
    reading = reading_for(
        canonical_unit="Pa", display_unit="GPa", accepted_units=["MPa", "GPa"], requested=None
    )
    fields = reading.read(_Value(original_unit="MPa", value_scalar=210_000.0))

    assert fields["display_unit"] == "GPa"
    assert fields["display_value"] == pytest.approx(210.0)
    assert set(fields) == {
        "display_unit",
        "display_value",
        "display_min",
        "display_max",
        "display_typical",
        "display_uncertainty",
    }


def test_a_leitura_sai_da_unidade_original_e_cobre_a_faixa_inteira():
    """Os limites de uma faixa de material só existem como foram digitados.

    O canônico guardado é um só — o ponto representativo —, então converter a
    partir dele deixaria min e max de fora. Sair da original é uma regra só
    para os cinco campos, e dá o mesmo número.
    """
    reading = reading_for(
        canonical_unit="Pa", display_unit="MPa", accepted_units=["MPa", "GPa"], requested=None
    )
    fields = reading.read(
        _Value(original_unit="GPa", value_min=200.0, value_max=220.0, value_typical=210.0)
    )
    assert fields["display_min"] == pytest.approx(200_000.0)
    assert fields["display_max"] == pytest.approx(220_000.0)
    assert fields["display_typical"] == pytest.approx(210_000.0)
    assert fields["display_value"] is None


def test_dado_ausente_nao_ganha_leitura():
    """Sem unidade original não há medida, e sem medida não há o que ler.

    Todos os campos saem `None`, e nenhum sai `0` — D-24 vale aqui como em
    qualquer outro lugar.
    """
    reading = reading_for(
        canonical_unit="Pa", display_unit="GPa", accepted_units=[], requested=None
    )
    fields = reading.read(_Value())
    assert fields["display_unit"] == "GPa"
    assert all(fields[k] is None for k in fields if k != "display_unit")
