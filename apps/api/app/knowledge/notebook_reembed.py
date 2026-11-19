"""Re-embed notebook passages whose vector has another identity (D-255).

Run with::

    python -m app.knowledge.notebook_reembed                       # simulação: só conta
    python -m app.knowledge.notebook_reembed --apply \\
        --max-requests 300 --batch 20 --rpm 90 --tpm 27000 --deadline-minutes 60

A notebook question is embedded with the configured identity — today
``gemini-embedding-001`` at 768 dimensions (D-101) — and a stored vector of any
other identity is ignored by the semantic search: the vectors written before
D-101 have the model's native 3072 dimensions, and those sources are found by
words only (the ``status`` of the Cérebro workflow counts them). This replaces
those vectors, in place, with ones of the current identity.

**It only swaps the vector.** The row of ``notebook_embedding`` is updated —
model, dimensions, bytes — and nothing else is written: no source, passage,
position or note is created, changed or deleted. A passage that never had a
vector (its ingestion ran without embeddings, or the provider failed) is not
this command's business: it is searched by words, as it always was.

**Idempotent and resumable.** What is pending is recomputed from the database
on every run — a vector whose identity is not the current one, by the rule of
:func:`app.knowledge.embeddings.embedding_matches` — and each batch is committed
as soon as it is stored, so a run cut short keeps what it paid for and a second
run finds only what is left.

**Dry run by default**, like :mod:`app.knowledge.chunk_positions`: it reads, counts
and prints the requests the work would take, and sends nothing.

**Within the quota**, with the pacing and the refusal reading of
:mod:`app.knowledge.embed` (the same ``--rpm``/``--tpm``/``--max-requests``/
``--deadline-minutes``): a per-minute 429 waits what the server asked (at most
120 s) and repeats the batch, four in a row or a per-day 429 end the run with
exit 0; 5xx and network failures back off 5, 15 and 45 s; a 400 on a batch is
resent one passage at a time, and a single passage refused stays as it is (its
old vector untouched) until the next run. Anything else is configuration: exit 1.

**The log is public** (GitHub Actions) and a notebook is a person's own
material: the output carries counts and the model's name — never a title, a
passage, an id or a key.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import and_, func, not_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.knowledge.embed import (
    DEFAULT_RATE_LIMIT_WAIT,
    MAX_CONSECUTIVE_RATE_LIMITS,
    MAX_RATE_LIMIT_WAIT,
    TRANSIENT_BACKOFF_SECONDS,
    _Client,
    _estimate_tokens,
    _is_transient,
    _non_negative_float,
    _non_negative_int,
    _Pacer,
    _positive_int,
)
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingHttpError,
    EmbeddingUnavailableError,
    pack_vector,
)
from app.models.notebook import NotebookChunk, NotebookEmbedding, NotebookSource

PREFIX = "[cadernos-reembed]"
DAILY_QUOTA_MESSAGE = f"{PREFIX} cota diária esgotada — continua na próxima execução."


@dataclass
class ReembedReport:
    """What one run found and did, in counts."""

    applied: bool = False
    #: Stale vectors by ``(model, dimensions)`` when the run started.
    stale_groups: dict[tuple[str, int], int] = field(default_factory=dict)
    sources: int = 0
    notebooks: int = 0
    replaced: int = 0
    refused: int = 0
    requests: int = 0
    remaining: int = 0
    exit_code: int = 0

    @property
    def stale(self) -> int:
        return sum(self.stale_groups.values())


def _is_current(model: str, dims: int):
    """SQL twin of :func:`app.knowledge.embeddings.embedding_matches` for notebooks."""
    same_model = NotebookEmbedding.model == model
    if dims == 0:
        return same_model
    return and_(same_model, NotebookEmbedding.dimensions == dims)


def stale_groups(db: Session, model: str, dims: int) -> dict[tuple[str, int], int]:
    """How many stored vectors of each other identity there are; no vector is read."""
    rows = db.execute(
        select(NotebookEmbedding.model, NotebookEmbedding.dimensions, func.count())
        .join(NotebookChunk, NotebookEmbedding.chunk_id == NotebookChunk.id)
        .where(not_(_is_current(model, dims)))
        .group_by(NotebookEmbedding.model, NotebookEmbedding.dimensions)
        .order_by(NotebookEmbedding.model, NotebookEmbedding.dimensions)
    ).all()
    return {(str(m), int(d)): int(n) for m, d, n in rows}


def stale_chunk_ids(db: Session, model: str, dims: int) -> list[int]:
    """The passages to re-embed, smallest sources first, in reading order."""
    rows = db.execute(
        select(NotebookChunk.id)
        .join(NotebookEmbedding, NotebookEmbedding.chunk_id == NotebookChunk.id)
        .join(NotebookSource, NotebookSource.id == NotebookChunk.source_id)
        .where(not_(_is_current(model, dims)))
        .order_by(NotebookSource.char_count, NotebookSource.id, NotebookChunk.ordinal)
    ).all()
    return [int(chunk_id) for (chunk_id,) in rows]


def _scope(db: Session, model: str, dims: int) -> tuple[int, int]:
    """``(sources, notebooks)`` holding at least one stale vector."""
    row = db.execute(
        select(
            func.count(func.distinct(NotebookSource.id)),
            func.count(func.distinct(NotebookSource.notebook_id)),
        )
        .select_from(NotebookEmbedding)
        .join(NotebookChunk, NotebookEmbedding.chunk_id == NotebookChunk.id)
        .join(NotebookSource, NotebookSource.id == NotebookChunk.source_id)
        .where(not_(_is_current(model, dims)))
    ).one()
    return int(row[0]), int(row[1])


def _dims(dims: int) -> str:
    return f"{dims} dimensões" if dims else "dimensão nativa do modelo"


class _Run:
    """One execution in ``--apply`` mode; the state its loop threads through."""

    def __init__(
        self,
        db: Session,
        client: _Client,
        report: ReembedReport,
        *,
        batch: int,
        max_requests: int,
        deadline: float | None,
        pacer: _Pacer,
        sleep: Callable[[float], None],
        clock: Callable[[], float],
        out: Callable[[str], None],
    ) -> None:
        self.db = db
        self.client = client
        self.report = report
        self.batch = batch
        self.max_requests = max_requests
        self.deadline = deadline
        self.pacer = pacer
        self.sleep = sleep
        self.clock = clock
        self.out = out
        self.stop_message = ""

    def execute(self, queue: list[int]) -> int:
        """Re-embed ``queue``; returns the exit code."""
        position = 0
        while position < len(queue):
            ids = queue[position : position + self.batch]
            position += len(ids)
            texts = self._texts(ids)
            ids = [chunk_id for chunk_id in ids if chunk_id in texts]  # deleted meanwhile
            if not ids:
                continue
            outcome = self._send(ids, [texts[i] for i in ids])
            if outcome == "bad_request" and len(ids) > 1:
                self.out(
                    f"::notice::{PREFIX} o servidor recusou um lote de {len(ids)} trechos "
                    "(400); reenviando um a um."
                )
                for chunk_id in ids:
                    single = self._send([chunk_id], [texts[chunk_id]])
                    if single == "bad_request":
                        self.report.refused += 1
                    elif single != "stored":
                        return self._stop(single)
                continue
            if outcome == "bad_request":
                self.report.refused += 1
                continue
            if outcome != "stored":
                return self._stop(outcome)
        return 0

    def _stop(self, outcome: str) -> int:
        if self.stop_message:
            self.out(self.stop_message)
        return 1 if outcome == "fatal" else 0

    def _texts(self, ids: list[int]) -> dict[int, str]:
        rows = self.db.execute(
            select(NotebookChunk.id, NotebookChunk.text).where(NotebookChunk.id.in_(ids))
        ).all()
        return {int(chunk_id): text for chunk_id, text in rows}

    def _send(self, ids: list[int], texts: list[str]) -> str:
        """``stored``, ``bad_request``, ``daily_quota``, ``budget``, ``deadline`` or ``fatal``."""
        tokens = _estimate_tokens(texts)
        rate_limited = 0
        transient = 0
        while True:
            if self.max_requests and self.report.requests >= self.max_requests:
                self.stop_message = (
                    f"{PREFIX} limite de {self.max_requests} pedidos desta execução atingido."
                )
                return "budget"
            if not self._wait(self.pacer.wait_for(tokens)):
                return "deadline"
            self.pacer.sent(tokens)
            self.report.requests += 1
            try:
                vectors = self.client.embed(texts)
            except EmbeddingUnavailableError as exc:
                if isinstance(exc, EmbeddingHttpError) and exc.status == 429:
                    rate_limited += 1
                    if exc.daily or rate_limited >= MAX_CONSECUTIVE_RATE_LIMITS:
                        self.stop_message = DAILY_QUOTA_MESSAGE
                        return "daily_quota"
                    wait = min(
                        exc.retry_after if exc.retry_after is not None else DEFAULT_RATE_LIMIT_WAIT,
                        MAX_RATE_LIMIT_WAIT,
                    )
                    self.out(f"{PREFIX} limite por minuto (429): aguardando {wait:g} s.")
                    if not self._wait(wait):
                        return "deadline"
                    continue
                if isinstance(exc, EmbeddingHttpError) and exc.status == 400:
                    return "bad_request"
                if _is_transient(exc) and transient < len(TRANSIENT_BACKOFF_SECONDS):
                    wait = TRANSIENT_BACKOFF_SECONDS[transient]
                    transient += 1
                    self.out(f"{PREFIX} falha temporária; nova tentativa em {wait:g} s.")
                    if not self._wait(wait):
                        return "deadline"
                    continue
                self.stop_message = f"::error::{PREFIX} {exc}"
                return "fatal"
            if len(vectors) != len(ids):
                self.stop_message = (
                    f"::error::{PREFIX} o servidor devolveu {len(vectors)} vetores "
                    f"para {len(ids)} trechos."
                )
                return "fatal"
            self._store(ids, vectors)
            return "stored"

    def _store(self, ids: list[int], vectors: list[list[float]]) -> None:
        rows = {
            row.chunk_id: row
            for row in self.db.execute(
                select(NotebookEmbedding).where(NotebookEmbedding.chunk_id.in_(ids))
            ).scalars()
        }
        for chunk_id, vector in zip(ids, vectors, strict=True):
            row = rows.get(chunk_id)
            if row is None:  # the vector went with its passage meanwhile
                continue
            row.model = self.client.model
            row.dimensions = len(vector)
            row.vector = pack_vector(vector)
            self.report.replaced += 1
        # Committed per batch: a run cut short keeps what it paid for.
        self.db.commit()

    def _wait(self, seconds: float) -> bool:
        """Sleep, unless the deadline falls first — then ``False``."""
        if self.deadline is not None and self.clock() + seconds >= self.deadline:
            self.stop_message = f"{PREFIX} prazo desta execução atingido."
            return False
        if seconds > 0:
            self.sleep(seconds)
        return True


def run(
    db: Session,
    *,
    apply: bool = False,
    client: _Client | None = None,
    settings: Settings = default_settings,
    batch: int | None = None,
    max_requests: int = 0,
    deadline_minutes: float = 0,
    rpm: int = 0,
    tpm: int = 0,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    out: Callable[[str], None] = print,
) -> ReembedReport:
    """Count (and, with ``apply``, replace) the notebook vectors of another identity.

    ``exit_code`` is 1 only for configuration or a server that kept failing —
    never for a quota, a budget or a deadline, which are the schedule working.
    """
    size = max(1, batch if batch is not None else settings.knowledge_embedding_batch)
    if client is None:
        client = EmbeddingClient(settings.model_copy(update={"knowledge_embedding_batch": size}))
    report = ReembedReport(applied=apply)
    if not client.configured:
        out(
            f"::error::{PREFIX} embeddings não configurados: defina "
            "KNOWLEDGE_EMBEDDING_BASE_URL (ou AI_BASE_URL) e KNOWLEDGE_EMBEDDING_MODEL. "
            "Sem a identidade atual não há como saber qual vetor é antigo."
        )
        report.exit_code = 1
        return report

    model, dims = client.model, client.dimensions
    report.stale_groups = stale_groups(db, model, dims)
    report.sources, report.notebooks = _scope(db, model, dims)
    mode = "aplicar" if apply else "simulação (nada é enviado nem gravado)"
    out(f"{PREFIX} modo: {mode}; identidade atual: {model} ({_dims(dims)}).")
    if report.stale == 0:
        out(f"{PREFIX} nada a fazer: todo vetor de caderno já é de {model} ({_dims(dims)}).")
        return report
    groups = ", ".join(f"{m} ({_dims(d)}): {n}" for (m, d), n in report.stale_groups.items())
    out(
        f"{PREFIX} {report.stale} vetores de outra identidade — {groups} — em "
        f"{report.sources} fontes de {report.notebooks} cadernos; "
        f"{math.ceil(report.stale / size)} pedidos com lote de {size}."
    )
    if not apply:
        report.remaining = report.stale
        out(f"{PREFIX} simulação: rode com --apply para trocar os vetores.")
        return report

    deadline = clock() + deadline_minutes * 60.0 if deadline_minutes > 0 else None
    report.exit_code = _Run(
        db,
        client,
        report,
        batch=size,
        max_requests=max(0, max_requests),
        deadline=deadline,
        pacer=_Pacer(rpm, tpm, clock),
        sleep=sleep,
        clock=clock,
        out=out,
    ).execute(stale_chunk_ids(db, model, dims))
    report.remaining = sum(stale_groups(db, model, dims).values())
    if report.refused:
        out(
            f"{PREFIX} {report.refused} trechos recusados (400) nesta execução: "
            "mantêm o vetor antigo e voltam na próxima."
        )
    out(
        f"{PREFIX} {report.replaced} vetores trocados com {report.requests} pedidos; "
        f"faltam {report.remaining}."
    )
    return report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.notebook_reembed",
        description=(
            "Troca os vetores de fontes de caderno gravados com outra identidade de embedding "
            "(ex.: 3072 dimensões, antes do D-101) pelos da identidade atual."
        ),
    )
    parser.add_argument("--apply", action="store_true", help="envia e grava (sem isto, só conta)")
    parser.add_argument(
        "--max-requests",
        type=_non_negative_int,
        default=0,
        help="pedidos que esta execução pode fazer (0 = até a cota acabar)",
    )
    parser.add_argument(
        "--deadline-minutes",
        type=_non_negative_float,
        default=0,
        help="tempo máximo desta execução, em minutos (0 = sem prazo)",
    )
    parser.add_argument(
        "--batch",
        type=_positive_int,
        default=None,
        help="trechos por pedido (padrão: KNOWLEDGE_EMBEDDING_BATCH)",
    )
    parser.add_argument(
        "--rpm", type=_non_negative_int, default=0, help="pedidos por minuto (0 = sem limite)"
    )
    parser.add_argument(
        "--tpm", type=_non_negative_int, default=0, help="tokens estimados por minuto (0 = sem)"
    )
    return parser


def main(argv: list[str] | None = None, *, settings: Settings = default_settings) -> None:
    """Parse the flags, run against ``DATABASE_URL`` and exit with the run's code."""
    args = _parser().parse_args(argv if argv is not None else [])
    from app.db.base import SessionLocal

    try:
        with SessionLocal() as db:
            report = run(
                db,
                apply=args.apply,
                settings=settings,
                batch=args.batch,
                max_requests=args.max_requests,
                deadline_minutes=args.deadline_minutes,
                rpm=args.rpm,
                tpm=args.tpm,
            )
    except SQLAlchemyError as exc:
        # The class name only: the message quotes the statement, and the log is public.
        print(
            f"::error::{PREFIX} o banco de dados recusou ou perdeu a conexão "
            f"({type(exc).__name__}); os lotes já gravados ficam."
        )
        sys.exit(1)
    sys.exit(report.exit_code)


if __name__ == "__main__":
    main(sys.argv[1:])
