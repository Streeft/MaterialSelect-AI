"""app.knowledge.retrieval: a função de busca que não existia antes deste
trabalho — só as primitivas (BM25, embeddings) existiam, sem quem as chamasse.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.knowledge.retrieval import search
from app.knowledge.service import KnowledgeService
from app.models.enums import DocumentKind, SourceAuthority


@pytest.fixture
def corpus(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from app.config import settings

    root = tmp_path / "cerebro"
    root.mkdir()
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    return root


def _pdf_bytes(pages: list[str]) -> bytes:
    from app.tests.test_knowledge_ingest import _pdf_bytes as build

    return build(pages)


def _write(root, name: str, pages: list[str]):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_pdf_bytes(pages))
    return path


class TestLexicalOnly:
    def test_finds_a_matching_passage(self, db_session, corpus) -> None:
        _write(corpus, "aula.pdf", ["O módulo de Young mede a rigidez elástica do material."])
        _write(corpus, "outro.pdf", ["Corrosão em ambientes marinhos e névoa salina."])
        KnowledgeService(db_session).ingest()

        results = search(db_session, "rigidez elastica modulo", top_k=5, settings=Settings())

        assert results
        assert any("Young" in r.text for r in results)

    def test_respects_top_k(self, db_session, corpus) -> None:
        for i in range(10):
            _write(corpus, f"doc{i}.pdf", [f"Densidade e propriedades mecânicas do material {i}."])
        KnowledgeService(db_session).ingest()

        results = search(
            db_session, "densidade propriedades mecanicas", top_k=3, settings=Settings()
        )
        assert len(results) <= 3

    def test_no_match_returns_empty(self, db_session, corpus) -> None:
        _write(corpus, "aula.pdf", ["conteúdo qualquer sobre engenharia"])
        KnowledgeService(db_session).ingest()
        results = search(db_session, "xenobiologia quantica", top_k=5, settings=Settings())
        assert results == []

    def test_carries_document_provenance(self, db_session, corpus) -> None:
        import json

        _write(corpus, "ashby.pdf", ["Índices de desempenho na seleção de materiais."])
        (corpus / "manifesto.json").write_text(
            json.dumps(
                {
                    "documentos": [
                        {
                            "path": "ashby.pdf",
                            "titulo": "Materials Selection in Mechanical Design",
                            "tipo": "LIVRO",
                            "autoridade": "CIENTIFICA",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        KnowledgeService(db_session).ingest()

        results = search(
            db_session, "indices desempenho selecao materiais", top_k=5, settings=Settings()
        )
        assert results
        assert results[0].document_title == "Materials Selection in Mechanical Design"
        assert results[0].document_kind == DocumentKind.LIVRO
        assert results[0].document_authority == SourceAuthority.CIENTIFICA

    def test_empty_corpus_returns_empty(self, db_session, corpus) -> None:
        assert search(db_session, "qualquer coisa", top_k=5, settings=Settings()) == []
