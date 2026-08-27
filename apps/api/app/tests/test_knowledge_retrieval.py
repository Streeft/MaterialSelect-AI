"""Retrieval end to end: what is found, in what order, and what is admitted.

The corpus here is seeded straight into the database rather than through PDF
ingestion, so a failure points at ranking and not at a parser.

The property that matters most is not "the right passage comes first" — that is
BM25's business and tested next door. It is that the *account of how the answer
was reached* is never wrong: a search that could not use the semantic pass says
so, in a sentence the reader will see, instead of quietly returning the lexical
answer as though nothing happened.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.config import Settings
from app.knowledge.embeddings import EmbeddingUnavailableError, pack_vector
from app.knowledge.lexical import fold
from app.knowledge.retrieval import KnowledgeRetriever
from app.models.enums import DocumentKind, IngestStatus, SourceAuthority
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding

MODEL = "modelo-de-teste"


def _settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "knowledge_dir": "Cérebro",
        "knowledge_retrieval_top_k": 5,
        "knowledge_retrieval_candidates": 120,
        "knowledge_embedding_model": "",
        "knowledge_embedding_base_url": "",
    }
    base.update(overrides)
    return Settings(**base)


def _semantic_settings(**overrides: Any) -> Settings:
    return _settings(
        knowledge_embedding_model=MODEL,
        knowledge_embedding_base_url="https://exemplo.invalido/v1",
        **overrides,
    )


class _StubEmbedder:
    """Stands in for the network. Returns whatever it was handed."""

    def __init__(self, vector: list[float] | None = None, error: Exception | None = None) -> None:
        self.vector = vector or [1.0, 0.0]
        self.error = error
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        if self.error is not None:
            raise self.error
        return [self.vector for _ in texts]


def _document(
    db,
    path: str,
    *,
    title: str | None = None,
    authority: SourceAuthority = SourceAuthority.NAO_VERIFICADA,
    author: str | None = None,
) -> KnowledgeDocument:
    document = KnowledgeDocument(
        path=path,
        title=title or path,
        kind=DocumentKind.LIVRO,
        authority=authority,
        author=author,
        checksum="0" * 64,
        status=IngestStatus.EXTRAIDO,
    )
    db.add(document)
    db.flush()
    return document


def _chunk(
    db,
    document: KnowledgeDocument,
    text: str,
    *,
    ordinal: int = 0,
    page: int | None = 1,
    heading: str | None = None,
) -> KnowledgeChunk:
    chunk = KnowledgeChunk(
        document_id=document.id,
        ordinal=ordinal,
        text=text,
        search_text=fold(text),
        char_count=len(text),
        page_start=page,
        page_end=page,
        heading=heading,
    )
    db.add(chunk)
    db.flush()
    return chunk


def _vector(db, chunk: KnowledgeChunk, values: list[float], model: str = MODEL) -> None:
    db.add(
        KnowledgeEmbedding(
            chunk_id=chunk.id,
            model=model,
            dimensions=len(values),
            vector=pack_vector(values),
        )
    )
    db.flush()


@pytest.fixture
def corpus(db_session):
    """Three passages on three subjects, in two documents of unequal standing."""
    livro = _document(
        db_session,
        "ashby.pdf",
        title="Seleção de Materiais no Projeto Mecânico",
        authority=SourceAuthority.CIENTIFICA,
        author="Michael Ashby",
    )
    apostila = _document(db_session, "apostila.pdf", title="Notas de aula")

    rigidez = _chunk(
        db_session,
        livro,
        "O módulo de Young mede a rigidez elástica e aparece no índice de "
        "desempenho de uma viga leve.",
        ordinal=0,
        page=42,
        heading="4.1 RIGIDEZ",
    )
    corrosao = _chunk(
        db_session,
        livro,
        "A corrosão sob tensão exige atenção especial na seleção de aços "
        "inoxidáveis austeníticos.",
        ordinal=1,
        page=90,
    )
    fadiga = _chunk(
        db_session,
        apostila,
        "A fadiga é a falha progressiva sob carregamento cíclico repetido.",
        ordinal=0,
        page=3,
    )
    return {
        "livro": livro,
        "apostila": apostila,
        "rigidez": rigidez,
        "corrosao": corrosao,
        "fadiga": fadiga,
    }


class TestLexicalPath:
    def test_finds_the_passage_about_the_subject_asked(self, db_session, corpus) -> None:
        result = KnowledgeRetriever(db_session, _settings()).search("rigidez elástica de uma viga")

        assert result.method == "lexical"
        assert result.passages[0].chunk_id == corpus["rigidez"].id

    def test_unaccented_query_reaches_an_accented_passage(self, db_session, corpus) -> None:
        # The single reason `search_text` exists as a stored column: SQLite's
        # lower() does not touch accents.
        result = KnowledgeRetriever(db_session, _settings()).search("corrosao sob tensao")
        assert result.passages[0].chunk_id == corpus["corrosao"].id

    def test_nothing_configured_means_no_degradation_notice(self, db_session, corpus) -> None:
        # Nobody asked for semantic retrieval, so saying it did not run would be
        # noise on every single search.
        result = KnowledgeRetriever(db_session, _settings()).search("fadiga")
        assert result.degraded_reason is None

    def test_top_k_is_respected(self, db_session, corpus) -> None:
        result = KnowledgeRetriever(db_session, _settings()).search("seleção de materiais", top_k=1)
        assert len(result.passages) == 1

    def test_query_with_nothing_to_match_answers_empty(self, db_session, corpus) -> None:
        # An empty result is a legitimate answer: it is what lets the AI layer
        # state it had no grounding rather than invent some.
        result = KnowledgeRetriever(db_session, _settings()).search("termodinâmica estatística")
        assert result.is_empty

    def test_query_of_only_stopwords_answers_empty(self, db_session, corpus) -> None:
        assert KnowledgeRetriever(db_session, _settings()).search("de com que a o").is_empty

    def test_zero_top_k_never_touches_the_database(self, db_session, corpus) -> None:
        assert KnowledgeRetriever(db_session, _settings()).search("rigidez", top_k=0).is_empty


class TestCitationChain:
    def test_passage_carries_its_provenance(self, db_session, corpus) -> None:
        passage = KnowledgeRetriever(db_session, _settings()).search("rigidez").passages[0]

        assert passage.title == "Seleção de Materiais no Projeto Mecânico"
        assert passage.author == "Michael Ashby"
        assert passage.authority is SourceAuthority.CIENTIFICA
        assert passage.path == "ashby.pdf"
        assert passage.page_start == 42

    def test_locator_reads_as_a_citation(self, db_session, corpus) -> None:
        passage = KnowledgeRetriever(db_session, _settings()).search("rigidez").passages[0]
        assert passage.locator == ("Seleção de Materiais no Projeto Mecânico — 4.1 RIGIDEZ — p. 42")

    def test_locator_collapses_a_single_page_range(self, db_session, corpus) -> None:
        passage = KnowledgeRetriever(db_session, _settings()).search("fadiga cíclica").passages[0]
        assert passage.locator.endswith("p. 3")


class TestSemanticPath:
    def test_method_says_hybrid_when_the_semantic_pass_ran(self, db_session, corpus) -> None:
        for chunk in (corpus["rigidez"], corpus["corrosao"], corpus["fadiga"]):
            _vector(db_session, chunk, [1.0, 0.0])

        result = KnowledgeRetriever(
            db_session, _semantic_settings(), embedder=_StubEmbedder([1.0, 0.0])
        ).search("rigidez")

        assert result.method == "hibrido"
        assert result.degraded_reason is None

    def test_the_query_is_embedded_once_and_not_the_corpus(self, db_session, corpus) -> None:
        # Embedding the candidates per search would be a second network round
        # trip proportional to the corpus; they are embedded at index time.
        for chunk in (corpus["rigidez"], corpus["corrosao"]):
            _vector(db_session, chunk, [1.0, 0.0])
        embedder = _StubEmbedder([1.0, 0.0])

        KnowledgeRetriever(db_session, _semantic_settings(), embedder=embedder).search("rigidez")

        assert embedder.calls == [["rigidez"]]

    def test_semantics_decides_where_the_lexical_pass_cannot(self, db_session) -> None:
        # Identical text, so BM25 has nothing to separate them and ranks them
        # equal. That is exactly where the semantic pass has to be the one that
        # decides — otherwise it is decoration.
        doc = _document(db_session, "misto.pdf")
        generico = _chunk(db_session, doc, "A seleção de materiais orienta o projeto.", ordinal=0)
        pertinente = _chunk(db_session, doc, "A seleção de materiais orienta o projeto.", ordinal=1)
        _vector(db_session, generico, [0.0, 1.0])
        _vector(db_session, pertinente, [1.0, 0.0])

        lexical = KnowledgeRetriever(db_session, _settings()).search("seleção de materiais")
        hybrid = KnowledgeRetriever(
            db_session, _semantic_settings(), embedder=_StubEmbedder([1.0, 0.0])
        ).search("seleção de materiais")

        # Left to itself the lexical pass falls back on insertion order...
        assert lexical.passages[0].chunk_id == generico.id
        # ...and the vectors overturn it without losing either passage.
        assert hybrid.passages[0].chunk_id == pertinente.id
        assert {p.chunk_id for p in lexical.passages} == {p.chunk_id for p in hybrid.passages}


class TestFusion:
    """Reciprocal rank fusion, on its own — the arithmetic the ordering rests on."""

    def test_agreement_between_the_two_passes_wins(self) -> None:
        fused = KnowledgeRetriever._fuse([{1: 9.0, 2: 8.0, 3: 7.0}, {2: 0.9, 1: 0.2, 3: 0.1}])
        # 2 is second and first; 1 is first and second. Symmetric — and so is
        # the result, which is the honest answer when the passes disagree
        # exactly as much as they agree.
        assert fused[1] == pytest.approx(fused[2])
        assert fused[3] < fused[1]

    def test_equal_scores_share_a_rank(self) -> None:
        # Without this the tie-break on authority would never fire: two passages
        # a pass considers indistinguishable would still leave fusion with
        # different numbers, separated by whichever id sorted first.
        fused = KnowledgeRetriever._fuse([{1: 5.0, 2: 5.0}])
        assert fused[1] == pytest.approx(fused[2])

    def test_a_pass_that_found_nothing_contributes_nothing(self) -> None:
        only_lexical = KnowledgeRetriever._fuse([{1: 3.0, 2: 1.0}])
        assert only_lexical[1] > only_lexical[2]


class TestDegradationIsDeclared:
    def test_no_vectors_yet_says_to_run_the_indexing(self, db_session, corpus) -> None:
        result = KnowledgeRetriever(
            db_session, _semantic_settings(), embedder=_StubEmbedder()
        ).search("rigidez")

        assert result.method == "lexical"
        assert result.degraded_reason is not None
        assert "indexação de embeddings" in result.degraded_reason
        # And it still answers — degraded, not broken.
        assert not result.is_empty

    def test_provider_failure_is_reported_and_survived(self, db_session, corpus) -> None:
        _vector(db_session, corpus["rigidez"], [1.0, 0.0])
        embedder = _StubEmbedder(error=EmbeddingUnavailableError("servidor fora do ar"))

        result = KnowledgeRetriever(db_session, _semantic_settings(), embedder=embedder).search(
            "rigidez"
        )

        assert result.method == "lexical"
        assert result.degraded_reason is not None
        assert "servidor fora do ar" in result.degraded_reason
        assert result.passages[0].chunk_id == corpus["rigidez"].id

    def test_vectors_from_another_model_are_not_used(self, db_session, corpus) -> None:
        # Silently comparing them would produce a number that looks like a
        # similarity and is not.
        _vector(db_session, corpus["rigidez"], [1.0, 0.0], model="outro-modelo")

        result = KnowledgeRetriever(
            db_session, _semantic_settings(), embedder=_StubEmbedder()
        ).search("rigidez")

        assert result.method == "lexical"
        assert result.degraded_reason is not None

    def test_dimension_drift_asks_for_a_reindex(self, db_session, corpus) -> None:
        _vector(db_session, corpus["rigidez"], [1.0, 0.0, 0.0])

        result = KnowledgeRetriever(
            db_session, _semantic_settings(), embedder=_StubEmbedder([1.0, 0.0])
        ).search("rigidez")

        assert result.degraded_reason is not None
        assert "Reindexe" in result.degraded_reason


class TestAuthorityBreaksTies:
    def test_vouched_source_wins_an_exact_tie(self, db_session) -> None:
        oficial = _document(db_session, "norma.pdf", authority=SourceAuthority.OFICIAL)
        anonimo = _document(db_session, "anon.pdf", authority=SourceAuthority.NAO_VERIFICADA)
        # Identical text, so nothing but provenance separates them. The
        # undeclared source is inserted first, so passing by insertion order
        # would put it on top.
        _chunk(db_session, anonimo, "A ductilidade limita a conformação a frio.")
        _chunk(db_session, oficial, "A ductilidade limita a conformação a frio.")

        result = KnowledgeRetriever(db_session, _settings()).search("ductilidade")

        assert result.passages[0].authority is SourceAuthority.OFICIAL

    def test_authority_never_outranks_a_better_match(self, db_session) -> None:
        # The rule is a tie-break and nothing more: a course handout that
        # actually answers the question beats a norm that mentions it once.
        oficial = _document(db_session, "norma.pdf", authority=SourceAuthority.OFICIAL)
        apostila = _document(db_session, "apostila.pdf", authority=SourceAuthority.NAO_VERIFICADA)
        _chunk(db_session, oficial, "Escopo, referências normativas e termos. Fluência citada.")
        _chunk(
            db_session,
            apostila,
            "Fluência é a deformação lenta sob carga constante; a fluência "
            "governa componentes a alta temperatura, e o ensaio de fluência "
            "mede essa taxa.",
        )

        result = KnowledgeRetriever(db_session, _settings()).search("fluência")

        assert result.passages[0].path == "apostila.pdf"
