"""embed: os vetores do Cérebro, com a sobra da cota gratuita, noite após noite.

O comando é o que a execução noturna do workflow chama. Estes testes confirmam
o que ele promete: um pedido HTTP por lote e um commit por lote (uma execução
cortada ao meio guarda o que pagou), o documento menor primeiro, o 429 por
minuto esperado e repetido, o 429 por dia (ou quatro por minuto seguidos)
encerrando com saída 0, o 400 de um lote virando pedidos avulsos, a falha
temporária com espera de 5, 15 e 45 s, credencial e configuração com saída 1,
orçamento de pedidos e prazo com saída 0 — e nenhuma rede: o cliente, o relógio
e o sono são falsos.
"""

from __future__ import annotations

import http.client

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.knowledge import embed as embed_module
from app.knowledge.embed import DAILY_QUOTA_MESSAGE, EmbedReport, main, run
from app.knowledge.embeddings import (
    EmbeddingHttpError,
    EmbeddingUnavailableError,
    pack_vector,
)
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
from app.repositories.knowledge_repository import KnowledgeRepository

MODEL = "modelo-teste"
DIMS = 4


class FakeClient:
    """Stands in for EmbeddingClient: records every call, raises what it is told."""

    def __init__(
        self,
        script: list[BaseException | None] | None = None,
        *,
        model: str = MODEL,
        dimensions: int = DIMS,
        configured: bool = True,
        refuse_lists: bool = False,
        refuse_texts: frozenset[str] = frozenset(),
    ) -> None:
        self.script = list(script or [])
        self.model = model
        self.dimensions = dimensions
        self.configured = configured
        self.refuse_lists = refuse_lists
        self.refuse_texts = refuse_texts
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        if self.script:
            item = self.script.pop(0)
            if item is not None:
                raise item
        if self.refuse_lists and len(texts) > 1:
            raise _http(400, detail="Lists are not supported.")
        if any(text in self.refuse_texts for text in texts):
            raise _http(400, detail="Invalid input text.")
        size = self.dimensions or 3
        return [[1.0] + [0.0] * (size - 1) for _ in texts]


class Clock:
    """A monotonic clock that only moves when the command sleeps."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def _http(
    status: int, *, retry_after: float | None = None, daily: bool = False, detail: str = ""
) -> EmbeddingHttpError:
    return EmbeddingHttpError(
        f"erro {status}. {detail}".strip(),
        status=status,
        retry_after=retry_after,
        daily=daily,
        detail=detail,
    )


#: How Gemini answers a wrong or revoked key: 400, not 401.
INVALID_KEY = "API key not valid. Please pass a valid API key."


def _network_error() -> EmbeddingUnavailableError:
    error = EmbeddingUnavailableError("O servidor de embeddings não respondeu em 30s.")
    error.__cause__ = TimeoutError()
    return error


def _truncated_body() -> EmbeddingUnavailableError:
    error = EmbeddingUnavailableError("A resposta chegou incompleta ou malformada.")
    error.__cause__ = http.client.IncompleteRead(b'{"data": [')
    return error


def _document(
    db: Session, path: str, texts: list[str]
) -> tuple[KnowledgeDocument, list[KnowledgeChunk]]:
    document = KnowledgeDocument(path=path, title=path, checksum="0" * 64, chunk_count=len(texts))
    db.add(document)
    db.flush()
    chunks = []
    for ordinal, text in enumerate(texts):
        chunk = KnowledgeChunk(
            document_id=document.id,
            ordinal=ordinal,
            text=text,
            char_count=len(text),
            search_text=text,
        )
        db.add(chunk)
        chunks.append(chunk)
    db.flush()
    return document, chunks


def _embed(db: Session, chunk: KnowledgeChunk, *, model: str, dims: int) -> None:
    db.add(
        KnowledgeEmbedding(
            chunk_id=chunk.id,
            model=model,
            dimensions=dims,
            vector=pack_vector([1.0] + [0.0] * (dims - 1)),
        )
    )
    db.flush()


def _run(
    db: Session, client: FakeClient, clock: Clock | None = None, **kwargs
) -> tuple[EmbedReport, list[str]]:
    clock = clock or Clock()
    lines: list[str] = []
    report = run(db, client=client, sleep=clock.sleep, clock=clock, out=lines.append, **kwargs)
    return report, lines


def _texts(n: int, prefix: str = "trecho") -> list[str]:
    return [f"{prefix} {i}" for i in range(n)]


def _stored(db: Session) -> list[KnowledgeEmbedding]:
    return list(db.execute(select(KnowledgeEmbedding)).scalars())


@pytest.fixture
def commits(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Counts db.commit() calls while still committing (to the test savepoint)."""
    counted: list[int] = []
    original = db_session.commit

    def counting_commit() -> None:
        counted.append(1)
        original()

    monkeypatch.setattr(db_session, "commit", counting_commit)
    return counted


