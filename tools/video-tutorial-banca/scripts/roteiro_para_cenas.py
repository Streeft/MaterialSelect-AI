"""Build cenas.json from the per-scene tables in roteiro-mestre.md.

The script is the single source of the narration text: each table row whose first
cell is a scene id (A1, S5, C2...) becomes one scene, and its narration cell is
split into sentences. Subtitles reuse these sentences verbatim; the TTS engines
read them through the `pronuncia` map, which never touches the subtitle text.

Usage: python roteiro_para_cenas.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SCENE_ID = re.compile(r"[A-Z]\d")
# Sentence end: . ! ? followed by a space and an uppercase letter or a digit.
SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])")

PRONUNCIA = {
    "MaterialSelect AI": "Material Select Ei Ai",
    "Ashby": "Ashbi",
    "log-log": "log log",
    "CSV": "cê ésse vê",
    "XLSX": "xis ele ésse xis",
    "Young": "Yang",
    "0,999": "zero vírgula novecentos e noventa e nove",
}

# Scenes of the 2-3 min cut (roteiro-mestre.md, "Corte curto").
CURTO = ["A0", "A1", "C2", "S1", "S2", "S5", "S6", "C3", "P1", "P2", "C8", "E1"]


def main() -> None:
    cenas = []
    for line in (HERE / "roteiro-mestre.md").read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 11 or not SCENE_ID.fullmatch(cells[1]):
            continue
        texto = re.sub(r"[*_`]", "", cells[4]).strip()
        frases = [] if texto.startswith("(") or texto in {"", "—", "-"} else SPLIT.split(texto)
        cenas.append({"id": cells[1], "bloco": cells[2], "frases": frases})

    spec = {
        "_doc": "Gerado por scripts/roteiro_para_cenas.py a partir de roteiro-mestre.md. Não edite à mão.",
        "pronuncia": PRONUNCIA,
        "curto": CURTO,
        "cenas": cenas,
    }
    (HERE / "cenas.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n",
                                     encoding="utf-8")
    falas = sum(1 for c in cenas if c["frases"])
    print(f"{len(cenas)} cenas, {falas} com narração")


if __name__ == "__main__":
    main()
