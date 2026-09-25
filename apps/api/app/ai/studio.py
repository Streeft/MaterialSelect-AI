"""What a provider sees and answers when the Studio makes something (D-94).

The Studio is the notebook's right-hand panel: from the student's selected
sources it writes a report, flashcards, a quiz, a data table or a mind map. The
boundary is the chat's (``app.ai.notebook``): a provider receives the passages
and the student's choices — never a session, never a source it was not handed —
and answers JSON whose every item points at passages **by number**. The service
then checks each item's figures against the passages *that item* cites
(``app.notebooks.grounding``), with the same one retry and the same written
refusal.

This module holds three things, in this order:

* the **catalogue** — the tools, their formats and templates, and the default
  instruction each template carries. It is the one truth the modal reads
  (``GET /notebooks/studio-catalog``), so the text a student edits with the
  pencil is the text the model receives;
* the **prompts and schemas**, one per tool;
* the **readers**, which coerce a model's JSON into the shape the service
  checks — anything malformed is dropped, never guessed.

Two things here are deliberate and easy to undo by accident:

* **A distractor is held to the same rule as the right answer.** A quiz option
  with a figure the sources never state is an invented figure, whatever the
  answer key says about it; the prompt tells the model to take distractors from
  other values the sources state, and the check drops a question that did not.
* **The mind map comes back flat** (``id``/``parent``), not nested. Gemini's
  strict JSON mode does not promise recursive schemas, and a flat list is also
  easier to check: the reader builds the tree and drops orphans, cycles and
  anything deeper than the chosen depth.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ai.notebook import _RULES, Passage, render_passages

# --- catalogue ---------------------------------------------------------------


@dataclass(frozen=True)
class Choice:
    """One card of the modal: a format, a template, a count or a difficulty."""

    slug: str
    label: str
    description: str
    #: The template's instruction, shown and editable under the pencil.
    instructions: str = ""
    #: A data table template's columns — what the pencil edits there.
    columns: tuple[str, ...] = ()
    #: How many items a count choice asks for.
    amount: int | None = None


@dataclass(frozen=True)
class ToolSpec:
    slug: str
    label: str
    description: str
    formats: tuple[Choice, ...] = ()
    templates: tuple[Choice, ...] = ()
    counts: tuple[Choice, ...] = ()
    difficulties: tuple[Choice, ...] = ()
    #: Whether the student chooses the columns (the data table).
    columns: bool = False
    #: Export formats, in the order the menu lists them.
    exports: tuple[str, ...] = ()

    def format(self, slug: str | None) -> Choice | None:
        return next((c for c in self.formats if c.slug == slug), None)

    def template(self, slug: str | None) -> Choice | None:
        return next((c for c in self.templates if c.slug == slug), None)

    def count(self, slug: str | None) -> Choice | None:
        return next((c for c in self.counts if c.slug == slug), None)

    def difficulty(self, slug: str | None) -> Choice | None:
        return next((c for c in self.difficulties if c.slug == slug), None)


_DIFFICULTIES = (
    Choice("facil", "Fácil", "Definições e fatos diretos das fontes."),
    Choice("medio", "Médio", "Relacionar ideias e aplicar conceitos."),
    Choice("dificil", "Difícil", "Comparar, justificar e raciocinar sobre casos."),
)

#: Custom template slug: the instruction is the student's, and it is required.
CUSTOM = "personalizado"

CATALOG: dict[str, ToolSpec] = {
    spec.slug: spec
    for spec in (
        ToolSpec(
            slug="report",
            label="Relatório",
            description="Um documento em seções, cada parágrafo com as fontes citadas.",
            formats=(
                Choice("corrido", "Texto corrido", "Parágrafos, como um texto de apostila."),
                Choice("topicos", "Tópicos", "Itens curtos, para revisar rápido."),
            ),
            templates=(
                Choice(
                    "visao_geral",
                    "Visão geral",
                    "Do que as fontes tratam e como as ideias se ligam.",
                    "Escreva uma visão geral das fontes: do que tratam, quais são as ideias "
                    "centrais e como elas se relacionam. Organize em seções com títulos curtos.",
                ),
                Choice(
                    "guia_estudo",
                    "Guia de estudo",
                    "Conceitos-chave explicados, com perguntas de revisão.",
                    "Escreva um guia de estudo para um aluno de graduação: os conceitos-chave "
                    "de cada parte, explicados com clareza, e ao fim de cada seção uma pergunta "
                    "de revisão.",
                ),
                Choice(
                    "resumo_executivo",
                    "Resumo executivo",
                    "Conclusões primeiro, justificativa depois.",
                    "Escreva um resumo executivo para quem tem cinco minutos: primeiro as "
                    "conclusões e recomendações das fontes, depois a justificativa de cada uma.",
                ),
                Choice(
                    "faq",
                    "Perguntas frequentes",
                    "As perguntas que um aluno faria, respondidas pelas fontes.",
                    "Escreva perguntas frequentes: o título de cada seção é uma pergunta que um "
                    "aluno faria, e o texto a responde com base nas fontes.",
                ),
                Choice(
                    "glossario",
                    "Glossário",
                    "Os termos técnicos, definidos como as fontes definem.",
                    "Escreva um glossário: o título de cada seção é um termo técnico das "
                    "fontes, e o texto o define como as fontes o definem.",
                ),
                Choice(
                    CUSTOM,
                    "Crie o seu",
                    "Descreva a estrutura, o estilo e o público.",
                ),
            ),
            exports=("docx",),
        ),
        ToolSpec(
            slug="flashcards",
            label="Cartões didáticos",
            description="Frente e verso para memorizar, cada cartão com a fonte.",
            formats=(
                Choice("pergunta", "Pergunta e resposta", "A frente pergunta; o verso responde."),
                Choice("termo", "Termo e definição", "A frente é um termo; o verso, a definição."),
            ),
            counts=(
                Choice("menos", "Menos", "10 cartões", amount=10),
                Choice("padrao", "Padrão", "15 cartões", amount=15),
                Choice("mais", "Mais", "25 cartões", amount=25),
            ),
            difficulties=_DIFFICULTIES,
            exports=("csv", "docx"),
        ),
        ToolSpec(
            slug="quiz",
            label="Teste",
            description="Questões com gabarito, dica e explicação citada.",
            formats=(
                Choice("multipla", "Múltipla escolha", "Quatro alternativas, uma correta."),
                Choice("vf", "Verdadeiro ou falso", "Uma afirmação para julgar."),
            ),
            counts=(
                Choice("menos", "Menos", "5 questões", amount=5),
                Choice("padrao", "Padrão", "10 questões", amount=10),
                Choice("mais", "Mais", "15 questões", amount=15),
            ),
            difficulties=_DIFFICULTIES,
            exports=("docx", "csv"),
        ),
        ToolSpec(
            slug="table",
            label="Tabela de dados",
            description="Dados copiados das fontes para colunas que você escolhe.",
            templates=(
                Choice(
                    "propriedades",
                    "Propriedades de materiais",
                    "Um material e uma propriedade por linha.",
                    columns=(
                        "Material",
                        "Propriedade",
                        "Valor",
                        "Unidade",
                        "Condição ou observação",
                    ),
                ),
                Choice(
                    "conceitos",
                    "Conceitos",
                    "Termo, definição e exemplo.",
                    columns=("Termo", "Definição", "Exemplo"),
                ),
                Choice(
                    "linha_tempo",
                    "Linha do tempo",
                    "Datas e acontecimentos, na ordem.",
                    columns=("Data ou período", "Acontecimento", "Por que importa"),
                ),
                Choice(CUSTOM, "Crie a sua", "Você escolhe as colunas."),
            ),
            columns=True,
            exports=("xlsx", "csv"),
        ),
        ToolSpec(
            slug="mindmap",
            label="Mapa mental",
            description="As ideias das fontes em árvore, cada ramo com a fonte.",
            formats=(
                Choice("visao_geral", "Visão geral", "Dois níveis abaixo do tema.", amount=2),
                Choice("detalhado", "Detalhado", "Três níveis abaixo do tema.", amount=3),
            ),
            exports=("svg",),
        ),
    )
}

#: The tools the Studio makes today. Audio, video, slides and the infographic
#: are phase 4 (D-96) and stay "em breve" on the screen.
TOOLS = tuple(CATALOG)

# --- request -----------------------------------------------------------------


@dataclass(frozen=True)
class StudioRequest:
    tool: str
    notebook_title: str
    source_titles: tuple[str, ...]
    passages: tuple[Passage, ...]
    format: str | None = None
    template: str | None = None
    #: The template's instruction — the default one, or what the student wrote
    #: under the pencil. Style, never a rule: it goes below the rules.
    instructions: str | None = None
    topic: str | None = None
    #: Items asked for (cards, questions).
    count: int | None = None
    difficulty: str | None = None
    columns: tuple[str, ...] = field(default_factory=tuple)
    #: Mind map levels below the root.
    depth: int = 2
    retry_note: str | None = None


# --- limits ------------------------------------------------------------------

MAX_TITLE = 120
MAX_SECTIONS = 12
MAX_SECTION_PARAGRAPHS = 8
MAX_TEXT = 1600
MAX_SHORT = 400
MAX_CARDS = 30
MAX_QUESTIONS = 20
MAX_OPTIONS = 6
MAX_ROWS = 40
MAX_COLUMNS = 8
MAX_CELL = 400
MAX_NODES = 60
MAX_LABEL = 120
MAX_DEPTH = 4

# --- prompts -----------------------------------------------------------------

_DIFFICULTY_TEXT = {
    "facil": "Nível fácil: definições e fatos diretos das fontes.",
    "medio": "Nível médio: relacionar ideias e aplicar conceitos das fontes.",
    "dificil": (
        "Nível difícil: comparar, justificar e raciocinar sobre casos, sempre com base nas fontes."
    ),
}


def _task(request: StudioRequest) -> str:
    if request.tool == "report":
        shape = (
            "Cada parágrafo é um tópico curto, de uma ou duas frases, como um item de lista."
            if request.format == "topicos"
            else "Escreva parágrafos corridos."
        )
        return (
            "Tarefa: escreva um relatório em seções. Cada seção tem um título curto "
            "(heading) e parágrafos; cada parágrafo cita, em citations, os trechos que o "
            f"sustentam. {shape} Dê ao relatório um título curto (title)."
        )
    if request.tool == "flashcards":
        shape = (
            "A frente é um termo técnico das fontes; o verso, a definição dele segundo as "
            "fontes."
            if request.format == "termo"
            else "A frente é uma pergunta curta; o verso, a resposta."
        )
        return (
            f"Tarefa: crie {request.count} cartões didáticos, sem repetir assunto. {shape} "
            "Cada cartão cita, em citations, os trechos em que frente e verso se apoiam. "
            "Dê ao conjunto um título curto (title)."
        )
    if request.tool == "quiz":
        if request.format == "vf":
            shape = (
                'questões de verdadeiro ou falso. Em cada uma, options é exatamente ["Verdadeiro", '
                '"Falso"] e o enunciado é uma afirmação sobre as fontes — metade verdadeiras, '
                "metade falsas, e uma afirmação falsa nunca traz número que não esteja num "
                "trecho citado."
            )
        else:
            shape = (
                "questões de múltipla escolha com quatro alternativas e uma só correta. "
                "**As alternativas erradas também seguem a regra 3:** se uma alternativa tem "
                "número, ele está num trecho citado pela questão — use como distratores outros "
                "valores que as fontes trazem, ou alternativas sem número."
            )
        return (
            f"Tarefa: crie {request.count} {shape} Para cada questão: prompt (enunciado), "
            "options, answer_index (posição da alternativa correta em options, começando em "
            "0), hint (uma dica que não entrega a resposta), explanation (por que a correta "
            "está certa) e citations (os trechos que sustentam enunciado, alternativas e "
            "explicação). Dê ao teste um título curto (title)."
        )
    if request.tool == "table":
        if request.columns:
            columns = "; ".join(request.columns)
            shape = (
                f"As colunas são exatamente estas, nesta ordem: {columns}. Em columns, repita-as."
            )
        else:
            shape = (
                "Escolha de duas a seis colunas que organizem o que as fontes trazem e "
                "escreva-as em columns."
            )
        return (
            f"Tarefa: monte uma tabela de dados extraídos das fontes. {shape} Cada linha é "
            "um item (um material, um conceito, um acontecimento…) e tem uma célula por "
            "coluna, na ordem das colunas. Cada célula copia o que a fonte diz e cita, em "
            "citations, o trecho de onde veio. **Se as fontes não trazem aquele dado, a "
            "célula fica com texto vazio e sem citação — nunca estime, nunca complete.** "
            f"Números e unidades exatamente como no trecho. No máximo {MAX_ROWS} linhas. "
            "Dê à tabela um título curto (title)."
        )
    if request.tool == "mindmap":
        return (
            "Tarefa: organize as ideias das fontes num mapa mental. O nó raiz tem id 1 e "
            "parent 0 e é o tema central; cada outro nó tem um id próprio, o id do pai "
            "(parent), um rótulo curto de até oito palavras (label) e as citações. "
            f"No máximo {request.depth} níveis abaixo da raiz e {MAX_NODES - 20} nós. "
            "Dê ao mapa um título curto (title)."
        )
    raise ValueError(f"Ferramenta desconhecida: {request.tool}")


def studio_system(request: StudioRequest) -> str:
    parts = [_RULES, _task(request)]
    if request.difficulty in _DIFFICULTY_TEXT:
        parts.append(_DIFFICULTY_TEXT[request.difficulty])
    if request.instructions:
        parts.append(
            "Modelo escolhido pelo aluno (estilo e estrutura; não muda as regras acima):\n"
            + request.instructions
        )
    if request.topic:
        parts.append(
            "Foco pedido pelo aluno (use só o que os trechos dizem sobre isso):\n" + request.topic
        )
    if request.retry_note:
        parts.append(request.retry_note)
    return "\n\n".join(parts)


def studio_user(request: StudioRequest) -> str:
    titles = "\n".join(f"- {title}" for title in request.source_titles)
    return (
        f"Caderno: {request.notebook_title}\nFontes:\n{titles}\n\n"
        f"{render_passages(request.passages)}"
    )


# --- schemas -----------------------------------------------------------------

_CITATIONS = {
    "type": "array",
    "items": {"type": "integer"},
    "description": "Números dos trechos que sustentam este item.",
}


def _object(properties: dict) -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def _array(item: dict) -> dict:
    return {"type": "array", "items": item}


_STRING = {"type": "string"}

SCHEMAS: dict[str, dict] = {
    "report": _object(
        {
            "title": _STRING,
            "sections": _array(
                _object(
                    {
                        "heading": _STRING,
                        "paragraphs": _array(_object({"text": _STRING, "citations": _CITATIONS})),
                    }
                )
            ),
        }
    ),
    "flashcards": _object(
        {
            "title": _STRING,
            "cards": _array(_object({"front": _STRING, "back": _STRING, "citations": _CITATIONS})),
        }
    ),
    "quiz": _object(
        {
            "title": _STRING,
            "questions": _array(
                _object(
                    {
                        "prompt": _STRING,
                        "options": _array(_STRING),
                        "answer_index": {"type": "integer"},
                        "hint": _STRING,
                        "explanation": _STRING,
                        "citations": _CITATIONS,
                    }
                )
            ),
        }
    ),
    "table": _object(
        {
            "title": _STRING,
            "columns": _array(_STRING),
            "rows": _array(
                _object({"cells": _array(_object({"text": _STRING, "citations": _CITATIONS}))})
            ),
        }
    ),
    "mindmap": _object(
        {
            "title": _STRING,
            "nodes": _array(
                _object(
                    {
                        "id": {"type": "integer"},
                        "parent": {"type": "integer"},
                        "label": _STRING,
                        "citations": _CITATIONS,
                    }
                )
            ),
        }
    ),
}


def schema_for(request: StudioRequest) -> dict:
    return SCHEMAS[request.tool]


# --- readers -----------------------------------------------------------------


def _text(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit] if isinstance(value, str) else ""


def _list(value: object) -> list:
    return value if isinstance(value, list) else []


def _citations(value: object) -> list[int]:
    return [n for n in _list(value) if isinstance(n, int) and not isinstance(n, bool)]


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def read_studio(request: StudioRequest, raw: dict) -> dict:
    """Coerce one model answer into the shape the service checks.

    Sizes are capped and malformed items dropped; nothing is repaired by
    guessing. Citations stay as the model numbered them — the service filters
    them against the passages handed over and checks the figures.
    """
    title = _text(raw.get("title"), MAX_TITLE)
    tool = request.tool
    if tool == "report":
        sections = []
        for section in _list(raw.get("sections"))[:MAX_SECTIONS]:
            if not isinstance(section, dict):
                continue
            paragraphs = [
                {"text": text, "citations": _citations(p.get("citations"))}
                for p in _list(section.get("paragraphs"))[:MAX_SECTION_PARAGRAPHS]
                if isinstance(p, dict) and (text := _text(p.get("text"), MAX_TEXT))
            ]
            if paragraphs:
                sections.append(
                    {"heading": _text(section.get("heading"), MAX_TITLE), "paragraphs": paragraphs}
                )
        return {"title": title, "sections": sections}

    if tool == "flashcards":
        cards = []
        for card in _list(raw.get("cards")):
            if not isinstance(card, dict):
                continue
            front = _text(card.get("front"), MAX_SHORT)
            back = _text(card.get("back"), MAX_TEXT)
            if front and back:
                cards.append(
                    {"front": front, "back": back, "citations": _citations(card.get("citations"))}
                )
        return {"title": title, "cards": cards[: min(request.count or MAX_CARDS, MAX_CARDS)]}

    if tool == "quiz":
        questions = []
        for item in _list(raw.get("questions")):
            if not isinstance(item, dict):
                continue
            prompt = _text(item.get("prompt"), MAX_TEXT)
            if request.format == "vf":
                options = ["Verdadeiro", "Falso"]
            else:
                options = [
                    text
                    for o in _list(item.get("options"))[:MAX_OPTIONS]
                    if (text := _text(o, MAX_SHORT))
                ]
            answer = _int(item.get("answer_index"))
            if not prompt or len(options) < 2 or answer is None or not 0 <= answer < len(options):
                continue
            if len(set(options)) != len(options):
                continue
            questions.append(
                {
                    "prompt": prompt,
                    "options": options,
                    "answer_index": answer,
                    "hint": _text(item.get("hint"), MAX_SHORT),
                    "explanation": _text(item.get("explanation"), MAX_TEXT),
                    "citations": _citations(item.get("citations")),
                }
            )
        limit = min(request.count or MAX_QUESTIONS, MAX_QUESTIONS)
        return {"title": title, "questions": questions[:limit]}

    if tool == "table":
        columns = list(request.columns) or [
            text for c in _list(raw.get("columns"))[:MAX_COLUMNS] if (text := _text(c, 60))
        ]
        rows = []
        for row in _list(raw.get("rows"))[:MAX_ROWS]:
            if not isinstance(row, dict):
                continue
            cells = [
                (
                    {
                        "text": _text(c.get("text"), MAX_CELL),
                        "citations": _citations(c.get("citations")),
                    }
                    if isinstance(c, dict)
                    else {"text": "", "citations": []}
                )
                for c in _list(row.get("cells"))[: len(columns)]
            ]
            # A short row is padded with absent cells, never shifted.
            cells.extend({"text": "", "citations": []} for _ in range(len(columns) - len(cells)))
            if any(cell["text"] for cell in cells):
                rows.append({"cells": cells})
        return {"title": title, "columns": columns, "rows": rows}

    if tool == "mindmap":
        return {"title": title, "root": build_tree(raw.get("nodes"), request.depth)}

    raise ValueError(f"Ferramenta desconhecida: {tool}")


def build_tree(raw: object, depth: int) -> dict | None:
    """The mind map's flat node list as a tree, or None when it has no root.

    The root is the node whose parent is 0 (the first one, if the model wrote
    several). A node whose parent is unknown, or that sits in a cycle, never
    connects to the root and is dropped; so is anything deeper than ``depth``
    levels below it, and anything past the node cap.
    """
    nodes: dict[int, dict] = {}
    order: list[int] = []
    for item in _list(raw):
        if not isinstance(item, dict):
            continue
        node_id, parent = _int(item.get("id")), _int(item.get("parent"))
        label = _text(item.get("label"), MAX_LABEL)
        if node_id is None or node_id < 1 or parent is None or not label or node_id in nodes:
            continue
        nodes[node_id] = {
            "parent": parent,
            "label": label,
            "citations": _citations(item.get("citations")),
        }
        order.append(node_id)
    root_id = next((i for i in order if nodes[i]["parent"] == 0), None)
    if root_id is None:
        return None
    children: dict[int, list[int]] = {}
    for node_id in order:
        children.setdefault(nodes[node_id]["parent"], []).append(node_id)

    budget = [min(MAX_NODES, len(nodes))]
    limit = min(max(depth, 1), MAX_DEPTH)

    def grow(node_id: int, level: int) -> dict:
        budget[0] -= 1
        node = nodes[node_id]
        kids = []
        if level < limit:
            for child in children.get(node_id, []):
                if budget[0] <= 0:
                    break
                kids.append(grow(child, level + 1))
        return {"label": node["label"], "citations": node["citations"], "children": kids}

    # Walking down from the root visits each node once: a cycle never touches
    # the root, so its members are simply never reached.
    return grow(root_id, 0)
