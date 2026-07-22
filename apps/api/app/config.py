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

    @property
    def cors_origins_list(self) -> list[str]:
        """Return the configured CORS origins as a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
