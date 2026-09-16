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

#: Os três tipos de síntese.
COMPOSITO = "composito"
ESPUMA = "espuma"
PAINEL = "painel"
KINDS = (COMPOSITO, ESPUMA, PAINEL)

KIND_LABELS = {
    COMPOSITO: "Compósito de dois constituintes",
    ESPUMA: "Espuma de um sólido",
    PAINEL: "Painel sanduíche",
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

#: Slug do módulo. Nomeado pela mesma razão: no painel sanduíche ele é o número
#: que a regra de flexão lê dos dois pais — e também o slug em que ela escreve.
MODULO = "modulo_young"

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

_FLEXAO_SANDUICHE = Rule(
    key="flexao-sanduiche",
    label="Módulo de flexão equivalente do painel",
    formula="E* = 12·[Ef·t³/6 + Ef·t·(c+t)²/2 + Ec·c³/12] / (c+2t)³",
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
    PAINEL: {
        # Massa é massa: a única grandeza que o arranjo não muda, e por isso a
        # **mesma** regra do compósito, rodada na fração de espessura das faces.
        DENSIDADE: _VOLUME_LINEAR,
        # Esta não é mistura nenhuma — ver KIND_NOTES[PAINEL].
        MODULO: _FLEXAO_SANDUICHE,
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
    PAINEL: {
        "limite_escoamento": (
            "A resistência de um painel é uma **competição entre modos de falha** — "
            "escoamento da face, cisalhamento do núcleo e enrugamento da face —, e "
            "vale o menor deles. Só o primeiro é calculável aqui: os outros dois "
            "precisam da resistência ao cisalhamento e do módulo de cisalhamento do "
            "núcleo, e nenhum dos dois está catalogado. O mínimo sobre parte dos "
            "modos é um limite superior, não a resistência."
        ),
        "resistencia_tracao": (
            "Mesma razão do limite de escoamento: sem os modos do núcleo, qualquer "
            "número aqui seria um limite superior apresentado como resistência."
        ),
        "condutividade_termica": (
            "Um painel é anisotrópico por construção: através da espessura as camadas "
            "estão em série e no plano estão em paralelo, e os dois valores diferem "
            "por muito. O catálogo guarda um número isotrópico, e escolher uma das "
            "duas direções em silêncio daria ao leitor a outra."
        ),
        "dureza": (
            "Dureza mede a superfície, então seria a da face — e dizer isso "
            "esconderia que a indentação do núcleo é justamente um dos modos de "
            "falha de um painel."
        ),
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
    PAINEL: (
        "Painel sanduíche hipotético: duas faces de espessura **t** sobre um núcleo "
        "de espessura **c**. Um painel não é uma mistura, é um **arranjo** — e o "
        "módulo que sai daqui é o de **flexão equivalente**, o que uma placa "
        "homogênea da mesma espessura precisaria ter para ser tão rígida quanto "
        "esta. Ele passa do limite de Voigt nas mesmas frações, que é o que "
        "nenhuma regra das misturas pode fazer, e é por isso que se constrói "
        "painel. Só a **razão t/c** decide: dobrar as duas espessuras não muda "
        "nem ρ* nem E*, e é isso que torna legítimo tratar o painel como "
        "material. Densidade e as grandezas por massa, essas sim, são as mesmas "
        "regras do compósito — massa é massa, o arranjo não a move."
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


@dataclass(frozen=True)
class _Sandwich:
    """A geometria de um painel: espessura de **cada** face e do núcleo.

    Só a **razão** entre as duas decide alguma coisa — dobrar as duas não muda
    nem ``ρ*`` nem ``E*``. É esse fato que torna legítimo tratar o painel como
    um material: sob escala self-similar o par (E*, ρ*) não se move, que é
    exatamente a liberdade que um índice de desempenho assume ter.
    """

    face: float
    core: float

    @property
    def total(self) -> float:
        return self.core + 2.0 * self.face

    @property
    def face_fraction(self) -> float:
        """Fração de espessura ocupada pelas duas faces — e de volume, também.

        Num painel de área constante, fração de espessura *é* fração de volume,
        e é por isso que a densidade sai pela regra do compósito sem adaptação.
        """
        return 2.0 * self.face / self.total

    def flexural_modulus(self, face_modulus: float, core_modulus: float) -> float:
        """``E*``: o módulo de uma placa homogênea de igual rigidez à flexão.

        Os três termos de ``(EI)/b`` são, na ordem: as faces fletindo em torno
        dos próprios eixos, as faces em torno do eixo do painel (o termo que
        domina, e o motivo de o sanduíche existir) e o núcleo em torno do eixo
        do painel.
        """
        t, c, d = self.face, self.core, self.total
        rigidity = (
            face_modulus * t**3 / 6.0
            + face_modulus * t * (c + t) ** 2 / 2.0
            + core_modulus * c**3 / 12.0
        )
        return 12.0 * rigidity / d**3


def _mix_two_parents(
    *,
    kind: str,
    fraction: float,
    first: ParentValues,
    second: ParentValues,
    sandwich: _Sandwich | None = None,
) -> tuple[list[SynthesizedValue], list[SkippedProperty]]:
    """Roda a tabela de regras de um tipo de **dois** pais.

    Compósito e painel compartilham este laço porque compartilham quase todas
    as regras: densidade, grandezas por massa e temperatura de serviço são as
    mesmas leis, rodadas na mesma fração volumétrica. O que o painel acrescenta
    é uma regra só — e ela não é mistura nenhuma, é geometria.
    """
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

    for slug, rule in _RULES[kind].items():
        a = first.get(slug)
        b = second.get(slug)
        missing = [name for name, v in ((_FIRST[kind], a), (_SECOND[kind], b)) if v is None]
        if missing:
            who = (
                f"Nem {missing[0]} nem o outro têm"
                if len(missing) == 2
                else f"{missing[0].capitalize()} não tem"
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
        elif rule.key == "flexao-sanduiche":
            assert sandwich is not None  # garantido por _RULES: só o painel a tem
            values.append(
                SynthesizedValue(
                    slug=slug,
                    rule=rule,
                    quality=quality,
                    value=sandwich.flexural_modulus(a.value, b.value),
                )
            )
        else:  # pragma: no cover - guarded by _validate
            raise SynthesisError(f"Regra sem implementação: {rule.key}")

    _add_declared_absences(kind, skipped)
    return values, skipped


#: Como cada tipo de dois pais chama os seus pais quando precisa dizer que falta
#: dado num deles. "O primeiro constituinte" e "a face" são a mesma posição, e
#: nomeá-la errado mandaria o leitor corrigir o material errado.
_FIRST = {COMPOSITO: "o primeiro constituinte", PAINEL: "a face"}
_SECOND = {COMPOSITO: "o segundo constituinte", PAINEL: "o núcleo"}


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

    values, skipped = _mix_two_parents(
        kind=COMPOSITO, fraction=fraction, first=first, second=second
    )
    return SynthesisResult(
        kind=COMPOSITO,
        kind_label=KIND_LABELS[COMPOSITO],
        parameters={"fracao_volumetrica": fraction},
        values=tuple(values),
        skipped=tuple(sorted(skipped, key=lambda item: item.slug)),
    )


def synthesize_sandwich(
    *, face_thickness: float, core_thickness: float, face: ParentValues, core: ParentValues
) -> SynthesisResult:
    """Um painel sanduíche: duas faces de espessura ``t`` sobre um núcleo ``c``.

    As espessuras entram na **mesma unidade**, e qual unidade é não importa:
    toda regra aqui lê só a razão ``t/c``. Densidade e as grandezas por massa
    saem pelas regras do compósito, na fração de espessura das faces — massa é
    massa, e o arranjo não a move. O módulo é o de **flexão equivalente**, e
    esse o arranjo move muito: ele passa do limite de Voigt nas mesmas frações,
    o que nenhuma regra das misturas pode fazer.

    Raises:
        SynthesisError: quando uma das espessuras não é positiva. Sem núcleo ou
            sem face o resultado é um dos pais, não um painel — e as duas
            degenerescências são exatamente onde ``E*`` devolve ``Ef`` e ``Ec``,
            o que os testes usam para conferir a fórmula.
    """
    if not face_thickness > 0 or not core_thickness > 0:
        raise SynthesisError(
            "As duas espessuras são positivas: sem núcleo ou sem faces o "
            "resultado é um dos materiais, não um painel sanduíche."
        )
    if not math.isfinite(face_thickness) or not math.isfinite(core_thickness):
        raise SynthesisError("As espessuras precisam ser números finitos.")

    sandwich = _Sandwich(face=face_thickness, core=core_thickness)
    values, skipped = _mix_two_parents(
        kind=PAINEL,
        fraction=sandwich.face_fraction,
        first=face,
        second=core,
        sandwich=sandwich,
    )
    return SynthesisResult(
        kind=PAINEL,
        kind_label=KIND_LABELS[PAINEL],
        parameters={
            "espessura_face": face_thickness,
            "espessura_nucleo": core_thickness,
        },
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
