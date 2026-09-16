"""O Synthesizer: as leis, as ausências declaradas e a qualidade propagada.

Os testes seguem as afirmações do docstring do módulo, porque são elas que
continuariam parecendo software funcionando se estivessem erradas: os números
sairiam, e seriam sobre outra coisa.
"""

from __future__ import annotations

import math

import pytest

from app.calculations.synthesis import (
    COMPOSITO,
    DENSIDADE,
    EMPIRICO,
    ESPUMA,
    EXATO,
    LIMITES,
    PAINEL,
    ParentValue,
    SynthesisError,
    reasons_for,
    rules_for,
    synthesize_composite,
    synthesize_foam,
    synthesize_sandwich,
)
from app.models.enums import DataQuality

_E_FIBRA = 230.0e9
_E_MATRIZ = 3.5e9
_RHO_FIBRA = 1800.0
_RHO_MATRIZ = 1200.0
_CUSTO_FIBRA = 30.0
_CUSTO_MATRIZ = 4.0


def _p(value: float, quality: DataQuality = DataQuality.MEDIDO) -> ParentValue:
    return ParentValue(value=value, quality=quality)


def _fibra(**overrides) -> dict[str, ParentValue]:
    values = {
        DENSIDADE: _p(_RHO_FIBRA),
        "modulo_young": _p(_E_FIBRA),
        "custo_massa": _p(_CUSTO_FIBRA),
        "temp_max_servico": _p(800.0),
    }
    values.update(overrides)
    return values


def _matriz(**overrides) -> dict[str, ParentValue]:
    values = {
        DENSIDADE: _p(_RHO_MATRIZ),
        "modulo_young": _p(_E_MATRIZ),
        "custo_massa": _p(_CUSTO_MATRIZ),
        "temp_max_servico": _p(420.0),
    }
    values.update(overrides)
    return values


def _solido(**overrides) -> dict[str, ParentValue]:
    values = {
        DENSIDADE: _p(2700.0),
        "modulo_young": _p(70.0e9),
        "limite_escoamento": _p(250.0e6),
        "custo_massa": _p(3.5),
        "temp_max_servico": _p(420.0),
    }
    values.update(overrides)
    return values


def _by_slug(result):
    return {value.slug: value for value in result.values}


def _skipped(result):
    return {item.slug: item.reason for item in result.skipped}


# --- a regra é da propriedade, não da receita -------------------------------


def test_a_densidade_mistura_por_volume_e_isso_e_exato() -> None:
    """Conservação de massa: não é modelo, é contabilidade."""
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=_matriz())
    densidade = _by_slug(result)[DENSIDADE]

    assert densidade.value == pytest.approx(0.6 * _RHO_FIBRA + 0.4 * _RHO_MATRIZ)
    assert densidade.rule.basis == EXATO


def test_o_custo_mistura_por_massa_e_nao_por_volume() -> None:
    """O erro invisível: só aparece quando as duas densidades diferem.

    Por volume daria 19,6; por massa dá 22,0. Os dois números são plausíveis, e
    apenas um é o custo de um quilograma do compósito.
    """
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=_matriz())
    custo = _by_slug(result)["custo_massa"]

    densidade = 0.6 * _RHO_FIBRA + 0.4 * _RHO_MATRIZ
    fracao_massica = 0.6 * _RHO_FIBRA / densidade
    esperado = fracao_massica * _CUSTO_FIBRA + (1 - fracao_massica) * _CUSTO_MATRIZ

    assert custo.value == pytest.approx(esperado)
    assert custo.value != pytest.approx(0.6 * _CUSTO_FIBRA + 0.4 * _CUSTO_MATRIZ)


def test_com_densidades_iguais_as_duas_fracoes_coincidem() -> None:
    """Prova de que a distinção acima é sobre densidade e não sobre a fórmula."""
    igual = _matriz(**{DENSIDADE: _p(_RHO_FIBRA)})
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=igual)

    assert _by_slug(result)["custo_massa"].value == pytest.approx(
        0.6 * _CUSTO_FIBRA + 0.4 * _CUSTO_MATRIZ
    )


