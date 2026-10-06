"""Backfill the Cérebro's vectors within a free quota, a little every night.

Run with::

    python -m app.knowledge.embed --max-requests 300 --batch 20 --rpm 90 --tpm 27000

Ingestion (``python -m app.knowledge.ingest --no-embed``) writes passages; this
writes their vectors. They are separate commands because they run against
different limits: extracting text costs nothing but time, while every vector
spends a request of a daily quota the product itself also draws on (the query
embedding of an explanation, a notebook question). On Gemini's free tier that is
about a thousand requests a day, so a corpus of tens of thousands of passages is
covered over several nights with whatever the day left over — and the command is
built to be interrupted at any point and pick up where it stopped.

**Resumable by construction.** What is pending is recomputed from the database
on every run: a chunk with no vector, or with one from another model or of
another size (the rule of :func:`app.knowledge.embeddings.embedding_matches`,
evaluated in SQL). Each batch is committed as soon as it is stored, so a run
killed by the job's timeout keeps everything it paid for.

**Smallest documents first**, so what one night covers is whole documents.

**One ``embed()`` call is one HTTP request.** The client splits its input by
``KNOWLEDGE_EMBEDDING_BATCH``; this command builds it with that setting equal to
``--batch``, so the requests it counts are the requests the quota counts.

**How each refusal is read** — the difference between waiting, stopping for the
day and failing:

* 429 per minute: wait what the server asked (``retry_after``, else 60 s, never
  more than 120 s) and repeat the same batch. Four in a row are read as the day
  being over — a minute-quota that never recovers is not one.
* 429 per day: stop with exit 0. Nothing is wrong; tomorrow continues.
* 400 on a batch of several: the endpoint may not accept lists — or one passage
  is refused. The batch is resent one passage at a time, and how those singles
  end decides the rest of the run: some stored and some refused means the 400
  was a passage, so the run goes back to the batch size it had; all stored
  means the endpoint refuses lists, so the run stays at one. 400 on a single
  passage skips it for this run (it stays pending and is tried again next
  time), with a warning naming its id and the server's explanation.
* 400 on three single passages in a row, with nothing stored in between:
  either configuration or a run of passages the server always refuses. One
  *canary* passage from the far end of the queue (normally another, larger
  document) tells them apart. Stored: the refusals were the passages, the
  count starts over and the run carries on — three adjacent bad passages of one
  document would otherwise stop every night at the same place, and nothing
  behind them would ever be reached. Refused too: configuration, exit 1.
  Gemini answers a wrong or revoked key with 400 ``INVALID_ARGUMENT``
  (``API_KEY_INVALID``), not 401, and a field it rejects (an unsupported
  ``dimensions``) the same way — read one passage at a time, that would
  otherwise be a green job sending one request per pending chunk. A bad key
  costs five requests at most (the batch, three singles, the canary). With no
  passage left to try, nothing is blocked: the run ends with exit 0 and the
  warnings, which carry the server's explanation.
* 5xx, timeout, network: back off 5, 15 and 45 s; still failing, exit 1.
* 401/403/404, any other status, or an answer of the wrong shape (vectors of a
  size other than the configured one included): configuration, exit 1.

Exit 0 also when the request budget or the deadline ends the run: that is the
schedule working, not a failure.

**What is on the removal list is never sent.** ``Cérebro/removidos.txt`` (D-100)
is read through :mod:`app.knowledge.removal` — the reader the ingestion and the
prune use — and the passages of every document it matches, by path or by
SHA-256, are left out of the queue. Taking a document out of the base is a
separate, manual action (``conhecimento_remover``); between adding a line to
the list and running it, the unattended nightly run must not hand that text to
an embedding provider whose free tier may use what it receives. The run counts
what it held back and says to run the prune; it never names a document. The
list comes from ``--list`` (as in the prune) or, without it, from
``KNOWLEDGE_DIR`` (as in the ingestion). Asked for and unreadable — missing,
not UTF-8, a malformed line — the run fails before any request (exit 1): an
embedding run that cannot tell what was removed does not guess.

**The log is public** (GitHub Actions). It carries counts, chunk ids and the
model's name — never a passage's text, a path or a key.
"""

