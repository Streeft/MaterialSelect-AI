"""Material designations: which system a code belongs to, and how a code is matched (D-105).

Two rules live here and nowhere else.

**A code is matched as the source wrote it, give or take case and spacing.**
``designation_key`` folds case (Unicode NFKC, then upper case) and drops
whitespace — ``s 30400`` and ``S30400`` are the same code written twice — and
nothing more. Hyphens, dots and slashes stay: ``1.4301`` (an EN number) and
``14301`` are different strings, and stripping punctuation to make them meet
would be deciding that two designations are the same by how they look. That is
TM1 (equivalence declared by a source), which this module refuses to do by
resemblance; "looks alike" is the Find Similar question (D-63).

**A system is a closed vocabulary.** ``resolve_system`` maps what a reader types
(``aisi``, ``sae``, ``nbr``, ``comercial``) to the enum, and an unknown name is
an error that lists the systems — never zero results that would read as "no
material has one".
"""

from __future__ import annotations

import unicodedata

from app.models.enums import DesignationSystem


class DesignationError(ValueError):
    """A designation or a system name that cannot be used. Message in Portuguese."""


#: How each system is written on screen and in documents.
SYSTEM_LABELS: dict[DesignationSystem, str] = {
    DesignationSystem.UNS: "UNS",
    DesignationSystem.AISI_SAE: "AISI/SAE",
    DesignationSystem.ASTM: "ASTM",
    DesignationSystem.EN: "EN",
    DesignationSystem.ISO: "ISO",
    DesignationSystem.DIN: "DIN",
    DesignationSystem.JIS: "JIS",
    DesignationSystem.GB: "GB",
    DesignationSystem.ABNT: "ABNT NBR",
    DesignationSystem.COMERCIAL: "Nome comercial",
}

#: What a reader may type after ``norma:``, folded (see ``_fold``).
_SYSTEM_ALIASES: dict[str, DesignationSystem] = {
    "uns": DesignationSystem.UNS,
    "aisi": DesignationSystem.AISI_SAE,
    "sae": DesignationSystem.AISI_SAE,
    "aisi/sae": DesignationSystem.AISI_SAE,
    "aisi-sae": DesignationSystem.AISI_SAE,
    "aisi_sae": DesignationSystem.AISI_SAE,
    "astm": DesignationSystem.ASTM,
    "en": DesignationSystem.EN,
    "iso": DesignationSystem.ISO,
    "din": DesignationSystem.DIN,
    "jis": DesignationSystem.JIS,
    "gb": DesignationSystem.GB,
    "abnt": DesignationSystem.ABNT,
    "nbr": DesignationSystem.ABNT,
    "comercial": DesignationSystem.COMERCIAL,
}


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.strip().casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def resolve_system(raw: str) -> DesignationSystem:
    """The system a reader named, or an error listing the ones that exist."""
    system = _SYSTEM_ALIASES.get(_fold(raw))
    if system is None:
        raise DesignationError(
            f"Norma desconhecida: '{raw}'. As normas aceitas são {KNOWN_SYSTEMS}."
        )
    return system


#: The list an unknown system's error names, in the words a reader types.
KNOWN_SYSTEMS = "UNS, AISI (ou SAE), ASTM, EN, ISO, DIN, JIS, GB, ABNT (ou NBR) e comercial"


def system_label(system: DesignationSystem) -> str:
    return SYSTEM_LABELS[system]


def designation_key(code: str) -> str:
    """The form a code is stored and compared in: NFKC, upper case, no whitespace.

    Raises ``DesignationError`` for a code that is empty once spaces are gone —
    a designation with no characters names nothing.
    """
    folded = "".join(unicodedata.normalize("NFKC", code).upper().split())
    if not folded:
        raise DesignationError("Uma designação precisa de um código.")
    return folded
