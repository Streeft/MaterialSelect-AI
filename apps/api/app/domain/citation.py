"""The ABNT (NBR 6023:2018) reference of a data source, built from recorded fields only.

Deterministic and pure: the same record always gives the same text, and the text
is assembled here — the interface only copies it. The project's third principle
holds for a bibliography as it does for a property value: **a part nobody
recorded is left out, never filled in.** No author becomes "Anônimo", no year
becomes "[s.d.]" or an estimated date, no place becomes "[S. l.]" and no
publisher "[s. n.]". NBR 6023:2018 asks for an approximate date in brackets when
the date cannot be found and keeps the two Latin markers for place and publisher;
all three would write something the record does not say, so they are not written
(D-233 records the choice).

Element order, for what is present::

    AUTHORS. Title. Publisher, year. Reference. Disponível em: URL. Acesso em: d mmm. aaaa.

Without ``authors`` the entry is the title, whose first word — with an article
and the word after it — goes in capitals, as the norm asks. ``title`` falls back
to the source's ``label``, which every source has.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from app.domain.errors import ValidationError

if TYPE_CHECKING:
    from app.models.source import Source

#: NBR 6023: months abbreviated to three letters with a full stop, except "maio".
_MONTHS = (
    "jan.",
    "fev.",
    "mar.",
    "abr.",
    "maio",
    "jun.",
    "jul.",
    "ago.",
    "set.",
    "out.",
    "nov.",
    "dez.",
)

#: Articles that stay with the next word in an entry by title.
_ARTICLES = frozenset({"a", "o", "as", "os", "um", "uma", "uns", "umas"})


@dataclass(frozen=True)
class SourceParts:
    """The recorded fields of a source that an ABNT reference can use."""

    label: str
    authors: str | None = None
    title: str | None = None
    publisher: str | None = None
    year: int | None = None
    url: str | None = None
    accessed_on: date | None = None
    reference: str | None = None

    @classmethod
    def from_source(cls, source: Source) -> SourceParts:
        return cls(
            label=source.label,
            authors=source.authors,
            title=source.title,
            publisher=source.publisher,
            year=source.year,
            url=source.url,
            accessed_on=source.accessed_on,
            reference=source.reference,
        )


def _clean(text: str | None) -> str | None:
    """The text without surrounding blanks; ``None`` when nothing is left."""
    if text is None:
        return None
    stripped = " ".join(text.split())
    return stripped or None


def _sentence(text: str) -> str:
    """``text`` closed by a full stop, unless it already ends a sentence."""
    return text if text[-1] in ".?!" else f"{text}."


def _entry_by_title(title: str) -> str:
    """The title with its first word (after an article, two) in capitals."""
    words = title.split(" ")
    count = 2 if len(words) > 1 and words[0].lower() in _ARTICLES else 1
    head = " ".join(words[:count]).upper()
    return " ".join([head, *words[count:]])


def format_access_date(day: date) -> str:
    """``13 nov. 2026``."""
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


def abnt_reference(parts: SourceParts) -> str:
    """The reference of ``parts`` in ABNT form, with only what was recorded."""
    authors = _clean(parts.authors)
    title = _clean(parts.title) or _clean(parts.label) or ""
    publisher = _clean(parts.publisher)
    url = _clean(parts.url)
    reference = _clean(parts.reference)

    elements: list[str] = []
    if authors:
        elements.append(_sentence(authors))
        elements.append(_sentence(title))
    else:
        elements.append(_sentence(_entry_by_title(title)))

    published = ", ".join(
        part for part in (publisher, str(parts.year) if parts.year is not None else None) if part
    )
    if published:
        elements.append(_sentence(published))
    if reference:
        elements.append(_sentence(reference))
    if url:
        elements.append(f"Disponível em: {url}.")
        # "Acesso em" qualifies the address; without one it would cite nothing.
        if parts.accessed_on is not None:
            elements.append(f"Acesso em: {format_access_date(parts.accessed_on)}.")
    return " ".join(elements)


#: What the ``source`` table can hold, and the first year a printed reference can plausibly carry.
_BIBLIOGRAPHY_LIMITS = {"authors": 500, "title": 300, "publisher": 200, "url": 500}
_BIBLIOGRAPHY_LABELS = {
    "authors": "Os autores",
    "title": "O título",
    "publisher": "A editora",
    "url": "O endereço",
}
_FIRST_YEAR = 1000


def _checked_url(url: str) -> str:
    """``url`` when it is an ``http``/``https`` address with a host; a refusal otherwise.

    The check is of shape only: nothing is fetched and nothing is completed
    ("exemplo.org" does not become "https://exemplo.org" — that would write an
    address nobody typed).
    """
    parts = urlsplit(url)
    if (
        parts.scheme not in ("http", "https")
        or not parts.hostname
        or any(ch.isspace() for ch in url)
    ):
        raise ValidationError(
            "O endereço deve começar com http:// ou https:// e ter um domínio, "
            "como https://exemplo.org/pagina."
        )
    return url


def edit_bibliography(current: SourceParts, sent: dict[str, Any], *, today: date) -> dict[str, Any]:
    """The bibliographic fields a curator sent, checked, as the values to store (D-236).

    ``sent`` holds only the keys that came in the request: a key left out stays
    as it is, a key sent as ``None`` or as blank text clears the field (back to
    "nobody recorded it"). Nothing is inferred — a URL does not bring an access
    date, a year does not bring a publisher — and nothing is rounded: a value
    that does not fit is refused with the reason, in Portuguese, never trimmed to
    fit. The checks that depend on two fields (an access earlier than the
    publication year) look at the result, so they hold whichever of the two came.
    """
    out: dict[str, Any] = {}
    for key in ("authors", "title", "publisher", "url"):
        if key not in sent:
            continue
        value = _clean(sent[key])
        if value is not None:
            limit = _BIBLIOGRAPHY_LIMITS[key]
            if len(value) > limit:
                raise ValidationError(
                    f"{_BIBLIOGRAPHY_LABELS[key]} passa de {limit} caracteres "
                    f"({len(value)}); abrevie o texto."
                )
            if key == "url":
                value = _checked_url(value)
        out[key] = value

    if "year" in sent:
        year = sent["year"]
        if year is not None and not _FIRST_YEAR <= year <= today.year:
            raise ValidationError(
                f"O ano deve estar entre {_FIRST_YEAR} e {today.year}; "
                "deixe em branco se ninguém o registrou."
            )
        out["year"] = year
    if "accessed_on" in sent:
        accessed = sent["accessed_on"]
        if accessed is not None and accessed > today:
            raise ValidationError("A data de acesso não pode estar no futuro.")
        out["accessed_on"] = accessed

    year = out["year"] if "year" in out else current.year
    accessed = out["accessed_on"] if "accessed_on" in out else current.accessed_on
    if year is not None and accessed is not None and accessed.year < year:
        raise ValidationError(
            "A data de acesso não pode ser anterior ao ano de publicação "
            f"({accessed.year} < {year})."
        )
    return out
