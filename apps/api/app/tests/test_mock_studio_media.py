"""The mock's audio, slides, video and infographic (D-98).

The mock is the reference implementation of the contract: what it writes must
pass the committed figure check unchanged — the strict rule of a statistic
included — because every figure is copied from the passage its item cites.
Each test runs the mock's answer through ``app.ai.studio.read_studio`` (inside
``MockAIProvider.studio``) and then ``app.notebooks.studio_content.check``.
"""

from __future__ import annotations

import pytest

from app.ai.mock import MockAIProvider, _clip
from app.ai.notebook import Passage
from app.ai.studio import MAX_BULLETS, MAX_STAT_VALUE, StudioRequest
from app.notebooks.studio_content import check

STEEL = Passage(
    number=1,
    source_title="Apostila de materiais",
    heading="Tabela 45 — Aços",
    page_start=3,
    page_end=3,
    text=(
        "O aço 1020 tem módulo de 210 GPa e alongamento de 25 % na ruptura. "
        "Sua densidade é de 7 850 kg/m³. É o aço mais usado em estruturas."
    ),
)
TITANIUM = Passage(
    number=2,
    source_title="Notas de ligas 2024",
    heading=None,
    page_start=None,
    page_end=None,
    text="A liga Ti-6Al-4V resiste bem a -196 °C, e custa 1.200 por quilo.",
)
POLYMER = Passage(
    number=3,
    source_title="Notas de polímeros",
    heading="Termoplásticos",
    page_start=None,
    page_end=None,
    text="O polietileno amolece perto de 120 °C. Custa 45% menos que o náilon.",
)
PLAIN = Passage(
    number=4,
    source_title="Glossário",
    heading="Tenacidade",
    page_start=None,
    page_end=None,
    text="Tenacidade é a energia que um material absorve antes de fraturar.",
)
PASSAGES = (STEEL, TITANIUM, POLYMER, PLAIN)


def _request(tool: str, passages=PASSAGES, **kwargs) -> StudioRequest:
    options = {"notebook_title": "Materiais", **kwargs}
    return StudioRequest(
        tool=tool,
        source_titles=tuple(p.source_title for p in passages),
        passages=passages,
        **options,
    )


def _run(request: StudioRequest):
    read = MockAIProvider().studio(request)
    return read, check(request, read, set(), "Reserva")


@pytest.mark.parametrize(
    ("tool", "extra"),
    [
        ("audio", {}),
        ("audio", {"template": "debate", "count": 12}),
        ("slides", {"template": "detalhada", "count": 10}),
        ("video", {"format": "explicativo"}),
        ("video", {"format": "resumo"}),
        ("infographic", {"format": "paisagem", "count": 5}),
    ],
)
def test_the_mock_passes_the_committed_check_unchanged(tool, extra):
    read, checked = _run(_request(tool, **extra))
    assert checked.withheld == {}
    assert checked.items > 0
    assert checked.title == read["title"]


