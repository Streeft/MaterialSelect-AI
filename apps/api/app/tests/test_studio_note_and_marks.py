"""Two Studio details of D-98 left open by the phase-4 review.

* **"Salvar como nota" shortens, it does not cut.** The body of a long artifact
  was ``text[:20_000]``: the cut could fall inside "1 200 MPa" and print "1 2",
  and nothing said the note was not the whole artifact.
* **The infographic's ``[n]`` marks have one colour.** The screen drew them in
  the muted ink and the SVG in each card's accent; they are secondary metadata,
  so the file now follows the screen.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from xml.etree import ElementTree

import pytest

from app.ai.guardrails import _NUMBER_TOKEN
from app.exporters import studio as studio_exporter
from app.exporters.studio import infographic_svg
from app.models.notebook import StudioArtifact
from app.schemas.notebook import ArtifactOut, NoteIn, NoteUpdate
from app.services.studio_service import MAX_NOTE_CHARS, NOTE_SHORTENED, note_body

SVG = "{http://www.w3.org/2000/svg}"


def _figures(text: str) -> list[str]:
    return [m.group(0) for m in _NUMBER_TOKEN.finditer(text)]


# --- the note's body ------------------------------------------------------------------


def test_a_body_that_fits_is_kept_whole():
    text = "Frente: Densidade do aço?\nVerso: 7850 kg/m³. [1]"
    assert note_body(text) == text
    exact = "a" * MAX_NOTE_CHARS
    assert note_body(exact) == exact


def _max_length(model, field: str) -> int:
    lengths = [m.max_length for m in model.model_fields[field].metadata if hasattr(m, "max_length")]
    assert len(lengths) == 1
    return lengths[0]


def test_the_ceiling_is_the_note_editor_s():
    # A saved note longer than the editor accepts could not be edited back.
    assert MAX_NOTE_CHARS == 20_000
    assert _max_length(NoteIn, "body") == MAX_NOTE_CHARS
    assert _max_length(NoteUpdate, "body") == MAX_NOTE_CHARS
    assert "20 000 caracteres" in NOTE_SHORTENED
    assert NOTE_SHORTENED.startswith("(Nota encurtada:")


def test_a_long_body_is_cut_on_a_line_break_and_says_so():
    lines = [f"Linha {i}: o aço tem módulo de 210 GPa. [1]" for i in range(2000)]
    text = "\n".join(lines)
    assert len(text) > MAX_NOTE_CHARS

    body = note_body(text)
    assert len(body) <= MAX_NOTE_CHARS
    assert body.endswith("\n\n" + NOTE_SHORTENED)
    kept = body.removesuffix("\n\n" + NOTE_SHORTENED)
    # Whole lines only: the kept part is a prefix of the artifact, line for line.
    assert kept.split("\n") == lines[: len(kept.split("\n"))]
    # And it uses the room it has: the next line would not have fitted.
    next_line = lines[len(kept.split("\n"))]
    assert len(kept) + 1 + len(next_line) + len("\n\n" + NOTE_SHORTENED) > MAX_NOTE_CHARS


def test_a_single_long_line_is_cut_on_whitespace_never_inside_a_number():
    # One line (a table row is one line), with "1 200 MPa" straddling every
    # plausible cut: whichever whitespace the budget lands on, "1 2" must not
    # come out.
    budget = MAX_NOTE_CHARS - len("\n\n" + NOTE_SHORTENED)
    for shift in range(0, 8):
        head = "x" * (budget - 3 - shift)
        text = f"{head} 1 200 MPa; " + "y " * 5000
        body = note_body(text)
        assert len(body) <= MAX_NOTE_CHARS
        assert body.endswith(NOTE_SHORTENED)
        kept = body.removesuffix("\n\n" + NOTE_SHORTENED)
        assert "\n" not in kept
        assert text.startswith(kept)
        # Every figure kept is a figure the text states, whole.
        assert set(_figures(kept)) <= set(_figures(text))
        assert not re.search(r"\b1 2(?!00)", kept)
        assert kept.endswith(("x", "1 200", "MPa;", "y"))


@pytest.mark.parametrize(
    "figure",
    ["12 345 678", "12.345.678,5", "1 200", "3,14159", "-40", "6,02e23"],
)
def test_no_way_of_writing_a_figure_is_split(figure):
    budget = MAX_NOTE_CHARS - len("\n\n" + NOTE_SHORTENED)
    for shift in range(len(figure) + 2):
        head = "a " * ((budget - shift) // 2)
        text = f"{head}{figure} kWh " + "b " * 3000
        kept = note_body(text).removesuffix("\n\n" + NOTE_SHORTENED)
        tail = kept.rsplit(" ", 1)[-1] if " " in kept else kept
        assert set(_figures(kept)) <= set(_figures(text)), (shift, tail)


def test_a_body_without_any_break_still_fits():
    text = "9" * (MAX_NOTE_CHARS + 50)
    body = note_body(text)
    assert len(body) <= MAX_NOTE_CHARS
    # One unbreakable figure: nothing of it can be kept without splitting it.
    assert body == NOTE_SHORTENED


def test_saving_a_long_artifact_as_a_note_goes_through_the_rule(client, db_session):
    notebook = client.post("/api/notebooks", json={"title": "Longo"}).json()
    client.post(
        f"/api/notebooks/{notebook['id']}/sources/text",
        json={"title": "Aula", "text": "O aço tem módulo de 210 GPa e densidade de 7850 kg/m³."},
    )
    started = client.post(f"/api/notebooks/{notebook['id']}/studio", json={"tool": "flashcards"})
    assert started.status_code == 202, started.text
    artifact = db_session.get(StudioArtifact, started.json()["id"])
    cards = [
        {"front": f"Pergunta {i}?", "back": "O aço tem 1 200 MPa de tração.", "citations": [1]}
        for i in range(600)
    ]
    artifact.content = {**artifact.content, "body": {"title": "Muitos", "cards": cards}}
    artifact.status = "pronto"
    db_session.flush()

    note = client.post(f"/api/notebooks/{notebook['id']}/studio/{artifact.id}/note")
    assert note.status_code == 201
    body = note.json()["body"]
    assert len(body) <= MAX_NOTE_CHARS
    assert body.endswith("\n\n" + NOTE_SHORTENED)
    assert body.startswith("Frente: Pergunta 0?")
    assert set(_figures(body)) <= {"0", "1 200", "20 000", *(str(i) for i in range(600))}


# --- the infographic's marks ------------------------------------------------------------


def _luminance(hex_colour: str) -> float:
    channels = [int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _contrast(a: str, b: str) -> float:
    high, low = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def _infographic() -> ArtifactOut:
    now = datetime.now(UTC)
    board = {
        "title": "Aço",
        "subtitle": "",
        "stats": [{"value": "210 GPa", "label": "módulo do aço", "citations": [1]}],
        "points": [
            {"heading": f"Ponto {i}", "text": "O alumínio é leve.", "citations": [1, 2]}
            for i in range(6)
        ],
        "steps": [{"text": "Definir a função", "citations": [2]}],
    }
    return ArtifactOut(
        id=1,
        tool="infographic",
        format="paisagem",
        title="Aço",
        status="pronto",
        source_count=1,
        created_at=now,
        updated_at=now,
        content=board,
        citations=[],
        withheld=[],
    )


def test_the_marks_are_drawn_in_the_muted_ink_on_every_card():
    root = ElementTree.fromstring(infographic_svg(_infographic(), "sub"))
    marks = [t for t in root.iter(f"{SVG}text") if re.fullmatch(r"(\[\d+\] ?)+", t.text or "")]
    assert len(marks) == 8  # one stat, six points, one step
    assert {t.get("fill") for t in marks} == {studio_exporter._INFOGRAPHIC_MARKS_INK}
    # Not a card's accent — the headings keep those.
    accents = {tone[2] for tone in studio_exporter._INFOGRAPHIC_TONES}
    assert studio_exporter._INFOGRAPHIC_MARKS_INK not in accents


def test_the_muted_ink_is_the_screen_s_light_token():
    # ``--ink-muted: 74 81 98`` in the light theme of apps/web/app/globals.css.
    assert studio_exporter._INFOGRAPHIC_MARKS_INK == "#" + bytes((74, 81, 98)).hex()


def test_the_marks_stay_legible_on_every_card_fill():
    ink = studio_exporter._INFOGRAPHIC_MARKS_INK
    ratios = [_contrast(ink, fill) for fill, _stroke, _accent in studio_exporter._INFOGRAPHIC_TONES]
    assert min(ratios) >= 4.5
    assert round(min(ratios), 2) == 6.51  # on #dbeafe, the palest-but-bluest fill
    assert _contrast(ink, studio_exporter._SVG_SURFACE) >= 4.5


def test_the_svg_still_carries_nothing_foreign():
    svg = infographic_svg(_infographic(), "sub")
    assert "foreignObject" not in svg
    assert "href" not in svg and "url(" not in svg
