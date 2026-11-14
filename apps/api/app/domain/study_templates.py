"""Ready-made study formulations for the selection wizard (D-210).

A template is the *formulation* of a classic Ashby problem — function,
objective, the design constraint in words, the free variable and the
performance index — and nothing else. It carries **no material number**
(principle 1): no threshold, no property value, no default limit. Every
number a run prints still comes from the catalogue.

The limits a template applies are ``exists`` constraints on the properties its
index reads: a material without Young's modulus cannot be ranked by
``E^(1/2)/ρ``, and saying so in the funnel ("Módulo de Young existe") is the
honest answer — the index would only come out undefined for it later.

The index names a catalogue index by slug when there is one (the seeded Ashby
indices, ``app/db/seed.py``) and also writes its expression down, so a
catalogue that lacks the slug still gets the same formulation as a custom
expression. The expressions use the same safe grammar as any other index and
are validated against the live catalogue before a template is offered.

References: M. F. Ashby, *Materials Selection in Mechanical Design*, chapters
on performance indices (beam, panel, spring and heat-exchanger examples).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.text_fold import fold_accents, word_pattern

#: The criterion key that ranks by the study's own index (see
#: ``SelectionService.INDEX_KEY``). Repeated here so this module stays pure.
INDEX_CRITERION_KEY = "__index__"


@dataclass(frozen=True)
class StudyTemplate:
    """One classic formulation: words and an index expression, no data."""

    slug: str
    name: str
    summary: str
    function_text: str
    objective_text: str
    design_constraint: str
    free_variables: tuple[str, ...]
    #: Properties the index reads; each becomes an ``exists`` limit.
    required_properties: tuple[str, ...]
    #: A seeded index with this formulation, when the catalogue has it.
    index_slug: str | None
    index_name: str
    index_expression: str
    index_goal: str
    reference: str
    #: Accent-folded words that point a plain-language request at this
    #: formulation (D-224): the project assistant's rule-based fallback picks
    #: the template whose words the text holds the most of.
    keywords: tuple[str, ...] = ()


_ASHBY = "Ashby, Materials Selection in Mechanical Design"

STUDY_TEMPLATES: tuple[StudyTemplate, ...] = (
    StudyTemplate(
        slug="viga-leve-rigida",
        name="Viga leve e rígida",
        summary="Viga em flexão com rigidez especificada: o mínimo de massa.",
        function_text="Viga em flexão",
        objective_text="Minimizar a massa",
        design_constraint="Rigidez à flexão especificada; comprimento fixo",
        free_variables=("área da seção",),
        required_properties=("modulo_young", "densidade"),
        index_slug="viga-leve-rigidez",
        index_name="Viga leve limitada por rigidez",
        index_expression="sqrt(modulo_young) / densidade",
        index_goal="maximize",
        reference=_ASHBY,
        keywords=(
            "viga*",
            "estrutura*",
            "pilar*",
            "prateleira*",
            "suporte*",
            "ponte*",
            "predio*",
            "edificio*",
            "casa",
            "casas",
            "quadro*",
            "haste*",
            "barra*",
        ),
    ),
    StudyTemplate(
        slug="mola-leve",
        name="Mola leve",
        summary="Mola que armazena o máximo de energia elástica por unidade de massa.",
        function_text="Mola (armazenar energia elástica)",
        objective_text="Minimizar a massa para a mesma energia armazenada",
        design_constraint="Não escoar: tensão máxima abaixo do limite de escoamento",
        free_variables=("dimensões da mola",),
        required_properties=("limite_escoamento", "modulo_young", "densidade"),
        index_slug=None,
        index_name="Mola leve (σy²/Eρ)",
        index_expression="limite_escoamento ** 2 / (modulo_young * densidade)",
        index_goal="maximize",
        reference=_ASHBY,
        keywords=("mola*", "amortec*", "trampolim", "arco", "estilingue"),
    ),
    StudyTemplate(
        slug="painel-leve-rigido",
        name="Painel leve e rígido",
        summary="Placa em flexão com rigidez especificada: o mínimo de massa.",
        function_text="Painel (placa) em flexão",
        objective_text="Minimizar a massa",
        design_constraint="Rigidez à flexão especificada; comprimento e largura fixos",
        free_variables=("espessura",),
        required_properties=("modulo_young", "densidade"),
        index_slug="placa-leve-rigidez",
        index_name="Placa leve limitada por rigidez",
        index_expression="cbrt(modulo_young) / densidade",
        index_goal="maximize",
        reference=_ASHBY,
        keywords=(
            "painel*",
            "paineis",
            "placa*",
            "chapa*",
            "parede*",
            "tampa*",
            "casco*",
            "piso*",
            "porta*",
            "carenagem",
            "capa*",
            "roupa*",
            "jaqueta*",
            "tecido*",
        ),
    ),
    StudyTemplate(
        slug="trocador-de-calor",
        name="Trocador de calor",
        summary="Parede fina que conduz calor entre dois fluidos sob diferença de pressão.",
        function_text="Parede de trocador de calor (conduzir calor entre dois fluidos)",
        objective_text="Maximizar o fluxo de calor por unidade de área",
        design_constraint="Suportar a diferença de pressão entre os fluidos sem escoar",
        free_variables=("espessura da parede",),
        required_properties=("condutividade_termica", "limite_escoamento"),
        index_slug=None,
        index_name="Trocador de calor (λσy)",
        index_expression="condutividade_termica * limite_escoamento",
        index_goal="maximize",
        reference=_ASHBY,
        keywords=(
            "trocador*",
            "radiador*",
            "aquecedor*",
            "dissipador*",
            "panela*",
            "serpentina*",
            "caldeira*",
            "conduzir calor",
        ),
    ),
)


def nearest_template(text: str) -> StudyTemplate | None:
    """The template whose keywords the text holds the most of, or ``None``.

    Ties go to table order, so the answer never depends on anything but the
    text. ``None`` when not one keyword appears — the caller then ranks by
    the properties its limits name instead of guessing a formulation.
    """
    folded = fold_accents(text or "").lower()
    best: tuple[int, StudyTemplate] | None = None
    for template in STUDY_TEMPLATES:
        hits = sum(1 for word in template.keywords if word_pattern(word).search(folded))
        if hits and (best is None or hits > best[0]):
            best = (hits, template)
    return best[1] if best else None


def template_by_slug(slug: str) -> StudyTemplate | None:
    """The template with this slug, or ``None``."""
    return next((t for t in STUDY_TEMPLATES if t.slug == slug), None)