def test_audio_alternates_the_hosts_and_both_cite_the_passage():
    read, checked = _run(_request("audio"))
    lines = checked.body["lines"]
    assert [line["speaker"] for line in lines] == [1, 2] * len(PASSAGES)
    assert (
        lines[0]["text"] == "Vamos ver o que a fonte “Apostila de materiais” diz sobre “Materiais”."
    )
    assert lines[1]["text"].startswith("O aço 1020 tem módulo de 210 GPa")
    assert all(line["citations"] == [PASSAGES[i // 2].number] for i, line in enumerate(lines))


def test_audio_names_the_topic_when_there_is_one():
    read, _ = _run(_request("audio", topic="ligas leves"))
    assert read["lines"][0]["text"].endswith("diz sobre “ligas leves”.")


def test_a_notebook_title_with_a_figure_is_not_spoken_ungrounded():
    # "Turma 2026" states a figure no passage grounds; the host names the
    # passage's own subject instead, and nothing is withheld.
    read, checked = _run(_request("audio", notebook_title="Turma 2026"))
    assert checked.withheld == {}
    assert "2026" not in read["lines"][0]["text"]
    assert read["lines"][0]["text"].endswith("diz sobre “Tabela 45 — Aços”.")


def test_audio_respects_the_requested_amount_as_far_as_passages_allow():
    _, few = _run(_request("audio", count=4))
    assert len(few.body["lines"]) == 4
    _, many = _run(_request("audio", count=40))
    assert len(many.body["lines"]) == 2 * len(PASSAGES)


def test_a_slide_per_passage_with_its_sentences_as_bullets():
    read, checked = _run(_request("slides", count=3))
    slides = checked.body["slides"]
    assert len(slides) == 3
    assert slides[0]["title"] == "Tabela 45 — Aços"
    assert slides[1]["title"] == "Notas de ligas 2024"  # no heading → the source title
    assert slides[0]["bullets"] == [
        "O aço 1020 tem módulo de 210 GPa e alongamento de 25 % na ruptura.",
        "Sua densidade é de 7 850 kg/m³.",
        "É o aço mais usado em estruturas.",
    ]
    assert all(len(s["bullets"]) <= MAX_BULLETS for s in slides)
    assert slides[0]["notes"].startswith("O aço 1020")
    assert [s["citations"] for s in slides] == [[1], [2], [3]]


def test_the_video_takes_its_length_from_the_format():
    many = tuple(
        Passage(i, f"Fonte {chr(64 + i)}", None, None, None, f"Trecho de número {i * 111}.")
        for i in range(1, 11)
    )
    _, explained = _run(_request("video", passages=many, format="explicativo"))
    _, summary = _run(_request("video", passages=many, format="resumo"))
    assert (len(explained.body["slides"]), len(summary.body["slides"])) == (8, 5)
    assert all(s["notes"] for s in summary.body["slides"])  # narration: never silent
    assert explained.withheld == {}


def test_infographic_stats_are_copied_exactly_and_pass_the_strict_rule():
    read, checked = _run(_request("infographic"))
    assert [s["value"] for s in checked.body["stats"]] == ["210 GPa", "-196 °C", "120 °C"]
    assert all(len(s["value"]) <= MAX_STAT_VALUE for s in checked.body["stats"])
    assert [s["citations"] for s in checked.body["stats"]] == [[1], [2], [3]]
    # A label is a phrase of the passage's own text, never its heading.
    assert checked.body["stats"][0]["label"].startswith("O aço 1020")

    assert [p["heading"] for p in checked.body["points"]][:2] == [
        "Tabela 45 — Aços",
        "Notas de ligas 2024",
    ]
    assert [s["text"] for s in checked.body["steps"]] == [
        "Tabela 45 — Aços",
        "Notas de ligas 2024",
        "Termoplásticos",
        "Tenacidade",
    ]
    assert checked.withheld == {}


def test_a_figure_without_a_unit_is_still_a_stat_when_it_is_the_only_one():
    passage = Passage(1, "Notas", None, None, None, "Foram ensaiados 12 corpos de prova.")
    _, checked = _run(_request("infographic", passages=(passage,)))
    assert [s["value"] for s in checked.body["stats"]] == ["12 corpos"]
    assert checked.withheld == {}


def test_a_figure_inside_a_token_is_not_taken_as_a_stat():
    # "Ti-6Al-4V": the "6" is the tail of "-6", a different figure.
    passage = Passage(1, "Notas", None, None, None, "A liga Ti-6Al-4V aguenta 300 MPa.")
    _, checked = _run(_request("infographic", passages=(passage,)))
    assert [s["value"] for s in checked.body["stats"]] == ["300 MPa"]
    assert checked.withheld == {}


def test_a_passage_without_numbers_yields_no_stat_and_no_failure():
    read, checked = _run(_request("infographic", passages=(PLAIN,)))
    assert read["stats"] == []
    assert checked.body["stats"] == []
    assert checked.withheld == {}
    assert checked.body["points"] and checked.body["steps"]


def test_no_passages_is_an_empty_answer_not_an_error():
    for tool in ("audio", "slides", "video", "infographic"):
        _, checked = _run(_request(tool, passages=()))
        assert checked.items == 0


def test_the_mock_is_deterministic():
    request = _request("infographic", count=3)
    assert MockAIProvider().studio(request) == MockAIProvider().studio(request)


def test_a_clip_never_ends_on_half_a_figure():
    text = "A densidade medida foi de 7 850 kg/m³ no ensaio."
    clipped = _clip(text, 34)  # would end "… de 7 8" / "… de 7"
    assert clipped == "A densidade medida foi de…"
    assert _clip("curto", 10) == "curto"