def test_o_modulo_sai_como_par_de_limites_porque_depende_da_direcao() -> None:
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=_matriz())
    modulo = _by_slug(result)["modulo_young"]

    voigt = 0.6 * _E_FIBRA + 0.4 * _E_MATRIZ
    reuss = 1.0 / (0.6 / _E_FIBRA + 0.4 / _E_MATRIZ)

    assert modulo.value is None
    assert modulo.value_min == pytest.approx(reuss)
    assert modulo.value_max == pytest.approx(voigt)
    assert modulo.rule.basis == LIMITES


def test_reuss_fica_abaixo_de_voigt_em_toda_fracao() -> None:
    """Se a ordem se invertesse, o intervalo estaria de cabeça para baixo."""
    for fraction in (0.1, 0.25, 0.5, 0.75, 0.9):
        modulo = _by_slug(
            synthesize_composite(fraction=fraction, first=_fibra(), second=_matriz())
        )["modulo_young"]
        assert modulo.value_min < modulo.value_max


def test_a_temperatura_maxima_e_o_minimo_e_nao_uma_media() -> None:
    """O compósito falha quando o constituinte mais fraco falha."""
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=_matriz())
    assert _by_slug(result)["temp_max_servico"].value == pytest.approx(420.0)


# --- as ausências declaradas ------------------------------------------------


def test_um_composito_nao_tem_resistencia_sintetizada_e_diz_por_que() -> None:
    """A interface é o que decide, e é o que o catálogo não descreve."""
    result = synthesize_composite(
        fraction=0.6,
        first=_fibra(limite_escoamento=_p(3.5e9)),
        second=_matriz(limite_escoamento=_p(70.0e6)),
    )

    assert "limite_escoamento" not in _by_slug(result)
    assert "interface" in _skipped(result)["limite_escoamento"]


def test_uma_espuma_tem_resistencia_porque_o_mecanismo_e_conhecido() -> None:
    """A assimetria entre os dois tipos é o achado, não um descuido."""
    espuma = _by_slug(synthesize_foam(relative_density=0.1, solid=_solido()))
    assert "limite_escoamento" in espuma

    composito = _by_slug(
        synthesize_composite(
            fraction=0.5,
            first=_fibra(limite_escoamento=_p(1.0e9)),
            second=_matriz(limite_escoamento=_p(1.0e8)),
        )
    )
    assert "limite_escoamento" not in composito


def test_propriedade_que_falta_no_pai_e_ausencia_com_motivo_e_nunca_zero() -> None:
    sem_modulo = {k: v for k, v in _matriz().items() if k != "modulo_young"}
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=sem_modulo)

    assert "modulo_young" not in _by_slug(result)
    assert "segundo constituinte" in _skipped(result)["modulo_young"]


def test_as_duas_razoes_de_ausencia_convivem_e_cada_uma_traz_a_sua() -> None:
    """ "Ninguém catalogou no pai" e "não há regra honesta" são coisas diferentes."""
    sem_modulo = {k: v for k, v in _matriz().items() if k != "modulo_young"}
    reasons = _skipped(synthesize_composite(fraction=0.5, first=_fibra(), second=sem_modulo))

    assert "catalogado" in reasons["modulo_young"]
    assert "interface" in reasons["limite_escoamento"]


def test_o_custo_por_massa_nomeia_a_densidade_quando_ela_e_que_falta() -> None:
    """A dependência entre propriedades tem de chegar escrita ao leitor."""
    sem_densidade = {k: v for k, v in _matriz().items() if k != DENSIDADE}
    reasons = _skipped(synthesize_composite(fraction=0.6, first=_fibra(), second=sem_densidade))

    assert "densidade" in reasons["custo_massa"]
    assert "massa" in reasons["custo_massa"]


# --- a qualidade propagada --------------------------------------------------


