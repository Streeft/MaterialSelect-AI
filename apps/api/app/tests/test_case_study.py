"""Regression test for the A2 case study (docs/12-estudo-de-caso.md).

Reproduces Ashby's classic "light, stiff tie" problem end to end — import →
filter → index → rank — over the same nine materials and real
literature-representative values documented in
``docs/estudo-de-caso/materiais-haste-leve-rigida.csv`` (embedded here so the
test stays self-contained, the same choice ``test_imports_api.py`` already
makes for its own fixture CSV). Asserts the ranking matches the
literature-consolidated result: CFRP wins, the three structural metals cluster
within a few percent of each other (a famous Ashby observation), and the
brittleness constraint correctly excludes the one ceramic candidate even
though it has the best raw index value.
"""

from __future__ import annotations

CSV_CONTENT = """nome,classe,subclasse,densidade [g/cm3],modulo_young [GPa],limite_escoamento_min [MPa],limite_escoamento_max [MPa],resistencia_tracao [MPa],dureza [HV],temp_max_servico [degC],condutividade_termica [W/(m*K)],custo_massa,palavras_chave
Aço estrutural (tipo A36/SS400),Metais,Aço-carbono estrutural,7.85,200,,,,,,,,estrutural;caso-de-estudo
Liga de alumínio 7075-T6,Metais,Liga de alumínio aeroespacial,2.70,70,,,,,,,,aeroespacial;caso-de-estudo
Liga de titânio Ti-6Al-4V,Metais,Liga de titânio aeroespacial,4.43,114,,,,,,,,aeroespacial;caso-de-estudo
Poliamida 6/6 (Nylon),Polímeros,Termoplástico de engenharia,1.15,3.0,,,,,,,,termoplástico;caso-de-estudo
Polipropileno,Polímeros,Termoplástico commodity,0.905,1.5,,,,,,,,termoplástico;caso-de-estudo
Alumina (Al2O3),Cerâmicas,Óxido técnico,3.90,390,,,,,,,,ceramica-tecnica;caso-de-estudo
CFRP laminado (epóxi/fibra de carbono),Compósitos,Laminado quase-isotrópico,1.50,53,,,,,,,,alto-desempenho;caso-de-estudo
GFRP laminado (epóxi/fibra de vidro),Compósitos,Laminado quase-isotrópico,1.80,26,,,,,,,,caso-de-estudo
Borracha natural (NR),Elastômeros,Elastômero natural,1.10,0.05,,,,,,,,flexivel;caso-de-estudo
""".encode()

MAPPING = {
    "name_column": "nome",
    "class_column": "classe",
    "subclass_column": "subclasse",
    "keywords_column": "palavras_chave",
    "source_label": "Estudo de caso didático — Ashby (valores típicos de classe)",
    "columns": [
        {"column": "densidade [g/cm3]", "property_slug": "densidade", "unit": "g/cm**3"},
        {"column": "modulo_young [GPa]", "property_slug": "modulo_young", "unit": "GPa"},
    ],
}

RUN_REQUEST = {
    "combinator": "AND",
    "constraints": [
        {
            "operator": "text_contains",
            "text": "caso-de-estudo",
            "label": "Conjunto do estudo de caso",
        },
        {
            "operator": "not_in_class",
            "class_slugs": ["ceramicas"],
            "label": "Não frágil (cerâmica excluída de uso em tração)",
        },
    ],
    "index": {
        "name": "Rigidez específica",
        "expression": "modulo_young / densidade",
        "goal": "maximize",
    },
    "ranking": {
        "normalization": "minmax",
        "criteria": [{"key": "__index__", "weight": 1.0}],
    },
}

# Literature-consolidated order for E/rho on this material set (see
# docs/12-estudo-de-caso.md §5-6): composites beat metals, the three
# structural metals cluster tightly, polymers trail, elastomers last.
EXPECTED_ORDER = [
    "CFRP laminado (epóxi/fibra de carbono)",
    "Liga de alumínio 7075-T6",
    "Liga de titânio Ti-6Al-4V",
    "Aço estrutural (tipo A36/SS400)",
    "GFRP laminado (epóxi/fibra de vidro)",
    "Poliamida 6/6 (Nylon)",
    "Polipropileno",
    "Borracha natural (NR)",
]


def _import_case_study(client) -> None:
    job_id = client.post(
        "/api/imports/upload",
        files={"file": ("materiais-haste-leve-rigida.csv", CSV_CONTENT, "text/csv")},
    ).json()["job_id"]
    validated = client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
    assert validated.status_code == 200
    assert validated.json()["valid_count"] == 9
    committed = client.post(f"/api/imports/{job_id}/commit")
    assert committed.status_code == 200
    assert committed.json()["imported_count"] == 9


def test_case_study_reproduces_literature_ranking(client):
    _import_case_study(client)

    resp = client.post("/api/selection/run", json=RUN_REQUEST)
    assert resp.status_code == 200
    body = resp.json()

    # The brittleness constraint removes the one ceramic candidate (Alumina)
    # even though it has, by far, the best raw index value — the whole point
    # of the case study is that a single index is never the full answer.
    names = [c["name"] for c in body["candidates"]]
    assert "Alumina (Al2O3)" not in names
    assert names == EXPECTED_ORDER

    # The three structural metals cluster within ~2% of each other on E/rho —
    # the classic Ashby observation that metals as a class barely differ on
    # this index, even though they differ hugely on E and rho individually.
    ranked = {c["name"]: c["index_value"] for c in body["candidates"]}
    metals = [
        ranked["Liga de alumínio 7075-T6"],
        ranked["Liga de titânio Ti-6Al-4V"],
        ranked["Aço estrutural (tipo A36/SS400)"],
    ]
    assert (max(metals) - min(metals)) / min(metals) < 0.02

    # CFRP's specific stiffness is well over the metals' — not a marginal win.
    assert ranked["CFRP laminado (epóxi/fibra de carbono)"] > 1.3 * max(metals)


def test_case_study_import_leaves_no_material_audit_trail(client):
    """Cross-check with the M2 audit trail (docs/DECISIONS.md D-43): bulk
    import bypasses per-material auditing by design, only a saved study
    (created by hand afterwards, not by the importer) would show up.
    """
    _import_case_study(client)

    events = client.get("/api/audit", params={"entity_type": "material"}).json()
    assert events == []