class TestRepository:
    def test_pending_includes_other_model_and_other_size_but_not_current(
        self, db_session: Session
    ) -> None:
        _, chunks = _document(db_session, "a.pdf", _texts(4))
        current, other_model, other_size, _never = chunks
        _embed(db_session, current, model=MODEL, dims=DIMS)
        _embed(db_session, other_model, model="outro-modelo", dims=DIMS)
        _embed(db_session, other_size, model=MODEL, dims=8)
        repo = KnowledgeRepository(db_session)

        pending = repo.pending_chunk_ids(MODEL, DIMS)

        assert pending == [chunks[1].id, chunks[2].id, chunks[3].id]
        assert repo.embedding_totals(MODEL, DIMS) == (4, 1, 3)

    def test_dimension_zero_accepts_any_size_of_the_same_model(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "a.pdf", _texts(3))
        _embed(db_session, chunks[0], model=MODEL, dims=DIMS)
        _embed(db_session, chunks[1], model=MODEL, dims=8)
        repo = KnowledgeRepository(db_session)

        assert repo.pending_chunk_ids(MODEL, 0) == [chunks[2].id]
        assert repo.embedding_totals(MODEL, 0) == (3, 2, 1)

    def test_smallest_document_first_then_by_position(self, db_session: Session) -> None:
        _, big = _document(db_session, "livro.pdf", _texts(3, "livro"))
        _, small = _document(db_session, "ficha.pdf", _texts(1, "ficha"))
        _, medium = _document(db_session, "artigo.pdf", _texts(2, "artigo"))

        pending = KnowledgeRepository(db_session).pending_chunk_ids(MODEL, DIMS)

        assert pending == [c.id for c in small + medium + big]

    def test_replace_chunks_deletes_the_old_vectors(self, db_session: Session) -> None:
        # SQLite does not apply ``ondelete`` here and reuses freed ids: a vector
        # left behind would be inherited by a new passage and read as current.
        document, chunks = _document(db_session, "a.pdf", _texts(2))
        _, other = _document(db_session, "b.pdf", _texts(1))
        for chunk in chunks + other:
            _embed(db_session, chunk, model=MODEL, dims=DIMS)
        repo = KnowledgeRepository(db_session)

        repo.replace_chunks(
            document.id,
            [
                KnowledgeChunk(ordinal=i, text=t, char_count=len(t), search_text=t)
                for i, t in enumerate(["novo 0", "novo 1"])
            ],
        )

        assert [e.chunk_id for e in _stored(db_session)] == [other[0].id]
        new_ids = [c.id for c in repo.list_chunks(document.id)]
        assert repo.pending_chunk_ids(MODEL, DIMS) == new_ids

    def test_chunk_texts_returns_only_existing_ids(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "a.pdf", ["um", "dois"])
        repo = KnowledgeRepository(db_session)

        assert repo.chunk_texts([chunks[1].id, 999_999]) == {chunks[1].id: "dois"}
        assert repo.chunk_texts([]) == {}


