"""Varredura de família (D-144): a grade, o índice por passo e as ausências.

As leis estão provadas em ``test_synthesis.py``. O que se prova aqui é o que a
varredura acrescenta: que a grade sai por índice e devolve os extremos exatos,
que o teto vale, que um passo é exatamente a síntese daquela receita, e que um
passo sem índice diz por quê — nunca zero, nunca silêncio.
"""

from __future__ import annotations

import math

import pytest

from app.calculations.family_sweep import (
    FRACAO_VOLUMETRICA,
    LINEAR,
    LOGARITMICA,
    MAX_STEPS,
    RAZAO_NUCLEO_FACE,
    sweep_family,
    sweep_grid,
)
from app.calculations.synthesis import (
    COMPOSITO,
    DENSIDADE,
    ESPUMA,
    PAINEL,
    ParentValue,
    SynthesisError,
    synthesize_composite,
    synthesize_sandwich,
)
from app.models.enums import DataQuality

_E_FACE = 70.0e9
_E_NUCLEO = 0.1e9
_RHO_FACE = 2700.0
_RHO_NUCLEO = 60.0

_E_FIBRA = 230.0e9
_E_MATRIZ = 3.5e9
_RHO_FIBRA = 1800.0
_RHO_MATRIZ = 1200.0


def _p(value: float, quality: DataQuality = DataQuality.MEDIDO) -> ParentValue:
    return ParentValue(value=value, quality=quality)


def _face(**overrides) -> dict[str, ParentValue]:
    values = {"modulo_young": _p(_E_FACE), DENSIDADE: _p(_RHO_FACE)}
    values.update(overrides)
    return values


def _nucleo(**overrides) -> dict[str, ParentValue]:
    values = {"modulo_young": _p(_E_NUCLEO), DENSIDADE: _p(_RHO_NUCLEO)}
    values.update(overrides)
    return values


def _fibra() -> dict[str, ParentValue]:
    return {"modulo_young": _p(_E_FIBRA), DENSIDADE: _p(_RHO_FIBRA)}


def _matriz() -> dict[str, ParentValue]:
    return {"modulo_young": _p(_E_MATRIZ), DENSIDADE: _p(_RHO_MATRIZ)}


def _panel(**overrides):
    args = {
        "kind": PAINEL,
        "start": 2.0,
        "stop": 40.0,
        "steps": 12,
        "spacing": LINEAR,
        "first": _face(),
        "second": _nucleo(),
        "expression": "cbrt(modulo_young) / densidade",
    }
    args.update(overrides)
    return sweep_family(**args)


def _composite(**overrides):
    args = {
        "kind": COMPOSITO,
        "start": 0.1,
        "stop": 0.7,
        "steps": 7,
        "spacing": LINEAR,
        "first": _fibra(),
        "second": _matriz(),
        "expression": "modulo_young / densidade",
    }
    args.update(overrides)
    return sweep_family(**args)


# --- a grade ----------------------------------------------------------------


def test_a_grade_devolve_os_extremos_exatamente_como_pedidos() -> None:
    """Uma soma acumulada de 0,1 não chega em 0,9; a grade por índice chega."""
    grid = sweep_grid(start=0.1, stop=0.9, steps=9, spacing=LINEAR)

    assert grid[0] == 0.1
    assert grid[-1] == 0.9
    assert len(grid) == 9


def test_cada_ponto_sai_da_sua_posicao_e_nao_do_vizinho() -> None:
    """O ponto ``i`` é a fórmula fechada de ``i`` — e não a soma de ``i`` passos.

    A diferença é exatamente o que a regra protege: somar o passo 0,1 nove
    vezes dá 0,9999999999999999, e numa fração isso é o ponto que escapa (ou
    não) do intervalo aberto por acaso de arredondamento.
    """
    start, stop, steps = 0.1, 1.0, 10
    grid = sweep_grid(start=start, stop=stop, steps=steps, spacing=LINEAR)

    for i, x in enumerate(grid):
        assert x == pytest.approx(start + (stop - start) * i / (steps - 1), rel=1e-15)
    accumulated = start
    for _ in range(steps - 1):
        accumulated += (stop - start) / (steps - 1)
    assert accumulated != stop  # a soma erra o último ponto…
    assert grid[-1] == stop  # …e a grade não


def test_uma_fracao_perto_de_um_nunca_escapa_do_intervalo() -> None:
    grid = sweep_grid(start=0.5, stop=0.99, steps=MAX_STEPS, spacing=LINEAR)

    assert all(0 < x < 1 for x in grid)
    assert grid[-1] == 0.99
    assert all(a < b for a, b in zip(grid, grid[1:], strict=False))


