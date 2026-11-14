"""Build cenas-v3.json (full cut, v3 script) from the scene table in roteiro-v3.md.

Each table row whose first cell is a scene id becomes one scene. The narration cell
holds the voice's audio tags in brackets ([excited], [laughs]...): they go to the TTS
prompt and never to the captions. Captions are the narration without tags, split into
sentences.

With --estimar DIR, a timing file DIR/{id}.json is written for every scene that has no
audio yet in DIR, from the speaking rate measured on the scenes that do (padded, so the
real take later fits inside the slot). Those files carry "estimado": true.

Usage: python roteiro_v3_para_cenas.py [--estimar audio/narracao/marcio]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SCENE_ID = re.compile(r"[A-Z]\d")
TAG = re.compile(r"\[[^\]]*\]\s*")
SPLIT = re.compile(r"(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])")
GAP = 0.45  # pause between sentences, as gravar.js assumes
PAD = 1.15  # estimated sentences are 15% longer than the measured rate says

# Respellings sent to the voice only (captions keep the written form).
PRONUNCIA = {
    "MaterialSelect AI": "Material Select Ei Ai",
    "Ashby": "Ashbi",
    "Young": "Yang",
    "log-log": "log log",
    "CSV": "cê ésse vê",
    "XLSX": "xis ele ésse xis",
    "0,999": "zero vírgula novecentos e noventa e nove",
}

# Chapter cards (number, title) and the scenes that show catalog values (demo badge).
CARTELAS = {
    "C1": ["1", "O método"], "C2": ["2", "Seleção"], "C3": ["3", "Mapas e comparação"],
    "C4": ["4", "Dados confiáveis"], "C5": ["5", "Dimensionar e custo"], "C6": ["6", "Demais recursos"],
    "C7": ["7", "Verificação e limites"], "C8": ["", "Encerramento"],
}
SELO = ["S1", "S2", "S4", "S5", "S6", "S7", "S8", "P1", "P2", "P3", "P4", "K1", "D1", "D2", "D3", "Z1", "Z2", "Z3"]

CAPITULOS = {
    "A": "Abertura", "I": "Abertura", "C": None, "M": "1. O método", "S": "2. Seleção",
    "P": "3. Mapas e comparação", "K": "3. Mapas e comparação", "D": "4. Dados confiáveis",
    "Z": "5. Dimensionar e custo", "R": "6. Demais recursos", "V": "7. Verificação e limites",
    "E": "Encerramento",
}


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--estimar")
    args = ap.parse_args()
    cenas, ordem = [], []
    for line in (HERE / "roteiro-v3.md").read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 4 or not SCENE_ID.fullmatch(cells[1]):
            continue
        cid, narr = cells[1], cells[2]
        ordem.append(cid)
        if narr.startswith("("):
            cenas.append({"id": cid, "bloco": narr.strip("()"), "frases": [], "prompt": ""})
            continue
        prompt = narr
        for a, b in PRONUNCIA.items():
            prompt = prompt.replace(a, b)
        frases = [s.strip() for s in SPLIT.split(TAG.sub("", narr)) if s.strip()]
        cenas.append({"id": cid, "bloco": CAPITULOS.get(cid[0]) or "", "frases": frases, "prompt": prompt})
    spec = {
        "_doc": "Gerado por scripts/roteiro_v3_para_cenas.py a partir de roteiro-v3.md. Não edite à mão.",
        "voz": {"servico": "ElevenLabs", "modelo": "eleven_v4", "voz": "Marcio - Viral Hook Narrator", "voice_id": "plASsyS7JE6GCAvx9uIc"},
        "pronuncia": PRONUNCIA,
        "cartelas": CARTELAS,
        "selo": SELO,
        "cenas": cenas,
    }
    (HERE / "cenas-v3.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(cenas)} cenas: {' '.join(ordem)}")

    if not args.estimar:
        return
    folder = Path(args.estimar)
    done = [c for c in cenas if c["frases"] and (folder / f"{c['id']}.mp3").exists()]
    chars = sum(len(" ".join(c["frases"])) for c in done)
    secs = sum(duration(folder / f"{c['id']}.mp3") - GAP * (len(c["frases"]) - 1) for c in done)
    rate = chars / secs
    print(f"ritmo medido em {len(done)} cenas: {rate:.1f} caracteres/s")
    for c in cenas:
        if not c["frases"] or (folder / f"{c['id']}.mp3").exists():
            continue
        t, out = 0.0, []
        for f in c["frases"]:
            d = round(len(f) / rate * PAD, 3)
            out.append({"texto": f, "inicio": round(t, 3), "fim": round(t + d, 3)})
            t += d + GAP
        (folder / f"{c['id']}.json").write_text(json.dumps(
            {"id": c["id"], "duracao": out[-1]["fim"], "estimado": True, "frases": out}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{c['id']} estimado: {out[-1]['fim']:.1f} s")


if __name__ == "__main__":
    main()
