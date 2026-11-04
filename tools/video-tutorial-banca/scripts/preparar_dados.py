"""Prepare the LOCAL recording database through the API (never production).

Creates what the scenes need to show non-empty screens: the saved tie study,
a notebook with one short text source, and one own record. Idempotent by name.
Usage: python preparar_dados.py [API base, default http://127.0.0.1:8811]
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8811"
if "127.0.0.1" not in API and "localhost" not in API:
    raise SystemExit("Recusado: este script só roda contra uma API local de gravação.")
COOKIE = "msai_session=video-banca-local-session-0001"

# The tie study shown in the video (scenes 2.2 to 2.10). Kept here so the saved
# copy and the one built on screen are the same study.
TIE_STUDY = {
    "name": "Tirante leve e rígido",
    "function_text": "Tirante em tração",
    "objective_text": "Mínima massa para rigidez axial dada",
    "free_variables": ["área da seção"],
    "constraints": [
        {"operator": "gte", "property_slug": "resistencia_tracao", "value": 100, "unit": "MPa"},
        {"operator": "gte", "property_slug": "tenacidade_fratura", "value": 15, "unit": "MPa*m**0.5"},
        {"operator": "gte", "property_slug": "temp_max_servico", "value": 200, "unit": "degC"},
    ],
    "index": {"expression": "modulo_young / densidade", "goal": "maximize"},
    "criteria": [
        {"key": "__index__", "weight": 0.7},
        {"key": "custo_massa", "weight": 0.3, "direction": "min"},
    ],
}

NOTEBOOK_TEXT = (
    "Resumo do método de seleção de materiais de Ashby, escrito para esta demonstração.\n\n"
    "1. Função: o que o componente faz (por exemplo, um tirante em tração).\n"
    "2. Objetivo: o que se quer minimizar ou maximizar (por exemplo, a massa).\n"
    "3. Restrições: o que o material precisa atender, sempre com unidade.\n"
    "4. Variáveis livres: o que o projeto deixa variar (por exemplo, a área da seção).\n\n"
    "Combinando objetivo e restrição chega-se a um índice de desempenho. No tirante "
    "leve e rígido, o índice é o módulo de Young dividido pela densidade. Num mapa de "
    "propriedades em escala logarítmica, um índice desse tipo vira uma reta, e os "
    "materiais acima dela são melhores."
)


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + "/api" + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Cookie": COOKIE},
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        raise SystemExit(f"{method} {path}: {err.code} {err.read()[:400]!r}") from err


def main() -> None:
    studies = call("GET", "/selection/studies")
    if not any(s["name"] == TIE_STUDY["name"] for s in studies):
        call("POST", "/selection/studies", TIE_STUDY)
        print("estudo salvo criado")

    notebooks = call("GET", "/notebooks")
    title = "Seleção de materiais: anotações"
    nb = next((n for n in notebooks if n["title"] == title), None)
    if nb is None:
        nb = call("POST", "/notebooks", {"title": title, "emoji": "📘"})
        call(
            "POST",
            f"/notebooks/{nb['id']}/sources/text",
            {"title": "Resumo do método (texto de demonstração)", "text": NOTEBOOK_TEXT},
        )
        print("caderno criado")

    mine = call("GET", "/my-records")
    own_name = "Liga Exemplo do Participante (fictícia)"
    if own_name not in json.dumps(mine, ensure_ascii=False):
        metais = next(c["id"] for c in call("GET", "/classes") if c["slug"] == "metais")
        call(
            "POST",
            "/materials",
            {
                "name": own_name,
                "class_id": metais,
                "description": "Registro próprio fictício, criado só para a demonstração em vídeo.",
                "is_own_record": True,
                "values": [
                    {"property_slug": "densidade", "kind": "scalar", "value": 2.75, "unit": "g/cm**3"},
                    {"property_slug": "modulo_young", "kind": "scalar", "value": 71, "unit": "GPa"},
                ],
            },
        )
        print("registro próprio criado")


if __name__ == "__main__":
    main()