from __future__ import annotations

import argparse
import http.client
import math
import sys
import time
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Protocol

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.db.base import SessionLocal
from app.domain.errors import ValidationError
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingHttpError,
    EmbeddingUnavailableError,
)
from app.knowledge.removal import REMOVAL_LIST_FILENAME, RemovalList, load_removal_list
from app.repositories.knowledge_repository import KnowledgeRepository

#: Waits between attempts after a 5xx, a timeout or a network error.
TRANSIENT_BACKOFF_SECONDS: tuple[float, ...] = (5.0, 15.0, 45.0)
#: Wait after a per-minute 429 that did not say how long to wait.
DEFAULT_RATE_LIMIT_WAIT = 60.0
#: Never wait longer than this after a per-minute 429, whatever the server asks.
MAX_RATE_LIMIT_WAIT = 120.0
#: Consecutive per-minute 429s after which the day is taken to be over.
MAX_CONSECUTIVE_RATE_LIMITS = 4
#: Single passages refused (400) in a row, with nothing stored in between,
#: after which a canary passage from the far end of the queue is sent: refused
#: too, the refusal is read as configuration and the run fails.
MAX_CONSECUTIVE_REFUSALS = 3
#: Characters per token when estimating a request against the TPM limit.
#: Portuguese prose runs at about four; three over-counts, so the estimate errs
#: toward waiting.
CHARS_PER_TOKEN = 3

DAILY_QUOTA_MESSAGE = "[embed] cota diária do Gemini esgotada — continua na próxima execução."


