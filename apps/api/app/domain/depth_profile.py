"""Perfis de profundidade L1/L2/L3 (D-127): quanto da base o leitor vê.

O EduPack organiza a base em três níveis — o Nível 1 mostra poucas grandezas
para quem começa, o Nível 3 mostra tudo. Aqui o nível é **uma visão**, e só
isso. Três regras, cada uma com teste:

1. **Visão, nunca filtro de dado.** Uma propriedade acima do nível escolhido não
   é "ausente" nem zero: ela continua gravada, continua entrando no cálculo, e a
   ficha diz por escrito que o nível atual mostra X de Y propriedades. Ausência
   (``is_missing``, D-24) e "fora do nível" são estados diferentes e não se
   confundem.
2. **Padrão seguro.** Propriedade sem nível declarado aparece em **todos** os
   níveis (``min_level = 1``). Uma grandeza nova, importada ou criada por um
   curador nunca some de uma tela porque ninguém lembrou de classificá-la.
   E o nível padrão da aplicação é o 3: quem não escolhe nada vê o que sempre viu.
3. **Seleção, ranking e exportação não leem o nível.** Nenhuma assinatura de
   cálculo recebe este parâmetro; o canário em ``test_depth_profile.py`` roda a
   mesma seleção com e sem ``nivel`` e exige a mesma resposta.

O nível é declarado **por slug, em configuração versionada aqui**, e não numa
coluna: é um fato estrutural sobre a grandeza (como ``display_unit``), não um
valor de material, e não exige migração. Quando a carga oficial em três níveis
(D-102, C1) chegar, o bundle estende este mapa — o slug é a chave estável que os
dois lados compartilham.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import IntEnum
from types import MappingProxyType


class DepthLevel(IntEnum):
    """Os três níveis de profundidade. O inteiro é a ordem: 1 < 2 < 3."""

    L1 = 1
    L2 = 2
    L3 = 3


#: O nível de quem não escolheu nenhum: todos. Mudar isto mudaria o que a
#: aplicação mostra hoje sem que ninguém tivesse pedido — não mude.
DEFAULT_LEVEL = DepthLevel.L3

#: O nível de uma propriedade que não declarou nenhum: visível em todos.
UNDECLARED_MIN_LEVEL = DepthLevel.L1

#: A partir de que nível cada propriedade aparece. Só se listam as que NÃO são
#: do Nível 1; o resto herda o padrão seguro. Critério estrutural, não de dado:
#: o Nível 1 fica com o que se ensina primeiro (massa, rigidez, resistência,
#: custo, temperatura de serviço, condução); o 2 acrescenta as grandezas de
#: segunda leitura (Poisson, calor específico, dilatação, dureza, energia e
#: CO2 de produção); o 3, as de fim de vida.
PROPERTY_MIN_LEVEL: Mapping[str, DepthLevel] = MappingProxyType(
    {
        "coef_poisson": DepthLevel.L2,
        "calor_especifico": DepthLevel.L2,
        "coef_expansao_termica": DepthLevel.L2,
        "dureza": DepthLevel.L2,
        "energia_incorporada": DepthLevel.L2,
        "pegada_co2": DepthLevel.L2,
        "energia_reciclagem": DepthLevel.L3,
        "co2_reciclagem": DepthLevel.L3,
    }
)

#: Nível mínimo sugerido de cada ferramenta (rota da barra lateral). É
#: declaração, não portão: nenhuma rota é escondida ou recusada por isto, e com
#: o nível padrão (3) todas aparecem. Ferramenta não listada vale para todos.
TOOL_MIN_LEVEL: Mapping[str, DepthLevel] = MappingProxyType(
    {
        "/app/dimensionar": DepthLevel.L2,
        "/app/custo": DepthLevel.L2,
        "/app/eco": DepthLevel.L2,
        "/app/baterias": DepthLevel.L3,
        "/app/sintetizar": DepthLevel.L3,
    }
)

LEVEL_LABELS: Mapping[DepthLevel, tuple[str, str]] = MappingProxyType(
    {
        DepthLevel.L1: ("Nível 1", "Introdutório: as grandezas que se ensinam primeiro."),
        DepthLevel.L2: ("Nível 2", "Intermediário: acrescenta as grandezas de segunda leitura."),
        DepthLevel.L3: ("Nível 3", "Completo: todas as propriedades cadastradas."),
    }
)


class DepthLevelError(ValueError):
    """Nível pedido que não existe."""


def parse_level(raw: str | int | None) -> DepthLevel:
    """Lê o nível de um parâmetro; ``None``/vazio é o padrão (todos)."""
    if raw is None or raw == "":
        return DEFAULT_LEVEL
    try:
        return DepthLevel(int(raw))
    except (TypeError, ValueError) as exc:
        raise DepthLevelError(f"Nível de profundidade inválido: {raw!r}. Use 1, 2 ou 3.") from exc


def property_min_level(slug: str) -> DepthLevel:
    """A partir de que nível a propriedade aparece (padrão seguro: todos)."""
    return PROPERTY_MIN_LEVEL.get(slug, UNDECLARED_MIN_LEVEL)


def is_visible(slug: str, level: DepthLevel) -> bool:
    return property_min_level(slug) <= level


@dataclass(frozen=True)
class Visibility:
    """Quantas propriedades o nível mostra de quantas existem."""

    level: DepthLevel
    shown: tuple[str, ...]
    hidden: tuple[str, ...]

    @property
    def total(self) -> int:
        return len(self.shown) + len(self.hidden)


def split_by_level(slugs: Iterable[str], level: DepthLevel) -> Visibility:
    """Separa, sem descartar: o que fica fora do nível volta em ``hidden``."""
    shown: list[str] = []
    hidden: list[str] = []
    for slug in slugs:
        (shown if is_visible(slug, level) else hidden).append(slug)
    return Visibility(level=level, shown=tuple(shown), hidden=tuple(hidden))
