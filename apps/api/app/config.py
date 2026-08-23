"""Application configuration.

Settings are read from environment variables (and an optional local .env file).
No secrets are hard-coded here. See .env.example for the documented variables.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the API.

    Attributes:
        database_url: SQLAlchemy database URL. Defaults to a local SQLite file for
            development; production is expected to point at PostgreSQL.
        cors_origins: Comma-separated list of allowed browser origins for CORS.
        app_name: Human-facing application name.
        environment: Free-form environment label (development, production, ...).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./materialselect.db"
    cors_origins: str = "http://localhost:3000"
    app_name: str = "MaterialSelect AI"
    environment: str = "development"

    # --- Import uploads ---------------------------------------------------
    # Directory where uploaded files are kept while an import job is open.
    upload_dir: str = "var/uploads"
    # Hard limit on uploaded file size (bytes). 5 MiB is generous for the
    # expected property spreadsheets while bounding memory/disk usage.
    max_upload_bytes: int = 5 * 1024 * 1024
    # Hard limit on data rows per import, to bound validation/commit time.
    max_import_rows: int = 5000

    # --- AI layer (optional) ----------------------------------------------
    # "" disables the layer entirely. Four providers exist:
    #   mock          deterministic rules, offline, no key (the default, and the
    #                 only one the reproducibility argument can rest on);
    #   claude-api    Claude through the Anthropic Messages API, with your own key;
    #   claude-cli    Claude through the Claude Code CLI installed on the machine,
    #                 signed in as it already is — no API key needed;
    #   openai-compat any server speaking OpenAI chat-completions, chosen by
    #                 AI_BASE_URL — Groq's free plan, a local Ollama (no
    #                 credential at all), OpenRouter, OpenAI.
    # The product is fully usable with the layer off: nothing numeric depends
    # on it.
    ai_provider: str = "mock"
    # For claude-api it is optional (empty means the SDK reads ANTHROPIC_API_KEY
    # itself, and the key never passes through settings). For openai-compat it
    # is the bearer token, and empty is a valid configuration: a local server
    # wants no Authorization header at all.
    ai_api_key: str = ""
    ai_model: str = "claude-opus-5"
    # Root of an OpenAI-compatible API, ending at /v1. No default on purpose: a
    # default would pick a vendor on the operator's behalf. Only openai-compat
    # reads it.
    ai_base_url: str = ""
    # How openai-compat constrains the answer's shape:
    #   schema  response_format=json_schema, strict — the real guarantee, and
    #           what Groq's gpt-oss models and OpenAI support;
    #   object  response_format=json_object — valid JSON, shape asked in words;
    #   prompt  nothing enforced; the schema travels in the system prompt.
    # Degrading is the operator's decision, never a silent fallback: a provider
    # that quietly stopped enforcing the contract would look identical to one
    # that never had it.
    ai_json_mode: str = "schema"
    # Both real providers are slower than a local rule: the CLI has a process to
    # start before it has a model to ask.
    ai_timeout_seconds: float = 90.0
    # Ceiling for one answer, thinking and text together. These replies are
    # small; the limit exists so a runaway one fails fast and says why.
    ai_max_output_tokens: int = 16000
    # Executable for claude-cli, resolved on PATH.
    ai_cli_command: str = "claude"

    # --- Knowledge base / Cérebro (optional) ------------------------------
    # Root directory of the curated reference corpus, relative to the repo root
    # or absolute. Empty disables the layer entirely: nothing is discovered,
    # nothing is indexed, and the AI layer behaves exactly as it did before —
    # same contract as AI_PROVIDER="" and an unset STRIPE_API_KEY.
    knowledge_dir: str = ""
    # Ceiling on one document's bytes. A textbook runs to ~150 MB, so this is
    # generous by design; it exists to fail loudly on a file that is not what it
    # claims rather than to filter the corpus.
    knowledge_max_document_bytes: int = 200 * 1024 * 1024
    # Ceiling on passages kept per document. A full textbook yields tens of
    # thousands; this bounds one ingestion run and, more importantly, keeps a
    # single enormous source from crowding out every other document at
    # retrieval time.
    knowledge_max_chunks_per_document: int = 4000
    # How many passages retrieval hands to the model. Small on purpose: the
    # prompt already carries the catalogue, and an answer grounded in three
    # relevant passages is more checkable than one drowning in twenty.
    knowledge_retrieval_top_k: int = 5

    # --- Auth (A5): login with Google, project-scoped studies -------------
    # Empty client id/secret means OAuth is off: the login endpoint answers
    # 503 with a clear reason instead of crashing into Google with bad
    # credentials. There is no "default" client id, same reasoning as
    # AI_BASE_URL having none — it would pick whose Google Cloud project logs
    # everyone in.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Empty allows any Google account. Set to restrict logins to one email
    # domain (e.g. a university) before hosting for a class.
    google_allowed_domain: str = ""
    # Used to build the exact redirect_uri Google requires pre-registered.
    backend_base_url: str = "http://localhost:8000"
    # Where the browser lands after a successful login.
    frontend_url: str = "http://localhost:3000"
    # Secure by default (the cookie is only sent over HTTPS); local dev over
    # plain HTTP must opt out explicitly rather than the reverse, so a
    # deployment can never silently forget to turn this on.
    session_cookie_secure: bool = True
    # 14 days, fixed at creation — no sliding renewal, so a session's
    # lifetime is exactly what it says, nothing to keep alive by polling.
    session_ttl_hours: int = 336
    # How long the CSRF `state` cookie survives between the redirect to
    # Google and the callback coming back.
    oauth_state_ttl_seconds: int = 600

    # --- Billing (Stripe) --------------------------------------------------
    # Vazio desliga a cobrança: toda rota de /billing responde 503, mesmo
    # padrão do Google OAuth quando faltam as credenciais. Sem default por
    # propósito, mesma razão de AI_BASE_URL — não existe chave que sirva
    # para o Stripe de outra pessoa.
    stripe_api_key: str = ""
    # Verifica a assinatura HMAC do cabeçalho Stripe-Signature no webhook;
    # sem ele, o endpoint recusa todo evento em vez de confiar num payload
    # não verificado.
    stripe_webhook_secret: str = ""
    # O preço/plano que o checkout usa — um único plano no v1, sem seletor
    # na interface.
    stripe_price_id: str = ""

    @property
    def google_oauth_enabled(self) -> bool:
        """True when a Google OAuth client is configured."""
        return bool(self.google_client_id.strip() and self.google_client_secret.strip())

    @property
    def stripe_enabled(self) -> bool:
        """True when Stripe is fully configured (key, webhook secret, and price)."""
        return bool(
            self.stripe_api_key.strip()
            and self.stripe_webhook_secret.strip()
            and self.stripe_price_id.strip()
        )

    @property
    def ai_enabled(self) -> bool:
        """True when an AI provider is configured."""
        return bool(self.ai_provider.strip())

    @property
    def knowledge_enabled(self) -> bool:
        """True when a knowledge-base root is configured."""
        return bool(self.knowledge_dir.strip())

    @property
    def cors_origins_list(self) -> list[str]:
        """Return the configured CORS origins as a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
