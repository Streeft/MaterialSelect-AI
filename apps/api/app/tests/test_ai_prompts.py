"""O bloco de contexto do Cérebro no prompt: presente só quando há trechos
recuperados, e nunca oferecido como fonte de número (essa regra vive no
guardrail, não aqui — este teste cobre só a construção do texto)."""

from __future__ import annotations

from app.ai.prompts import EXPLAIN_SCHEMA, explain_user, interpret_user
from app.ai.provider import ProblemContext, ResultContext
from app.knowledge.retrieval import RetrievedChunk
from app.models.enums import DocumentKind, SourceAuthority

_CHUNK = RetrievedChunk(
    document_title="Materials Selection in Mechanical Design",
    document_kind=DocumentKind.LIVRO,
    document_authority=SourceAuthority.CIENTIFICA,
    page_start=42,
    page_end=43,
    text="O índice de rigidez específica é E/ρ para uma viga em flexão.",
    score=0.9,
)


class TestInterpretPrompt:
    def test_no_reference_block_when_nothing_retrieved(self) -> None:
        context = ProblemContext(statement="x", properties=[], indices=[], classes=[])
        assert "Trechos de referência" not in interpret_user(context)

    def test_reference_block_when_retrieved(self) -> None:
        context = ProblemContext(
            statement="x", properties=[], indices=[], classes=[], retrieved=(_CHUNK,)
        )
        text = interpret_user(context)
        assert "Trechos de referência" in text
        assert "Materials Selection in Mechanical Design" in text
        assert "42" in text and "43" in text
        assert _CHUNK.text in text

    def test_statement_still_appears_after_the_reference_block(self) -> None:
        context = ProblemContext(
            statement="enunciado do usuario aqui",
            properties=[],
            indices=[],
            classes=[],
            retrieved=(_CHUNK,),
        )
        text = interpret_user(context)
        assert text.index("Trechos de referência") < text.index("enunciado do usuario aqui")


class TestExplainPrompt:
    def test_no_reference_block_when_nothing_retrieved(self) -> None:
        context = ResultContext(
            study_name="Estudo",
            function_text=None,
            objective_text=None,
            constraint_labels=[],
            index_name=None,
            index_expression=None,
            index_dimension=None,
            initial_count=5,
            final_count=5,
            funnel=[],
            ranked=[],
            excluded_for_missing=[],
            sensitivity_changed=False,
        )
        assert "Trechos de referência" not in explain_user(context)

    def test_reference_block_when_retrieved(self) -> None:
        context = ResultContext(
            study_name="Estudo",
            function_text=None,
            objective_text=None,
            constraint_labels=[],
            index_name=None,
            index_expression=None,
            index_dimension=None,
            initial_count=5,
            final_count=5,
            funnel=[],
            ranked=[],
            excluded_for_missing=[],
            sensitivity_changed=False,
            retrieved=(_CHUNK,),
        )
        assert "Trechos de referência" in explain_user(context)


class TestExplainSchema:
    def test_sources_field_is_present(self) -> None:
        assert "sources" in EXPLAIN_SCHEMA["properties"]
        assert EXPLAIN_SCHEMA["properties"]["sources"]["type"] == "array"
