"""Sentence timings for a narration file made outside narrar.py (the short cut's voice).

The script's sentences are known (cenas.json); the audio has a pause between them.
FFmpeg's silencedetect lists the pauses, and the N-1 longest ones become the sentence
boundaries. Output: {id}.json in the same shape narrar.py writes, so gravar.js and
the motion layer read both voices the same way. The audio is also converted to a
48 kHz mono WAV next to it.

Usage: python tempos_frases.py --pasta DIR [--cena A1 ...]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent

UNITS = "zero um dois três quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove".split()
TENS = "_ _ vinte trinta quarenta cinquenta sessenta setenta oitenta noventa".split()
HUNDREDS = "_ cento duzentos trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos".split()


def spell(n: int) -> str:
    """Portuguese words for an integer (enough to estimate how long it takes to say)."""
    if n < 20:
        return UNITS[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " e " + UNITS[n % 10])
    if n == 100:
        return "cem"
    if n < 1000:
        return HUNDREDS[n // 100] + ("" if n % 100 == 0 else " e " + spell(n % 100))
    if n < 1_000_000:
        k = n // 1000
        return ("mil" if k == 1 else spell(k) + " mil") + ("" if n % 1000 == 0 else " e " + spell(n % 1000))
    return "muitos"


def spoken(text: str, pron: dict[str, str]) -> str:
    for a, b in pron.items():
        text = text.replace(a, b)
    text = re.sub(r"(\d+),(\d+)", lambda m: spell(int(m[1])) + " vírgula " + spell(int(m[2])), text)
    return re.sub(r"\d+", lambda m: spell(int(m[0])), text)


def silences(path: Path, noise_db: int, min_s: float) -> list[tuple[float, float]]:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
         f"silencedetect=noise={noise_db}dB:d={min_s}", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    return list(zip(starts, ends))


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pasta", required=True)
    ap.add_argument("--cena", nargs="*")
    ap.add_argument("--spec", default="cenas.json", help="scene spec, relative to tools/video-tutorial-banca")
    args = ap.parse_args()
    folder = Path(args.pasta)
    spec = json.loads((HERE / args.spec).read_text(encoding="utf-8"))
    frases = {c["id"]: c["frases"] for c in spec["cenas"] if c["frases"]}
    for src in sorted(folder.glob("*.mp3")):
        cid = src.stem
        if cid not in frases or (args.cena and cid not in args.cena):
            continue
        wav = folder / f"{cid}.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ar", "48000", "-ac", "1", str(wav)], check=True)
        total = duration(wav)
        texts = frases[cid]
        n = len(texts)
        sil = []
        for noise, min_s in ((-38, 0.18), (-34, 0.15), (-30, 0.12)):
            sil = [s for s in silences(wav, noise, min_s) if 0.2 < s[0] < total - 0.2]
            if len(sil) >= n - 1:
                break
        # Leading/trailing silence: speech starts after the first and ends before the last.
        lead = silences(wav, -38, 0.05)
        start = lead[0][1] if lead and lead[0][0] < 0.05 else 0.0
        end = total
        tail = [s for s in lead if s[1] >= total - 0.05]
        if tail:
            end = tail[-1][0]
        # Each boundary takes the pause closest to where the text says it should be
        # (sentence lengths in characters), favouring longer pauses; pauses inside a
        # sentence (a comma) are shorter and sit away from the expected spot.
        lens = [len(spoken(t, spec.get("pronuncia", {}))) for t in texts]
        cuts, last = [], start
        for i in range(1, n):
            expected = start + (end - start) * sum(lens[:i]) / sum(lens)
            cand = [x for x in sil if x[0] > last]
            if not cand:
                break
            best = min(cand, key=lambda x: abs((x[0] + x[1]) / 2 - expected) - 4 * (x[1] - x[0]))
            cuts.append(best)
            last = best[1]
        if len(cuts) < n - 1:
            print(f"{cid}: só {len(cuts)} pausas para {n} frases; tempos proporcionais ao texto")
            acc, cuts = start, []
            for L in lens[:-1]:
                acc += (end - start) * L / sum(lens)
                cuts.append((acc, acc))
        bounds = [start] + [c for pair in cuts for c in pair] + [end]
        out = []
        for i, t in enumerate(texts):
            out.append({"texto": t, "inicio": round(bounds[2 * i], 3), "fim": round(bounds[2 * i + 1], 3)})
        # Shift so the first word is at 0, as narrar.py does after trimming silence.
        off = out[0]["inicio"]
        for f in out:
            f["inicio"] = round(f["inicio"] - off, 3)
            f["fim"] = round(f["fim"] - off, 3)
        (folder / f"{cid}.json").write_text(json.dumps({"id": cid, "duracao": round(end - start, 3), "inicio_audio": round(start, 3), "frases": out}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(cid, " | ".join(f"{f['inicio']:.2f}-{f['fim']:.2f}" for f in out))


if __name__ == "__main__":
    main()
