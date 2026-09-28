"""Grounding of the Studio's audio, slides, video and infographic (D-98).

Pure tests over ``app.notebooks.studio_content.check``: the read model answer
is written by hand in the shape ``app.ai.studio.read_studio`` returns, so what
is under test is the item rule alone — no provider, no database.
"""

from __future__ import annotations

from app.ai.notebook import Passage
from app.ai.studio import StudioRequest
from app.notebooks.grounding import foreign_unit, strict_ungrounded, value_unit
from app.notebooks.studio_content import check, finalise, item_count, withheld_sentences
from app.schemas.notebook import CitationOut

STEEL = Passage(
    number=1,
    source_title="Apostila de materiais",
    heading="Tabela 45 — Aços",
    page_start=3,
    page_end=3,
    text="O aço 1020 tem módulo de 210 GPa e alongamento de 25 % na ruptura.",
)
POLYMER = Passage(
    number=2,
    source_title="Notas de polímeros",
    heading=None,
    page_start=None,
    page_end=None,
    text="O polietileno amolece perto de 120 °C e custa cerca de 1.200 por tonelada.",
)
PASSAGES = (STEEL, POLYMER)


def _request(tool: str) -> StudioRequest:
    return StudioRequest(
        tool=tool,
        notebook_title="Materiais",
        source_titles=("Apostila de materiais", "Notas de polímeros"),
        passages=PASSAGES,
    )


def _check(tool: str, read: dict, extra: set[float] | None = None):
    return check(_request(tool), {"title": "Título", **read}, extra or set(), "Reserva")


def _infographic(*stats: dict, points=(), steps=()) -> dict:
    return {"subtitle": "", "stats": list(stats), "points": list(points), "steps": list(steps)}


def _stat(value: str, label: str = "Módulo do aço", citations=(1,)) -> dict:
    return {"value": value, "label": label, "citations": list(citations)}


# --- the strict rule ---------------------------------------------------------


def test_a_small_percentage_is_a_measurement_not_a_list_shape():
    # 45 ≤ 100 would pass the ordinary rule; a statistic has no such allowance.
    assert strict_ungrounded(["45%"], [1], PASSAGES) == [45]
    assert strict_ungrounded(["25 %"], [1], PASSAGES) == []


def test_a_passage_s_labels_do_not_ground_a_statistic():
    # "Tabela 45" is where a figure is, never a figure itself.
    assert strict_ungrounded(["45"], [1], PASSAGES) == [45]


def test_a_figure_in_an_uncited_passage_does_not_ground_a_statistic():
    assert strict_ungrounded(["120 °C"], [1], PASSAGES) == [120]
    assert strict_ungrounded(["120 °C"], [2], PASSAGES) == []


def test_pt_br_grouping_is_read_as_the_guardrails_read_it():
    assert strict_ungrounded(["1.200"], [2], PASSAGES) == []
    assert strict_ungrounded(["1 200"], [2], PASSAGES) == []


def test_the_unit_is_the_value_s_shape_without_its_figures():
    assert value_unit("210 GPa") == "#GPa"
    assert value_unit("25 %") == "#%"
    assert value_unit("1.200") == ""


def test_a_unit_the_cited_passage_does_not_write_is_foreign():
    assert foreign_unit("210 MPa", [1], PASSAGES)
    assert not foreign_unit("210 GPa", [1], PASSAGES)
    assert not foreign_unit("210\u00a0GPa", [1], PASSAGES)  # NBSP
    # Bounded: "Pa" is not found inside "GPa", nor "m" inside "mm".
    assert foreign_unit("210 Pa", [1], PASSAGES)
    assert foreign_unit("120 °F", [2], PASSAGES)
    assert not foreign_unit("120°C", [2], PASSAGES)
    assert not foreign_unit("25%", [1], PASSAGES)
    assert not foreign_unit("1.200", [2], PASSAGES)
    # The unit must be in a passage the statistic cites.
    assert foreign_unit("210 GPa", [2], PASSAGES)
    sheet = Passage(1, "Chapa", None, None, None, "Espessura de 5 mm.")
    assert foreign_unit("5 m", [1], (sheet,))
    assert not foreign_unit("5 mm", [1], (sheet,))


def test_case_is_the_si_prefix_and_is_compared_exactly():
    mega = Passage(1, "Ensaio", None, None, None, "Escoamento de 210 MPa; potência de 5 MW.")
    assert foreign_unit("210 mPa", [1], (mega,))  # milli, not mega
    assert foreign_unit("5 mW", [1], (mega,))
    assert foreign_unit("210 GPa", [1], PASSAGES) is False
    assert foreign_unit("210 gpa", [1], PASSAGES)
    assert not foreign_unit("210 MPa", [1], (mega,))


