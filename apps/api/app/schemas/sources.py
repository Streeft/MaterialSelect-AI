"""Schemas for the source registry (M1)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class SourceBibliographyMixin(BaseModel):
    """The parts of a bibliographic reference a source may record (D-233).

    Each is ``None`` when nobody recorded it. None is ever filled in on output.
    """

    authors: str | None = None
    title: str | None = None
    publisher: str | None = None
    year: int | None = None
    url: str | None = None
    accessed_on: date | None = None


class SourceReferenceOut(SourceBibliographyMixin):
    """A source as the material sheet cites it, with its ABNT text (D-233).

    ``abnt`` is assembled in the backend (``app.domain.citation``); the screen
    only copies it.
    """

    id: int
    label: str
    reference: str | None = None
    abnt: str


class SourceOut(SourceBibliographyMixin):
    """A registered data source, with its procedência/licença and reviewer."""

    id: int
    label: str
    reference: str | None = None
    is_demo: bool
    license_label: str | None = None
    license_url: str | None = None
    contains_third_party_data: bool
    reviewed_by_email: str | None = None
    reviewed_at: datetime | None = None
