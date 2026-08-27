"""Schemas for the knowledge-base ingestion endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class IngestReportOut(BaseModel):
    """What one ingestion run did — the same shape the CLI prints."""

    root: str
    created: int
    updated: int
    unchanged: int
    failed: int
    skipped: int
    total_chunks: int
    embedded_chunks: int
    embeddings_skipped_reason: str | None = None
    failures: list[str] = Field(default_factory=list)
