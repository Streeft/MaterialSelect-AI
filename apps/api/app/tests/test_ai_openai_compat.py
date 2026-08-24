"""The vendor-neutral provider: what it sends, and what it refuses to assume.

No test here reaches the network. The point of the provider is that one
implementation serves a free Groq plan, a local Ollama and OpenAI alike, so what
has to be pinned down is the *request* — which header is present, which is
deliberately absent, and which error a misconfiguration produces. A wrong error
message here is not cosmetic: it is the difference between a student switching
to a working endpoint in a minute and giving up on the layer.

The other half of the file is the same guarantee the Claude providers carry
(:mod:`app.ai.model_base`), re-checked through this transport: the catalogue
overwrites the model, and a slug the model invented is *reported*, not hidden.
"""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from app.ai import factory
from app.ai.openai_compat import OpenAICompatProvider, _strip_fence
from app.ai.provider import (
    AIUnavailableError,
    ClassFacts,
    IndexFacts,
    ProblemContext,
    PropertyFacts,
)
from app.config import Settings

GROQ = "https://api.groq.com/openai/v1"
OLLAMA = "http://localhost:11434/v1"


# --- a server that never was -----------------------------------------------


class _Response:
    def __init__(self, body: str) -> None:
        self._body = body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False


class _Server:
    """Records the request it was given, then answers however it was told to."""

    def __init__(self, body: str = "", error: Exception | None = None) -> None:
        self.body = body
        self.error = error
        self.request: object = None
        self.timeout: float | None = None

    def __call__(self, request: object, timeout: float | None = None) -> _Response:
        self.request = request
        self.timeout = timeout
        if self.error is not None:
            raise self.error
        return _Response(self.body)


def _answer(content: str, finish_reason: str = "stop", **message: object) -> str:
    """One chat-completions envelope carrying ``content``."""
    return json.dumps(
        {
            "choices": [
                {
                    "finish_reason": finish_reason,
                    "message": {"role": "assistant", "content": content, **message},
                }
            ]
        }
    )


def _http_error(code: int, payload: object = None) -> urllib.error.HTTPError:
    body = json.dumps(payload if payload is not None else {"error": {"message": "sem detalhe"}})
    return urllib.error.HTTPError(
        f"{GROQ}/chat/completions", code, "erro", {}, io.BytesIO(body.encode("utf-8"))
    )


def _provider(server: _Server, **overrides: object) -> OpenAICompatProvider:
    options: dict[str, object] = {"ai_provider": "openai-compat", "ai_base_url": GROQ}
    options.update(overrides)
    return OpenAICompatProvider(settings=Settings(**options), opener=server)  # type: ignore[arg-type]


def _sent(server: _Server) -> dict:
    return json.loads(server.request.data.decode("utf-8"))  # type: ignore[attr-defined]


def _context(statement: str = "Viga leve e rígida.") -> ProblemContext:
    return ProblemContext(
        statement=statement,
        properties=[
            PropertyFacts(
                slug="densidade",
                name="Densidade",
                symbol="ρ",
                category="fisica",
                canonical_unit="kg/m**3",
                accepted_units=["kg/m**3", "g/cm**3"],
                better_direction="min",
            ),
        ],
        indices=[
            IndexFacts(
                slug="viga-leve-rigidez",
                name="Viga leve limitada por rigidez",
                expression="sqrt(modulo_young) / densidade",
                goal="maximize",
                description=None,
                assumptions=None,
            )
        ],
        classes=[ClassFacts(slug="metais", name="Metais")],
    )


_EMPTY_INTERPRETATION = {
    "function_text": "Viga em flexão",
    "objective_text": "Minimizar massa",
    "free_variables": [],
    "constraints": [],
    "properties": [],
    "indices": [],
    "charts": [],
    "open_questions": [],
}


# --- configuration ---------------------------------------------------------


class TestItIsRegistered:
    def test_the_factory_knows_it(self) -> None:
        provider = factory.get_provider(Settings(ai_provider="openai-compat", ai_base_url=GROQ))
        assert isinstance(provider, OpenAICompatProvider)
        assert provider.simulated is False

    def test_mock_is_still_the_default(self) -> None:
        # The free provider is an option, never a promotion: only a
        # deterministic default lets two runs of a study be compared.
        assert Settings().ai_provider == "mock"


class TestTheEndpointHasNoDefault:
    def test_without_a_base_url_the_error_lists_the_free_options(self) -> None:
        # A default would pick a vendor for the operator. The alternative is to
        # fail with the URLs in hand, which is also the documentation.
        with pytest.raises(AIUnavailableError) as exc:
            _provider(_Server(), ai_base_url="").interpret(_context())
        message = str(exc.value)
        assert "AI_BASE_URL" in message
        assert "groq.com" in message
        assert "localhost:11434" in message

    def test_a_base_url_without_a_scheme_is_refused(self) -> None:
        with pytest.raises(AIUnavailableError, match="http://"):
            _provider(_Server(), ai_base_url="api.groq.com/openai/v1").interpret(_context())

    def test_the_path_is_appended_to_the_configured_root(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server, ai_base_url=f"{GROQ}/").interpret(_context())
        assert server.request.full_url == f"{GROQ}/chat/completions"  # type: ignore[attr-defined]