def test_o_valor_calculado_herda_a_pior_qualidade_dos_pais() -> None:
    """Não pode ser mais confiável que o menos confiável que entrou nele."""
    result = synthesize_composite(
        fraction=0.6,
        first=_fibra(),
        second=_matriz(modulo_young=_p(_E_MATRIZ, DataQuality.ESTIMADO)),
    )
    valores = _by_slug(result)

    assert valores["modulo_young"].quality is DataQuality.ESTIMADO
    assert valores[DENSIDADE].quality is DataQuality.MEDIDO


def test_a_qualidade_e_por_valor_e_nao_por_registro() -> None:
    """Uma densidade medida não fica estimada porque o módulo era estimativa."""
    result = synthesize_composite(
        fraction=0.6,
        first=_fibra(modulo_young=_p(_E_FIBRA, DataQuality.ESTIMADO)),
        second=_matriz(),
    )
    valores = _by_slug(result)

    assert valores["modulo_young"].quality is DataQuality.ESTIMADO
    assert valores[DENSIDADE].quality is DataQuality.MEDIDO


def test_a_regra_de_massa_conta_tambem_a_qualidade_das_densidades_que_leu() -> None:
    """Ela lê quatro números; a pior qualidade é entre os quatro."""
    result = synthesize_composite(
        fraction=0.6,
        first=_fibra(**{DENSIDADE: _p(_RHO_FIBRA, DataQuality.IMPORTADO)}),
        second=_matriz(),
    )
    assert _by_slug(result)["custo_massa"].quality is DataQuality.IMPORTADO


# --- a espuma ---------------------------------------------------------------


def test_a_densidade_da_espuma_e_a_definicao_da_densidade_relativa() -> None:
    espuma = _by_slug(synthesize_foam(relative_density=0.1, solid=_solido()))
    assert espuma[DENSIDADE].value == pytest.approx(270.0)
    assert espuma[DENSIDADE].rule.basis == EXATO


def test_o_modulo_da_espuma_escala_com_o_quadrado_e_a_lei_e_empirica() -> None:
    espuma = _by_slug(synthesize_foam(relative_density=0.1, solid=_solido()))
    assert espuma["modulo_young"].value == pytest.approx(0.01 * 70.0e9)
    assert espuma["modulo_young"].rule.basis == EMPIRICO


def test_o_escoamento_da_espuma_usa_o_expoente_tres_meios_com_a_constante() -> None:
    espuma = _by_slug(synthesize_foam(relative_density=0.1, solid=_solido()))
    assert espuma["limite_escoamento"].value == pytest.approx(0.3 * math.pow(0.1, 1.5) * 250.0e6)


def test_o_que_e_por_massa_e_herdado_do_solido_e_a_regra_diz_isso() -> None:
    """Mesma substância: abrir vazios não muda o preço de um quilograma."""
    espuma = _by_slug(synthesize_foam(relative_density=0.1, solid=_solido()))
    custo = espuma["custo_massa"]

    assert custo.value == pytest.approx(3.5)
    assert custo.rule.key == "herdado"


def test_a_espuma_nao_tem_condutividade_e_o_motivo_e_o_gas() -> None:
    reasons = _skipped(synthesize_foam(relative_density=0.1, solid=_solido()))
    assert "gás" in reasons["condutividade_termica"]


def test_uma_espuma_mais_leve_e_menos_rigida_em_toda_a_faixa() -> None:
    anterior = None
    for r in (0.05, 0.1, 0.3, 0.6, 0.9):
        modulo = _by_slug(synthesize_foam(relative_density=r, solid=_solido()))[
            "modulo_young"
        ].value
        if anterior is not None:
            assert modulo > anterior
        anterior = modulo


# --- as recusas da receita --------------------------------------------------


