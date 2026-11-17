"""Checking the addresses and the text of a laudo e-mail (D-242).

Pure rules, no HTTP and no clock. The check is deliberately the common, strict
subset of RFC 5321 — a plain ``local@domain.tld`` in ASCII — and not the whole
grammar: the people typing these addresses write ``ana@empresa.com.br``, and a
laxer pattern would also accept the quoted forms and comments that are how a
header gets smuggled into a message. A line break, a comma, a space, an angle
bracket or a second ``@`` is never an address here.

(A library such as ``email-validator`` would be one more dependency for a rule
this short; the DNS check it adds would also make a send depend on the network.)
"""

from __future__ import annotations

import re

from app.domain.errors import ValidationError

#: Recipients ("Para") and copies ("Cc") one send may carry.
MAX_RECIPIENTS = 5
MAX_CC = 5
MAX_SUBJECT = 200
MAX_MESSAGE = 1000

_LOCAL = re.compile(r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$")
_LABEL = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
_TLD = re.compile(r"^[A-Za-z]{2,24}$")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def is_valid_address(value: str) -> bool:
    """``local@domain.tld``: ASCII, one ``@``, a dotted domain and a letters-only ending."""
    if not value or len(value) > 254 or value.count("@") != 1:
        return False
    local, domain = value.split("@")
    if not local or len(local) > 64 or not _LOCAL.match(local):
        return False
    labels = domain.split(".")
    if len(labels) < 2 or not all(_LABEL.match(label) for label in labels):
        return False
    return bool(_TLD.match(labels[-1]))


def clean_addresses(
    raw: list[str], *, label: str, minimum: int, maximum: int, exclude: frozenset[str] = frozenset()
) -> list[str]:
    """Trim, validate and de-duplicate (case-insensitively) a list of addresses.

    ``exclude`` holds addresses already used in another list, so a person in "Para"
    is not copied in "Cc" too. The error names the offending address and says
    what is wrong in Portuguese.
    """
    seen: set[str] = set()
    cleaned: list[str] = []
    for item in raw:
        address = item.strip()
        if not address:
            continue
        if not is_valid_address(address):
            raise ValidationError(f'{label}: "{address[:80]}" não é um endereço de e-mail válido.')
        key = address.lower()
        if key in seen or key in exclude:
            continue
        seen.add(key)
        cleaned.append(address)
    if len(cleaned) < minimum:
        raise ValidationError(f"{label}: informe ao menos {minimum} endereço de e-mail.")
    if len(cleaned) > maximum:
        raise ValidationError(f"{label}: no máximo {maximum} endereços por envio.")
    return cleaned


def clean_subject(value: str | None) -> str | None:
    """One line: blanks collapse, a line break is an error (it would end the header)."""
    if value is None:
        return None
    if "\r" in value or "\n" in value or _CONTROL.search(value):
        raise ValidationError("O assunto deve ter uma linha só, sem quebras de linha.")
    text = " ".join(value.split())
    if len(text) > MAX_SUBJECT:
        raise ValidationError(f"O assunto pode ter no máximo {MAX_SUBJECT} caracteres.")
    return text or None


def clean_message(value: str | None) -> str | None:
    """The sender's own words: line breaks kept, control characters dropped, capped."""
    if value is None:
        return None
    text = _CONTROL.sub("", value.replace("\r\n", "\n").replace("\r", "\n")).strip()
    if len(text) > MAX_MESSAGE:
        raise ValidationError(f"A mensagem pode ter no máximo {MAX_MESSAGE} caracteres.")
    return text or None
