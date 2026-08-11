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
    # "" disables the layer entirely. Three providers exist:
    #   mock       deterministic rules, offline, no key (the default, and the
    #              only one the reproducibility argument can rest on);
    #   claude-api Claude through the Anthropic Messages API, with your own key;
    #   claude-cli Claude through the Claude Code CLI installed on the machine,
    #              signed in as it already is — no API key needed.
    # The product is fully usable with the layer off: nothing numeric depends
    # on it.
    ai_provider: str = "mock"
    # Only for claude-api, and optional even there: left empty, the SDK reads
    # ANTHROPIC_API_KEY itself and the key never passes through settings.
    ai_api_key: str = ""
    ai_model: str = "claude-opus-5"
    # Both real providers are slower than a local rule: the CLI has a process to
    # start before it has a model to ask.
    ai_timeout_seconds: float = 90.0
    # Ceiling for one answer, thinking and text together. These replies are
    # small; the limit exists so a runaway one fails fast and says why.
    ai_max_output_tokens: int = 16000
    # Executable for claude-cli, resolved on PATH.
    ai_cli_command: str = "claude"

    @property
    def ai_enabled(self) -> bool:
        """True when an AI provider is configured."""
        return bool(self.ai_provider.strip())

    @property
    def cors_origins_list(self) -> list[str]:
        """Return the configured CORS origins as a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
