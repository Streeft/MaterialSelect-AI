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

from pydantic import BaseModel, Field, field_validator

from app.calculations.synthesis import COMPOSITO, ESPUMA, PAINEL


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
        # `gt=0` já barra -inf e NaN não é > 0, mas +inf passa: uma espessura
        # infinita zeraria a razão t/c sem erro nenhum.
        if value is not None and not math.isfinite(value):
            raise ValueError("Valor inválido.")
        return value


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
