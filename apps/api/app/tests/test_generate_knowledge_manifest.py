"""Inferência de proveniência por convenção de pasta — conservadora: nunca
declara autor a não ser que o nome do arquivo deixe isso inequívoco.
"""

from __future__ import annotations

import json
from pathlib import Path

from scripts.generate_knowledge_manifest import infer_provenance, update_manifest


class TestFolderRules:
    def test_bibliografia_is_a_scientific_book(self) -> None:
        entry = infer_provenance("01-Bibliografia/callister-materials-science.pdf")
        assert entry["tipo"] == "LIVRO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_extratos_de_capitulos_is_also_a_book(self) -> None:
        entry = infer_provenance("01-Bibliografia/Extratos-de-Capitulos/cap3.pdf")
        assert entry["tipo"] == "LIVRO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_course_material_folder_has_no_rule_anymore(self) -> None:
        # D-100: o material de curso saiu do Cérebro; a pasta não tem mais
        # regra, e um arquivo ali cai no padrão "ninguém disse" em vez de ser
        # declarado slide do professor.
        entry = infer_provenance("02-Material-de-Curso-ENG02016/Topicos-de-Aula/topico-1.pdf")
        assert entry["tipo"] == "OUTRO"
        assert entry["autoridade"] == "NAO_VERIFICADA"

    def test_fichas_granta_is_a_ficha(self) -> None:
        entry = infer_provenance(
            "03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/Metais e ligas/Ferrosas/aco.pdf"
        )
        assert entry["tipo"] == "FICHA"
        assert entry["autoridade"] == "TECNICA"

    def test_artigos_cientificos_is_an_article(self) -> None:
        entry = infer_provenance("05-Artigos-Cientificos/artigo1.pdf")
        assert entry["tipo"] == "ARTIGO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_ferramentas_e_diagramas_is_outro(self) -> None:
        entry = infer_provenance("04-Ferramentas-e-Diagramas/ashby-diagrama.pdf")
        assert entry["tipo"] == "OUTRO"
        assert entry["autoridade"] == "TECNICA"

    def test_unrecognised_folder_falls_back_to_outro_nao_verificada(self) -> None:
        entry = infer_provenance("99-Pasta-Nova/arquivo.pdf")
        assert entry["tipo"] == "OUTRO"
        assert entry["autoridade"] == "NAO_VERIFICADA"


class TestTitleAndAuthor:
    def test_title_comes_from_the_filename_cleaned(self) -> None:
        entry = infer_provenance("01-Bibliografia/materials-selection-in-design.pdf")
        assert entry["titulo"] == "materials selection in design"

    def test_unambiguous_author_in_filename_is_captured(self) -> None:
        entry = infer_provenance(
            "01-Bibliografia/Ashby - Materials Selection in Mechanical Design.pdf"
        )
        assert entry["autor"] == "Ashby"

    def test_generic_filename_has_no_author(self) -> None:
        entry = infer_provenance("04-Ferramentas-e-Diagramas/diagrama-3.pdf")
        assert "autor" not in entry or entry["autor"] is None

    def test_never_invents_reference_or_url(self) -> None:
        entry = infer_provenance("01-Bibliografia/qualquer-livro.pdf")
        assert entry.get("referencia") is None
        assert entry.get("url") is None

    def test_ficha_with_dash_pattern_does_not_extract_author(self) -> None:
        # Regression test: material names in FICHA files may have " - " pattern
        # (e.g. "Polietileno - PE") but should NOT extract as author.
        entry = infer_provenance(
            "03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/Polimeros/Polietileno - PE.pdf"
        )
        assert entry["tipo"] == "FICHA"
        assert "autor" not in entry or entry["autor"] is None

    def test_artigo_with_author_prefix_extracts_author(self) -> None:
        # ARTIGO is the second folder type where author extraction is allowed.
        entry = infer_provenance("05-Artigos-Cientificos/Smith - Innovative Materials Research.pdf")
        assert entry["tipo"] == "ARTIGO"
        assert entry["autor"] == "Smith"


class TestRemovalList:
    """D-100: o que está em removidos.txt nunca é declarado, e sai se já estava."""

    def test_removed_paths_are_neither_added_nor_kept(self, tmp_path: Path) -> None:
        (tmp_path / "01-Bibliografia").mkdir()
        (tmp_path / "01-Bibliografia" / "livro.pdf").write_bytes(b"%PDF")
        (tmp_path / "02-Curso").mkdir()
        (tmp_path / "02-Curso" / "aula.pdf").write_bytes(b"%PDF")
        (tmp_path / "Tópico 1.pdf").write_bytes(b"%PDF")
        (tmp_path / "removidos.txt").write_text("02-Curso/\nTópico 1.pdf\n", encoding="utf-8")
        (tmp_path / "manifesto.json").write_text(
            json.dumps({"documentos": [{"path": "Tópico 1.pdf", "titulo": "Tópico 1"}]}),
            encoding="utf-8",
        )

        declared, added, dropped = update_manifest(tmp_path)

        payload = json.loads((tmp_path / "manifesto.json").read_text(encoding="utf-8"))
        paths = [entry["path"] for entry in payload["documentos"]]
        assert paths == ["01-Bibliografia/livro.pdf"]
        assert (declared, added, dropped) == (1, 1, 1)
