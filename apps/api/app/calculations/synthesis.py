"""Synthesizer: registros derivados, e por que isso não viola o princípio 1.

Este módulo cria **materiais hipotéticos** a partir de materiais catalogados
mais uma receita: um compósito de dois constituintes com fração volumétrica, ou
uma espuma de um sólido com densidade relativa. É o item do roteiro que mais
perto passa de "inventar propriedade de material", então a primeira coisa a
escrever é por que não é isso.

**Um valor sintetizado não é inventado; é calculado, e a diferença é que ele
carrega a derivação.** O princípio 1 proíbe valor que veio de lugar nenhum. Um
limite de Voigt calculado a partir de dois módulos catalogados e de uma fração
declarada veio de algum lugar, e o lugar é auditável — a mesma distinção que o
D-64 fez ao dizer que "2,4 kg" é afirmação auditável e não número com rótulo
digitado ao lado. Três coisas sustentam isso, e nenhuma é opcional:

1. **O registro é declarado sintetizado**, e a receita inteira (tipo, pais,
   parâmetros) fica gravada. Ninguém encontra um registro destes achando que é
   medido.
2. **Cada valor nomeia a lei que o produziu** e a base dela — exata, limites ou
   empírica —, porque "regra das misturas" e "Gibson–Ashby" são afirmações
   diferentes sobre o quanto se pode confiar no número.
3. **A qualidade do dado é a pior dos pais que a regra leu.** Um valor calculado
   não pode ser mais confiável que o menos confiável dos números que entraram
   nele. Isso propaga a incerteza *de entrada*; a incerteza *do modelo* não vira
   número nenhum — inventar barra de erro para uma lei empírica seria
   exatamente o que o princípio 1 proíbe —, ela é declarada em palavras, na base
   da regra.

**A decisão que carrega o item: a regra de mistura é propriedade da
propriedade, não da receita.** É aritmeticamente possível aplicar regra das
misturas a qualquer número, e é aí que uma ferramenta destas mente. Densidade
mistura linearmente por volume, e isso é conservação de massa — exato. Módulo
mistura por Voigt *ao longo das fibras* e por Reuss transversalmente, então a
resposta honesta é o **par de limites**. Custo por massa e as grandezas
ambientais são *por unidade de massa*, então misturam por **fração mássica**, não
volumétrica — e errar isso é invisível até os dois constituintes terem
densidades diferentes. Temperatura máxima de serviço não mistura: é o **mínimo**,
porque o compósito falha quando o constituinte mais fraco falha. E **resistência
não tem regra nenhuma** num compósito: quem a controla é a interface, e a
interface é exatamente aquilo sobre o que o catálogo não sabe nada.

Propriedade sem regra declarada **não é sintetizada**: o registro derivado
simplesmente não a tem, com o motivo escrito (princípio 3, D-24). É o mesmo
desenho do ``is_ratio_scale`` do [D-63](../../docs/DECISIONS.md) — um
comportamento da propriedade decide se a operação faz sentido — e do
``ProcessAttributeKind`` do D-59, em que o tipo decide qual comparação roda.

**A assimetria entre compósito e espuma é real e vale a pena ver.** Uma espuma é
*o mesmo material* com vazios: o mecanismo de falha é entendido e escala
(Gibson–Ashby), então ela **tem** regra de resistência. Um compósito é dois
materiais com uma interface entre eles, e é a interface que decide — por isso ele
**não** tem. A diferença não está na fórmula; está no que se sabe.

As leis são mecânica dos materiais clássica (Voigt, Reuss, Gibson–Ashby), escritas
aqui a partir dos resultados padrão. Como os casos de carga do D-64, elas moram em
**código e não em tabela**, porque são argumento e não dado: argumento se verifica
por revisão.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.models.enums import DataQuality

#: Os dois tipos de síntese de v1.
COMPOSITO = "composito"
ESPUMA = "espuma"
KINDS = (COMPOSITO, ESPUMA)

KIND_LABELS = {
    COMPOSITO: "Compósito de dois constituintes",
    ESPUMA: "Espuma de um sólido",
}

#: Quão firme é a lei que produziu o número. Impresso ao lado do valor, porque
#: "conservação de massa" e "ajuste empírico" são afirmações diferentes sobre o
#: quanto se pode confiar nele.
EXATO = "exato"
LIMITES = "limites"
EMPIRICO = "empirico"

BASIS_LABELS = {
    EXATO: "Exata",
    LIMITES: "Par de limites",
    EMPIRICO: "Empírica",
}

#: Slug da densidade. Nomeado porque a regra de fração mássica o lê para
#: converter fração volumétrica em fração mássica — uma dependência entre
#: propriedades, e das que a resposta precisa nomear quando falta.
DENSIDADE = "densidade"

#: Melhor para pior. Um valor calculado herda a **pior** qualidade entre os
#: valores que a regra leu: medido é o que alguém mediu, importado o que outra
#: base afirmou, estimado o que alguém arbitrou.
_QUALITY_ORDER = (DataQuality.MEDIDO, DataQuality.IMPORTADO, DataQuality.ESTIMADO)


class SynthesisError(ValueError):
    """A receita em si não fecha — parâmetro fora de faixa, pai faltando."""


@dataclass(frozen=True)
class Rule:
    """Uma lei de mistura ou de escala, com a fórmula escrita por extenso."""

    key: str
    label: str
    formula: str
    basis: str
    #: Slugs de **outras** propriedades que esta regra lê. Faltando um deles, o
    #: valor não é sintetizado e o motivo nomeia o que faltou.
    needs: tuple[str, ...] = ()
    #: ``True`` quando a regra devolve um par de limites em vez de um escalar.
    is_interval: bool = False


@dataclass(frozen=True)
class SynthesizedValue:
    """Um valor derivado, com a lei que o produziu colada nele."""

    slug: str
    rule: Rule
    quality: DataQuality
    #: Escalar, ou ``None`` quando a regra devolveu limites.
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None

    @property
    def note(self) -> str:
        """O que a folha de proveniência imprime sob este número."""
        return f"{self.rule.label} ({BASIS_LABELS[self.rule.basis]}): {self.rule.formula}"


@dataclass(frozen=True)
class SkippedProperty:
    """Uma propriedade que o registro derivado **não** tem, e por quê."""

    slug: str
    reason: str


@dataclass(frozen=True)
class SynthesisResult:
    kind: str
    kind_label: str
    parameters: dict[str, float]
    values: tuple[SynthesizedValue, ...]
    skipped: tuple[SkippedProperty, ...]


# --- as leis ---------------------------------------------------------------

_VOLUME_LINEAR = Rule(
    key="volume-linear",
    label="Regra das misturas por volume",
    formula="x = f·xA + (1 − f)·xB",
    basis=EXATO,
)
_MASSA_LINEAR = Rule(
    key="massa-linear",
    label="Regra das misturas por massa",
    formula="x = wA·xA + wB·xB, com wA = f·ρA / ρ",
    basis=EXATO,
    needs=(DENSIDADE,),
)
_VOIGT_REUSS = Rule(
    key="voigt-reuss",
    label="Limites de Voigt e Reuss",
    formula="Reuss = 1 / (f/xA + (1−f)/xB) ≤ x ≤ f·xA + (1−f)·xB = Voigt",
    basis=LIMITES,
    is_interval=True,
)
_MINIMO = Rule(
    key="minimo",
    label="Mínimo dos constituintes",
    formula="x = min(xA, xB)",
    basis=EXATO,
)

_ESCALA_DENSIDADE = Rule(
    key="densidade-relativa",
    label="Definição da densidade relativa",
    formula="ρ* = R · ρs",
    basis=EXATO,
)
_ESCALA_MODULO = Rule(
    key="gibson-ashby-modulo",
    label="Escala de Gibson–Ashby (módulo, célula aberta)",
    formula="E* = R² · Es",
    basis=EMPIRICO,
)
_ESCALA_ESCOAMENTO = Rule(
    key="gibson-ashby-escoamento",
    label="Escala de Gibson–Ashby (colapso plástico, célula aberta)",
    formula="σ* = 0,3 · R^(3/2) · σs",
    basis=EMPIRICO,
)
_HERDADO = Rule(
    key="herdado",
    label="Herdado do sólido",
    formula="x* = xs",
    basis=EXATO,
)

#: Constante empírica do colapso plástico de espuma de célula aberta. Escrita
#: aqui e nomeada na fórmula, nunca escondida no meio da conta.
_COLAPSO_PLASTICO = 0.3

#: Regra por (tipo de síntese, slug). Uma propriedade ausente destas tabelas
#: **não é sintetizada**, e é essa ausência que o item inteiro protege: aplicar
#: regra das misturas a tudo que é numérico é o jeito de uma ferramenta destas
#: mentir sem errar uma conta.
_RULES: dict[str, dict[str, Rule]] = {
    COMPOSITO: {
        DENSIDADE: _VOLUME_LINEAR,
        "modulo_young": _VOIGT_REUSS,
        "condutividade_termica": _VOIGT_REUSS,
        "temp_max_servico": _MINIMO,
        "custo_massa": _MASSA_LINEAR,
        "energia_incorporada": _MASSA_LINEAR,
        "pegada_co2": _MASSA_LINEAR,
        "energia_reciclagem": _MASSA_LINEAR,
        "co2_reciclagem": _MASSA_LINEAR,
    },
    ESPUMA: {
        DENSIDADE: _ESCALA_DENSIDADE,
        "modulo_young": _ESCALA_MODULO,
        "limite_escoamento": _ESCALA_ESCOAMENTO,
        # Mesma substância: o que é *por quilograma* não muda ao abrir vazios.
        # O gasto do próprio processo de espumação não está catalogado, e não
        # foi inventado — ver a nota do tipo, que diz isso ao leitor.
        "temp_max_servico": _HERDADO,
        "custo_massa": _HERDADO,
        "energia_incorporada": _HERDADO,
        "pegada_co2": _HERDADO,
        "energia_reciclagem": _HERDADO,
        "co2_reciclagem": _HERDADO,
    },
}

#: Por que cada propriedade de peso fica de fora, por tipo. Um "não sei" com
#: motivo é resposta; um silêncio não é.
_NO_RULE: dict[str, dict[str, str]] = {
    COMPOSITO: {
        "limite_escoamento": (
            "Resistência de compósito é controlada pela interface entre fibra e "
            "matriz, e a interface é exatamente o que este catálogo não descreve. "
            "Não há regra das misturas honesta para ela."
        ),
        "resistencia_tracao": (
            "Mesma razão do limite de escoamento: quem decide é a interface, e "
            "ela não está catalogada."
        ),
        "dureza": (
            "Dureza é medida de superfície e depende de qual constituinte o "
            "penetrador encontra; não mistura."
        ),
    },
    ESPUMA: {
        "resistencia_tracao": (
            "A escala de Gibson–Ashby implementada aqui é a do colapso plástico, "
            "que se refere ao escoamento do sólido. Aplicá-la à resistência à "
            "tração usaria uma lei para responder outra pergunta."
        ),
        "condutividade_termica": (
            "Numa espuma de baixa densidade relativa quem conduz é o gás das "
            "células, e o catálogo não tem gás nenhum. A escala do sólido "
            "sozinha erraria por muito."
        ),
        "dureza": "Dureza de espuma depende da célula, não só do sólido.",
    },
}

#: Nota do tipo de síntese, mostrada uma vez por registro derivado.
KIND_NOTES = {
    COMPOSITO: (
        "Compósito hipotético de dois constituintes catalogados, com fração "
        "volumétrica declarada. O módulo sai como **par de limites** (Voigt e "
        "Reuss) porque depende da direção, e a direção não está no catálogo."
    ),
    ESPUMA: (
        "Espuma hipotética de célula aberta, com densidade relativa declarada. As "
        "escalas de Gibson–Ashby são empíricas. As grandezas *por massa* são as "
        "do sólido: é a mesma substância, e o gasto do próprio processo de "
        "espumação não está catalogado — não foi estimado."
    ),
}


def _validate() -> None:
    """Recusa, no import, uma tabela de regras que se contradiz.

    Uma propriedade não pode ter regra **e** justificativa de ausência para o
    mesmo tipo: uma das duas estaria mentindo para o leitor, e nada no caminho
    até a tela pegaria isso.
    """
    for kind in KINDS:
        if kind not in _RULES:
            raise ValueError(f"Tipo de síntese sem tabela de regras: {kind}")
        overlap = set(_RULES[kind]) & set(_NO_RULE.get(kind, {}))
        if overlap:
            raise ValueError(
                f"{kind}: {', '.join(sorted(overlap))} tem regra e motivo de ausência."
            )
        for slug, rule in _RULES[kind].items():
            if slug in rule.needs:
                raise ValueError(f"{kind}/{slug}: a regra depende da própria propriedade.")


_validate()


def rules_for(kind: str) -> dict[str, Rule]:
    """As regras de um tipo de síntese, por slug de propriedade."""
    if kind not in _RULES:
        raise SynthesisError(f"Tipo de síntese desconhecido: {kind}.")
    return dict(_RULES[kind])


def reasons_for(kind: str) -> dict[str, str]:
    """As ausências declaradas de um tipo, por slug — cada uma com seu motivo."""
    if kind not in _RULES:
        raise SynthesisError(f"Tipo de síntese desconhecido: {kind}.")
    return dict(_NO_RULE.get(kind, {}))


def _worst(qualities: list[DataQuality]) -> DataQuality:
    """A pior qualidade da lista. Sem entradas, o mais conservador."""
    if not qualities:
        return DataQuality.ESTIMADO
    return max(qualities, key=_QUALITY_ORDER.index)


@dataclass(frozen=True)
class ParentValue:
    """Um valor catalogado de um pai, do jeito que a síntese precisa lê-lo."""

    value: float
    quality: DataQuality


#: Valores de um pai: slug → valor utilizável. Slug ausente significa que o pai
#: não tem aquele número — declarado ausente, sem linha, ou sem normalização
#: dão no mesmo aqui (princípio 3).
ParentValues = dict[str, ParentValue]


def synthesize_composite(
    *, fraction: float, first: ParentValues, second: ParentValues
) -> SynthesisResult:
    """Um compósito de dois constituintes, com ``fraction`` de volume do primeiro.

    Args:
        fraction: fração **volumétrica** do primeiro constituinte, 0 < f < 1.
        first, second: valores catalogados de cada pai, por slug.

    Raises:
        SynthesisError: quando a fração não deixa um compósito de dois — em 0 ou
            em 1 o resultado é um dos pais, e copiar um material catalogado para
            dentro de um registro sintetizado seria criar uma segunda cópia dele.
    """
    if not 0 < fraction < 1:
        raise SynthesisError(
            "A fração volumétrica fica entre 0 e 1, exclusivos: em 0 ou em 1 o "
            "resultado é um dos constituintes, não um compósito."
        )

    values: list[SynthesizedValue] = []
    skipped: list[SkippedProperty] = []
    f = fraction

    # A fração mássica precisa das duas densidades, e a dependência é nomeada
    # quando falta — é ela que separa "custo mistura por massa" de "custo mistura
    # por volume", e o erro é invisível até os dois pais terem densidades
    # diferentes.
    rho_a = first.get(DENSIDADE)
    rho_b = second.get(DENSIDADE)
    density = None
    if rho_a is not None and rho_b is not None:
        density = f * rho_a.value + (1.0 - f) * rho_b.value

    for slug, rule in _RULES[COMPOSITO].items():
        a = first.get(slug)
        b = second.get(slug)
        missing = [name for name, v in (("primeiro", a), ("segundo", b)) if v is None]
        if missing:
            who = (
                "Os dois constituintes não têm"
                if len(missing) == 2
                else f"O {missing[0]} constituinte não tem"
            )
            skipped.append(SkippedProperty(slug=slug, reason=f"{who} {slug} catalogado."))
            continue
        assert a is not None and b is not None

        if rule.key == "massa-linear":
            if density is None or not density > 0:
                skipped.append(
                    SkippedProperty(
                        slug=slug,
                        reason=(
                            f"{slug} é grandeza por unidade de massa e mistura por "
                            "fração mássica, que precisa da densidade dos dois "
                            "constituintes — e ela falta."
                        ),
                    )
                )
                continue
            assert rho_a is not None and rho_b is not None
            w_a = f * rho_a.value / density
            quality = _worst([a.quality, b.quality, rho_a.quality, rho_b.quality])
            values.append(
                SynthesizedValue(
                    slug=slug,
                    rule=rule,
                    quality=quality,
                    value=w_a * a.value + (1.0 - w_a) * b.value,
                )
            )
            continue

        quality = _worst([a.quality, b.quality])
        if rule.key == "volume-linear":
            values.append(
                SynthesizedValue(
                    slug=slug,
                    rule=rule,
                    quality=quality,
                    value=f * a.value + (1.0 - f) * b.value,
                )
            )
        elif rule.key == "minimo":
            values.append(
                SynthesizedValue(slug=slug, rule=rule, quality=quality, value=min(a.value, b.value))
            )
        elif rule.key == "voigt-reuss":
            if a.value <= 0 or b.value <= 0:
                skipped.append(
                    SkippedProperty(
                        slug=slug,
                        reason=(
                            "O limite de Reuss divide pelos valores dos "
                            "constituintes, e um deles não é positivo."
                        ),
                    )
                )
                continue
            voigt = f * a.value + (1.0 - f) * b.value
            reuss = 1.0 / (f / a.value + (1.0 - f) / b.value)
            values.append(
                SynthesizedValue(
                    slug=slug,
                    rule=rule,
                    quality=quality,
                    value_min=min(reuss, voigt),
                    value_max=max(reuss, voigt),
                )
            )
        else:  # pragma: no cover - guarded by _validate
            raise SynthesisError(f"Regra sem implementação: {rule.key}")

    _add_declared_absences(COMPOSITO, skipped)
    return SynthesisResult(
        kind=COMPOSITO,
        kind_label=KIND_LABELS[COMPOSITO],
        parameters={"fracao_volumetrica": fraction},
        values=tuple(values),
        skipped=tuple(sorted(skipped, key=lambda item: item.slug)),
    )


def synthesize_foam(*, relative_density: float, solid: ParentValues) -> SynthesisResult:
    """Uma espuma de célula aberta do sólido dado, com densidade relativa ``R``.

    Raises:
        SynthesisError: quando ``R`` não está em (0, 1). Em 1 a espuma é o
            sólido; acima de 1 não é espuma nenhuma.
    """
    if not 0 < relative_density < 1:
        raise SynthesisError(
            "A densidade relativa fica entre 0 e 1, exclusivos: em 1 a espuma é o "
            "próprio sólido."
        )

    r = relative_density
    values: list[SynthesizedValue] = []
    skipped: list[SkippedProperty] = []

    for slug, rule in _RULES[ESPUMA].items():
        parent = solid.get(slug)
        if parent is None:
            skipped.append(
                SkippedProperty(slug=slug, reason=f"O sólido não tem {slug} catalogado.")
            )
            continue
        if rule.key == "densidade-relativa":
            value = r * parent.value
        elif rule.key == "gibson-ashby-modulo":
            value = r**2 * parent.value
        elif rule.key == "gibson-ashby-escoamento":
            value = _COLAPSO_PLASTICO * math.pow(r, 1.5) * parent.value
        elif rule.key == "herdado":
            value = parent.value
        else:  # pragma: no cover - guarded by _validate
            raise SynthesisError(f"Regra sem implementação: {rule.key}")
        values.append(SynthesizedValue(slug=slug, rule=rule, quality=parent.quality, value=value))

    _add_declared_absences(ESPUMA, skipped)
    return SynthesisResult(
        kind=ESPUMA,
        kind_label=KIND_LABELS[ESPUMA],
        parameters={"densidade_relativa": relative_density},
        values=tuple(values),
        skipped=tuple(sorted(skipped, key=lambda item: item.slug)),
    )


def _add_declared_absences(kind: str, skipped: list[SkippedProperty]) -> None:
    """Junta as ausências **declaradas** às que faltaram por dado do pai.

    As duas são ausência para quem lê a ficha, mas por razões diferentes: uma
    diz "ninguém catalogou isto no pai", a outra diz "esta propriedade não tem
    regra honesta para este tipo de síntese". Ambas vêm escritas.
    """
    already = {item.slug for item in skipped}
    for slug, reason in _NO_RULE.get(kind, {}).items():
        if slug not in already:
            skipped.append(SkippedProperty(slug=slug, reason=reason))
