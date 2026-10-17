"""Phrases of the notices D-138 removed, for the tests that pin their absence.

Exports, CAE cards, Studio files and AI caveats used to carry a usage-limitation
sentence ("apoio didático", "triagem preliminar", "não substitui validação") and,
for demo rows, a fictitious-data warning. The author removed both (D-138);
``is_demo`` stays as an internal marker. The phrases are specific on purpose:
test data may still be named "fictícia", and that is not a notice.
"""

from __future__ import annotations

REMOVED_NOTICE_PHRASES = (
    "apoio didático",
    "triagem preliminar",
    "não substitui validação",
    "marcados como demonstrativos",
    "dados exclusivamente demonstrativos",
    "não utilizar em projetos reais",
    "não use em projeto real",
)


def assert_no_removed_notice(text: object) -> None:
    """Fail when ``text`` (a string, or cells to join) still carries a removed notice."""
    if not isinstance(text, str):
        text = " ".join(str(cell) for cell in text if cell is not None)  # type: ignore[attr-defined]
    folded = text.lower()
    for phrase in REMOVED_NOTICE_PHRASES:
        assert phrase not in folded, phrase
