"""A unidade em que o leitor lê — e tudo o que ela não pode tocar.

O catálogo guarda todo número na **unidade canônica** da propriedade, e é assim
que ele tem de continuar: é sobre o valor canônico que o motor de seleção
compara, que o avaliador de índices calcula e que `conversion_method` promete
reprodutibilidade. Só que ninguém lê módulo de Young em pascal. Um engenheiro lê
210 GPa; a tela mostrava 210000000000. Esta camada resolve essa distância, e a
resolve **na saída**, sem mexer em nada do que está guardado.

**A unidade de leitura é propriedade da propriedade, não da dimensão.** É a
decisão que o dado impôs: `modulo_young`, `limite_escoamento` e
`resistencia_tracao` têm a mesma dimensão — `[mass]/[length]/[time]**2` — e
ninguém as lê na mesma unidade. Módulo é GPa, resistência é MPa, e uma tabela
que mostrasse "210000 MPa" ao lado de "250 MPa" estaria tecnicamente correta e
seria ilegível. Por isso a convenção mora em `PropertyDefinition.display_unit`,
ao lado de `better_direction` e `allows_log_scale`, que são a mesma espécie de
fato: coisas que se sabem sobre a grandeza, não sobre o registro.

**A escolha do leitor é parâmetro da pergunta, e vive na URL.** Nunca no
servidor, pela razão que o [D-63](../../docs/DECISIONS.md) já fixou para o
registro de referência: se a preferência morasse numa linha de usuário, a mesma
URL desenharia duas tabelas diferentes para duas pessoas, e um documento
exportado a partir dela deixaria de ser reproduzível a partir do próprio link.

**Três coisas a unidade de leitura não pode tocar**, e cada uma tem o seu teste:

1. **O valor gravado e o seu `conversion_method`.** Aquele campo descreve de onde
   o número veio, não como alguém escolheu olhar para ele.
2. **O avaliador de índices.** Um índice é definido sobre slugs canônicos; se uma
   unidade de leitura chegasse lá, `sqrt(modulo_young)/densidade` mudaria de
   valor conforme a tela em que foi aberto — e continuaria parecendo plausível.
3. **A diferença percentual.** Ela só existe em escala de razão
   (`units.is_ratio_scale`), e `temp_max_servico` é canônica em **kelvin**: lida
   em °C, "o dobro da temperatura" viraria uma afirmação falsa com toda a
   autoridade de um número calculado. O percentual é computado sobre o canônico,
   sempre.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.calculations.units import (
    UnitError,
    from_canonical,
    from_canonical_delta,
    pretty_unit,
)


class DisplayUnitError(ValueError):
    """Unidade de leitura pedida que a propriedade não admite."""


@dataclass(frozen=True)
class Reading:
    """Como uma propriedade vai ser lida nesta resposta.

    Carrega a canônica junto de propósito: quem imprime precisa poder dizer que
    está lendo numa unidade diferente da guardada, e o documento exportado
    declara as duas.
    """

    unit: str
    canonical_unit: str

    @property
    def is_canonical(self) -> bool:
        return self.unit == self.canonical_unit

    @property
    def label(self) -> str:
        """O rótulo para a tela, já embelezado (`kg/m³`, não `kg/m**3`)."""
        return pretty_unit(self.unit)

    def value(self, value: float | None) -> float | None:
        """Converte um valor, **preservando a ausência**.

        `None` entra e `None` sai: dado ausente é o quarto estado da qualidade
        (D-24) e nunca vira `0`, aqui como em qualquer outro lugar. Um zero
        produzido por uma camada de apresentação seria ainda pior que os outros,
        porque não haveria proveniência nenhuma que o desmentisse.
        """
        if value is None:
            return None
        if self.is_canonical:
            return value
        return from_canonical(value, self.canonical_unit, self.unit)

    def delta(self, value: float | None) -> float | None:
        """Converte uma **diferença** — incerteza, tolerância, largura de faixa.

        Separada de :meth:`value` porque numa escala com offset as duas contas
        são diferentes: ±5 K lidos em °C são ±5 °C, e não ±(−268,15). O número
        errado apareceria ao lado de uma temperatura que converteu certo, então
        nada na tela pareceria fora do lugar — é o tipo de defeito que só um
        teste apanha.
        """
        if value is None:
            return None
        if self.is_canonical:
            return value
        return from_canonical_delta(value, self.canonical_unit, self.unit)

    def read(self, value: object) -> dict[str, float | str | None]:
        """Os campos `display_*` de uma linha de valor, prontos para o schema.

        **Converte a partir da unidade original, e não da canônica.** As duas
        dariam o mesmo número — o Pint faz a volta exata —, mas só a original
        existe para *todos* os cinco campos: o canônico guardado é um só
        (`normalized_value`, o ponto representativo), enquanto os limites de uma
        faixa de material moram apenas como foram digitados. Uma regra só para os
        cinco é mais fácil de conferir do que duas regras que coincidem.

        Quando não há unidade original — dado ausente —, não há o que ler, e
        todos os campos saem `None`. Ausência atravessa como ausência.
        """
        origin = getattr(value, "original_unit", None) or self.canonical_unit
        if not origin:
            return {
                "display_unit": self.unit,
                "display_value": None,
                "display_min": None,
                "display_max": None,
                "display_typical": None,
                "display_uncertainty": None,
            }
        moved = Reading(unit=self.unit, canonical_unit=origin)
        return {
            "display_unit": self.unit,
            "display_value": moved.value(getattr(value, "value_scalar", None)),
            "display_min": moved.value(getattr(value, "value_min", None)),
            "display_max": moved.value(getattr(value, "value_max", None)),
            "display_typical": moved.value(getattr(value, "value_typical", None)),
            # Incerteza é **diferença**: ±5 K lidos em °C são ±5 °C.
            "display_uncertainty": moved.delta(getattr(value, "uncertainty", None)),
        }


def reading_for(
    *,
    canonical_unit: str,
    display_unit: str | None,
    accepted_units: Sequence[str],
    requested: str | None,
) -> Reading:
    """Resolve em que unidade uma propriedade será lida.

    A ordem é: o que o leitor pediu, senão a convenção da propriedade, senão a
    canônica. Um `display_unit` nulo é a resposta legítima "esta grandeza se lê
    como está guardada" — o caso das adimensionais.

    **Unidade pedida fora do conjunto admitido é recusada, nunca ignorada** — a
    regra do [D-56](../../docs/DECISIONS.md). Ignorar devolveria a tabela na
    unidade errada sem avisar, e o leitor leria os números como se fossem os que
    pediu. O conjunto admitido é `accepted_units` (que já é a lista curada de
    unidades válidas para aquela propriedade) mais a canônica e a convenção.

    Raises:
        DisplayUnitError: unidade pedida fora do conjunto, ou dimensionalmente
            incompatível com a canônica.
    """
    if requested is None:
        chosen = display_unit or canonical_unit
    else:
        allowed = {canonical_unit, *accepted_units}
        if display_unit:
            allowed.add(display_unit)
        if requested not in allowed:
            raise DisplayUnitError(
                f"Unidade de leitura {requested!r} não é admitida para esta "
                f"propriedade. Admitidas: {', '.join(sorted(allowed))}."
            )
        chosen = requested

    # Mesmo vindo do catálogo, a compatibilidade é conferida: um `display_unit`
    # semeado errado produziria números plausíveis e falsos em toda a aplicação,
    # e é melhor falhar no seed do que imprimir isso.
    if chosen != canonical_unit:
        try:
            from_canonical(1.0, canonical_unit, chosen)
        except UnitError as exc:
            raise DisplayUnitError(str(exc)) from exc

    return Reading(unit=chosen, canonical_unit=canonical_unit)


def parse_choices(raw: str | None) -> dict[str, str]:
    """Lê `modulo_young:GPa,densidade:g/cm**3` vindo da URL.

    Formato deliberadamente literal — slug, dois-pontos, unidade — para que a URL
    continue legível e um leitor possa editá-la à mão. Entrada vazia é um mapa
    vazio, que é "leia pela convenção de cada propriedade".

    Raises:
        DisplayUnitError: par malformado. Recusar aqui é o que impede uma URL
            truncada de virar silenciosamente "leia tudo em canônico".
    """
    if not raw:
        return {}
    choices: dict[str, str] = {}
    for piece in raw.split(","):
        piece = piece.strip()
        if not piece:
            continue
        slug, separator, unit = piece.partition(":")
        if not separator or not slug.strip() or not unit.strip():
            raise DisplayUnitError(
                f"Par de unidade de leitura malformado: {piece!r}. "
                "O formato é 'propriedade:unidade'."
            )
        choices[slug.strip()] = unit.strip()
    return choices


def readings_for(
    definitions: Sequence[object],
    choices: Mapping[str, str],
) -> dict[str, Reading]:
    """Resolve a leitura de várias propriedades de uma vez, por slug.

    Recebe qualquer objeto com `slug`, `canonical_unit`, `display_unit` e
    `accepted_units` — serve tanto `PropertyDefinition` quanto
    `ProcessAttributeDefinition`, que têm os mesmos quatro campos e a mesma
    pergunta a responder.
    """
    return {
        definition.slug: reading_for(  # type: ignore[attr-defined]
            canonical_unit=definition.canonical_unit or "",  # type: ignore[attr-defined]
            display_unit=getattr(definition, "display_unit", None),
            accepted_units=getattr(definition, "accepted_units", None) or [],
            requested=choices.get(definition.slug),  # type: ignore[attr-defined]
        )
        for definition in definitions
    }
