"""What a real model is told, and the shape it must answer in.

Both real providers — the Messages API and the local Claude Code CLI — read this
module, so the instructions and the JSON contract cannot drift apart between
them.

The text is in Portuguese because everything it produces is read in Portuguese.
It restates, in words, rules that ``app/ai/guardrails.py`` already enforces in
code. That is not redundancy and it is not a substitute: the guardrail is the
guarantee, the prompt is not. But a model that understands the rule trips it
less often, and every trip is a suggestion the user does not get.

Note what the schemas here deliberately do **not** ask for. The model chooses an
index by slug and never writes its expression, goal or name — those are read
from the catalogue afterwards — and it never writes the caveats of an
explanation, which the backend owns. Fewer fields under the model's control is
fewer fields to police.
"""

from __future__ import annotations

from app.ai.provider import ProblemContext, ResultContext

# Operators a proposal may use. Existence and free-text operators are left out:
# they carry no threshold, so a model has nothing to add over the user simply
# ticking them in the form.
PROPOSABLE_OPERATORS = [
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "outside",
    "in_class",
    "not_in_class",
]

INTERPRET_SYSTEM = """\
Você lê enunciados de problemas de engenharia de materiais e os traduz para a \
estrutura de uma seleção pelo método de Ashby. Responda em português do Brasil.

Seu trabalho é **escolher** entre o que existe no catálogo apresentado: função, \
objetivo, variáveis livres, restrições, propriedades e índices de desempenho.

O que você não faz, em nenhuma hipótese:

1. Não invente entidade. Propriedade, classe, índice e eixo de gráfico só podem \
ser slugs presentes no catálogo. Você não escreve expressões de índice: apenas \
aponta o slug de um índice já cadastrado, cuja expressão o backend já validou.
2. Não produza número. Todo número de uma restrição tem de estar escrito no \
enunciado do usuário e ser copiado exatamente como ele escreveu.
3. Não converta unidade. "300 °C" vira value 300 com unit "degC" — nunca 573,15 \
com unit "K", mesmo que a conta esteja certa. Converter é trabalho do backend, \
que é quem registra a trilha valor original → valor normalizado; convertido por \
você, esse registro se perde.
4. Não adivinhe unidade. Se o enunciado traz um limite sem unidade para uma \
propriedade dimensionada, **não proponha a restrição**: escreva uma pergunta em \
open_questions citando a cláusula. Lido na unidade canônica, "no mínimo 300" \
pode virar 300 K e inverter o sentido do que o usuário disse.
4a. Os "Trechos de referência", quando presentes, servem só para entender \
terminologia e contexto técnico. Nenhum número deles vira restrição — todo \
número continua tendo que estar escrito no enunciado do usuário. Citar um \
trecho não abre exceção nenhuma na regra 2.
5. Não estime propriedade de material, não recomende material e não faça conta.

O que não couber nessas regras vira uma frase em open_questions. Dizer "não \
consegui ler isto" é uma resposta melhor do que adivinhar: uma proposta que \
viola as regras é descartada pelo backend antes de chegar ao usuário, então o \
palpite não o ajuda — só o deixa sem a explicação de por que não veio nada.

Seja conciso. evidence é um trecho **copiado** do enunciado, não uma paráfrase; \
rationale é uma frase curta.\
"""

EXPLAIN_SYSTEM = """\
Você redige, em português do Brasil, uma explicação sobre um resultado de \
seleção de materiais **que já foi calculado**. Você descreve o que aconteceu; \
não calcula, não recalcula e não corrige.

Regra absoluta sobre números: só escreva cifras que apareçam literalmente no \
bloco de dados da mensagem, copiadas como estão. Nada de somas, diferenças, \
percentuais, médias, arredondamentos ou ordens de grandeza — nem quando a conta \
estiver certa. Uma cifra que não esteja no bloco faz o backend descartar a \
resposta inteira, e o usuário fica sem explicação nenhuma.

Se houver "Trechos de referência", você pode citá-los para dar contexto — \
preencha sources com os números entre colchetes dos trechos que realmente \
usou (ex.: [1], [2]). Isso não muda a regra sobre números: cifra continua \
tendo que vir do bloco de dados, nunca de um trecho de referência.

Não afirme que um material é adequado à aplicação, não sugira substituições e \
não estime propriedade. O ranking mede o índice declarado sobre os valores \
cadastrados; ele não decide um projeto.

Formato: summary com uma frase; paragraphs com dois a quatro parágrafos curtos. \
As ressalvas do relatório são escritas pelo backend — não as repita.\
"""


# --- interpretation --------------------------------------------------------