class TestAuthenticationIsOptional:
    """The reason this provider exists: a configuration where auth cannot fail."""

    def test_no_key_means_no_authorization_header(self) -> None:
        # An empty bearer would turn "this server needs no credential" into
        # "your credential was rejected" — which is a local Ollama's whole point.
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server, ai_base_url=OLLAMA, ai_api_key="").interpret(_context())
        headers = server.request.headers  # type: ignore[attr-defined]
        assert not any(name.lower() == "authorization" for name in headers)

    def test_a_key_travels_as_a_bearer_token(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server, ai_api_key="  gsk_exemplo  ").interpret(_context())
        headers = {name.lower(): value for name, value in server.request.headers.items()}  # type: ignore[attr-defined]
        assert headers["authorization"] == "Bearer gsk_exemplo"


class TestHowTheShapeIsAskedFor:
    def test_schema_mode_asks_the_server_to_enforce_it(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server).interpret(_context())
        body = _sent(server)
        assert body["response_format"]["type"] == "json_schema"
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["response_format"]["json_schema"]["schema"]["type"] == "object"
        # Enforced server-side, so the prompt is not padded with the schema too.
        assert "JSON Schema" not in body["messages"][0]["content"]

    def test_object_mode_moves_the_contract_into_the_prompt(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server, ai_json_mode="object").interpret(_context())
        body = _sent(server)
        assert body["response_format"] == {"type": "json_object"}
        assert "JSON Schema" in body["messages"][0]["content"]

    def test_prompt_mode_enforces_nothing_but_still_states_the_contract(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server, ai_json_mode="prompt").interpret(_context())
        body = _sent(server)
        assert "response_format" not in body
        assert "JSON Schema" in body["messages"][0]["content"]

    def test_an_unknown_mode_is_refused_rather_than_guessed(self) -> None:
        with pytest.raises(AIUnavailableError, match="AI_JSON_MODE"):
            _provider(_Server(), ai_json_mode="estrito").interpret(_context())

    def test_the_statement_is_the_user_message(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server).interpret(_context("Preciso de uma viga a 300 °C."))
        assert "300 °C" in _sent(server)["messages"][1]["content"]


class TestReadingTheAnswer:
    def test_a_code_fence_is_packaging_not_content(self) -> None:
        fenced = "```json\n" + json.dumps(_EMPTY_INTERPRETATION) + "\n```"
        result = _provider(_Server(_answer(fenced)), ai_json_mode="prompt").interpret(_context())
        assert result["function_text"] == "Viga em flexão"

    def test_content_parts_are_joined(self) -> None:
        parts = [
            {"type": "text", "text": '{"function_text": "Viga'},
            {"type": "text", "text": ' em flexão"}'},
        ]
        result = _provider(_Server(_answer(parts))).interpret(_context())  # type: ignore[arg-type]
        assert result["function_text"] == "Viga em flexão"

    def test_prose_instead_of_json_fails_loudly(self) -> None:
        # Never a shrug: an unreadable answer is reported, never turned into an
        # empty proposal the user would read as "nothing to suggest".
        with pytest.raises(AIUnavailableError, match="JSON"):
            _provider(_Server(_answer("Claro! Aqui vai:")), ai_json_mode="prompt").interpret(
                _context()
            )

    def test_a_truncated_answer_says_so(self) -> None:
        with pytest.raises(AIUnavailableError, match="truncada"):
            _provider(_Server(_answer("{", finish_reason="length"))).interpret(_context())

    def test_a_refusal_is_not_read_as_an_empty_proposal(self) -> None:
        body = _answer("", refusal="não posso ajudar com isso")
        with pytest.raises(AIUnavailableError, match="recusou"):
            _provider(_Server(body)).interpret(_context())

    def test_a_content_filter_is_named_as_itself(self) -> None:
        with pytest.raises(AIUnavailableError, match="filtro de conteúdo"):
            _provider(_Server(_answer("", finish_reason="content_filter"))).interpret(_context())

    def test_an_error_envelope_without_choices_is_surfaced(self) -> None:
        body = json.dumps({"error": {"message": "model_decommissioned"}})
        with pytest.raises(AIUnavailableError, match="model_decommissioned"):
            _provider(_Server(body)).interpret(_context())

    def test_an_empty_string_is_not_an_answer(self) -> None:
        with pytest.raises(AIUnavailableError, match="vazia"):
            _provider(_Server(_answer("   "))).interpret(_context())


