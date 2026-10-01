\"\"\"What a real model is told, and the shape it must answer in.

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
\"\"\"

from __future__ import annotations

from app.ai.provider import ProblemContext, ResultContext
from app.models.enums import DocumentKind

#: Document kinds that are not page-oriented. When retrieved chunks come from
#: these kinds, citation locators must not emit "— p. 1-1".
UNPAGINATED_KINDS = frozenset({DocumentKind.LINK, DocumentKind.VIDEO})

# Operators a proposal may use. Existence and free-text operators are left out:
# they carry no threshold, so a model has nothing to add over the user simply
# ticking them in the form.
PROPOSABLE_OPERATORS = [
    \"gt\",
    \"gte\",
    \"lt\",
    \"lte\",
    \"between\",
    \"outside\",
    \"in_class\",\n    \"not_in_class\",
]

INTERPRET_SYSTEM = \"\"\"\\\nVocê lê enunciados de problemas de engenharia de materiais e os traduz para a \\\nestrutura de uma seleção pelo método de Ashby. Responda em português do Brasil.

Seu trabalho é **escolher** entre o que existe no catálogo apresentado: função, \\\nobjetivo, variáveis livres, restrições, propriedades e índices de desempenho.

O que você não faz, em nenhuma hipótese:

1. Não invente entidade. Propriedade, classe, índice e eixo de gráfico só podem \\\nser slugs presentes no catálogo. Você não escreve expressões de índice: apenas \\\naponta o slug de um índice já cadastrado, cuja expressão o backend já validou.
2. Não produza número. Todo número de uma restrição tem de estar escrito no \\\nenunciado do usuário e ser copiado exatamente como ele escreveu.
3. Não converta unidade. \"300 °C\" vira value 300 com unit \"degC\" — nunca 573,15 \\\ncom unit \"K\", mesmo que a conta esteja certa. Converter é trabalho do backend, \\\nque é quem registra a trilha valor original → valor normalizado; convertido por \\\nvocê, esse registro se perde.
4. Não adivinhe unidade. Se o enunciado traz um limite sem unidade para uma \\\npropriedade dimensionada, **não proponha a restrição**: escreva uma pergunta em \\\nopen_questions citando a cláusula. Lido na unidade canônica, \"no mínimo 300\" \\\npode virar 300 K e inverter o sentido do que o usuário disse.
4a. Os \"Trechos de referência\", quando presentes, servem só para entender \\\nterminologia e contexto técnico. Nenhum número deles vira restrição — todo \\\nnúmero continua tendo que estar escrito no enunciado do usuário. Citar um \\\ntrecho não abre exceção nenhuma na regra 2.
5. Não estime propriedade de material, não recomende material e não faça conta.

O que não couber nessas regras vira uma frase em open_questions. Dizer \"não \\\nconsegui ler isto\" é uma resposta melhor do que adivinhar: uma proposta que \\\nviola as regras é descartada pelo backend antes de chegar ao usuário, então o \\\npalpite não o ajuda — só o deixa sem a explicação de por que não veio nada.

Seja conciso. evidence é um trecho **copiado** do enunciado, não uma paráfrase; \\\nrationale é uma frase curta.\\\n\"\"\"

EXPLAIN_SYSTEM = \"\"\"\\\nVocê redige, em português do Brasil, uma explicação sobre um resultado de \\\nseleção de materiais **que já foi calculado**. Você descreve o que aconteceu; \\\nnão calcula, não recalcula e não corrige.

Regra absoluta sobre números: só escreva cifras que apareçam literalmente no \\\nbloco de dados da mensagem, copiadas como estão. Nada de somas, diferenças, \\\npercentuais, médias, arredondamentos ou ordens de grandeza — nem quando a conta \\\nestiver certa. Uma cifra que não esteja no bloco faz o backend descartar a \\\nresposta inteira, e o usuário fica sem explicação nenhuma.

