"""Varredura de família do Synthesizer: um índice ao longo de uma receita (D-144).

Uma síntese responde "qual material sai *desta* receita". A varredura responde
a pergunta seguinte, a que o projetista faz de fato: **como um índice de
desempenho anda quando a receita anda** — onde o painel sanduíche fica mais
rígido por peso, a partir de que fração de fibra o compósito deixa de compensar.
Ela não é uma lei nova: é a mesma síntese rodada numa grade de receitas, com o
mesmo avaliador de índice da seleção e dos mapas (``evaluate_index``), de modo
que um passo da varredura e um registro gravado com a mesma receita não possam
discordar.

**Só se varre o que move o material, e por isso não se varre espessura.** Num
índice de desempenho a geometria já foi eliminada: ``E^(1/2)/ρ`` é o que sobra
da massa de uma viga *depois* de a seção ter sido dimensionada para a rigidez
pedida, e o fator estrutural que ficou de fora é o mesmo para todo material.
Variar a espessura absoluta de uma peça multiplica todos os candidatos pelo
mesmo número e não muda a ordem de ninguém — uma varredura dela seria uma reta
que não responde nada. As duas variáveis aceitas são do lado do material:

* **painel:** a razão ``c/t`` entre a espessura do núcleo e a de **cada** face.
  O docstring de ``_Sandwich`` já diz por que é a razão, e não as espessuras,
  que decide: escala self-similar não move nem ``ρ*`` nem ``E*``. A varredura
  roda com ``t = 1`` e ``c = c/t``, e o resultado é o mesmo para qualquer par
  com aquela razão;
* **compósito:** a fração volumétrica do primeiro constituinte.

Três regras que a varredura não afrouxa:

1. **A grade é calculada por índice, nunca por soma acumulada.** ``x_i`` sai de
   ``i`` e dos dois extremos, e os extremos são devolvidos **exatamente** como
   foram pedidos; somar um passo de ponto flutuante ``n`` vezes erraria o último
   ponto e, numa fração perto de 1, poderia empurrá-lo para fora do intervalo.
   Linear ou logarítmica é declarado, e o teto é de ``MAX_STEPS`` passos.
2. **Passo que não tem índice sai em ``skipped`` com o motivo escrito**, nunca
   como zero e nunca omitido em silêncio. O caso que motivou a regra: o painel
   não tem resistência sintetizada (é competição entre modos de falha, ver
   ``_NO_RULE[PAINEL]``), então um índice que lê ``limite_escoamento`` não tem
   valor em passo nenhum — e cada passo diz isso, com o motivo do Synthesizer.
3. **Par de limites gera par de índices.** O módulo do compósito é o intervalo
   de Reuss a Voigt; um índice que o lê é avaliado nos cantos do intervalo e
   devolvido como ``index_min``/``index_max``, nunca como um número só. Isso só
   é exato quando o índice é **lei de potência** (monótono em cada propriedade
   positiva, então o extremo está num canto); para outra expressão o passo é
   recusado com o motivo, porque os cantos não limitariam nada.

Determinística: sem acaso, sem relógio, sem banco. As mesmas entradas devolvem
o mesmo resultado, igual campo a campo.
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Mapping
from dataclasses import dataclass

from app.calculations.expressions import ExpressionError, safe_variable, variables_in
from app.calculations.performance import evaluate_index
from app.calculations.powerlaw import as_monomial
from app.calculations.synthesis import (
    COMPOSITO,
    KIND_LABELS,
    PAINEL,
    ParentValues,
    SkippedProperty,
    SynthesisError,
    SynthesisResult,
    reasons_for,
    synthesize_composite,
    synthesize_sandwich,
    worst_quality,
)
from app.models.enums import DataQuality

#: Teto de passos. Uma figura de linha não ganha nada acima disto, e cada passo
#: é uma síntese inteira — o teto mantém a requisição barata e previsível.
MAX_STEPS = 50
#: Uma varredura de um ponto é a prévia; abaixo de dois não há linha.
MIN_STEPS = 2

#: Espaçamentos declarados da grade.
LINEAR = "linear"
LOGARITMICA = "log"
SPACINGS = (LINEAR, LOGARITMICA)

#: As variáveis varridas — uma por tipo de síntese, ambas do lado do material.
RAZAO_NUCLEO_FACE = "razao_nucleo_face"
FRACAO_VOLUMETRICA = "fracao_volumetrica"
SWEEP_VARIABLES = {PAINEL: RAZAO_NUCLEO_FACE, COMPOSITO: FRACAO_VOLUMETRICA}

VARIABLE_LABELS = {
    RAZAO_NUCLEO_FACE: "Razão entre a espessura do núcleo e a de cada face (c/t)",
    FRACAO_VOLUMETRICA: "Fração volumétrica do primeiro constituinte",
}

#: O que a figura precisa dizer ao leitor, por tipo. Escrito aqui, ao lado da
#: conta, para a tela não ter de inventar a frase.
SWEEP_NOTES = {
    PAINEL: (
        "Varre-se a razão c/t, e não a espessura do painel: só a razão move ρ* e "
        "E*, e mudar a espessura absoluta de uma peça multiplica todos os "
        "candidatos pelo mesmo fator estrutural, sem mudar a ordem de ninguém."
    ),
    COMPOSITO: (
        "Varre-se a fração volumétrica do primeiro constituinte. O módulo e a "
        "condutividade do compósito são um par de limites (Reuss e Voigt), e um "
        "índice que os lê sai como par também."
    ),
}

#: Como cada tipo se chama numa frase de ausência.
_NOUN = {PAINEL: "o painel sanduíche", COMPOSITO: "o compósito"}


@dataclass(frozen=True)
class SweepStep:
    """Um ponto da grade em que o índice existe."""

    #: Posição na grade (0 a n−1), para a tela intercalar com ``skipped``.
    position: int
    parameter: float
    #: Os parâmetros que descrevem a receita deste passo, em palavras do domínio.
    parameters: dict[str, float]
    synthesis: SynthesisResult
    #: Escalar, ou ``None`` quando o índice leu um par de limites.
    index_value: float | None
    index_min: float | None
    index_max: float | None
    #: A pior qualidade entre os valores sintetizados que o índice leu.
    quality: DataQuality


@dataclass(frozen=True)
class SkippedStep:
    """Um ponto da grade sem índice, e por quê."""

    position: int
    parameter: float
    parameters: dict[str, float]
    reason: str


@dataclass(frozen=True)
class SweepResult:
    kind: str
    kind_label: str
    variable: str
    variable_label: str
    spacing: str
    grid: tuple[float, ...]
    expression: str
    note: str
    steps: tuple[SweepStep, ...]
    skipped: tuple[SkippedStep, ...]
    #: Propriedades que o registro derivado não tem em passo nenhum da grade,
    #: com o motivo do Synthesizer (dado faltante no pai ou ausência declarada).
    absent: tuple[SkippedProperty, ...]


def sweep_grid(*, start: float, stop: float, steps: int, spacing: str) -> tuple[float, ...]:
    """A grade explícita de ``steps`` pontos de ``start`` a ``stop``.

    Cada ponto é calculado a partir da **sua posição** e dos dois extremos, e
    os extremos são os pedidos, sem arredondamento: ``x_0 = start`` e
    ``x_{n−1} = stop`` exatos. Na escala logarítmica a interpolação é feita nos
    logaritmos (razão constante entre vizinhos).

    Raises:
        SynthesisError: extremo não finito ou não positivo, ``start ≥ stop``,
            número de passos fora de [``MIN_STEPS``, ``MAX_STEPS``], espaçamento
            desconhecido, ou faixa estreita demais para ``steps`` pontos
            distintos.
    """
    if spacing not in SPACINGS:
        raise SynthesisError(
            f"Espaçamento desconhecido: {spacing}. Use 'linear' ou 'log' (logarítmico)."
        )
    if isinstance(steps, bool) or not isinstance(steps, int):
        raise SynthesisError("O número de passos é um inteiro.")
    if not MIN_STEPS <= steps <= MAX_STEPS:
        raise SynthesisError(
            f"A varredura tem de {MIN_STEPS} a {MAX_STEPS} passos; foram pedidos {steps}."
        )
    if not (math.isfinite(start) and math.isfinite(stop)):
        raise SynthesisError("Os extremos da varredura precisam ser números finitos.")
    if not (start > 0 and stop > 0):
        raise SynthesisError("Os extremos da varredura são positivos.")
    if not start < stop:
        raise SynthesisError("O início da varredura fica abaixo do fim.")

    last = steps - 1
    if spacing == LINEAR:
        interior = [(start * (last - i) + stop * i) / last for i in range(1, last)]
    else:
        log_start, log_stop = math.log(start), math.log(stop)
        interior = [
            math.exp((log_start * (last - i) + log_stop * i) / last) for i in range(1, last)
        ]
    grid = (start, *interior, stop)
    if any(not left < right for left, right in itertools.pairwise(grid)):
        raise SynthesisError(
            f"A faixa de {start} a {stop} é estreita demais para {steps} passos distintos."
        )
    return grid


def _check_domain(kind: str, start: float, stop: float) -> None:
    """A faixa que cada variável admite, com a mesma razão da síntese."""
    if kind == COMPOSITO and not stop < 1:
        raise SynthesisError(
            "A fração volumétrica fica entre 0 e 1, exclusivos: em 1 o resultado é o "
            "primeiro constituinte, não um compósito."
        )


def _synthesize(
    kind: str, parameter: float, first: ParentValues, second: ParentValues
) -> tuple[SynthesisResult, dict[str, float]]:
    if kind == PAINEL:
        # t = 1 e c = c/t: só a razão decide (ver ``_Sandwich``), então qualquer
        # par com a mesma razão daria o mesmo resultado.
        result = synthesize_sandwich(
            face_thickness=1.0, core_thickness=parameter, face=first, core=second
        )
        return result, {
            RAZAO_NUCLEO_FACE: parameter,
            # Fração de espessura (e de volume) ocupada pelas duas faces.
            "fracao_faces": 2.0 / (parameter + 2.0),
        }
    result = synthesize_composite(fraction=parameter, first=first, second=second)
    return result, {FRACAO_VOLUMETRICA: parameter}


def _absence_reason(
    kind: str,
    variable: str,
    var_to_slug: Mapping[str, str],
    skipped_by_slug: Mapping[str, str],
    labels: Mapping[str, str],
) -> str:
    """A frase de um índice que lê uma propriedade que o registro não tem."""
    slug = var_to_slug.get(variable, variable)
    label = labels.get(slug, slug)
    why = skipped_by_slug.get(slug)
    if why is None:
        why = (
            f"{label} não tem regra de síntese para {_NOUN[kind]}, então o registro "
            "derivado não tem esse valor."
        )
    return f"O índice lê {label}, que {_NOUN[kind]} sintetizado não tem. {why}"


def _evaluate_step(
    *,
    kind: str,
    expression: str,
    used: set[str],
    is_monomial: bool,
    result: SynthesisResult,
    labels: Mapping[str, str],
) -> tuple[float | None, float | None, float | None, DataQuality | None, str | None]:
    """O índice de um passo: (valor, mínimo, máximo, qualidade, motivo)."""
    scalars: dict[str, float] = {}
    intervals: dict[str, tuple[float, float]] = {}
    qualities: dict[str, DataQuality] = {}
    var_to_slug: dict[str, str] = {}
    for value in result.values:
        name = safe_variable(value.slug)
        var_to_slug[name] = value.slug
        qualities[name] = value.quality
        if value.value is not None:
            scalars[name] = value.value
        else:
            assert value.value_min is not None and value.value_max is not None
            intervals[name] = (value.value_min, value.value_max)
    for item in result.skipped:
        var_to_slug.setdefault(safe_variable(item.slug), item.slug)
    for slug in reasons_for(kind):
        var_to_slug.setdefault(safe_variable(slug), slug)
    for slug in labels:
        var_to_slug.setdefault(safe_variable(slug), slug)

    missing = sorted(used - set(scalars) - set(intervals))
    if missing:
        skipped_by_slug = {item.slug: item.reason for item in result.skipped}
        reason = " ".join(
            _absence_reason(kind, name, var_to_slug, skipped_by_slug, labels) for name in missing
        )
        return None, None, None, None, reason

    quality = worst_quality([qualities[name] for name in sorted(used)])
    bounded = sorted(name for name in used if name in intervals)
    if not bounded:
        evaluation = evaluate_index(expression, used, scalars)
        if evaluation.value is None:
            return None, None, None, None, f"O índice não se calcula: {evaluation.undefined_reason}"
        return evaluation.value, None, None, quality, None

    names = ", ".join(labels.get(var_to_slug[name], var_to_slug[name]) for name in bounded)
    if not is_monomial:
        return (
            None,
            None,
            None,
            None,
            (
                f"O índice lê {names}, que {_NOUN[kind]} só tem como par de limites "
                "(Reuss e Voigt), e a expressão não é lei de potência: avaliá-la nos "
                "dois limites não garantiria o intervalo do índice."
            ),
        )
    corners: list[float] = []
    for corner in itertools.product(*(intervals[name] for name in bounded)):
        variables = {**scalars, **dict(zip(bounded, corner, strict=True))}
        evaluation = evaluate_index(expression, used, variables)
        if evaluation.value is None:
            return None, None, None, None, f"O índice não se calcula: {evaluation.undefined_reason}"
        corners.append(evaluation.value)
    return None, min(corners), max(corners), quality, None


def sweep_family(
    *,
    kind: str,
    start: float,
    stop: float,
    steps: int,
    spacing: str,
    first: ParentValues,
    second: ParentValues,
    expression: str,
    labels: Mapping[str, str] | None = None,
) -> SweepResult:
    """Roda a síntese em cada ponto da grade e avalia o índice no resultado.

    Args:
        kind: ``painel`` (varre ``c/t``) ou ``composito`` (varre a fração).
        start, stop, steps, spacing: a grade — ver :func:`sweep_grid`.
        first, second: valores dos pais (face e núcleo, ou os dois
            constituintes), lidos **uma vez** por quem chama.
        expression: o índice, já validado contra o catálogo de propriedades.
        labels: slug → nome legível, para as frases de ausência.

    Raises:
        SynthesisError: tipo sem varredura, grade inválida, faixa fora do
            domínio da variável ou expressão que não se lê.
    """
    if kind not in SWEEP_VARIABLES:
        raise SynthesisError(
            "A varredura de família cobre o painel sanduíche (razão c/t) e o "
            "compósito (fração volumétrica)."
        )
    grid = sweep_grid(start=start, stop=stop, steps=steps, spacing=spacing)
    _check_domain(kind, start, stop)
    try:
        used = variables_in(expression)
    except ExpressionError as exc:
        raise SynthesisError(str(exc)) from exc
    try:
        as_monomial(expression)
        is_monomial = True
    except (ValueError, ArithmeticError):  # ExpressionError é ValueError
        is_monomial = False
    names = dict(labels or {})

    evaluated: list[SweepStep] = []
    skipped: list[SkippedStep] = []
    absent: dict[str, SkippedProperty] = {}
    present: set[str] = set()
    for position, parameter in enumerate(grid):
        result, parameters = _synthesize(kind, parameter, first, second)
        present.update(value.slug for value in result.values)
        for item in result.skipped:
            absent.setdefault(item.slug, item)
        value, low, high, quality, reason = _evaluate_step(
            kind=kind,
            expression=expression,
            used=used,
            is_monomial=is_monomial,
            result=result,
            labels=names,
        )
        if reason is not None:
            skipped.append(
                SkippedStep(
                    position=position, parameter=parameter, parameters=parameters, reason=reason
                )
            )
            continue
        assert quality is not None
        evaluated.append(
            SweepStep(
                position=position,
                parameter=parameter,
                parameters=parameters,
                synthesis=result,
                index_value=value,
                index_min=low,
                index_max=high,
                quality=quality,
            )
        )

    variable = SWEEP_VARIABLES[kind]
    return SweepResult(
        kind=kind,
        kind_label=KIND_LABELS[kind],
        variable=variable,
        variable_label=VARIABLE_LABELS[variable],
        spacing=spacing,
        grid=grid,
        expression=expression,
        note=SWEEP_NOTES[kind],
        steps=tuple(evaluated),
        skipped=tuple(skipped),
        # Ausente em todo passo: uma propriedade que algum passo sintetizou não
        # é ausência da família, e não entra aqui.
        absent=tuple(
            sorted(
                (item for slug, item in absent.items() if slug not in present),
                key=lambda item: item.slug,
            )
        ),
    )