def test_spaces_and_the_degree_sign_s_variants_are_normalised():
    nbsp = Passage(1, "Ensaio", None, None, None, "Escoamento de 210\u00a0MPa a 120 ºC.")
    assert not foreign_unit("210 MPa", [1], (nbsp,))
    assert not foreign_unit("210\u202fMPa", [1], (nbsp,))
    assert not foreign_unit("120 °C", [1], (nbsp,))
    assert not foreign_unit("120 ℃", [1], (nbsp,))
    assert foreign_unit("120 °F", [1], (nbsp,))


def test_an_approximation_sign_the_passage_lacks_is_part_of_the_unit():
    assert foreign_unit("≈ 25 %", [1], PASSAGES)


# --- infographic -------------------------------------------------------------


def test_a_statistic_copied_exactly_passes():
    checked = _check("infographic", _infographic(_stat("210 GPa"), _stat("120 °C", "PE", (2,))))
    assert [s["value"] for s in checked.body["stats"]] == ["210 GPa", "120 °C"]
    assert not checked.withheld
    assert checked.items == 2


def test_a_small_percentage_not_in_the_passage_is_withheld():
    checked = _check("infographic", _infographic(_stat("45%", "Alongamento")))
    assert checked.body["stats"] == []
    assert withheld_sentences(checked) == [
        "Um dado em destaque foi omitido porque citava números que não aparecem nos "
        "trechos citados: 45."
    ]


def test_the_right_number_in_the_wrong_unit_is_withheld():
    checked = _check("infographic", _infographic(_stat("210 MPa")))
    assert checked.body["stats"] == []
    assert checked.figures == ["210 MPa"]
    assert withheld_sentences(checked) == [
        "Um dado em destaque foi omitido porque sua unidade não aparece no trecho "
        "citado: 210 MPa."
    ]


def test_units_withheld_twice_are_counted_in_one_sentence():
    checked = _check("infographic", _infographic(_stat("210 MPa"), _stat("25 ‰")))
    assert withheld_sentences(checked) == [
        "2 dados em destaque foram omitidos porque suas unidades não aparecem nos "
        "trechos citados: 210 MPa, 25 ‰."
    ]


def test_the_student_s_words_do_not_ground_a_statistic():
    # The topic said "45%"; a point may lean on it, a statistic may not.
    checked = _check(
        "infographic",
        _infographic(
            _stat("45%"),
            points=[{"heading": "Meta", "text": "Chegar a 450 ciclos", "citations": [1]}],
        ),
        extra={45, 450},
    )
    assert checked.body["stats"] == []
    assert [p["heading"] for p in checked.body["points"]] == ["Meta"]
    assert checked.items == 1


def test_a_statistic_that_cites_nothing_is_withheld():
    checked = _check("infographic", _infographic(_stat("210 GPa", citations=())))
    assert checked.body["stats"] == []


def test_a_figure_in_the_label_is_held_to_the_same_rule():
    checked = _check("infographic", _infographic(_stat("210 GPa", "Aço 1045")))
    assert checked.body["stats"] == []
    assert checked.figures == ["1045"]


def test_no_statistic_left_keeps_the_points_and_the_steps():
    checked = _check(
        "infographic",
        _infographic(
            _stat("45%"),
            points=[
                {"heading": "Rigidez", "text": "O aço tem 210 GPa.", "citations": [1]},
                {"heading": "Invento", "text": "E 999 GPa.", "citations": [1]},
            ],
            steps=[
                {"text": "Escolha o aço 1020", "citations": [1]},
                {"text": "Aqueça a 700 °C", "citations": [2]},
            ],
        ),
    )
    assert checked.body["stats"] == []
    assert [p["heading"] for p in checked.body["points"]] == ["Rigidez"]
    assert [s["text"] for s in checked.body["steps"]] == ["Escolha o aço 1020"]
    assert checked.items == 2
    assert set(checked.body) == {"title", "subtitle", "stats", "points", "steps"}
    sentences = withheld_sentences(checked)
    assert "Um ponto foi omitido porque citava números" in sentences[1]
    assert "Uma etapa foi omitida porque citava números" in sentences[2]


def test_an_infographic_with_nothing_left_has_no_items():
    checked = _check("infographic", _infographic(_stat("45%")))
    assert checked.items == 0


def test_a_subtitle_with_an_invented_figure_is_dropped():
    read = _infographic(_stat("210 GPa"))
    read["subtitle"] = "Os 7 aços de 2024"
    checked = _check("infographic", read)
    assert checked.body["subtitle"] == ""


