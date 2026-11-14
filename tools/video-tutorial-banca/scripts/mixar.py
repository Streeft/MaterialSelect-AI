"""Soundtrack of one cut, from the timeline built by montar_linha.py.

Stems (48 kHz):
  voz.wav     every sentence placed at its timeline time (mono, as recorded)
  sfx.wav     clicks, confirmations and chapter transitions (own synthesis, sons.py)
  musica.wav  the licensed bed (preparar_trilha.py), cut to length, ducked under the voice
Mixes:
  mix.wav            voice + music + sfx, normalized to -16 LUFS, true peak -1.5 dBTP
  mix_sem_voz.wav    music + sfx only, same gain as the full mix (for the "sem narração" cut)

The music bed comes in at -36 LUFS (20 dB under the voice target); the sidechain only
takes a few more dB while someone speaks, so it never pumps.

Usage: python mixar.py --linha timeline.json --narracao DIR --trilha trilha.wav --sons DIR --saida DIR
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 48000


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == SR, f"{path}: {w.getframerate()} Hz"
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        ch = w.getnchannels()
    return x.reshape(-1, ch).mean(axis=1) if ch > 1 else x


def write_wav(path: Path, x: np.ndarray) -> None:
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = x[:, None]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def place(track: np.ndarray, clip: np.ndarray, t: float, gain: float = 1.0) -> None:
    i = int(round(t * SR))
    if i >= len(track) or i < 0:
        return
    n = min(len(clip), len(track) - i)
    track[i:i + n] += clip[:n] * gain


def loudness(path: Path) -> float:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])


def _fr(it: dict, k: int) -> float:
    fs = (it.get("narracao") or {}).get("frases", [])
    return fs[k]["t"] if k < len(fs) else 0.0


def _tp(it: dict, k: int, word: str) -> float:
    """Same rule as tPalavra() in motion/src/cenas/Graficas.tsx: word start by characters."""
    fs = (it.get("narracao") or {}).get("frases", [])
    if k >= len(fs):
        return 0.0
    f = fs[k]
    i = max(0, f["texto"].find(word))
    return f["t"] + (f["src_fim"] - f["src_ini"]) * i / max(1, len(f["texto"]))


def eventos_v2(it: dict) -> list[tuple[str, float, float]]:
    """Sound cues of the v2 motion layer (motion/src/v2), as (sound, item time, gain).

    Mirrors the SFX markers commented in the TSX: keep both in step when a cue moves.
    """
    fr = lambda k: _fr(it, k)  # noqa: E731
    tp = lambda k, w: _tp(it, k, w)  # noqa: E731
    d, cid = it["duracao"], it["id"]
    ev: list[tuple[str, float, float]] = []
    if it["tipo"] == "cartela":
        ev += [("pop", 0.25, 0.35), ("swish", d - 0.38, 0.45)]
        return ev
    if it["tipo"] == "tela":
        if it.get("fade_in"):
            ev.append(("swish", 0.0, 0.4))
        if it.get("fade_out"):
            ev.append(("swish", d - 0.4, 0.45))
        for lab in (it.get("labels") or [])[1:]:
            ev.append(("swish", lab["t"] - 0.12, 0.4))
    table: dict[str, list[tuple[str, float, float]]] = {
        "A0": [("riser", 0.1, 0.5), ("swish", 2.2, 0.45), ("impacto", 4.6, 0.55), ("pop", 5.5, 0.35)],
        # Sentence numbers follow roteiro-v3.md (cenas-v3.json).
        "I1": [("pop", fr(1) - 0.2, 0.3)] + [("tic", fr(1) + 0.5 + 0.6 * k, 0.5) for k in range(3)],
        "M1": [("tic", fr(k), 0.5) for k in (2, 3, 4, 5)],
        "M2": [("tic", fr(1) + 0.3, 0.45), ("tic", fr(2), 0.45), ("tic", fr(3), 0.45), ("pop", fr(4), 0.4)],
        "M3": [("pop", fr(k), 0.3) for k in (0, 1, 2, 4)] + [("impacto", tp(5, "não decide"), 0.5)],
        "S1": [("pop", fr(0), 0.3), ("pop", tp(4, "678"), 0.35)],
        "S2": [("pop", tp(0, "rigidez"), 0.35)],
        "S3": [("pop", fr(2), 0.3)],
        "S4": [("pop", tp(0, "0,7"), 0.3), ("tic", tp(0, "0,7") + 0.35, 0.45), ("tic", tp(0, "0,7") + 0.7, 0.45), ("pop", fr(1), 0.35)],
        "S5": [("pop", fr(4) - 0.2, 0.3)] + [("pop", m["t"], 0.35) for m in it.get("marks", []) if m["name"].startswith("funil_")],
        "S6": [("pop", tp(0, "0,999"), 0.4)],
        "S7": [("impacto", tp(1, "não ganha zero"), 0.5)],
        "S8": [("pop", tp(1, "o primeiro"), 0.3)],
        "S9": [("impacto", fr(1) + 0.2, 0.45), ("pop", fr(2) + 0.3, 0.3)],
        "P1": [("pop", tp(3, "673"), 0.35)],
        "P2": [("pop", fr(1), 0.3), ("pop", fr(2), 0.3), ("swish", tp(2, "inclinação 3"), 0.35)],
        "P3": [("pop", fr(2), 0.3), ("swish", tp(2, "inclinação 1"), 0.35)],
        "P4": [("pop", fr(0) + 0.3, 0.3), ("swish", fr(1) + 0.3, 0.35), ("pop", fr(1) + 0.4, 0.3)],
        "K1": [("swish", tp(1, "cobre"), 0.45), ("impacto", tp(1, "cobre") + 0.45, 0.5)],
        "D1": [("pop", tp(0, "678"), 0.35), ("pop", fr(1) + 0.2, 0.3)],
        "D2": [("pop", fr(1), 0.3), ("impacto", fr(3), 0.5)],
        "D3": [("swish", fr(1), 0.4), ("pop", fr(1) + 0.1, 0.3)] + [("tic", fr(1) + 0.9 + 0.25 * k, 0.45) for k in range(3)] + [("impacto", tp(4, "ausente"), 0.5)],
        "Z1": [("pop", fr(1), 0.3), ("pop", fr(2), 0.3), ("pop", fr(3), 0.3)],
        "Z2": [("pop", fr(0) + 0.3, 0.3), ("pop", tp(1, "expoente"), 0.3)],
        "Z3": [("swish", tp(1, "leva a massa"), 0.4), ("pop", fr(2) + 0.2, 0.3)],
        "V1": [("pop", fr(1) + 0.2, 0.35), ("pop", fr(1) + 0.32, 0.35)],
        "V2": [("impacto", tp(0, w) + 0.05, 0.55) for w in ("não substitui", "não traz", "não especifica")] + [("confirma", fr(1), 0.7)],
        "E1": [("pop", fr(1), 0.3)],
    }
    return ev + table.get(cid, [])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--linha", required=True)
    ap.add_argument("--narracao", required=True)
    ap.add_argument("--trilha", required=True)
    ap.add_argument("--sons", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--v2", action="store_true", help="add the sound cues of the v2 motion layer (full cut)")
    args = ap.parse_args()
    tl = json.loads(Path(args.linha).read_text(encoding="utf-8"))
    out = Path(args.saida)
    out.mkdir(parents=True, exist_ok=True)
    n = int(np.ceil(tl["duracao"] * SR)) + SR
    voz = np.zeros(n, np.float32)
    sfx = np.zeros(n, np.float32)
    nomes = ("clique", "confirma", "transicao") + (("pop", "tic", "impacto", "swish", "riser") if args.v2 else ())
    sons = {k: read_wav(Path(args.sons) / f"{k}.wav") for k in nomes}
    cache: dict[str, np.ndarray] = {}

    last_click = -10.0
    for it in tl["itens"]:
        t0 = it["inicio"]
        nar = it.get("narracao")
        if nar and not (Path(args.narracao) / nar["arquivo"]).exists():
            # A scene whose voice is still to come (timings estimated): silent for now.
            print(f"{it['id']}: sem áudio de narração ainda; cena muda nesta mixagem")
            nar = None
        if nar:
            src = cache.setdefault(nar["arquivo"], read_wav(Path(args.narracao) / nar["arquivo"]))
            for f in nar["frases"]:
                a, b = int(f["src_ini"] * SR), int(f["src_fim"] * SR)
                clip = src[a:b].copy()
                fade = min(len(clip) // 4, int(0.012 * SR))  # no clicks at the cut points
                if fade:
                    clip[:fade] *= np.linspace(0, 1, fade)
                    clip[-fade:] *= np.linspace(1, 0, fade)
                place(voz, clip, t0 + f["t"])
        if it["tipo"] == "cartela":
            # Whoosh peaks on the card's arrival (the sound's middle on the cut).
            place(sfx, sons["transicao"], t0 - len(sons["transicao"]) / SR / 2 + FADE_PEAK, 0.9)
        for c in it.get("clicks", []):
            if c - last_click < 0.12:
                continue
            # Varied a little so repeated clicks do not sound mechanical.
            place(sfx, sons["clique"], t0 + c, float(np.random.default_rng(int(c * 1000)).uniform(0.75, 1.0)))
            last_click = c
        last_click = -10.0
        for c in it.get("confirms", []):
            place(sfx, sons["confirma"], t0 + c, 0.8)
        if args.v2:
            for nome, tt, g in eventos_v2(it):
                place(sfx, sons[nome], t0 + max(0.0, tt), g)

    write_wav(out / "voz.wav", voz)
    write_wav(out / "sfx.wav", sfx)

    # Music: cut to length, fade-in on the title, 3 s fade-out at the end, ducked under the voice.
    dur = tl["duracao"]
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", args.trilha, "-i", str(out / "voz.wav"),
        "-filter_complex",
        f"[0:a]atrim=0:{dur:.3f},asetpts=N/SR/TB,afade=t=in:d=1.5,afade=t=out:st={dur - 3:.3f}:d=3[m];"
        "[1:a]aformat=channel_layouts=stereo[sc];"
        "[m][sc]sidechaincompress=threshold=0.02:ratio=3:attack=80:release=600:makeup=1[md]",
        "-map", "[md]", "-ar", str(SR), str(out / "musica.wav"),
    ], check=True)

    # Full mix, then two-pass loudness normalization to -16 LUFS / -1.5 dBTP.
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(out / "voz.wav"), "-i", str(out / "musica.wav"), "-i", str(out / "sfx.wav"),
        "-filter_complex", "[0:a]aformat=channel_layouts=stereo[v];[2:a]aformat=channel_layouts=stereo[s];"
        "[v][1:a][s]amix=inputs=3:duration=first:normalize=0[o]",
        "-map", "[o]", "-ar", str(SR), str(out / "mix_bruto.wav"),
    ], check=True)
    measured = loudness(out / "mix_bruto.wav")
    gain_db = -16.0 - measured
    for name, inputs in (("mix", ["voz.wav", "musica.wav", "sfx.wav"]), ("mix_sem_voz", ["musica.wav", "sfx.wav"])):
        flt = "".join(f"[{i}:a]aformat=channel_layouts=stereo[a{i}];" for i in range(len(inputs)))
        flt += "".join(f"[a{i}]" for i in range(len(inputs))) + f"amix=inputs={len(inputs)}:duration=longest:normalize=0,volume={gain_db:.2f}dB,alimiter=limit=0.84:level=false[o]"
        cmd = ["ffmpeg", "-y", "-loglevel", "error"]
        for f in inputs:
            cmd += ["-i", str(out / f)]
        cmd += ["-filter_complex", flt, "-map", "[o]", "-ar", str(SR), "-t", f"{dur:.3f}", str(out / f"{name}.wav")]
        subprocess.run(cmd, check=True)
    print(f"mix: {loudness(out / 'mix.wav'):.1f} LUFS (bruto {measured:.1f}, ganho {gain_db:+.1f} dB); "
          f"voz {loudness(out / 'voz.wav'):.1f}, música {loudness(out / 'musica.wav'):.1f} LUFS")


FADE_PEAK = 0.0  # the whoosh is centered on the cut into the card

if __name__ == "__main__":
    main()