def test_a_grade_logaritmica_tem_razao_constante_entre_vizinhos() -> None:
    grid = sweep_grid(start=1.0, stop=1000.0, steps=4, spacing=LOGARITMICA)

    assert grid[0] == 1.0
    assert grid[-1] == 1000.0
    assert grid[1] == pytest.approx(10.0, rel=1e-12)
    assert grid[2] == pytest.approx(100.0, rel=1e-12)


@pytest.mark.parametrize("steps", [MAX_STEPS + 1, 1, 0, -3])
def test_o_numero_de_passos_tem_teto_e_piso(steps: int) -> None:
    with pytest.raises(SynthesisError, match="passos"):
        sweep_grid(start=1.0, stop=2.0, steps=steps, spacing=LINEAR)


def test_o_teto_cabe_inteiro() -> None:
    result = _panel(steps=MAX_STEPS)

    assert len(result.grid) == MAX_STEPS
    assert len(result.steps) + len(result.skipped) == MAX_STEPS


@pytest.mark.parametrize(
    ("start", "stop"),
    [
        (0.0, 2.0),
        (-1.0, 2.0),
        (2.0, 2.0),
        (3.0, 2.0),
        (1.0, math.inf),
        (math.nan, 2.0),
    ],
)
def test_extremos_invalidos_sao_recusados(start: float, stop: float) -> None:
    with pytest.raises(SynthesisError):
        sweep_grid(start=start, stop=stop, steps=5, spacing=LINEAR)


def test_espacamento_desconhecido_e_recusado() -> None:
    with pytest.raises(SynthesisError, match="Espaçamento"):
        sweep_grid(start=1.0, stop=2.0, steps=5, spacing="quadratico")


def test_faixa_estreita_demais_para_os_passos_e_recusada_e_nao_repete_ponto() -> None:
    with pytest.raises(SynthesisError, match="estreita"):
        sweep_grid(start=1.0, stop=1.0 + 1e-15, steps=MAX_STEPS, spacing=LINEAR)


def test_a_fracao_do_composito_nao_chega_em_um() -> None:
    with pytest.raises(SynthesisError, match="entre 0 e 1"):
        _composite(stop=1.0)


def test_a_espuma_nao_varre() -> None:
    with pytest.raises(SynthesisError, match="painel sanduíche"):
        sweep_family(
            kind=ESPUMA,
            start=0.1,
            stop=0.5,
            steps=3,
            spacing=LINEAR,
            first=_face(),
            second={},
            expression="densidade",
        )


# --- o passo é a síntese ----------------------------------------------------


def test_e_deterministica() -> None:
    assert _panel() == _panel()
    assert _composite() == _composite()


def test_cada_passo_do_painel_e_a_sintese_daquela_razao() -> None:
    """O mesmo número que a prévia daria, e para qualquer par com a mesma razão."""
    result = _panel(steps=5)

    for step in result.steps:
        ratio = step.parameter
        assert step.parameters[RAZAO_NUCLEO_FACE] == ratio
        assert step.parameters["fracao_faces"] == pytest.approx(2.0 / (ratio + 2.0))
        for t in (1.0, 3.0):
            alone = synthesize_sandwich(
                face_thickness=t, core_thickness=t * ratio, face=_face(), core=_nucleo()
            )
            values = {v.slug: v.value for v in alone.values}
            expected = values["modulo_young"] ** (1 / 3) / values[DENSIDADE]
            assert step.index_value == pytest.approx(expected, rel=1e-12)


def test_o_painel_tem_um_otimo_dentro_da_faixa() -> None:
    """A razão que motiva a varredura: E^(1/3)/ρ do painel não é monótono em c/t.

    Núcleo fino demais é quase a face maciça (pesada); grosso demais, quase o
    núcleo (mole). O melhor fica no meio — e é isso que a figura mostra.
    """
    result = _panel(start=0.5, stop=500.0, steps=30, spacing=LOGARITMICA)
    values = [step.index_value for step in result.steps]

    best = max(range(len(values)), key=values.__getitem__)
    assert 0 < best < len(values) - 1


def test_cada_passo_do_composito_e_a_sintese_daquela_fracao() -> None:
    result = _composite(steps=4)

    for step in result.steps:
        alone = synthesize_composite(fraction=step.parameter, first=_fibra(), second=_matriz())
        assert step.parameters == {FRACAO_VOLUMETRICA: step.parameter}
        assert step.synthesis == alone


# --- ausência: nunca zero, nunca silêncio -----------------------------------


def test_painel_sem_resistencia_sintetizada_exclui_o_indice_que_a_le() -> None:
    """Cada passo sai em ``skipped`` com o motivo do Synthesizer, e nenhum vira 0."""
    result = _panel(expression="limite_escoamento / densidade", steps=6)

    assert result.steps == ()
    assert len(result.skipped) == 6
    assert [item.position for item in result.skipped] == list(range(6))
    for item in result.skipped:
        assert "limite_escoamento" in item.reason
        assert "modos de falha" in item.reason