class TestBackfill:
    def test_embeds_everything_pending_with_one_commit_per_batch(
        self, db_session: Session, commits: list[int]
    ) -> None:
        _document(db_session, "a.pdf", _texts(5))
        client = FakeClient()

        report, lines = _run(db_session, client, batch=2)

        assert [len(call) for call in client.calls] == [2, 2, 1]
        assert len(commits) == 3
        assert report.exit_code == 0
        assert (report.written, report.requests, report.remaining, report.total) == (5, 3, 0, 5)
        stored = _stored(db_session)
        assert len(stored) == 5
        assert {(e.model, e.dimensions) for e in stored} == {(MODEL, DIMS)}
        assert lines[-1] == (
            "[embed] 5 vetores gravados agora com 3 pedidos; faltam 0 de 5 trechos (0,0%)."
        )

    def test_replaces_a_vector_of_another_model_or_size(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "a.pdf", _texts(2))
        _embed(db_session, chunks[0], model="outro-modelo", dims=DIMS)
        _embed(db_session, chunks[1], model=MODEL, dims=8)

        report, _ = _run(db_session, FakeClient(), batch=10)

        assert report.written == 2
        assert {(e.model, e.dimensions) for e in _stored(db_session)} == {(MODEL, DIMS)}

    def test_second_run_makes_no_request(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(3))
        _run(db_session, FakeClient(), batch=10)
        client = FakeClient()

        report, lines = _run(db_session, client, batch=10)

        assert client.calls == []
        assert report.requests == 0
        assert report.exit_code == 0
        assert lines[0].startswith("[embed] nada a fazer")
        assert lines[-1] == (
            "[embed] 0 vetores gravados agora com 0 pedidos; faltam 0 de 3 trechos (0,0%)."
        )

    def test_sends_the_smallest_document_first(self, db_session: Session) -> None:
        _document(db_session, "livro.pdf", _texts(3, "livro"))
        _document(db_session, "ficha.pdf", _texts(1, "ficha"))
        client = FakeClient()

        _run(db_session, client, batch=1)

        assert client.calls[0] == ["ficha 0"]

    def test_summary_percentage_is_what_is_left(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(8))

        _, lines = _run(db_session, FakeClient(), batch=1, max_requests=3)

        assert lines[-1] == (
            "[embed] 3 vetores gravados agora com 3 pedidos; faltam 5 de 8 trechos (62,5%)."
        )


class TestRateLimits:
    def test_per_minute_429_waits_what_the_server_asked_and_repeats_the_batch(
        self, db_session: Session
    ) -> None:
        _document(db_session, "a.pdf", _texts(2))
        client = FakeClient([_http(429, retry_after=37.0)])
        clock = Clock()

        report, _ = _run(db_session, client, clock, batch=2)

        assert clock.sleeps == [37.0]
        assert client.calls[0] == client.calls[1]
        assert report.exit_code == 0
        assert report.written == 2
        assert report.requests == 2

    @pytest.mark.parametrize(("retry_after", "expected"), [(None, 60.0), (500.0, 120.0)])
    def test_per_minute_wait_defaults_to_60_and_is_capped_at_120(
        self, db_session: Session, retry_after: float | None, expected: float
    ) -> None:
        _document(db_session, "a.pdf", _texts(1))
        clock = Clock()

        _run(db_session, FakeClient([_http(429, retry_after=retry_after)]), clock)

        assert clock.sleeps == [expected]

    def test_daily_quota_stops_with_exit_0_and_keeps_earlier_batches(
        self, db_session: Session, commits: list[int]
    ) -> None:
        _document(db_session, "a.pdf", _texts(3))
        client = FakeClient([None, _http(429, daily=True)])

        report, lines = _run(db_session, client, batch=1)

        assert report.exit_code == 0
        assert report.written == 1
        assert report.remaining == 2
        assert len(commits) == 1
        assert len(_stored(db_session)) == 1
        assert DAILY_QUOTA_MESSAGE in lines
        assert DAILY_QUOTA_MESSAGE == (
            "[embed] cota diária do Gemini esgotada — continua na próxima execução."
        )

    def test_four_per_minute_429_in_a_row_are_read_as_the_daily_quota(
        self, db_session: Session
    ) -> None:
        _document(db_session, "a.pdf", _texts(2))
        client = FakeClient([_http(429, retry_after=10.0)] * 4)
        clock = Clock()

        report, lines = _run(db_session, client, clock, batch=1)

        assert report.exit_code == 0
        assert report.written == 0
        assert len(client.calls) == 4
        assert clock.sleeps == [10.0, 10.0, 10.0]
        assert DAILY_QUOTA_MESSAGE in lines

    def test_success_resets_the_consecutive_429_count(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(2))
        slow = _http(429, retry_after=1.0)
        client = FakeClient([slow, slow, slow, None, slow, slow, slow])

        report, _ = _run(db_session, client, batch=1)

        assert report.exit_code == 0
        assert report.written == 2


