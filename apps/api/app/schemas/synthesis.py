"""Contratos do Synthesizer (P3).

Uma forma carrega a decisão do item: **``SynthesisPreview`` devolve as regras e
as ausências antes de gravar qualquer coisa.** Quem sintetiza um registro precisa
ver qual lei vai rodar em cada propriedade — e quais propriedades o registro
*não* vai ter, e por quê — antes de decidir se aquilo é o material que queria.
Gravar primeiro e explicar depois transformaria o catálogo do usuário num
depósito de hipóteses que ele não leu.
"""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.calculations.family_sweep import LINEAR, LOGARITMICA, MAX_STEPS, MIN_STEPS
from app.calculations.synthesis import COMPOSITO, ESPUMA, PAINEL
from app.schemas.selection import IndexIn


def _require_finite(value: float | None) -> float | None:
    """Recusa ``+inf`` num campo positivo.

    `gt=0` já barra -inf e NaN não é > 0, mas +inf passa: uma espessura
    infinita zeraria a razão t/c sem erro nenhum, e um extremo infinito de
    varredura faria a grade inteira virar infinito.
    """
    if value is not None and not math.isfinite(value):
        raise ValueError("Valor inválido.")
    return value


class RuleOut(BaseModel):
    """Uma lei de mistura ou de escala, com a fórmula escrita por extenso."""

    key: str
    label: str
    formula: str
    #: ``exato``, ``limites`` ou ``empirico`` — o quanto se pode confiar no
    #: número que ela produz.
    basis: str
    basis_label: str


class KindOut(BaseModel):
    """Um tipo de síntese: o que ele calcula e o que declaradamente não calcula."""

    kind: str
    label: str
    note: str
    #: Slug da propriedade → a lei que roda nela.
    rules: dict[str, RuleOut]
    #: Slug → por que este tipo **não** sintetiza aquela propriedade. Um "não
    #: sei" com motivo é resposta; um silêncio não é.
    without_rule: dict[str, str]


class SynthesisRequest(BaseModel):
    """A receita. Os campos do outro tipo são recusados, nunca ignorados."""

    kind: Literal[COMPOSITO, ESPUMA, PAINEL]
    name: str = Field(min_length=1, max_length=200)
    #: Onde o registro derivado entra na taxonomia. Exigido, e não herdado de um
    #: pai: uma espuma de alumínio não é necessariamente um metal para quem a
    #: está catalogando, e a ferramenta não tem como saber — mas tudo que lê por
    #: classe (árvore, gráficos, painel) precisa que alguém tenha decidido.
    class_id: int
    description: str | None = Field(default=None, max_length=1000)

    #: Compósito: os dois constituintes e a fração volumétrica do primeiro.
    #: Espuma: só ``parent_a_id`` e a densidade relativa.
    #: Painel: ``parent_a_id`` é a **face**, ``parent_b_id`` o **núcleo**, mais
    #: as duas espessuras.
    parent_a_id: int
    parent_b_id: int | None = None
    volume_fraction: float | None = Field(default=None, gt=0.0, lt=1.0)
    relative_density: float | None = Field(default=None, gt=0.0, lt=1.0)
    #: Espessura de **cada** face e do núcleo, na mesma unidade — qual unidade
    #: é não importa, porque toda regra do painel lê só a razão entre as duas.
    #: Sem limite superior de propósito: um painel de 200 mm é tão legítimo
    #: quanto um de 2 mm, e é a razão que decide o resultado.
    face_thickness: float | None = Field(default=None, gt=0.0)
    core_thickness: float | None = Field(default=None, gt=0.0)

    @field_validator("volume_fraction", "relative_density", "face_thickness", "core_thickness")
    @classmethod
    def _finite(cls, value: float | None) -> float | None:
        return _require_finite(value)


class SynthesizedValueOut(BaseModel):
    """Um valor derivado, com a lei que o produziu colada nele."""

    slug: str
    name: str
    canonical_unit: str | None = None
    #: Escalar, ou ``None`` quando a regra devolveu um par de limites.
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    rule: RuleOut
    #: A pior qualidade entre os valores dos pais que a regra leu.
    quality: str

    # --- a mesma medida, lida noutra unidade (D-70) ------------------------
    #: Um valor sintetizado nasce **canônico** — a regra de mistura opera sobre
    #: os canônicos dos pais —, então aqui não há "o que a fonte disse" para
    #: preservar: a proveniência deste número é a `rule` acima, e ela não se
    #: mexe. Os campos abaixo são a mesma grandeza lida na unidade do leitor.
    display_unit: str | None = None
    display_value: float | None = None
    display_min: float | None = None
    display_max: float | None = None