{sources_rule}Não afirme que um material é adequado à aplicação, não sugira substituições e \\\nnão estime propriedade. O ranking mede o índice declarado sobre os valores \\\ncadastrados; ele não decide um projeto.

Formato: summary com uma frase; paragraphs com dois a quatro parágrafos curtos. \\\nAs ressalvas do relatório são escritas pelo backend — não as repita.\\\n\"\"\"

#: Only when there are reference passages to cite (D-89). Without them the
#: question does not exist, and asking it anyway is how a strict-schema server
#: came to reject a whole explanation for a missing ``sources``.
_EXPLAIN_SOURCES_RULE = \"\"\"Há \"Trechos de referência\" na mensagem: você pode citá-los para dar contexto — \\\npreencha sources com os números entre colchetes dos trechos que realmente \\\nusou (ex.: [1], [2]), ou deixe a lista vazia se não usou nenhum. Isso não muda \\\na regra sobre números: cifra continua tendo que vir do bloco de dados, nunca \\\nde um trecho de referência.

\"\"\"


def explain_system(context: ResultContext) -> str:\n    \"\"\"The explanation's instructions, with the citation rule only when there
    is something to cite.\"\"\"\n    return EXPLAIN_SYSTEM.format(sources_rule=_EXPLAIN_SOURCES_RULE if context.retrieved else \"\")


# --- interpretation --------------------------------------------------------


def interpret_user(context: ProblemContext) -> str:\n    \"\"\"The catalogue the model may choose from, then the user's own words.\"\"\"\n    reference = _reference_block(context.retrieved)\n    blocks = [\n        \"# Catálogo de propriedades (slug: nome | unidade canônica | unidades \"\n        \"aceitas | melhor quando)\",\n        _properties_block(context) or \"(vazio)\",\n        \"\",\n        \"# Índices de desempenho cadastrados (slug: nome | expressão | objetivo)\",\n        _indices_block(context) or \"(vazio)\",\n        \"\",\n        \"# Classes de materiais (slug: nome)\",\n        _classes_block(context) or \"(vazio)\",\n    ]\n    if reference:\n        blocks += [\"\", reference]\n    blocks += [\n        \"\",\n        \"# Enunciado do usuário (a única fonte legítima de números)\",\n        context.statement,\n    ]\n    return \"\\n\".join(blocks)