class TestEveryFailureNamesItsFix:
    """A free plan fails in ways a paid one does not; the message has to help."""

    def test_a_rejected_credential_points_at_the_key_and_at_ollama(self) -> None:
        with pytest.raises(AIUnavailableError) as exc:
            _provider(_Server(error=_http_error(401))).interpret(_context())
        assert "AI_API_KEY" in str(exc.value)
        assert "Ollama" in str(exc.value)

    def test_a_missing_model_points_at_ai_model(self) -> None:
        with pytest.raises(AIUnavailableError) as exc:
            _provider(_Server(error=_http_error(404)), ai_model="gpt-inexistente").interpret(
                _context()
            )
        assert "AI_MODEL" in str(exc.value)
        assert "gpt-inexistente" in str(exc.value)

    def test_a_rate_limit_points_at_the_provider_that_has_none(self) -> None:
        with pytest.raises(AIUnavailableError) as exc:
            _provider(_Server(error=_http_error(429))).interpret(_context())
        assert "429" in str(exc.value)
        assert "mock" in str(exc.value)

    def test_a_rejected_schema_points_at_the_way_out(self) -> None:
        # The commonest failure on a free plan: the model does not do strict
        # structured output. The user needs the name of the setting, not a 400.
        error = _http_error(400, {"error": {"message": "response_format not supported"}})
        with pytest.raises(AIUnavailableError) as exc:
            _provider(_Server(error=error)).interpret(_context())
        assert "AI_JSON_MODE" in str(exc.value)
        assert "response_format not supported" in str(exc.value)

    def test_a_timeout_names_the_setting_that_governs_it(self) -> None:
        with pytest.raises(AIUnavailableError, match="AI_TIMEOUT_SECONDS"):
            _provider(_Server(error=TimeoutError())).interpret(_context())

    def test_an_unreachable_server_suggests_checking_it_is_up(self) -> None:
        error = urllib.error.URLError("Connection refused")
        with pytest.raises(AIUnavailableError) as exc:
            _provider(_Server(error=error), ai_base_url=OLLAMA).interpret(_context())
        assert "localhost:11434" in str(exc.value)
        assert "no ar" in str(exc.value)

    def test_the_timeout_setting_actually_reaches_the_request(self) -> None:
        server = _Server(_answer(json.dumps(_EMPTY_INTERPRETATION)))
        _provider(server, ai_timeout_seconds=12.5).interpret(_context())
        assert server.timeout == 12.5


class TestTheUserIsToldWhereTheirTextGoes:
    def test_the_notice_names_the_host(self) -> None:
        provider = _provider(_Server(), ai_base_url=GROQ)
        assert "api.groq.com" in provider.data_note
        assert "treinar" in provider.data_note

    def test_the_notice_never_repeats_the_path(self) -> None:
        # A gateway URL can carry a token in its path, and this string is shown
        # in the interface next to every suggestion.
        provider = _provider(_Server(), ai_base_url="https://gw.exemplo.br/k/segredo123/v1")
        assert "segredo123" not in provider.data_note
        assert "gw.exemplo.br" in provider.data_note

    def test_the_disclaimer_carries_it(self) -> None:
        disclaimer = factory.disclaimer_for(
            factory.get_provider(Settings(ai_provider="openai-compat", ai_base_url=GROQ))
        )
        assert "pode variar" in disclaimer  # still a real provider
        assert "api.groq.com" in disclaimer  # and now, where the text goes

    def test_the_claude_providers_add_nothing(self) -> None:
        assert factory.get_provider(Settings(ai_provider="mock")).data_note == ""


class TestTheContractSurvivesTheNewTransport:
    """D-35, re-checked here: a new provider must not be a new set of rules."""

    def test_the_catalogue_writes_the_expression_not_the_model(self) -> None:
        answer = dict(
            _EMPTY_INTERPRETATION,
            indices=[{"slug": "viga-leve-rigidez", "rationale": "casa com o enunciado"}],
        )
        result = _provider(_Server(_answer(json.dumps(answer)))).interpret(_context())
        index = result["indices"][0]
        assert index["expression"] == "sqrt(modulo_young) / densidade"
        assert index["name"] == "Viga leve limitada por rigidez"

    def test_an_invented_slug_is_passed_on_to_be_rejected_out_loud(self) -> None:
        # Filtering it here would hand the service a tidy proposal and cost the
        # user the one thing that makes the layer believable: being told what
        # was refused, and why.
        answer = dict(
            _EMPTY_INTERPRETATION,
            indices=[{"slug": "indice-inventado", "rationale": "…"}],
        )
        result = _provider(_Server(_answer(json.dumps(answer)))).interpret(_context())
        assert result["indices"][0]["slug"] == "indice-inventado"
        assert result["indices"][0]["expression"] == ""


class TestStripFence:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ('{"a": 1}', '{"a": 1}'),
            ('```json\n{"a": 1}\n```', '{"a": 1}'),
            ('```\n{"a": 1}\n```', '{"a": 1}'),
            ('  ```json\n{"a": "```"}\n```  ', '{"a": "```"}'),
        ],
    )
    def test_only_the_fence_is_removed(self, raw: str, expected: str) -> None:
        assert _strip_fence(raw) == expected