def interpret_user(context: ProblemContext) -> str:
    """The catalogue the model may choose from, then the user's own words."""
    reference = _reference_block(context.retrieved)
    blocks = [
        "# Catálogo de propriedades (slug: nome | unidade canônica | unidades "
        "aceitas | melhor quando)",
        _properties_block(context) or "(vazio)",
        "",
        "# Índices de desempenho cadastrados (slug: nome | expressão | objetivo)",
        _indices_block(context) or "(vazio)",
        "",
        "# Classes de materiais (slug: nome)",
        _classes_block(context) or "(vazio)",
    ]
    if reference:
        blocks += ["", reference]
    blocks += [
        "",
        "# Enunciado do usuário (a única fonte legítima de números)",
        context.statement,
    ]
    return "\n".join(blocks)


def interpret_schema(context: ProblemContext) -> dict:
    """The JSON contract, narrowed to this catalogue.

    Slugs are enumerated wherever the field is a pure choice, which lets the
    model be right by construction instead of by obedience. Where an enumeration
    would be wrong — a class constraint has no property — the field stays a free
    string and the guardrail does the rejecting, out loud.
    """
    property_slugs = [p.slug for p in context.properties]
    index_slugs = [i.slug for i in context.indices]
    class_slugs = [c.slug for c in context.classes]

    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "function_text",
            "objective_text",
            "free_variables",
            "constraints",
            "properties",
            "indices",
            "charts",
            "open_questions",
        ],
        "properties": {
            "function_text": {
                "type": "string",
                "description": (
                    "Função mecânica do componente, curta (ex.: 'Viga em flexão'). "
                    "Vazio se o enunciado não disser."
                ),
            },
            "objective_text": {
                "type": "string",
                "description": (
                    "O que se quer minimizar ou maximizar (ex.: 'Minimizar massa'). "
                    "Vazio se o enunciado não disser."
                ),
            },
            "free_variables": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Variáveis livres de projeto citadas (ex.: 'espessura').",
            },
            "constraints": {
                "type": "array",
                "items": _constraint_item_schema(class_slugs),
                "description": (
                    "Restrições lidas no enunciado. Omita a restrição cujo número ou "
                    "unidade você não conseguir copiar do texto."
                ),
            },
            "properties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["slug", "rationale"],
                    "properties": {
                        "slug": _slug_schema(property_slugs),
                        "rationale": {"type": "string"},
                    },
                },
                "description": "Propriedades do catálogo que o enunciado menciona.",
            },
            "indices": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["slug", "rationale"],
                    "properties": {
                        "slug": _slug_schema(index_slugs),
                        "rationale": {"type": "string"},
                    },
                },
                "description": (
                    "Índices do catálogo compatíveis, o mais adequado primeiro. "
                    "Justifique apenas o que de fato casou com aquele índice."
                ),
            },
            "charts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["x", "y", "scale", "rationale"],
                    "properties": {
                        "x": _slug_schema(property_slugs),
                        "y": _slug_schema(property_slugs),
                        "scale": {"type": "string", "enum": ["linear", "log"]},
                        "rationale": {"type": "string"},
                    },
                },
                "description": (
                    "No máximo um mapa de propriedades, aquele em que o índice "
                    "escolhido vira uma reta: denominador no X, numerador no Y, "
                    "escala log. Lista vazia se nenhum se aplicar."
                ),
            },
            "open_questions": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "O que você não conseguiu ler, e o que o usuário precisa "
                    "escrever para que fique legível."
                ),
            },
        },
    }


def _constraint_item_schema(class_slugs: list[str]) -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["constraint", "evidence", "rationale"],
        "properties": {
            "constraint": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "operator",
                    "property_slug",
                    "value",
                    "value_min",
                    "value_max",
                    "unit",
                    "class_slugs",
                ],
                "properties": {
                    "operator": {
                        "type": "string",
                        "enum": PROPOSABLE_OPERATORS,
                        "description": (
                            "gte/lte/gt/lt usam value; between/outside usam "
                            "value_min e value_max; in_class/not_in_class usam "
                            "class_slugs."
                        ),
                    },
                    "property_slug": {
                        "type": "string",
                        "description": (
                            "Slug da propriedade restringida; string vazia nas "
                            "restrições de classe."
                        ),
                    },
                    "value": {
                        "type": ["number", "null"],
                        "description": "Número copiado do enunciado, sem converter. null se não se aplicar.",
                    },
                    "value_min": {"type": ["number", "null"]},
                    "value_max": {"type": ["number", "null"]},
                    "unit": {
                        "type": "string",
                        "description": (
                            "Unidade escrita pelo usuário, em notação Pint (degC, GPa, "
                            "g/cm**3). Vazia só quando a propriedade for adimensional."
                        ),
                    },
                    "class_slugs": {
                        "type": "array",
                        "items": _slug_schema(class_slugs),
                    },
                },
            },
            "evidence": {
                "type": "string",
                "description": "Trecho copiado do enunciado que originou esta leitura.",
            },
            "rationale": {"type": "string"},
        },
    }