class TestBadRequest:
    def test_400_on_a_batch_resends_one_by_one_and_stays_at_one(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(5))
        client = FakeClient(refuse_lists=True)

        report, lines = _run(db_session, client, batch=3)

        assert [len(call) for call in client.calls] == [3, 1, 1, 1, 1, 1]
        assert report.written == 5
        assert report.exit_code == 0
        assert any(line.startswith("::notice::") for line in lines)
        assert "[embed] o servidor aceita um trecho por pedido: o resto segue com lote 1." in lines

    def test_400_on_a_single_passage_skips_it_for_this_run(self, db_session: Session) -> None:
        _, chunks = _document(db_session, "a.pdf", ["bom", "recusado", "outro bom"])
        client = FakeClient(refuse_texts=frozenset({"recusado"}))

        report, lines = _run(db_session, client, batch=1)

        assert report.exit_code == 0
        assert report.written == 2
        assert report.refused == 1
        assert report.remaining == 1
        warnings = [line for line in lines if line.startswith("::warning::")]
        assert len(warnings) == 1
        assert str(chunks[1].id) in warnings[0]
        assert "recusado" not in warnings[0].replace("recusou", "")  # no passage text
        assert KnowledgeRepository(db_session).pending_chunk_ids(MODEL, DIMS) == [chunks[1].id]

    def test_a_refused_passage_does_not_keep_the_rest_of_the_run_at_one(
        self, db_session: Session
    ) -> None:
        # The 400 of the first batch was one passage, not the list format: once
        # the singles show that, the run goes back to its batch size.
        _document(db_session, "a.pdf", ["bom 0", "recusado", "bom 1", "bom 2", "bom 3", "bom 4"])
        client = FakeClient(refuse_texts=frozenset({"recusado"}))

        report, lines = _run(db_session, client, batch=3)

        assert [len(call) for call in client.calls] == [3, 1, 1, 1, 3]
        assert (report.written, report.refused, report.exit_code) == (5, 1, 0)
        assert (
            "[embed] a recusa era de 1 trecho(s), não do lote: a execução volta ao lote de 3."
            in lines
        )

    def test_warning_carries_the_servers_explanation(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", ["recusado", "bom"])
        client = FakeClient(refuse_texts=frozenset({"recusado"}))

        _, lines = _run(db_session, client, batch=1)

        (warning,) = [line for line in lines if line.startswith("::warning::")]
        assert "(400: Invalid input text.)" in warning

    def test_a_refused_passage_at_the_head_of_the_queue_is_still_skipped(
        self, db_session: Session
    ) -> None:
        # Smallest documents first: a passage the server always refuses heads
        # the queue every night, and must not fail the run by itself.
        _document(db_session, "a.pdf", ["recusado", "bom 0", "bom 1"])
        client = FakeClient(refuse_texts=frozenset({"recusado"}))

        report, _ = _run(db_session, client, batch=1)

        assert (report.exit_code, report.written, report.refused) == (0, 2, 1)

    def test_refusals_separated_by_a_stored_passage_are_not_consecutive(
        self, db_session: Session
    ) -> None:
        texts = ["r0", "r1", "bom 0", "r2", "r3", "bom 1"]
        _document(db_session, "a.pdf", texts)
        client = FakeClient(refuse_texts=frozenset({"r0", "r1", "r2", "r3"}))

        report, _ = _run(db_session, client, batch=1)

        assert (report.exit_code, report.written, report.refused) == (0, 2, 4)


class TestSystematicBadRequest:
    """Um 400 em todo pedido é configuração (chave, modelo, dimensions), não trecho."""

    def test_every_request_refused_exits_1_after_a_few_requests(self, db_session: Session) -> None:
        # The measured failure: 50 chunks, every request answered 400 — before
        # the fix, 51 requests, 50 warnings and exit 0.
        _document(db_session, "a.pdf", _texts(50))
        client = FakeClient([_http(400, detail=INVALID_KEY)] * 60)

        report, lines = _run(db_session, client, batch=20)

        assert report.exit_code == 1
        # One batch, three singles, then the canary from the far end.
        assert [len(call) for call in client.calls] == [20, 1, 1, 1, 1]
        assert client.calls[-1] == ["trecho 49"]
        assert report.written == 0
        errors = [line for line in lines if line.startswith("::error::")]
        assert len(errors) == 1
        assert INVALID_KEY in errors[0]
        warnings = [line for line in lines if line.startswith("::warning::")]
        assert len(warnings) == 4
        assert all(INVALID_KEY in line for line in warnings)
        assert lines[-1].startswith("[embed] 0 vetores gravados agora com 5 pedidos;")

    def test_at_batch_one_three_refusals_and_the_canary_are_enough(
        self, db_session: Session
    ) -> None:
        _document(db_session, "a.pdf", _texts(10))
        client = FakeClient([_http(400, detail=INVALID_KEY)] * 10)

        report, _ = _run(db_session, client, batch=1)

        assert report.exit_code == 1
        assert len(client.calls) == 4


class TestAdjacentRefusedPassages:
    """Três trechos ruins seguidos de um documento não param toda noite no mesmo lugar."""

    def test_three_adjacent_refused_passages_do_not_fail_night_after_night(
        self, db_session: Session
    ) -> None:
        # The re-review's N1: before the canary, calls [5, 1, 1, 1], exit 1 and
        # nothing written — on night 1 and again on night 2, forever.
        _document(db_session, "a.pdf", ["p0", "p1", "p2", "bom 0", "bom 1"])
        poison = frozenset({"p0", "p1", "p2"})

        for night in (1, 2):
            client = FakeClient(refuse_texts=poison)
            report, lines = _run(db_session, client, batch=5)

            assert report.exit_code == 0, night
            assert not any(line.startswith("::error::") for line in lines)
            assert report.refused == 3
            assert report.remaining == 3

        texts = KnowledgeRepository(db_session).chunk_texts(
            [embedding.chunk_id for embedding in _stored(db_session)]
        )
        assert sorted(texts.values()) == ["bom 0", "bom 1"]

    def test_the_canary_comes_from_another_document_and_counts_as_written(
        self, db_session: Session
    ) -> None:
        _document(db_session, "a.pdf", ["p0", "p1", "p2", "p3"])
        _document(db_session, "b.pdf", _texts(6, "bom"))
        client = FakeClient(refuse_texts=frozenset({"p0", "p1", "p2", "p3"}))

        report, lines = _run(db_session, client, batch=1)

        # Three refusals, the canary from the far end (b.pdf's last passage),
        # then p3 — one refusal, counting from zero again — and b.pdf in order.
        assert client.calls[:5] == [["p0"], ["p1"], ["p2"], ["bom 5"], ["p3"]]
        assert (report.exit_code, report.written, report.refused) == (0, 6, 4)
        assert (
            "[embed] o trecho do fim da fila foi aceito: as recusas são daqueles "
            "trechos, não da configuração; a execução continua." in lines
        )

    def test_refused_passages_with_nothing_behind_them_end_with_exit_0(
        self, db_session: Session
    ) -> None:
        # Once everything else is stored, the refused passages are the whole
        # queue: no canary is left, nothing is blocked, and failing would turn
        # every later night red.
        _document(db_session, "a.pdf", ["bom"])
        _document(db_session, "b.pdf", ["p0", "p1", "p2"])
        poison = frozenset({"p0", "p1", "p2"})

        first, _ = _run(db_session, FakeClient(refuse_texts=poison), batch=1)
        client = FakeClient(refuse_texts=poison)
        second, _ = _run(db_session, client, batch=1)

        assert (first.exit_code, first.written, first.refused) == (0, 1, 3)
        assert (second.exit_code, second.written, second.refused) == (0, 0, 3)
        assert len(client.calls) == 3

    def test_a_refused_canary_fails_the_run(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", ["p0", "p1", "p2"])
        _document(db_session, "b.pdf", _texts(5, "também recusado"))
        client = FakeClient([_http(400, detail=INVALID_KEY)] * 10)

        report, lines = _run(db_session, client, batch=1)

        assert report.exit_code == 1
        assert client.calls == [["p0"], ["p1"], ["p2"], ["também recusado 4"]]
        (error,) = [line for line in lines if line.startswith("::error::")]
        assert INVALID_KEY in error

    def test_a_canary_hitting_the_daily_quota_stops_with_exit_0(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", ["p0", "p1", "p2", "bom"])
        client = FakeClient(
            [None, None, None, _http(429, daily=True)],
            refuse_texts=frozenset({"p0", "p1", "p2"}),
        )

        report, lines = _run(db_session, client, batch=1)

        assert report.exit_code == 0
        assert DAILY_QUOTA_MESSAGE in lines
        assert report.remaining == 4


class TestFailures:
    @pytest.mark.parametrize("status", [401, 403, 404])
    def test_credential_or_endpoint_errors_exit_1_without_retrying(
        self, db_session: Session, status: int
    ) -> None:
        _document(db_session, "a.pdf", _texts(2))
        client = FakeClient([_http(status)])
        clock = Clock()

        report, lines = _run(db_session, client, clock, batch=1)

        assert report.exit_code == 1
        assert len(client.calls) == 1
        assert clock.sleeps == []
        assert any(line.startswith("::error::") and f"erro {status}" in line for line in lines)

    def test_wrong_vector_size_is_configuration_and_exits_1(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(1))
        wrong_size = EmbeddingUnavailableError(
            "O servidor de embeddings ignorou dimensions=4: devolveu vetores de 3072 dimensões."
        )
        client = FakeClient([wrong_size])
        clock = Clock()

        report, lines = _run(db_session, client, clock)

        assert report.exit_code == 1
        assert clock.sleeps == []
        assert any("ignorou dimensions=4" in line for line in lines)

    @pytest.mark.parametrize("error", [lambda: _http(503), _network_error, _truncated_body])
    def test_transient_failure_backs_off_5_15_45_then_exits_1(
        self, db_session: Session, error
    ) -> None:
        _document(db_session, "a.pdf", _texts(1))
        client = FakeClient([error() for _ in range(4)])
        clock = Clock()

        report, _ = _run(db_session, client, clock)

        assert report.exit_code == 1
        assert clock.sleeps == [5.0, 15.0, 45.0]
        assert len(client.calls) == 4
        assert report.written == 0

    def test_transient_failure_that_recovers_carries_on(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(1))
        client = FakeClient([_http(502), None])
        clock = Clock()

        report, _ = _run(db_session, client, clock)

        assert report.exit_code == 0
        assert clock.sleeps == [5.0]
        assert report.written == 1

    def test_unconfigured_exits_1_naming_the_variables(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _document(db_session, "a.pdf", _texts(1))
        unconfigured = settings.model_copy(
            update={
                "knowledge_embedding_base_url": "",
                "knowledge_embedding_model": "",
                "ai_base_url": "",
            }
        )
        lines: list[str] = []

        report = run(db_session, settings=unconfigured, out=lines.append)

        assert report.exit_code == 1
        assert "KNOWLEDGE_EMBEDDING_BASE_URL" in lines[0]
        assert "KNOWLEDGE_EMBEDDING_MODEL" in lines[0]
        assert _stored(db_session) == []


class TestBudgetAndDeadline:
    def test_request_budget_stops_with_exit_0(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(5))
        client = FakeClient()

        report, lines = _run(db_session, client, batch=1, max_requests=2)

        assert report.exit_code == 0
        assert len(client.calls) == 2
        assert (report.written, report.remaining) == (2, 3)
        assert "[embed] limite de 2 pedidos desta execução atingido." in lines

    def test_deadline_stops_with_exit_0(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(5))
        client = FakeClient()
        clock = Clock()

        # One request a minute and a one-and-a-half-minute budget: two requests
        # fit (t=0 and t=60); the third would start at t=120, past the deadline.
        report, lines = _run(db_session, client, clock, batch=1, rpm=1, deadline_minutes=1.5)

        assert report.exit_code == 0
        assert len(client.calls) == 2
        assert report.remaining == 3
        assert "[embed] prazo desta execução atingido." in lines

    def test_a_429_wait_past_the_deadline_stops_instead_of_sleeping(
        self, db_session: Session
    ) -> None:
        _document(db_session, "a.pdf", _texts(1))
        clock = Clock()

        report, _ = _run(
            db_session,
            FakeClient([_http(429, retry_after=90.0)]),
            clock,
            deadline_minutes=1,
        )

        assert report.exit_code == 0
        assert clock.sleeps == []


class TestPacing:
    def test_rpm_spaces_requests_evenly(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(3))
        clock = Clock()

        _run(db_session, FakeClient(), clock, batch=1, rpm=2)

        assert clock.sleeps == [30.0, 30.0]

    def test_tpm_waits_for_the_window_to_free_room(self, db_session: Session) -> None:
        # 30 characters ≈ 10 estimated tokens: with 15 per minute, only one
        # request fits in any one-minute window.
        _document(db_session, "a.pdf", ["x" * 30, "y" * 30])
        clock = Clock()

        _run(db_session, FakeClient(), clock, batch=1, tpm=15)

        assert clock.sleeps == [60.0]

    def test_no_limits_no_sleep(self, db_session: Session) -> None:
        _document(db_session, "a.pdf", _texts(3))
        clock = Clock()

        _run(db_session, FakeClient(), clock, batch=1)

        assert clock.sleeps == []


class TestClientAndCli:
    def test_default_client_sends_one_batch_per_request(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        built: list[int] = []

        def build(configured_settings):
            built.append(configured_settings.knowledge_embedding_batch)
            return FakeClient()

        monkeypatch.setattr(embed_module, "EmbeddingClient", build)
        _document(db_session, "a.pdf", _texts(1))

        run(db_session, batch=7, out=lambda _line: None)

        assert built == [7]

    def test_main_passes_the_flags_and_exits_with_the_run_code(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        received: dict = {}

        def fake_run(db, **kwargs):
            received.update(kwargs)
            return EmbedReport(exit_code=0)

        monkeypatch.setattr(embed_module, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(embed_module, "run", fake_run)

        with pytest.raises(SystemExit) as exc:
            main(
                [
                    "--max-requests",
                    "300",
                    "--batch",
                    "20",
                    "--rpm",
                    "90",
                    "--tpm",
                    "27000",
                    "--deadline-minutes",
                    "120",
                ]
            )

        assert exc.value.code == 0
        assert received == {
            "batch": 20,
            "max_requests": 300,
            "deadline_minutes": 120.0,
            "rpm": 90,
            "tpm": 27000,
        }

    def test_main_without_configuration_exits_1(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setattr(embed_module, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(settings, "knowledge_embedding_base_url", "")
        monkeypatch.setattr(settings, "knowledge_embedding_model", "")
        monkeypatch.setattr(settings, "ai_base_url", "")

        with pytest.raises(SystemExit) as exc:
            main([])

        assert exc.value.code == 1
        assert "KNOWLEDGE_EMBEDDING_MODEL" in capsys.readouterr().out

    @pytest.mark.parametrize("argv", [["--batch", "0"], ["--max-requests", "-1"], ["--rpm", "x"]])
    def test_main_refuses_invalid_flags(self, argv: list[str]) -> None:
        with pytest.raises(SystemExit) as exc:
            main(argv)
        assert exc.value.code == 2