class SkippedPropertyOut(BaseModel):
    """Uma propriedade que o registro derivado não tem, e por quê."""

    slug: str
    name: str
    reason: str


class SynthesisPreview(BaseModel):
    """O que a receita produziria, antes de qualquer gravação."""

    kind: str
    kind_label: str
    kind_note: str
    parents: list[str]
    parameters: dict[str, float]
    values: list[SynthesizedValueOut]
    skipped: list[SkippedPropertyOut]


class SynthesisResultOut(SynthesisPreview):
    """O mesmo, mais o registro que foi gravado."""

    material_id: int
    material_name: str


# --- varredura de família (D-144) --------------------------------------------


class SweepRequest(BaseModel):
    """Uma família de receitas: dois pais, uma grade e um índice.

    Só painel e compósito varrem, cada um na sua variável do lado do material
    (``c/t`` e fração volumétrica); a espuma e a espessura absoluta ficam de
    fora — ver ``app.calculations.family_sweep``. Nada é gravado, então nome e
    classe, que a prévia pede para a gravação, não entram aqui.
    """

    kind: Literal[COMPOSITO, PAINEL]
    #: Compósito: os dois constituintes. Painel: ``parent_a_id`` é a **face** e
    #: ``parent_b_id`` o **núcleo** — a mesma convenção da prévia.
    parent_a_id: int
    parent_b_id: int
    #: Extremos da grade na variável do tipo, ambos positivos e finitos; na
    #: fração, ``stop`` fica abaixo de 1.
    start: float = Field(gt=0.0)
    stop: float = Field(gt=0.0)
    steps: int = Field(ge=MIN_STEPS, le=MAX_STEPS)
    spacing: Literal[LINEAR, LOGARITMICA] = LINEAR
    index: IndexIn

    @field_validator("start", "stop")
    @classmethod
    def _finite(cls, value: float) -> float:
        return _require_finite(value)

    @model_validator(mode="after")
    def _ordered(self) -> SweepRequest:
        if not self.start < self.stop:
            raise ValueError("O início da varredura fica abaixo do fim.")
        if self.kind == COMPOSITO and not self.stop < 1.0:
            raise ValueError(
                "A fração volumétrica fica entre 0 e 1, exclusivos: em 1 o resultado é "
                "o primeiro constituinte, não um compósito."
            )
        return self


class SweepIndexOut(BaseModel):
    """O índice avaliado em cada passo, com a dimensão que o catálogo lhe dá."""

    name: str | None = None
    expression: str
    goal: str
    dimension: str


class SweepPropertyOut(BaseModel):
    """Uma propriedade sintetizada em algum passo — a lei não muda ao longo da grade."""

    slug: str
    name: str
    canonical_unit: str | None = None
    display_unit: str | None = None
    rule: RuleOut


class SweepValueOut(BaseModel):
    """Um valor sintetizado num passo. Escalar, ou par de limites."""

    slug: str
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    quality: str
    display_value: float | None = None
    display_min: float | None = None
    display_max: float | None = None


class SweepStepOut(BaseModel):
    """Um ponto da grade em que o índice existe."""

    position: int
    parameter: float
    parameters: dict[str, float]
    #: Escalar, ou ``None`` quando o índice leu um par de limites — então
    #: ``index_min``/``index_max`` carregam o par, nunca uma média dos dois.
    index_value: float | None = None
    index_min: float | None = None
    index_max: float | None = None
    #: A pior qualidade entre os valores que o índice leu.
    quality: str
    values: list[SweepValueOut]


class SweepSkippedStepOut(BaseModel):
    """Um ponto da grade sem índice, com o motivo escrito (nunca zero)."""

    position: int
    parameter: float
    parameters: dict[str, float]
    reason: str


class SweepOut(BaseModel):
    """A família inteira: grade, índice por passo e o que ficou sem índice."""

    kind: str
    kind_label: str
    kind_note: str
    parents: list[str]
    variable: str
    variable_label: str
    spacing: str
    grid: list[float]
    note: str
    index: SweepIndexOut
    properties: list[SweepPropertyOut]
    steps: list[SweepStepOut]
    skipped: list[SweepSkippedStepOut]
    #: Propriedades que nenhum passo tem, com o motivo do Synthesizer.
    absent: list[SkippedPropertyOut]