def interpret_schema(context: ProblemContext) -> dict:\n    \"\"\"The JSON contract, narrowed to this catalogue.

    Slugs are enumerated wherever the field is a pure choice, which lets the
    model be right by construction instead of by obedience. Where an enumeration
    would be wrong — a class constraint has no property — the field stays a free
    string and the guardrail does the rejecting, out loud.
    \"\"\"\n    property_slugs = [p.slug for p in context.properties]\n    index_slugs = [i.slug for i in context.indices]\n    class_slugs = [c.slug for c in context.classes]

    return {\n        \"type\": \"object\",\n        \"additionalProperties\": False,\n        \"required\": [\n            \"function_text\",\n            \"objective_text\",\n            \"free_variables\",\n            \"constraints\",\n            \"properties\",\n            \"indices\",\n            \"charts\",\n            \"open_questions\",\n        ],\n        \"properties\": {\n            \"function_text\": {\n                \"type\": \"string\",\n                \"description\": (\n                    \"Função mecânica do componente, curta (ex.: 'Viga em flexão'). \"\n                    \"Vazio se o enunciado não disser.\"\n                ),\n            },\n            \"objective_text\": {\n                \"type\": \"string\",\n                \"description\": (\n                    \"O que se quer minimizar ou maximizar (ex.: 'Minimizar massa'). \"\n                    \"Vazio se o enunciado não disser.\"\n                ),\n            },\n            \"free_variables\": {\n                \"type\": \"array\",\n                \"items\": {\"type\": \"string\"},\n                \"description\": \"Variáveis livres de projeto citadas (ex.: 'espessura').\",\n            },\n            \"constraints\": {\n                \"type\": \"array\",\n                \"items\": _constraint_item_schema(class_slugs),\n                \"description\": (\n                    \"Restrições lidas no enunciado. Omita a restrição cujo número ou \"\n                    \"unidade você não conseguir copiar do texto.\"\n                ),\n            },\n            \"properties\": {\n                \"type\": \"array\",\n                \"items\": {\n                    \"type\": \"object\",\n                    \"additionalProperties\": False,\n                    \"required\": [\"slug\", \"rationale\"],\n                    \"properties\": {\n                        \"slug\": _slug_schema(property_slugs),\n                        \"rationale\": {\"type\": \"string\"},\n                    },\n                },\n                \"description\": \"Propriedades do catálogo que o enunciado menciona.\",\n            },\n            \"indices\": {\n                \"type\": \"array\",\n                \"items\": {\n                    \"type\": \"object\",\n                    \"additionalProperties\": False,\n                    \"required\": [\"slug\", \"rationale\"],\n                    \"properties\": {\n                        \"slug\": _slug_schema(index_slugs),\n                        \"rationale\": {\"type\": \"string\"},\n                    },\n                },\n                \"description\": (\n                    \"Índices do catálogo compatíveis, o mais adequado primeiro. \"\n                    \"Justifique apenas o que de fato casou com aquele índice.\"\n                ),\n            },\n            \"charts\": {\n                \"type\": \"array\",\n                \"items\": {\n                    \"type\": \"object\",\n                    \"additionalProperties\": False,\n                    \"required\": [\"x\", \"y\", \"scale\", \"rationale\"],\n                    \"properties\": {\n                        \"x\": _slug_schema(property_slugs),\n                        \"y\": _slug_schema(property_slugs),\n                        \"scale\": {\"type\": \"string\", \"enum\": [\"linear\", \"log\"]},\n                        \"rationale\": {\"type\": \"string\"},\n                    },\n                },\n                \"description\": (\n                    \"No máximo um mapa de propriedades, aquele em que o índice \"\n                    \"escolhido vira uma reta: denominador no X, numerador no Y, \"\n                    \"escala log. Lista vazia se nenhum se aplicar.\"\n                ),\n            },\n            \"open_questions\": {\n                \"type\": \"array\",\n                \"items\": {\"type\": \"string\"},\n                \"description\": (\n                    \"O que você não conseguiu ler, e o que o usuário precisa \"\n                    \"escrever para que fique legível.\"\n                ),\n            },\n        },\n    }


def _constraint_item_schema(class_slugs: list[str]) -> dict:\n    return {\n        \"type\": \"object\",\n        \"additionalProperties\": False,\n        \"required\": [\"constraint\", \"evidence\", \"rationale\"],\n        \"properties\": {\n            \"constraint\": {\n                \"type\": \"object\",\n                \"additionalProperties\": False,\n                \"required\": [\n                    \"operator\",\n                    \"property_slug\",\n                    \"value\",\n                    \"value_min\",\n                    \"value_max\",\n                    \"unit\",\n                    \"class_slugs\",\n                ],\n                \"properties\": {\n                    \"operator\": {\n                        \"type\": \"string\",\n                        \"enum\": PROPOSABLE_OPERATORS,\n                        \"description\": (\n                            \"gte/lte/gt/lt usam value; between/outside usam \"\n                            \"value_min e value_max; in_class/not_in_class usam \"\n                            \"class_slugs.\"\n                        ),\n                    },\n                    \"property_slug\": {\n                        \"type\": \"string\",\n                        \"description\": (\n                            \"Slug da propriedade restringida; string vazia nas \"\n                            \"restrições de classe.\"\n                        ),\n                    },\n                    \"value\": {\n                        \"type\": [\"number\", \"null\"],\n                        \"description\": \"Número copiado do enunciado, sem converter. null se não se aplicar.\",\n                    },\n                    \"value_min\": {\"type\": [\"number\", \"null\"]},\n                    \"value_max\": {\"type\": [\"number\", \"null\"]},\n                    \"unit\": {\n                        \"type\": \"string\",\n                        \"description\": (\n                            \"Unidade escrita pelo usuário, em notação Pint (degC, GPa, \"\n                            \"g/cm**3). Vazia só quando a propriedade for adimensional.\"\n                        ),\n                    },\n                    \"class_slugs\": {\n                        \"type\": \"array\",\n                        \"items\": _slug_schema(class_slugs),\n                    },\n                },\n            },\n            \"evidence\": {\n                \"type\": \"string\",\n                \"description\": \"Trecho copiado do enunciado que originou esta leitura.\",\n            },\n            \"rationale\": {\"type\": \"string\"},\n        },\n    }


def _slug_schema(values: list[str]) -> dict:\n    \"\"\"Enumerate the legitimate slugs, or fall back when there are none.\"\"\"\n    return {\"type\": \"string\", \"enum\": values} if values else {\"type\": \"string\"}


def _properties_block(context: ProblemContext) -> str:\n    lines = []\n    for facts in context.properties:\n        symbol = f\" ({facts.symbol})\" if facts.symbol else \"\"\n        accepted = \", \".join(facts.accepted_units) or facts.canonical_unit\n        better = \"maior é melhor\" if facts.better_direction.startswith(\"max\") else \"menor é melhor\"\n        lines.append(\n            f\"- {facts.slug}: {facts.name}{symbol} | {facts.canonical_unit} \"\n            f\"| aceita: {accepted} | {better}\"\n        )\n    return \"\\n\".join(lines)


def _indices_block(context: ProblemContext) -> str:\n    lines = []\n    for facts in context.indices:\n        description = f\" | {facts.description}\" if facts.description else \"\"\n        lines.append(\n            f\"- {facts.slug}: {facts.name} | {facts.expression} | {facts.goal}{description}\"\n        )\n    return \"\\n\".join(lines)


def _classes_block(context: ProblemContext) -> str:\n    return \"\\n\".join(f\"- {facts.slug}: {facts.name}\" for facts in context.classes)


def _format_pages(chunk: object) -> str:\n    \"\"\"Format the page locator for a reference chunk.

    Unpaginated kinds (LINK, VIDEO) have no page number and emit empty string.
    Paginated chunks on a single page format as ' — p. X'.
    Paginated chunks spanning multiple pages format as ' — p. X-Y'.
    \"\"\"\n    if getattr(chunk, \"document_kind\", None) in UNPAGINATED_KINDS:\n        return \"\"\n    start = getattr(chunk, \"page_start\", None)\n    end = getattr(chunk, \"page_end\", None)\n    if not (start and end):\n        return \"\"\n    if start == end:\n        return f\" — p. {start}\"\n    return f\" — p. {start}-{end}\"


def _reference_block(retrieved: tuple) -> str:\n    \"\"\"Numbered reference passages, or empty when nothing was retrieved.\"\"\"\n    if not retrieved:\n        return \"\"\n    lines = [\"# Trechos de referência (vocabulário e contexto — nunca extraia número daqui)\"]\n    for i, chunk in enumerate(retrieved, start=1):\n        pages = _format_pages(chunk)\n        lines.append(f\"[{i}] {chunk.document_title}{pages}\")\n        lines.append(f'    \"{chunk.text}\"')\n    return \"\\n\".join(lines)


# --- explanation -----------------------------------------------------------


def explain_schema(context: ResultContext) -> dict:\n    \"\"\"The explanation's JSON contract, built for this context (D-89).

    ``sources`` is part of it **only when there are reference passages**. A
    strict-schema server (Groq, ``AI_JSON_MODE=schema``) checks the generated
    JSON against this schema and throws the whole answer away when a required
    field is missing — and with nothing to cite, a model leaving out the list of
    citations is the natural answer, not an error. ``model_base.explain``
    already reads a missing ``sources`` as none; only the schema demanded it.

    Built per call rather than kept as a constant for the same reason
    ``interpret_schema`` is: the contract depends on what the prompt contains.
    \"\"\"\n    properties: dict = {\n        \"summary\": {\"type\": \"string\", \"description\": \"Uma frase.\"},\n        \"paragraphs\": {\n            \"type\": \"array\",\n            \"items\": {\"type\": \"string\"},\n            \"description\": \"De dois a quatro parágrafos curtos.\",\n        },\n    }\n    required = [\"summary\", \"paragraphs\"]\n    if context.retrieved:\n        properties[\"sources\"] = {\n            \"type\": \"array\",\n            \"items\": {\"type\": \"integer\"},\n            \"description\": (\n                \"Índices (1, 2, ...) dos trechos de referência de fato usados. \"\n                \"Vazio se nenhum foi citado.\"\n            ),\n        }\n        required.append(\"sources\")\n    return {\n        \"type\": \"object\",\n        \"additionalProperties\": False,\n        \"required\": required,\n        \"properties\": properties,\n    }


def explain_user(context: ResultContext) -> str:\n    \"\"\"The computed run, with every figure already written the way it may be quoted.

    Scores appear rounded to three decimals because that rounding is one of the
    readings ``AIService.explain`` accepts; showing full precision would invite
    the model to round it itself, and a self-rounded figure is an invented one.
    \"\"\"\n    lines = [f\"Estudo: {context.study_name}\"]\n    if context.function_text:\n        lines.append(f\"Função: {context.function_text}\")\n    if context.objective_text:\n        lines.append(f\"Objetivo: {context.objective_text}\")\n    if context.index_name:\n        expression = f\" ({context.index_expression})\" if context.index_expression else \"\"\n        dimension = f\", dimensão {context.index_dimension}\" if context.index_dimension else \"\"\n        lines.append(f\"Índice de mérito: {context.index_name}{expression}{dimension}\")

    subject = \"Processos\" if context.universe == \"process\" else \"Materiais\"\n    lines.append(f\"{subject} no catálogo: {context.initial_count}\")\n    lines.append(f\"Candidatos após as restrições: {context.final_count}\")

    if context.constraint_labels:\n        lines.append(\"Restrições aplicadas: \" + \"; \".join(context.constraint_labels))\n    else:\n        lines.append(\"Restrições aplicadas: nenhuma\")

    if context.funnel:\n        lines.append(\"Eliminação passo a passo:\")\n        lines.extend(f\"  - {label}: restaram {remaining}\" for label, remaining in context.funnel)

    if context.ranked:\n        lines.append(\"Ranking (posição, material, pontuação):\")\n        lines.extend(\n            f\"  - {rank}º {name}: {format_decimal(score)}\" for name, rank, score in context.ranked\n        )\n    else:\n        lines.append(\"Ranking: não foi calculado para este estudo.\")

    if context.excluded_for_missing:\n        lines.append(\n            \"Fora do ranking por dado ausente (não são candidatos ruins, são não avaliados):\"\n        )\n        lines.extend(\n            f\"  - {name}: sem {', '.join(labels)}\" for name, labels in context.excluded_for_missing\n        )

    lines.append(\n        \"Sensibilidade aos pesos: \"\n        + (\n            \"o primeiro colocado muda quando os pesos variam.\"\n            if context.sensitivity_changed\n            else \"o primeiro colocado se mantém sob as variações testadas.\"\n        )\n    )\n    reference = _reference_block(context.retrieved)\n    if reference:\n        lines += [\"\", reference]\n    return \"\\n\".join(lines)


def format_decimal(value: float) -> str:\n    \"\"\"Three decimals with a decimal comma, as the interface writes numbers.\"\"\"\n    return f\"{value:.3f}\".replace(\".\", \",\")\n