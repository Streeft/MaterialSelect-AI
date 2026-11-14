"""Curated use scenarios for the project assistant (D-224). Pure data and rules.

A scenario is a situation a non-engineer describes in plain words — "vai ficar
na neve", "fica no sol", "encosta na comida" — mapped to the limits a material
must meet there. It is the second of the three origins a number of the project
assistant may have (D-224):

1. ``usuario`` — the number is in the person's own text (the grounding rule of
   ``app/ai/guardrails.py`` still applies);
2. ``cenario:<id>`` — the number comes from **this table**, with its source;
3. ``sugestao_ia`` — a range the model proposed when no scenario covers the case,
   marked "Sugestão da IA, revise" and never applied without confirmation.

The model only ever names a scenario by its ``id``. It never sees, copies or
writes the numbers below: the server expands a scenario into its limits from
this table, so a scenario limit is exactly as trustworthy as this file.

What this table is not: a claim about any material. Every limit here is a
requirement of the *use* ("serve abaixo de −30 °C"), and the catalogue still
decides who meets it. Values are written with their unit and converted to the
canonical one only through ``app/calculations/units.py`` (principle 4); the
tests check that every property exists, every unit converts and every value
lies inside the range the demo catalogue actually holds.

Sources are honest on purpose. Only a limit that comes from a published
reference names it; the others say they are the project's teaching ranges —
"Referência didática do projeto (faixa típica de uso)" — and never borrow the
authority of a standard they do not come from.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.text_fold import fold_accents, word_pattern

#: The source line of every scenario that is not taken from a publication.
DIDACTIC_SOURCE = "Referência didática do projeto (faixa típica de uso)"

#: Operators a scenario limit may use. ``exists`` and ``level_at_least`` carry
#: no number; the others carry ``value`` + ``unit``.
SCENARIO_OPERATORS = frozenset({"gt", "gte", "lt", "lte", "exists", "level_at_least"})
NUMERIC_SCENARIO_OPERATORS = frozenset({"gt", "gte", "lt", "lte"})

#: The durability scale of the catalogue (D-126, D-188), worst first. Repeated
#: here so a scenario level can be checked without a database; the tests check
#: it against the seeded definitions.
DURABILITY_SCALE = ("Muito pobre", "Pobre", "Aceitável", "Bom", "Excelente")
BIOCOMPATIBILITY_SCALE = (
    "Não indicado",
    "Contato superficial",
    "Dispositivo de curta duração",
    "Implantável",
)


@dataclass(frozen=True)
class ScenarioConstraint:
    """One limit of a scenario: a number with its unit, or an ordinal level."""

    property_slug: str
    operator: str
    value: float | None = None
    unit: str | None = None
    #: The minimum accepted level, for ``level_at_least`` (a label of the scale).
    level: str | None = None
    #: Why the limit is there, in the reader's words.
    note: str = ""


@dataclass(frozen=True)
class ScenarioCriterion:
    """A ranking preference a scenario adds: better is lower or higher."""

    property_slug: str
    direction: str  # "max" | "min"


@dataclass(frozen=True)
class UseScenario:
    """A situation of use, its trigger words, its limits and their source."""

    id: str
    name: str
    #: What the scenario asks for, in words and **without numbers** — this is
    #: what the model reads when it picks scenarios by id.
    summary: str
    #: Accent-folded, lower-case words or phrases. A trailing ``*`` matches any
    #: ending ("congel*" → congelado, congelar); otherwise the whole word.
    triggers: tuple[str, ...]
    constraints: tuple[ScenarioConstraint, ...]
    source: str
    criteria: tuple[ScenarioCriterion, ...] = ()
    #: Which parts of a product a triggered scenario reaches, when the
    #: rule-based plan spreads it over components: ``todas`` (temperature,
    #: budget — every part lives in it), ``expostas`` (sun, water, chemicals —
    #: only the parts on the outside) or ``uso`` (touches the skin, insulates —
    #: only the part that does it).
    scope: str = "uso"


def _limit(slug: str, operator: str, value: float, unit: str, note: str) -> ScenarioConstraint:
    return ScenarioConstraint(slug, operator, value=value, unit=unit, note=note)


def _level(slug: str, level: str, note: str) -> ScenarioConstraint:
    return ScenarioConstraint(slug, "level_at_least", level=level, note=note)


USE_SCENARIOS: tuple[UseScenario, ...] = (
    UseScenario(
        id="frio-extremo",
        scope="todas",
        name="Frio extremo",
        summary="Uso na neve ou em frio intenso: o material precisa servir em "
        "temperatura bem abaixo de zero sem ficar quebradiço.",
        triggers=(
            "frio",
            "neve",
            "esqui",
            "inverno",
            "gelo",
            "geada",
            "congel*",
            "polar",
            "antartic*",
            "abaixo de zero",
            "negativ*",
            "freezer",
            "snowboard",
        ),
        constraints=(
            _limit(
                "temp_min_servico",
                "lte",
                -30.0,
                "degC",
                "Serve até pelo menos −30 °C, a faixa de uma pista de esqui num dia frio.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="calor-moderado",
        scope="todas",
        name="Calor moderado",
        summary="Uso em lugar quente, como dentro de um carro ao sol ou em contato "
        "com água quente: o material não pode amolecer.",
        triggers=("calor", "quente", "aquec*", "verao", "agua quente", "estufa"),
        constraints=(
            _limit(
                "temp_max_servico",
                "gte",
                80.0,
                "degC",
                "Aguenta pelo menos 80 °C, o que um objeto fechado ao sol ou água quente alcança.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="calor-alto",
        scope="todas",
        name="Calor alto ou forno",
        summary="Uso perto de fogo, forno ou chapa quente: o material precisa "
        "aguentar temperatura de cozinha de forno.",
        triggers=(
            "forno",
            "fogao",
            "fogo",
            "chama",
            "churrasq*",
            "lareira",
            "assar",
            "panela",
            "frigideira",
            "escapamento",
            "alta temperatura",
            "chapa quente",
        ),
        constraints=(
            _limit(
                "temp_max_servico",
                "gte",
                250.0,
                "degC",
                "Aguenta pelo menos 250 °C, a temperatura máxima de um forno doméstico.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="externo-uv",
        scope="expostas",
        name="Uso externo, com sol",
        summary="Fica ao ar livre e no sol: o material precisa resistir bem à "
        "radiação ultravioleta.",
        triggers=(
            "sol",
            "ao ar livre",
            "externo",
            "externa",
            "exterior",
            "intemperie*",
            "uv",
            "ultravioleta",
            "jardim",
            "varanda",
            "telhado",
            "fachada",
            "esqui",
        ),
        constraints=(
            _level(
                "resistencia-radiacao-uv",
                "Bom",
                "Resistência à radiação UV pelo menos “Bom”: fica exposto ao sol.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="agua-doce",
        scope="expostas",
        name="Água doce",
        summary="Molha com frequência (chuva, banho, lavagem): o material precisa "
        "resistir bem à água doce.",
        triggers=(
            "agua",
            "chuva",
            "molhad*",
            "molhar",
            "umid*",
            "piscina",
            "banheiro",
            "lavar",
            "lavave*",
            "rio",
            "lago",
            "aquario",
        ),
        constraints=(
            _level(
                "resistencia-agua-doce",
                "Bom",
                "Resistência à água doce pelo menos “Bom”: vai molhar com frequência.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="agua-salgada",
        scope="expostas",
        name="Água salgada ou ambiente marinho",
        summary="Uso no mar, na praia ou em barco: o material precisa resistir "
        "bem à água salgada.",
        triggers=(
            "mar",
            "maritim*",
            "marinh*",
            "praia",
            "salgad*",
            "oceano",
            "barco",
            "navio",
            "litoral",
            "maresia",
        ),
        constraints=(
            _level(
                "resistencia-agua-salgada",
                "Bom",
                "Resistência à água salgada pelo menos “Bom”: ambiente marinho corrói.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="contato-alimento",
        name="Contato com alimento",
        summary="Encosta em comida ou bebida: o material precisa resistir à água e "
        "aos ácidos fracos dos alimentos.",
        triggers=(
            "alimento*",
            "alimentar",
            "comida",
            "cozinha",
            "prato",
            "talher*",
            "copo",
            "garrafa",
            "bebida",
            "marmita",
            "utensilio*",
            "panela",
        ),
        constraints=(
            _level(
                "resistencia-agua-doce",
                "Bom",
                "Resistência à água doce pelo menos “Bom”: é lavado e encosta em líquidos.",
            ),
            _level(
                "resistencia-acidos-fracos",
                "Bom",
                "Resistência a ácidos fracos pelo menos “Bom”: vinagre, limão e molhos são ácidos.",
            ),
        ),
        source=DIDACTIC_SOURCE
        + ". A aptidão legal para contato com alimento (na União Europeia, o "
        "Regulamento (CE) nº 1935/2004) não está no catálogo: confira com o fabricante.",
    ),
    UseScenario(
        id="contato-pele",
        name="Contato com a pele",
        summary="Vestível ou encosta no corpo por muito tempo: o material precisa "
        "ser indicado ao menos para contato superficial com a pele.",
        triggers=(
            "pele",
            "roupa*",
            "vestivel",
            "vestir",
            "vestimenta",
            "jaqueta",
            "casaco",
            "luva*",
            "meia*",
            "calcado*",
            "sapato*",
            "bota*",
            "pulseira",
            "oculos",
        ),
        constraints=(
            _level(
                "biocompatibilidade",
                "Contato superficial",
                "Biocompatibilidade pelo menos “Contato superficial”: encosta na pele.",
            ),
        ),
        source=DIDACTIC_SOURCE
        + ". A avaliação biológica formal (série ISO 10993, para dispositivos "
        "médicos) não está no catálogo.",
    ),
    UseScenario(
        id="estrutural",
        name="Estrutura que sustenta carga",
        summary="Peça que sustenta peso (viga, pilar, laje, prateleira): material "
        "rígido o bastante para não flechar sob a carga.",
        triggers=(
            "estrutura*",
            "estrutural",
            "viga*",
            "pilar*",
            "laje*",
            "sustentar",
            "aguentar peso",
            "suportar peso",
            "ponte",
            "prateleira",
        ),
        constraints=(
            _limit(
                "modulo_young",
                "gte",
                10.0,
                "GPa",
                "Módulo de Young de pelo menos 10 GPa: da madeira para cima; "
                "deixa de fora plásticos comuns, borrachas e espumas.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="estrutural-leve",
        name="Estrutural leve",
        summary="Peça que carrega esforço e precisa ser leve: material rígido de "
        "verdade e de baixa densidade.",
        triggers=(
            "estrutura leve",
            "drone",
            "bicicleta",
            "aviao",
            "aeromodelo",
            "leve e rigid*",
            "leve e resistente",
            "suporte leve",
            "patinete",
        ),
        constraints=(
            _limit(
                "densidade",
                "lte",
                3.0,
                "g/cm**3",
                "Densidade até 3 g/cm³: da faixa do alumínio para baixo.",
            ),
            _limit(
                "modulo_young",
                "gte",
                1.0,
                "GPa",
                "Módulo de Young de pelo menos 1 GPa: deixa de fora espumas e borrachas.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="isolamento-termico",
        name="Isolamento térmico",
        summary="Precisa segurar o calor (ou o frio) de um lado: condutividade " "térmica baixa.",
        triggers=(
            "isolante termico",
            "isolamento termico",
            "isolar do frio",
            "isolar do calor",
            "isolar termicamente",
            "manter quente",
            "manter aquecido",
            "manter frio",
            "termic*",
            "cooler",
            "isopor",
            "agasalh*",
            "aquecid*",
        ),
        constraints=(
            _limit(
                "condutividade_termica",
                "lte",
                0.1,
                "W/(m*K)",
                "Condutividade térmica até 0,1 W/(m·K): a faixa das espumas e fibras isolantes.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="isolamento-eletrico",
        name="Isolamento elétrico",
        summary="Não pode conduzir eletricidade: material isolante elétrico, de "
        "resistividade muito alta.",
        triggers=(
            "isolante eletrico",
            "isolamento eletrico",
            "eletric*",
            "eletronic*",
            "fio",
            "fios",
            "tomada",
            "choque eletrico",
            "carregador",
            "cabo eletrico",
        ),
        constraints=(
            _limit(
                "resistividade_eletrica",
                "gte",
                1e10,
                "ohm*m",
                "Resistividade de pelo menos 10¹⁰ Ω·m: a faixa dos isolantes elétricos.",
            ),
        ),
        source="Callister & Rethwisch, Materials Science and Engineering: An "
        "Introduction, cap. 18 (propriedades elétricas): isolantes têm "
        "condutividade entre 10⁻²⁰ e 10⁻¹⁰ (Ω·m)⁻¹.",
    ),
    UseScenario(
        id="baixo-custo",
        scope="todas",
        name="Baixo custo",
        summary="O preço pesa na escolha: só materiais com custo cadastrado, "
        "ordenados do mais barato para o mais caro.",
        triggers=(
            "barato",
            "barata",
            "baixo custo",
            "economic*",
            "orcamento",
            "custo",
            "preco",
            "acessivel",
            "popular",
            "pouco dinheiro",
        ),
        constraints=(
            ScenarioConstraint(
                "custo_massa",
                "exists",
                note="Só entra quem tem custo cadastrado: sem o dado, não dá para comparar preço.",
            ),
        ),
        criteria=(ScenarioCriterion("custo_massa", "min"),),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="acidos-alcalis",
        scope="expostas",
        name="Contato com ácidos e álcalis",
        summary="Encosta em produtos químicos, de limpeza ou de laboratório: o "
        "material precisa resistir a ácidos e álcalis fracos.",
        triggers=(
            "acido*",
            "alcali*",
            "alcalin*",
            "quimic*",
            "produto de limpeza",
            "limpeza",
            "cloro",
            "soda",
            "laboratorio",
            "vinagre",
            "corrosiv*",
        ),
        constraints=(
            _level(
                "resistencia-acidos-fracos",
                "Bom",
                "Resistência a ácidos fracos pelo menos “Bom”.",
            ),
            _level(
                "resistencia-alcalis-fracos",
                "Bom",
                "Resistência a álcalis fracos pelo menos “Bom”.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="impermeavel",
        name="Impermeável",
        summary="Não pode encharcar: o material precisa absorver muito pouca água.",
        triggers=(
            "impermeave*",
            "a prova d'agua",
            "a prova dagua",
            "prova de agua",
            "nao molhar",
            "nao encharcar",
            "repelir agua",
        ),
        constraints=(
            _limit(
                "absorcao_agua",
                "lte",
                0.5,
                "percent",
                "Absorção de água até 0,5 % em massa: não encharca.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
    UseScenario(
        id="flexivel",
        name="Flexível",
        summary="Precisa dobrar e acompanhar o movimento (tecido, capa, vedação): "
        "material de baixa rigidez.",
        triggers=(
            "flexive*",
            "flexibilidade",
            "dobrave*",
            "dobrar",
            "macio",
            "macia",
            "maleave*",
            "tecido",
            "textil",
            "roupa*",
            "vestimenta",
        ),
        constraints=(
            _limit(
                "modulo_young",
                "lte",
                3.0,
                "GPa",
                "Módulo de Young até 3 GPa: dobra sem quebrar, como polímeros e borrachas.",
            ),
        ),
        source=DIDACTIC_SOURCE,
    ),
)

SCENARIO_IDS: tuple[str, ...] = tuple(s.id for s in USE_SCENARIOS)
_BY_ID = {s.id: s for s in USE_SCENARIOS}


SCENARIO_SCOPES = ("todas", "expostas", "uso")


def scenario_by_id(scenario_id: str) -> UseScenario | None:
    """The scenario with this id, or ``None``."""
    return _BY_ID.get(scenario_id)


def fold(text: str) -> str:
    """Accent- and case-folded text with one space between words."""
    return " ".join(fold_accents(text or "").lower().split())


def triggered_by(scenario: UseScenario, text: str) -> str | None:
    """The first trigger of ``scenario`` the text contains, or ``None``."""
    folded = fold(text)
    for trigger in scenario.triggers:
        if word_pattern(trigger).search(folded):
            return trigger.rstrip("*")
    return None


def match_scenarios(text: str) -> list[UseScenario]:
    """Every scenario one of whose trigger words the text contains, in table order."""
    return [s for s in USE_SCENARIOS if triggered_by(s, text) is not None]