def _slug_schema(values: list[str]) -> dict:
    """Enumerate the legitimate slugs, or fall back when there are none."""
    return {"type": "string", "enum": values} if values else {"type": "string"}


def _properties_block(context: ProblemContext) -> str:
    lines = []
    for facts in context.properties:
        symbol = f" ({facts.symbol})" if facts.symbol else ""
        accepted = ", ".join(facts.accepted_units) or facts.canonical_unit
        better = "maior é melhor" if facts.better_direction.startswith("max") else "menor é melhor"
        lines.append(
            f"- {facts.slug}: {facts.name}{symbol} | {facts.canonical_unit} "
            f"| aceita: {accepted} | {better}"
        )
    return "\n".join(lines)


def _indices_block(context: ProblemContext) -> str:
    lines = []
    for facts in context.indices:
        description = f" | {facts.description}" if facts.description else ""
        lines.append(
            f"- {facts.slug}: {facts.name} | {facts.expression} | {facts.goal}{description}"
        )
    return "\n".join(lines)


def _classes_block(context: ProblemContext) -> str:
    return "\n".join(f"- {facts.slug}: {facts.name}" for facts in context.classes)


def _reference_block(retrieved: tuple) -> str:
    """Numbered reference passages, or empty when nothing was retrieved."""
    if not retrieved:
        return ""
    lines = ["# Trechos de referência (vocabulário e contexto — nunca extraia número daqui)"]
    for i, chunk in enumerate(retrieved, start=1):
        pages = (
            f" — p. {chunk.page_start}-{chunk.page_end}"
            if chunk.page_start and chunk.page_end
            else ""
        )
        lines.append(f"[{i}] {chunk.document_title}{pages}")
        lines.append(f'    "{chunk.text}"')
    return "\n".join(lines)


# --- explanation -----------------------------------------------------------

EXPLAIN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "paragraphs", "sources"],
    "properties": {
        "summary": {"type": "string", "description": "Uma frase."},
        "paragraphs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "De dois a quatro parágrafos curtos.",
        },
        "sources": {
            "type": "array",
            "items": {"type": "integer"},
            "description": (
                "Índices (1, 2, ...) dos trechos de referência de fato usados. "
                "Vazio se nenhum foi citado ou se não havia nenhum disponível."
            ),
        },
    },
}


def explain_user(context: ResultContext) -> str:
    """The computed run, with every figure already written the way it may be quoted.

    Scores appear rounded to three decimals because that rounding is one of the
    readings ``AIService.explain`` accepts; showing full precision would invite
    the model to round it itself, and a self-rounded figure is an invented one.
    """
    lines = [f"Estudo: {context.study_name}"]
    if context.function_text:
        lines.append(f"Função: {context.function_text}")
    if context.objective_text:
        lines.append(f"Objetivo: {context.objective_text}")
    if context.index_name:
        expression = f" ({context.index_expression})" if context.index_expression else ""
        dimension = f", dimensão {context.index_dimension}" if context.index_dimension else ""
        lines.append(f"Índice de mérito: {context.index_name}{expression}{dimension}")

    lines.append(f"Materiais no catálogo: {context.initial_count}")
    lines.append(f"Candidatos após as restrições: {context.final_count}")

    if context.constraint_labels:
        lines.append("Restrições aplicadas: " + "; ".join(context.constraint_labels))
    else:
        lines.append("Restrições aplicadas: nenhuma")

    if context.funnel:
        lines.append("Eliminação passo a passo:")
        lines.extend(f"  - {label}: restaram {remaining}" for label, remaining in context.funnel)

    if context.ranked:
        lines.append("Ranking (posição, material, pontuação):")
        lines.extend(
            f"  - {rank}º {name}: {format_decimal(score)}" for name, rank, score in context.ranked
        )
    else:
        lines.append("Ranking: não foi calculado para este estudo.")

    if context.excluded_for_missing:
        lines.append(
            "Fora do ranking por dado ausente (não são candidatos ruins, são não avaliados):"
        )
        lines.extend(
            f"  - {name}: sem {', '.join(labels)}" for name, labels in context.excluded_for_missing
        )

    lines.append(
        "Sensibilidade aos pesos: "
        + (
            "o primeiro colocado muda quando os pesos variam."
            if context.sensitivity_changed
            else "o primeiro colocado se mantém sob as variações testadas."
        )
    )
    reference = _reference_block(context.retrieved)
    if reference:
        lines += ["", reference]
    return "\n".join(lines)


def format_decimal(value: float) -> str:
    """Three decimals with a decimal comma, as the interface writes numbers."""
    return f"{value:.3f}".replace(".", ",")