@pytest.mark.parametrize("fraction", [0.0, 1.0, -0.2, 1.5])
def test_fracao_fora_do_intervalo_aberto_e_recusada(fraction) -> None:
    """Em 0 ou em 1 o resultado é um dos pais, e copiá-lo criaria uma segunda cópia."""
    with pytest.raises(SynthesisError, match="fração volumétrica"):
        synthesize_composite(fraction=fraction, first=_fibra(), second=_matriz())


@pytest.mark.parametrize("r", [0.0, 1.0, 1.4, -0.1])
def test_densidade_relativa_fora_do_intervalo_aberto_e_recusada(r) -> None:
    with pytest.raises(SynthesisError, match="densidade relativa"):
        synthesize_foam(relative_density=r, solid=_solido())


def test_reuss_nao_divide_por_valor_nao_positivo() -> None:
    result = synthesize_composite(
        fraction=0.5, first=_fibra(modulo_young=_p(0.0)), second=_matriz()
    )
    assert "modulo_young" not in _by_slug(result)
    assert "Reuss" in _skipped(result)["modulo_young"]


def test_um_tipo_desconhecido_e_recusado() -> None:
    with pytest.raises(SynthesisError, match="Tipo de síntese desconhecido"):
        rules_for("liga-magica")
    with pytest.raises(SynthesisError, match="Tipo de síntese desconhecido"):
        reasons_for("liga-magica")


# --- o contrato das tabelas -------------------------------------------------


@pytest.mark.parametrize("kind", [COMPOSITO, ESPUMA, PAINEL])
def test_toda_regra_escreve_a_formula_e_declara_a_base(kind) -> None:
    """O número tem de poder ser refeito à mão a partir do que a tela mostra."""
    for slug, rule in rules_for(kind).items():
        assert rule.formula, slug
        assert rule.basis in (EXATO, LIMITES, EMPIRICO), slug


@pytest.mark.parametrize("kind", [COMPOSITO, ESPUMA, PAINEL])
def test_toda_ausencia_declarada_traz_motivo(kind) -> None:
    for slug, reason in reasons_for(kind).items():
        assert len(reason) > 20, slug


@pytest.mark.parametrize("kind", [COMPOSITO, ESPUMA, PAINEL])
def test_nenhuma_propriedade_tem_regra_e_motivo_de_ausencia_ao_mesmo_tempo(kind) -> None:
    """Uma das duas estaria mentindo, e nada no caminho até a tela pegaria."""
    assert not set(rules_for(kind)) & set(reasons_for(kind))


def test_cada_valor_carrega_a_lei_que_o_produziu() -> None:
    result = synthesize_composite(fraction=0.6, first=_fibra(), second=_matriz())
    for value in result.values:
        assert value.rule.label in value.note
        assert value.rule.formula in value.note


# --- painel sanduíche: o arranjo, não a mistura -----------------------------

#: Uma face rígida e fina sobre um núcleo leve e mole — o caso que faz o
#: sanduíche existir. Números redondos de propósito: a conta tem de poder ser
#: refeita à mão a partir do que a fórmula diz.
_E_FACE = 70.0e9
_E_NUCLEO = 0.1e9
_RHO_FACE = 2700.0
_RHO_NUCLEO = 60.0
_CUSTO_FACE = 5.0
_CUSTO_NUCLEO = 20.0


def _face(quality: DataQuality = DataQuality.MEDIDO) -> dict[str, ParentValue]:
    return {
        "modulo_young": _p(_E_FACE, quality),
        DENSIDADE: _p(_RHO_FACE, quality),
        "custo_massa": _p(_CUSTO_FACE, quality),
        "temp_max_servico": _p(500.0, quality),
    }


def _nucleo(quality: DataQuality = DataQuality.MEDIDO) -> dict[str, ParentValue]:
    return {
        "modulo_young": _p(_E_NUCLEO, quality),
        DENSIDADE: _p(_RHO_NUCLEO, quality),
        "custo_massa": _p(_CUSTO_NUCLEO, quality),
        "temp_max_servico": _p(120.0, quality),
    }


