"""Ready-made notebooks (D-235b, F7 of the screen review): a starting point.

A template gives a new notebook its name, its emoji, how the chat answers
(``chat_goal`` and the brief in ``chat_instructions``) and a few empty notes
whose bodies are *structure* — headings and empty bullets for the student to
fill. It carries no source, no passage and no claim about any material: a
notebook still answers only from what the student adds (D-92), and a note a
template wrote is the student's to edit or delete like any other.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StarterNote:
    title: str
    body: str


@dataclass(frozen=True)
class NotebookTemplate:
    id: str
    title: str
    emoji: str
    description: str
    chat_goal: str
    chat_instructions: str | None
    notes: tuple[StarterNote, ...]


NOTEBOOK_TEMPLATES: tuple[NotebookTemplate, ...] = (
    NotebookTemplate(
        id="disciplina",
        title="Disciplina de Materiais",
        emoji="🧱",
        description="Para acompanhar uma disciplina: plano de estudos, dúvidas e respostas que ensinam.",
        chat_goal="guia",
        chat_instructions=(
            "Explique como a um estudante de graduação em engenharia, com os termos da disciplina, "
            "e diga de qual trecho da fonte vem cada afirmação."
        ),
        notes=(
            StarterNote("Plano de estudos", "## Tópicos\n- \n\n## Datas\n- "),
            StarterNote("Dúvidas para a aula", "- "),
        ),
    ),
    NotebookTemplate(
        id="prova",
        title="Revisão para prova",
        emoji="📝",
        description="Respostas curtas, com definição e exemplo, para revisar o conteúdo antes da prova.",
        chat_goal="personalizado",
        chat_instructions=(
            "Seja direto: responda em poucas frases, com a definição e um exemplo, "
            "como numa revisão para prova."
        ),
        notes=(
            StarterNote("O que cai na prova", "- "),
            StarterNote("Definições e fórmulas", "## Definições\n- \n\n## Fórmulas\n- "),
        ),
    ),
    NotebookTemplate(
        id="tcc",
        title="Projeto de TCC",
        emoji="🎓",
        description="Para a revisão da literatura: o que cada fonte diz, onde concordam e onde discordam.",
        chat_goal="personalizado",
        chat_instructions=(
            "Ajude a escrever um trabalho acadêmico: diga o que cada fonte afirma, onde elas concordam "
            "e onde discordam, e nunca cite uma referência que não esteja entre as fontes."
        ),
        notes=(
            StarterNote("Pergunta de pesquisa", ""),
            StarterNote("Revisão da literatura", "## Fonte — ideia central\n- "),
            StarterNote("Método", ""),
        ),
    ),
    NotebookTemplate(
        id="branco",
        title="Caderno sem título",
        emoji="📓",
        description="Um caderno vazio, com a conversa no modo padrão.",
        chat_goal="padrao",
        chat_instructions=None,
        notes=(),
    ),
)

TEMPLATE_IDS = tuple(t.id for t in NOTEBOOK_TEMPLATES)


def notebook_template(template_id: str) -> NotebookTemplate | None:
    return next((t for t in NOTEBOOK_TEMPLATES if t.id == template_id), None)