def test_an_infographic_is_numbered_stats_then_points_then_steps():
    checked = _check(
        "infographic",
        _infographic(
            _stat("120 °C", "PE", (2,)),
            points=[{"heading": "Aço", "text": "Rígido.", "citations": [1]}],
            steps=[{"text": "Compare.", "citations": [2, 1]}],
        ),
    )
    handed = [
        CitationOut(
            number=p.number,
            chunk_id=p.number,
            source_id=p.number,
            source_title=p.source_title,
            excerpt="",
        )
        for p in PASSAGES
    ]
    body, citations, withheld = finalise("infographic", checked, handed)
    assert body["stats"][0]["citations"] == [1]
    assert body["points"][0]["citations"] == [2]
    assert body["steps"][0]["citations"] == [1, 2]
    assert [c.source_title for c in citations] == ["Notas de polímeros", "Apostila de materiais"]
    assert withheld == []
    assert item_count("infographic", body) == 3


# --- slides and video --------------------------------------------------------


def _slide(title="Aço", bullets=("Módulo de 210 GPa",), notes="Rígido.", citations=(1,)):
    return {"title": title, "bullets": list(bullets), "notes": notes, "citations": list(citations)}


def test_one_invented_bullet_drops_the_whole_slide():
    checked = _check(
        "slides",
        {"slides": [_slide(), _slide("Outro", ("Módulo de 210 GPa", "Custa 999 por kg"))]},
    )
    assert [s["title"] for s in checked.body["slides"]] == ["Aço"]
    assert checked.items == 1
    assert withheld_sentences(checked) == [
        "Um slide foi omitido porque citava números que não aparecem nos trechos citados: 999."
    ]


def test_an_invented_figure_in_the_notes_drops_the_slide():
    checked = _check("slides", {"slides": [_slide(notes="Cerca de 3.500 MPa.")]})
    assert checked.body["slides"] == []
    assert checked.items == 0


def test_a_video_scene_is_the_same_item_named_as_a_scene():
    checked = _check(
        "video",
        {
            "slides": [
                _slide(title="", notes="O aço tem 210 GPa [1]."),
                _slide(notes="Narração com 777 kN.", citations=(1,)),
            ]
        },
    )
    assert len(checked.body["slides"]) == 1
    scene = checked.body["slides"][0]
    assert scene["title"] == "Cena 1"
    assert scene["notes"] == "O aço tem 210 GPa."
    assert withheld_sentences(checked) == [
        "Uma cena foi omitida porque citava números que não aparecem nos trechos citados: 777."
    ]


def test_a_deck_s_title_is_structural_not_an_item():
    checked = check(
        _request("slides"),
        {"title": "Os 7 aços de 2024", "slides": [_slide()]},
        set(),
        "Reserva",
    )
    assert checked.title == "Reserva"
    assert checked.body["title"] == "Reserva"
    assert checked.items == 1
    assert not checked.withheld


def test_an_audio_title_is_structural_not_an_item():
    read = {"title": "Aço 1020", "lines": [{"speaker": 1, "text": "Oi.", "citations": [1]}]}
    checked = check(_request("audio"), read, set(), "Reserva")
    assert checked.body == {
        "title": "Aço 1020",
        "lines": [{"speaker": 1, "text": "Oi.", "citations": [1]}],
    }
    assert checked.items == 1


def test_a_slide_counts_as_one_item():
    checked = _check("slides", {"slides": [_slide(), _slide("PE", ("120 °C",), "", (2,))]})
    assert item_count("slides", checked.body) == 2


# --- audio -------------------------------------------------------------------


def test_an_audio_line_with_an_invented_figure_is_dropped():
    checked = _check(
        "audio",
        {
            "lines": [
                {"speaker": 1, "text": "O aço tem 210 GPa.", "citations": [1]},
                {"speaker": 2, "text": "E aguenta 950 °C.", "citations": [2]},
                {"speaker": 2, "text": "O polietileno amolece a 120 °C [2].", "citations": []},
            ]
        },
    )
    assert [(line["speaker"], line["citations"]) for line in checked.body["lines"]] == [
        (1, [1]),
        (2, [2]),
    ]
    assert checked.items == 2
    assert withheld_sentences(checked) == [
        "Uma fala foi omitida porque citava números que não aparecem nos trechos citados: 950."
    ]
    assert item_count("audio", checked.body) == 2


def test_audio_lines_withheld_twice_read_in_the_plural():
    checked = _check(
        "audio",
        {
            "lines": [
                {"speaker": 1, "text": "São 950 °C.", "citations": [2]},
                {"speaker": 2, "text": "E 3.100 MPa.", "citations": [1]},
            ]
        },
    )
    assert checked.items == 0
    assert withheld_sentences(checked)[0].startswith("2 falas foram omitidas porque citavam")
