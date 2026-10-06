"""The production failure of 06/10/2026, against the database that raised it.

``ingerir`` died on Neon with ``PostgreSQL text fields cannot contain NUL
(0x00) bytes``: pypdf returned U+0000 for an unmapped glyph and SQLite — every
other test here — stores it without a word. These two tests run only where a
PostgreSQL is reachable (``POSTGRES_TEST_URL``, set by the backend job of the
CI, the same guard as ``test_notebook_quota_postgres.py``) and are skipped
elsewhere.
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import Base
from app.knowledge import chunking, readers
from app.knowledge.service import KnowledgeService
from app.models.enums import IngestStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.repositories.knowledge_repository import KnowledgeRepository
from app.tests.test_knowledge_ingest import _pdf_bytes
from app.tests.test_notebook_quota_postgres import POSTGRES_TEST_URL, _is_postgres_available

pytestmark = pytest.mark.skipif(
    not _is_postgres_available(),
    reason="PostgreSQL não disponível; configure POSTGRES_TEST_URL para executar",
)

#: Every path these tests write lives under this folder of the corpus, so the
#: cleanup cannot touch a row another test (or a developer's base) owns.
FOLDER = "pg-nul-test"


def _nul_pdf(text: str) -> bytes:
    """``@@@@`` becomes the four-byte octal escape ``\\000`` — offsets unchanged."""
    return _pdf_bytes([text]).replace(b"@@@@", b"\\000")


@pytest.fixture
def pg(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[Session, Path]]:
    assert POSTGRES_TEST_URL is not None
    engine = create_engine(POSTGRES_TEST_URL)
    Base.metadata.create_all(engine)
    root = tmp_path / "cerebro"
    (root / FOLDER).mkdir(parents=True)
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    db = Session(engine)
    try:
        yield db, root
    finally:
        db.rollback()
        ids = select(KnowledgeDocument.id).where(KnowledgeDocument.path.like(f"{FOLDER}/%"))
        db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id.in_(ids)))
        db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.path.like(f"{FOLDER}/%")))
        db.commit()
        db.close()
        engine.dispose()


def test_a_pdf_with_nul_is_ingested_into_postgresql(pg) -> None:
    db, root = pg
    (root / FOLDER / "nul.pdf").write_bytes(_nul_pdf("O aco@@@@ carbono tem modulo de 210 GPa."))

    report = KnowledgeService(db).ingest(embed=False, on_document=db.commit)

    assert report.created == 1 and report.failed == 0
    repo = KnowledgeRepository(db)
    document = repo.get_by_path(f"{FOLDER}/nul.pdf")
    assert document is not None and document.status == IngestStatus.EXTRAIDO
    texts = [chunk.text for chunk in repo.list_chunks(document.id)]
    assert texts == ["O aco carbono tem modulo de 210 GPa."]


def test_a_refused_write_costs_one_document_on_postgresql(
    pg, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With the NUL let through on purpose, PostgreSQL raises the real
    ``DataError``: the savepoint must take back that document alone — its
    previous passages come back — and the run must go on to the next one."""
    db, root = pg
    service = KnowledgeService(db)
    (root / FOLDER / "b.pdf").write_bytes(_pdf_bytes(["Versao antiga do texto de vidros."]))
    service.ingest(embed=False, on_document=db.commit)

    (root / FOLDER / "a.pdf").write_bytes(_pdf_bytes(["O aluminio tem 2700 kg/m3."]))
    (root / FOLDER / "b.pdf").write_bytes(_nul_pdf("Versao nova@@@@ que o banco recusa."))
    (root / FOLDER / "c.pdf").write_bytes(_pdf_bytes(["O titanio tem modulo de 110 GPa."]))
    monkeypatch.setattr(readers, "storable_text", lambda text: text)
    monkeypatch.setattr(chunking, "storable_text", lambda text: text)

    report = service.ingest(embed=False, on_document=db.commit)

    assert report.created == 2 and report.failed == 1
    repo = KnowledgeRepository(db)
    refused = repo.get_by_path(f"{FOLDER}/b.pdf")
    assert refused is not None and refused.status == IngestStatus.EXTRAIDO
    assert [c.text for c in repo.list_chunks(refused.id)] == ["Versao antiga do texto de vidros."]
    assert "DataError" in (refused.error or "")
    for stored in ("a.pdf", "c.pdf"):
        document = repo.get_by_path(f"{FOLDER}/{stored}")
        assert document is not None and repo.list_chunks(document.id)