def test_a_frase_de_ausencia_usa_o_nome_da_propriedade() -> None:
    result = _panel(
        expression="limite_escoamento / densidade",
        steps=2,
        labels={"limite_escoamento": "Limite de escoamento"},
    )

    assert result.skipped[0].reason.startswith("O índice lê Limite de escoamento")


def test_a_falta_de_dado_no_pai_nomeia_o_pai() -> None:
    face = _face()
    del face["modulo_young"]
    result = _panel(first=face, steps=3)

    assert result.steps == ()
    assert all("A face não tem modulo_young" in item.reason for item in result.skipped)


def test_propriedade_sem_regra_nem_motivo_declarado_tambem_e_escrita() -> None:
    result = _panel(expression="fator_qualquer * densidade", steps=2)

    assert all("não tem regra de síntese" in item.reason for item in result.skipped)


def test_aritmetica_que_falha_vira_motivo_e_nao_zero() -> None:
    result = _panel(expression="densidade / (densidade - densidade)", steps=3)

    assert result.steps == ()
    assert all(item.reason.startswith("O índice não se calcula") for item in result.skipped)


def test_as_ausencias_da_familia_vem_com_o_motivo() -> None:
    result = _panel()

    absent = {item.slug: item.reason for item in result.absent}
    assert "modos de falha" in absent["limite_escoamento"]
    assert "anisotrópico" in absent["condutividade_termica"]
    assert "modulo_young" not in absent


# --- par de limites ---------------------------------------------------------


def test_o_modulo_do_composito_gera_um_par_de_indices() -> None:
    """Reuss e Voigt entram como par, e o índice sai como par — nunca a média."""
    result = _composite(steps=3)

    for step in result.steps:
        f = step.parameter
        voigt = f * _E_FIBRA + (1 - f) * _E_MATRIZ
        reuss = 1 / (f / _E_FIBRA + (1 - f) / _E_MATRIZ)
        rho = f * _RHO_FIBRA + (1 - f) * _RHO_MATRIZ
        assert step.index_value is None
        assert step.index_min == pytest.approx(reuss / rho)
        assert step.index_max == pytest.approx(voigt / rho)


def test_o_par_respeita_o_sentido_do_indice() -> None:
    """Num índice que cai com E, o mínimo vem de Voigt; o canto decide, não o nome."""
    result = _composite(expression="densidade / modulo_young", steps=2)

    for step in result.steps:
        f = step.parameter
        voigt = f * _E_FIBRA + (1 - f) * _E_MATRIZ
        rho = f * _RHO_FIBRA + (1 - f) * _RHO_MATRIZ
        assert step.index_min == pytest.approx(rho / voigt)


def test_par_de_limites_em_indice_que_nao_e_lei_de_potencia_e_recusado() -> None:
    result = _composite(expression="abs(modulo_young) / densidade", steps=3)

    assert result.steps == ()
    assert all("lei de potência" in item.reason for item in result.skipped)


def test_indice_sem_o_modulo_no_composito_sai_escalar() -> None:
    result = _composite(expression="densidade", steps=3)

    assert all(step.index_value is not None for step in result.steps)
    assert all(step.index_min is None and step.index_max is None for step in result.steps)


# --- qualidade --------------------------------------------------------------


def test_o_passo_herda_a_pior_qualidade_do_que_o_indice_leu() -> None:
    nucleo = _nucleo(modulo_young=_p(_E_NUCLEO, DataQuality.ESTIMADO))
    result = _panel(second=nucleo, expression="cbrt(modulo_young) / densidade", steps=2)
    only_density = _panel(second=nucleo, expression="densidade", steps=2)

    assert {step.quality for step in result.steps} == {DataQuality.ESTIMADO}
    assert {step.quality for step in only_density.steps} == {DataQuality.MEDIDO}


# --- o painel degenerado ----------------------------------------------------


def test_nas_pontas_da_razao_o_painel_e_a_face_e_o_nucleo() -> None:
    """As mesmas degenerescências de ``test_synthesis``, agora como pontas da grade.

    c/t → 0 devolve ``Ef``; c/t → ∞ devolve ``Ec``. A ponta do núcleo converge
    com ``t·Ef/(c·Ec)`` (ver o teste da síntese), por isso a razão vai a 1e12.
    """
    result = _panel(start=1e-9, stop=1e12, steps=3, spacing=LOGARITMICA, expression="modulo_young")

    first, *_, last = result.steps
    assert first.index_value == pytest.approx(_E_FACE, rel=1e-6)
    assert last.index_value == pytest.approx(_E_NUCLEO, rel=1e-7)
    values = [step.index_value for step in result.steps]
    assert values == sorted(values, reverse=True)