def _valor(result, slug: str):
    return next(value for value in result.values if value.slug == slug)


def test_o_painel_passa_do_limite_de_voigt_e_e_por_isso_que_ele_existe() -> None:
    """A afirmação central do item: **E\* não é mistura nenhuma.**

    Voigt é o limite *superior* da regra das misturas nas mesmas frações. Se o
    módulo do painel fosse uma mistura, ele teria de ficar abaixo. Ele fica
    muito acima — 2,7× aqui —, e é exatamente essa a razão de se construir um
    painel sanduíche em vez de uma placa do mesmo par de materiais moído junto.

    Se algum dia alguém trocar esta regra por uma regra das misturas "para
    simplificar", este teste é o que cai.
    """
    t, c = 1.0, 18.0
    result = synthesize_sandwich(face_thickness=t, core_thickness=c, face=_face(), core=_nucleo())
    f = 2 * t / (c + 2 * t)
    voigt = f * _E_FACE + (1 - f) * _E_NUCLEO

    modulo = _valor(result, "modulo_young").value
    assert modulo is not None
    assert modulo > voigt
    assert modulo == pytest.approx(19.0429e9, rel=1e-4)


def test_sem_nucleo_o_painel_e_a_propria_face() -> None:
    """Degenerescência que confere a fórmula inteira: c → 0 devolve ``Ef``."""
    result = synthesize_sandwich(
        face_thickness=1.0, core_thickness=1e-9, face=_face(), core=_nucleo()
    )
    assert _valor(result, "modulo_young").value == pytest.approx(_E_FACE, rel=1e-6)


def test_sem_faces_o_painel_e_o_proprio_nucleo() -> None:
    """A outra ponta: t → 0 devolve ``Ec``, e as duas juntas fixam os três termos.

    Esta converge mais devagar que a outra, e vale saber por quê: o termo que
    sobra é ``Ef·t·c²/2`` contra ``Ec·c³/12``, então o erro relativo anda com
    ``t·Ef / (c·Ec)`` — e a face aqui é 700× mais rígida que o núcleo. Daí o
    ``t`` bem menor; afrouxar a tolerância em vez disso esconderia um erro de
    fórmula do tamanho do próprio termo.
    """
    result = synthesize_sandwich(
        face_thickness=1e-12, core_thickness=1.0, face=_face(), core=_nucleo()
    )
    assert _valor(result, "modulo_young").value == pytest.approx(_E_NUCLEO, rel=1e-7)


def test_so_a_razao_entre_as_espessuras_decide() -> None:
    """Escala self-similar não move nem ρ* nem E*.

    É esse fato que torna legítimo tratar o painel como um material: um índice
    de desempenho assume poder reescalar a seção, e sob essa liberdade o par
    (E*, ρ*) do painel não se mexe. Sem isso, plotá-lo ao lado de sólidos num
    mapa seria comparar coisas diferentes.
    """
    pequeno = synthesize_sandwich(
        face_thickness=1.0, core_thickness=18.0, face=_face(), core=_nucleo()
    )
    grande = synthesize_sandwich(
        face_thickness=1000.0, core_thickness=18000.0, face=_face(), core=_nucleo()
    )
    for slug in ("modulo_young", DENSIDADE):
        assert _valor(pequeno, slug).value == pytest.approx(_valor(grande, slug).value)


def test_a_densidade_do_painel_e_a_regra_do_composito() -> None:
    """Massa é massa: a única grandeza que o arranjo não move.

    E não é coincidência de número — é literalmente a mesma ``Rule``, o que este
    teste fixa junto com o valor.
    """
    t, c = 1.0, 18.0
    result = synthesize_sandwich(face_thickness=t, core_thickness=c, face=_face(), core=_nucleo())
    f = 2 * t / (c + 2 * t)

    densidade = _valor(result, DENSIDADE)
    assert densidade.value == pytest.approx(f * _RHO_FACE + (1 - f) * _RHO_NUCLEO)
    assert densidade.rule.key == rules_for(COMPOSITO)[DENSIDADE].key


