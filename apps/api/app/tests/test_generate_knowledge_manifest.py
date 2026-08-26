"""Inferência de proveniência por convenção de pasta — conservadora: nunca
declara autor a não ser que o nome do arquivo deixe isso inequívoco.
"""

from __future__ import annotations

from scripts.generate_knowledge_manifest import infer_provenance


class TestFolderRules:
    def test_bibliografia_is_a_scientific_book(self) -> None:
        entry = infer_provenance("01-Bibliografia/callister-materials-science.pdf")
        assert entry["tipo"] == "LIVRO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_extratos_de_capitulos_is_also_a_book(self) -> None:
        entry = infer_provenance("01-Bibliografia/Extratos-de-Capitulos/cap3.pdf")
        assert entry["tipo"] == "LIVRO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_topicos_de_aula_is_a_slide(self) -> None:
        entry = infer_provenance("02-Material-de-Curso-ENG02016/Topicos-de-Aula/topico-1.pdf")
        assert entry["tipo"] == "SLIDE"
        assert entry["autoridade"] == "TECNICA"

    def test_trabalhos_entregues_is_an_exercise(self) -> None:
        entry = infer_provenance(
            "02-Material-de-Curso-ENG02016/Trabalhos-Entregues/Trabalho 1/relatorio.pdf"
        )
        assert entry["tipo"] == "EXERCICIO"
        assert entry["autoridade"] == "TECNICA"

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
        entry = infer_provenance("02-Material-de-Curso-ENG02016/Topicos-de-Aula/topico-3.pdf")
        assert "autor" not in entry or entry["autor"] is None

    def test_never_invents_reference_or_url(self) -> None:
        entry = infer_provenance("01-Bibliografia/qualquer-livro.pdf")
        assert entry.get("referencia") is None
        assert entry.get("url") is None