class _Client(Protocol):
    """What the command uses of :class:`EmbeddingClient` — a fake in tests."""

    @property
    def model(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    @property
    def configured(self) -> bool: ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class _Attempt(Enum):
    """How sending one batch ended."""

    STORED = "stored"
    BAD_REQUEST = "bad_request"
    DAILY_QUOTA = "daily_quota"
    BUDGET = "budget"
    DEADLINE = "deadline"
    FATAL = "fatal"


@dataclass
class EmbedReport:
    """What one run did — the counts the summary line prints."""

    total: int = 0
    pending_before: int = 0
    written: int = 0
    requests: int = 0
    refused: int = 0
    remaining: int = 0
    #: Pending passages left out because their document is on the removal list.
    held_back: int = 0
    exit_code: int = 0


class _Pacer:
    """Spaces requests under a requests-per-minute and a tokens-per-minute limit.

    RPM is enforced as an even spacing of ``60 / rpm`` seconds between
    requests rather than as a burst allowance: a burst of ninety requests in
    two seconds is within "90 per minute" on paper and is exactly what a
    shared free endpoint refuses. TPM is a sliding one-minute window over the
    estimated tokens of the requests sent. Zero turns either limit off.
    """

    def __init__(self, rpm: int, tpm: int, clock: Callable[[], float]) -> None:
        self.interval = 60.0 / rpm if rpm > 0 else 0.0
        self.tpm = tpm
        self.clock = clock
        self.last_sent: float | None = None
        self.window: deque[tuple[float, int]] = deque()

    def wait_for(self, tokens: int) -> float:
        """Seconds to wait before a request of ``tokens`` may be sent."""
        now = self.clock()
        wait = 0.0
        if self.interval and self.last_sent is not None:
            wait = max(wait, self.last_sent + self.interval - now)
        if self.tpm > 0:
            while self.window and self.window[0][0] <= now - 60.0:
                self.window.popleft()
            used = sum(spent for _, spent in self.window)
            # Free the oldest entries until the new request fits. A request
            # larger than the whole budget waits for an empty window and goes
            # alone — refusing it would leave that passage pending forever.
            for sent_at, spent in self.window:
                if used + tokens <= self.tpm:
                    break
                wait = max(wait, sent_at + 60.0 - now)
                used -= spent
        return max(wait, 0.0)

    def sent(self, tokens: int) -> None:
        now = self.clock()
        self.last_sent = now
        if self.tpm > 0:
            self.window.append((now, tokens))


def _estimate_tokens(texts: Sequence[str]) -> int:
    return max(1, math.ceil(sum(len(text) for text in texts) / CHARS_PER_TOKEN))


def _is_transient(exc: EmbeddingUnavailableError) -> bool:
    """A 5xx, or a timeout / network failure — worth backing off and retrying.

    A plain :class:`EmbeddingUnavailableError` is either the transport failing
    (raised *from* a :class:`TimeoutError` or :class:`OSError`, which covers
    ``URLError``, or from an :class:`http.client.HTTPException` such as a body
    cut short by ``IncompleteRead``) or the answer being wrong — a vector of
    another size, a body that is not JSON. The second kind is configuration,
    and waiting does not change it.
    """
    if isinstance(exc, EmbeddingHttpError):
        return exc.status >= 500
    return isinstance(exc.__cause__, (OSError, http.client.HTTPException))


def _percent(part: int, whole: int) -> str:
    """``part / whole`` as a pt-BR percentage with one decimal (D-30)."""
    share = 100.0 * part / whole if whole else 0.0
    return f"{share:.1f}".replace(".", ",")


class _Run:
    """One execution of the backfill; the state its loop threads through."""

    def __init__(
        self,
        db: Session,
        client: _Client,
        *,
        batch: int,
        max_requests: int,
        deadline: float | None,
        pacer: _Pacer,
        sleep: Callable[[float], None],
        clock: Callable[[], float],
        out: Callable[[str], None],
        removal: RemovalList | None = None,
    ) -> None:
        self.db = db
        self.removal = removal
        self.repo = KnowledgeRepository(db)
        self.client = client
        self.batch = batch
        self.max_requests = max_requests
        self.deadline = deadline
        self.pacer = pacer
        self.sleep = sleep
        self.clock = clock
        self.out = out
        self.report = EmbedReport()
        self.stop_message = ""
        #: The 400 that ended the last attempt, for its warning and, when it
        #: turns out to be systematic, for the error that ends the run.
        self.refusal: EmbeddingHttpError | None = None
        #: Single passages refused in a row since the last stored batch.
        self.consecutive_refusals = 0
        #: After a batch 400: the ids being resent one at a time, how many of
        #: them were stored and refused, and the batch size to go back to.
        self.probing = False
        self.probe: set[int] = set()
        self.probe_stored = 0
        self.probe_refused = 0
        self.probe_batch = 0

    # --- the loop --------------------------------------------------------

    def execute(self) -> EmbedReport:
        model, dims = self.client.model, self.client.dimensions
        total, _, pending = self.repo.embedding_totals(model, dims)
        self.report.total = total
        self.report.pending_before = pending
        size = f"{dims} dimensões" if dims else "dimensão nativa do modelo"
        if pending == 0:
            self.out(f"[embed] nada a fazer: os {total} trechos já têm vetor de {model} ({size}).")
            return self._finish(0)

        self.out(
            f"[embed] modelo {model} ({size}), lote de {self.batch}; "
            f"{pending} de {total} trechos sem vetor atual."
        )
        queue = deque(self._queue(model, dims))
        if not queue:
            self.out("[embed] nenhum trecho pendente fora da lista de remoção: nada a enviar.")
            return self._finish(0)
        exit_code = 0
        while queue:
            popped = [queue.popleft() for _ in range(min(self.batch, len(queue)))]
            texts_by_id = self.repo.chunk_texts(popped)
            # A chunk deleted since the list was read is simply gone.
            ids = [chunk_id for chunk_id in popped if chunk_id in texts_by_id]
            self._settle_probe([i for i in popped if i not in texts_by_id], None)
            if not ids:
                continue
            outcome = self._send(ids, [texts_by_id[chunk_id] for chunk_id in ids])
            if outcome is _Attempt.STORED:
                self.consecutive_refusals = 0
                self._settle_probe(ids, outcome)
                continue
            if outcome is _Attempt.BAD_REQUEST:
                if len(ids) > 1:
                    self.out(
                        f"::notice::[embed] O servidor recusou um lote de {len(ids)} trechos "
                        f"(400: {self._refusal_detail()}); reenviando um a um."
                    )
                    self.probing = True
                    self.probe = set(ids)
                    self.probe_stored = self.probe_refused = 0
                    self.probe_batch = self.batch
                    self.batch = 1
                    queue.extendleft(reversed(ids))
                    continue
                self._refused(ids[0])
                self._settle_probe(ids, outcome)
                if self.refusal is not None and (
                    self.consecutive_refusals >= MAX_CONSECUTIVE_REFUSALS
                ):
                    verdict = self._canary(queue)
                    if verdict is _Attempt.BAD_REQUEST and self.refusal is not None:
                        self.out(
                            f"[embed] {self.consecutive_refusals} trechos recusados (400) "
                            "seguidos, sem nenhum gravado entre eles, e também o do fim da "
                            "fila: tratado como configuração (chave, modelo ou dimensions), "
                            "não como trechos ruins."
                        )
                        self._fatal(self.refusal)
                        exit_code = 1
                        break
                    if verdict not in (None, _Attempt.STORED):
                        exit_code = 1 if verdict is _Attempt.FATAL else 0
                        break
                continue
            exit_code = 1 if outcome is _Attempt.FATAL else 0
            break
        if self.stop_message:
            self.out(self.stop_message)
        return self._finish(exit_code)

    def _queue(self, model: str, dims: int) -> list[int]:
        """The pending chunk ids, minus those of documents on the removal list.

        Matched in Python, as the prune does (NFC paths have no portable SQL
        spelling); the base is a few hundred documents. The count of what was
        held back is printed — never a path: the list exists because those
        names are not to be published.
        """
        pending = self.repo.pending_chunks(model, dims)
        if self.removal is None or self.removal.is_empty:
            return [chunk_id for chunk_id, _ in pending]
        removed = {
            doc_id
            for doc_id, path, checksum in self.repo.document_fingerprints()
            if self.removal.match_reason(path, checksum) is not None
        }
        queue = [chunk_id for chunk_id, doc_id in pending if doc_id not in removed]
        held = len(pending) - len(queue)
        self.report.held_back = held
        if held:
            documents = len({doc_id for _, doc_id in pending if doc_id in removed})
            self.out(
                f"::warning::[embed] {held} trechos de {documents} documento(s) na lista de "
                f"remoção ({REMOVAL_LIST_FILENAME}) não foram enviados: continuam na base até "
                "a ação `conhecimento_remover` (workflow Administração do banco) tirá-los."
            )
        return queue

    def _refused(self, chunk_id: int) -> None:
        """Count a single passage refused (400) and warn — by id, never by text."""
        self.report.refused += 1
        self.consecutive_refusals += 1
        self.out(
            f"::warning::[embed] O servidor recusou o trecho {chunk_id} "
            f"(400: {self._refusal_detail()}); ele continua pendente e volta na "
            "próxima execução."
        )

    def _canary(self, queue: deque[int]) -> _Attempt | None:
        """Send one passage from the far end of the queue, alone; ``None`` if none is left.

        After :data:`MAX_CONSECUTIVE_REFUSALS` single refusals in a row, the
        question is whether the configuration or the passages are at fault. The
        queue runs smallest document first, so its far end is normally another
        document — one the refusals say nothing about. Stored: the passages
        were at fault, the count starts over and the run goes on. Refused: the
        caller fails the run. Any other outcome (quota, budget, deadline, a
        fatal error) is the caller's to end the run with.

        No passage left means nothing is blocked behind the refused ones, so
        there is nothing to protect by failing: the run simply ends.
        """
        while queue:
            chunk_id = queue.pop()
            texts = self.repo.chunk_texts([chunk_id])
            if chunk_id not in texts:  # deleted since the list was read
                self._settle_probe([chunk_id], None)
                continue
            self.out(
                f"[embed] {self.consecutive_refusals} trechos recusados (400) seguidos: "
                f"testando o trecho {chunk_id}, do fim da fila, antes de concluir que é "
                "configuração."
            )
            outcome = self._send([chunk_id], [texts[chunk_id]])
            if outcome is _Attempt.STORED:
                self.consecutive_refusals = 0
                self.out(
                    "[embed] o trecho do fim da fila foi aceito: as recusas são daqueles "
                    "trechos, não da configuração; a execução continua."
                )
            elif outcome is _Attempt.BAD_REQUEST:
                self._refused(chunk_id)
            self._settle_probe([chunk_id], outcome)
            return outcome
        return None

    def _refusal_detail(self) -> str:
        """The server's explanation of the last 400 — never a passage or a key.

        ``detail`` is the server's own message, already cut at 300 characters by
        the client and scrubbed of the configured key there.
        """
        detail = self.refusal.detail.strip() if self.refusal is not None else ""
        return detail or "sem explicação do servidor"

    def _settle_probe(self, ids: list[int], outcome: _Attempt | None) -> None:
        """Count how the resent singles of a refused batch ended; decide at the last.

        ``outcome`` is ``STORED`` or ``BAD_REQUEST``; ``None`` (a chunk deleted
        meanwhile) only takes the id out of the count.

        Some stored and some refused: the 400 was a passage, not the list, so
        the run returns to the batch size it had — a passage the server always
        refuses stays pending and heads the queue every night, and staying at
        one would cost every such night twenty times the requests. All stored:
        the endpoint refuses lists, and the run stays at one.
        """
        if not self.probing:
            return
        for chunk_id in ids:
            if chunk_id not in self.probe:
                continue
            self.probe.discard(chunk_id)
            if outcome is _Attempt.STORED:
                self.probe_stored += 1
            elif outcome is _Attempt.BAD_REQUEST:
                self.probe_refused += 1
        if self.probe:
            return
        self.probing = False
        if self.probe_refused and self.probe_stored:
            self.batch = self.probe_batch
            self.out(
                f"[embed] a recusa era de {self.probe_refused} trecho(s), não do lote: "
                f"a execução volta ao lote de {self.batch}."
            )
        elif self.probe_stored:
            self.out("[embed] o servidor aceita um trecho por pedido: o resto segue com lote 1.")

    def _finish(self, exit_code: int) -> EmbedReport:
        model, dims = self.client.model, self.client.dimensions
        total, _, remaining = self.repo.embedding_totals(model, dims)
        self.report.total = total
        self.report.remaining = remaining
        self.report.exit_code = exit_code
        if self.report.refused:
            self.out(
                f"[embed] {self.report.refused} trechos recusados pelo servidor nesta "
                "execução (continuam pendentes)."
            )
        self.out(
            f"[embed] {self.report.written} vetores gravados agora com "
            f"{self.report.requests} pedidos; faltam {remaining} de {total} trechos "
            f"({_percent(remaining, total)}%)."
        )
        return self.report

    # --- one batch -------------------------------------------------------

    def _send(self, ids: list[int], texts: list[str]) -> _Attempt:
        """Send one batch until it is stored, refused, or the run must stop."""
        tokens = _estimate_tokens(texts)
        rate_limited = 0
        transient = 0
        while True:
            if self.max_requests and self.report.requests >= self.max_requests:
                self.stop_message = (
                    f"[embed] limite de {self.max_requests} pedidos desta execução atingido."
                )
                return _Attempt.BUDGET
            stop = self._wait(self.pacer.wait_for(tokens))
            if stop is not None:
                return stop
            self.pacer.sent(tokens)
            self.report.requests += 1
            try:
                vectors = self.client.embed(texts)
            except EmbeddingUnavailableError as exc:
                if isinstance(exc, EmbeddingHttpError) and exc.status == 429:
                    if exc.daily:
                        self.stop_message = DAILY_QUOTA_MESSAGE
                        return _Attempt.DAILY_QUOTA
                    rate_limited += 1
                    if rate_limited >= MAX_CONSECUTIVE_RATE_LIMITS:
                        self.out(
                            f"[embed] {rate_limited} recusas por minuto (429) seguidas: "
                            "tratado como cota diária."
                        )
                        self.stop_message = DAILY_QUOTA_MESSAGE
                        return _Attempt.DAILY_QUOTA
                    wait = min(
                        exc.retry_after if exc.retry_after is not None else DEFAULT_RATE_LIMIT_WAIT,
                        MAX_RATE_LIMIT_WAIT,
                    )
                    self.out(
                        f"[embed] limite por minuto (429): aguardando {wait:g} s e "
                        "repetindo o mesmo lote."
                    )
                    stop = self._wait(wait)
                    if stop is not None:
                        return stop
                    continue
                if isinstance(exc, EmbeddingHttpError) and exc.status == 400:
                    self.refusal = exc
                    return _Attempt.BAD_REQUEST
                if not _is_transient(exc):
                    return self._fatal(exc)
                outcome = self._back_off(exc, transient)
                if outcome is not None:
                    return outcome
                transient += 1
                rate_limited = 0
                continue

            if len(vectors) != len(ids):  # the real client already checks this
                return self._fatal(
                    EmbeddingUnavailableError(
                        f"O servidor devolveu {len(vectors)} vetores para {len(ids)} trechos."
                    )
                )
            for chunk_id, vector in zip(ids, vectors, strict=True):
                self.repo.set_embedding(chunk_id, model=self.client.model, vector=vector)
            # Committed per batch: a run cut short keeps what it paid for.
            self.db.commit()
            self.report.written += len(ids)
            return _Attempt.STORED

    def _back_off(self, exc: EmbeddingUnavailableError, failures: int) -> _Attempt | None:
        """Wait the next step of the transient backoff; stop when none is left."""
        if failures >= len(TRANSIENT_BACKOFF_SECONDS):
            return self._fatal(exc)
        wait = TRANSIENT_BACKOFF_SECONDS[failures]
        self.out(
            f"[embed] falha temporária ({_status_of(exc)}); nova tentativa em {wait:g} s "
            f"({failures + 1} de {len(TRANSIENT_BACKOFF_SECONDS)})."
        )
        return self._wait(wait)

    def _fatal(self, exc: EmbeddingUnavailableError) -> _Attempt:
        self.stop_message = f"::error::[embed] {exc}"
        return _Attempt.FATAL

    def _wait(self, seconds: float) -> _Attempt | None:
        """Sleep, unless the deadline falls first — then stop instead."""
        if self.deadline is not None and self.clock() + seconds >= self.deadline:
            self.stop_message = "[embed] prazo desta execução atingido."
            return _Attempt.DEADLINE
        if seconds > 0:
            self.sleep(seconds)
        return None


def _status_of(exc: EmbeddingUnavailableError) -> str:
    if isinstance(exc, EmbeddingHttpError):
        return f"HTTP {exc.status}"
    return "sem resposta do servidor"


def run(
    db: Session,
    *,
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
    removal: RemovalList | None = None,
) -> EmbedReport:
    """Embed pending chunks until done, out of budget, out of time or out of quota.

    Args:
        removal: the parsed removal list; the passages of every document it
            matches (by path or SHA-256) are never sent. ``None``: nothing is
            left out — the CLI passes one whenever a list is configured.
        client: the embedding client; by default one built from ``settings``
            with ``knowledge_embedding_batch`` equal to ``batch``, so that one
            ``embed()`` call is one request.
        batch: passages per request (default: ``KNOWLEDGE_EMBEDDING_BATCH``).
        max_requests: requests this run may send; 0 = until the quota says no.
        deadline_minutes: wall-clock budget; 0 = none.
        rpm, tpm: pacing limits; 0 = off.
        sleep, clock: injectable for tests (``clock`` must be monotonic).

    Returns the report; ``exit_code`` is 1 only for configuration or a server
    that kept failing — never for a quota, a budget or a deadline.
    """
    size = batch if batch is not None else settings.knowledge_embedding_batch
    size = max(1, size)
    if client is None:
        client = EmbeddingClient(settings.model_copy(update={"knowledge_embedding_batch": size}))
    if not client.configured:
        out(
            "::error::[embed] Embeddings não configurados: defina "
            "KNOWLEDGE_EMBEDDING_BASE_URL (ou AI_BASE_URL) e KNOWLEDGE_EMBEDDING_MODEL, e "
            "KNOWLEDGE_EMBEDDING_API_KEY (ou AI_API_KEY) se o servidor pedir chave. "
            "Nenhum pedido foi feito."
        )
        return EmbedReport(exit_code=1)
    deadline = clock() + deadline_minutes * 60.0 if deadline_minutes > 0 else None
    return _Run(
        db,
        client,
        batch=size,
        max_requests=max(0, max_requests),
        deadline=deadline,
        pacer=_Pacer(rpm, tpm, clock),
        sleep=sleep,
        clock=clock,
        out=out,
        removal=removal,
    ).execute()


def _non_negative_int(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("tem de ser 0 ou mais")
    return number


def _positive_int(value: str) -> int:
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("tem de ser 1 ou mais")
    return number


def _non_negative_float(value: str) -> float:
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise argparse.ArgumentTypeError("tem de ser 0 ou mais")
    return number


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.knowledge.embed",
        description="Gera os vetores dos trechos do Cérebro que ainda não têm vetor atual.",
    )
    parser.add_argument(
        "--max-requests",
        type=_non_negative_int,
        default=0,
        help="pedidos que esta execução pode fazer (0 = até a cota diária acabar)",
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
        "--tpm",
        type=_non_negative_int,
        default=0,
        help="tokens estimados por minuto (0 = sem limite)",
    )
    parser.add_argument(
        "--list",
        type=Path,
        default=None,
        help=(
            "lista de remoção (Cérebro/removidos.txt): os trechos dos documentos dela não "
            "são enviados. Sem a opção, a de KNOWLEDGE_DIR, se definido"
        ),
    )
    return parser


def load_removal(list_path: Path | None, settings: Settings) -> RemovalList | None:
    """The removal list this run must honour, or ``None`` when none is configured.

    ``--list`` names the file, as in the prune: it must exist and parse.
    Without it, ``KNOWLEDGE_DIR`` names the folder, as in the ingestion: the
    folder must exist, and a folder without ``removidos.txt`` is an empty list
    (a corpus nothing was ever removed from). Neither: ``None``.

    Raises:
        ValidationError: the list was asked for and cannot be read — the CLI
            exits 1 before any request rather than embed what may be removed.
    """
    if list_path is None:
        root_setting = settings.knowledge_dir.strip()
        if not root_setting:
            return None
        root = Path(root_setting).expanduser()
        if not root.is_dir():
            raise ValidationError(f"KNOWLEDGE_DIR não é um diretório: {root}")
        list_path = root / REMOVAL_LIST_FILENAME
        if not list_path.exists():
            return RemovalList(exact=frozenset(), prefixes=())
    try:
        return load_removal_list(list_path)
    except (OSError, UnicodeDecodeError) as exc:
        raise ValidationError(f"não consegui ler a lista de remoção {list_path}: {exc}") from exc


def main(argv: list[str] | None = None, *, settings: Settings = default_settings) -> None:
    """Parse the flags, run against ``DATABASE_URL`` and exit with the run's code."""
    args = _parser().parse_args(argv if argv is not None else [])
    try:
        removal = load_removal(args.list, settings)
    except ValidationError as exc:
        print(f"::error::[embed] {exc} Nenhum pedido foi feito.")
        sys.exit(1)
    if removal is None:
        print(
            "[embed] sem lista de remoção (nem --list nem KNOWLEDGE_DIR): nenhum trecho "
            "fica de fora por ela."
        )
    else:
        print(
            f"[embed] lista de remoção: {len(removal.entries)} caminhos, "
            f"{len(removal.checksums)} sha256."
        )
    try:
        with SessionLocal() as db:
            report = run(
                db,
                settings=settings,
                batch=args.batch,
                max_requests=args.max_requests,
                deadline_minutes=args.deadline_minutes,
                rpm=args.rpm,
                tpm=args.tpm,
                removal=removal,
            )
    except SQLAlchemyError as exc:
        # The class name only: SQLAlchemy's message quotes the statement and
        # its bound parameters, and the log is public. Batches already
        # committed stay; the next run continues from what is missing.
        print(
            f"::error::[embed] o banco de dados recusou ou perdeu a conexão "
            f"({type(exc).__name__}); os lotes já gravados ficam. Confira o secret "
            f"DATABASE_URL e se o banco está no ar."
        )
        sys.exit(1)
    sys.exit(report.exit_code)


if __name__ == "__main__":
    main(sys.argv[1:])