def test_o_custo_do_painel_mistura_por_massa_e_nao_por_espessura() -> None:
    """A mesma armadilha do compósito, e aqui ela é maior.

    A face é 45× mais densa que o núcleo, então a fração mássica e a fração de
    espessura não se parecem nem de longe: usar a de espessura erraria o custo
    por quilograma em muito.
    """
    t, c = 1.0, 18.0
    result = synthesize_sandwich(face_thickness=t, core_thickness=c, face=_face(), core=_nucleo())
    f = 2 * t / (c + 2 * t)
    rho = f * _RHO_FACE + (1 - f) * _RHO_NUCLEO
    w_face = f * _RHO_FACE / rho

    esperado = w_face * _CUSTO_FACE + (1 - w_face) * _CUSTO_NUCLEO
    por_espessura = f * _CUSTO_FACE + (1 - f) * _CUSTO_NUCLEO

    assert _valor(result, "custo_massa").value == pytest.approx(esperado)
    assert esperado != pytest.approx(por_espessura)


def test_a_temperatura_de_servico_do_painel_e_a_do_elo_mais_fraco() -> None:
    result = synthesize_sandwich(
        face_thickness=1.0, core_thickness=18.0, face=_face(), core=_nucleo()
    )
    assert _valor(result, "temp_max_servico").value == pytest.approx(120.0)


def test_o_painel_nao_declara_resistencia_e_diz_por_que() -> None:
    """A recusa do D-66 aplicada a modo de falha: o mínimo sobre parte é teto.

    Escoamento da face é calculável; cisalhamento do núcleo e enrugamento da
    face não são, porque o catálogo não tem nem a resistência ao cisalhamento
    nem o módulo de cisalhamento do núcleo. Publicar só o modo que se sabe
    calcular daria um limite superior com cara de resistência.
    """
    result = synthesize_sandwich(
        face_thickness=1.0, core_thickness=18.0, face=_face(), core=_nucleo()
    )
    motivos = {item.slug: item.reason for item in result.skipped}

    assert "limite_escoamento" not in {value.slug for value in result.values}
    assert "modos de falha" in motivos["limite_escoamento"]
    assert "limite superior" in motivos["limite_escoamento"]


def test_o_painel_nao_declara_condutividade_porque_e_anisotropico() -> None:
    result = synthesize_sandwich(
        face_thickness=1.0, core_thickness=18.0, face=_face(), core=_nucleo()
    )
    motivos = {item.slug: item.reason for item in result.skipped}
    assert "anisotrópico" in motivos["condutividade_termica"]


def test_a_qualidade_do_painel_e_a_pior_dos_pais_que_a_regra_leu() -> None:
    result = synthesize_sandwich(
        face_thickness=1.0,
        core_thickness=18.0,
        face=_face(DataQuality.MEDIDO),
        core=_nucleo(DataQuality.ESTIMADO),
    )
    assert _valor(result, "modulo_young").quality is DataQuality.ESTIMADO


def test_falta_de_dado_no_nucleo_nomeia_o_nucleo() -> None:
    """ "O segundo constituinte" mandaria o leitor conferir o material errado."""
    core = _nucleo()
    del core["modulo_young"]
    result = synthesize_sandwich(face_thickness=1.0, core_thickness=18.0, face=_face(), core=core)
    motivos = {item.slug: item.reason for item in result.skipped}
    assert "núcleo" in motivos["modulo_young"]


@pytest.mark.parametrize(
    ("face", "nucleo"),
    [(0.0, 1.0), (1.0, 0.0), (-1.0, 1.0), (math.inf, 1.0)],
)
def test_espessura_nao_positiva_ou_infinita_e_recusada(face, nucleo) -> None:
    with pytest.raises(SynthesisError):
        synthesize_sandwich(
            face_thickness=face, core_thickness=nucleo, face=_face(), core=_nucleo()
        )
