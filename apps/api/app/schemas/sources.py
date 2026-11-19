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


class SourcePatch(BaseModel):
    """The fields a curator may correct on a source (D-236, D-244).

    Only the fields **sent** are applied (``model_fields_set``); a field sent as
    ``null`` or blank clears it. The rules (plausible year, a real address, an
    access date that is not in the future) live in ``app.domain.citation`` so the
    refusal is written in Portuguese. The label, licence and reviewer are not
    here on purpose: they are what the source *is*, decided once at registration.
    (D-244 reverses the label and the licence: they may now be corrected too, since
    nothing else could fix a typo or a licence that changed; the reviewer stays.)
    """

    label: str | None = None
    reference: str | None = None
    license_label: str | None = None
    license_url: str | None = None

    authors: str | None = None
    title: str | None = None
    publisher: str | None = None
    year: int | None = None
    url: str | None = None
    accessed_on: date | None = None


class SourceCreate(SourceBibliographyMixin):
    """A source a curator registers by hand (D-249).

    The label and the licence are required — the same gate the importer applies ("informe a
    licença/procedência"): a source is registered with what it allows, or not at all. Who
    registered it and when are stamped from the session, never taken from the body, and a source
    made here is never a demonstration one (that marker is dado, set only by the seed).
    """

    label: str
    license_label: str
    license_url: str | None = None
    reference: str | None = None
    #: Set explicitly by whoever registers it, never inferred (M1).
    contains_third_party_data: bool = False


class SourceMergeIn(BaseModel):
    """Move every citation of this source to ``target_id`` and remove this source (D-249)."""

    target_id: int


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
    #: The ABNT text, assembled by the backend from the fields above (D-236).
    abnt: str
    #: How many stored rows cite this source — values, curves, composition, designations and
    #: the rest (D-249). ``None`` where it was not counted; ``0`` is a source nobody cites, the
    #: only kind that can be deleted.
    citations: int | None = None


class SourceMergeOut(BaseModel):
    """The source that kept the citations, and how many rows moved to it (D-249)."""

    target: SourceOut
    moved: int
