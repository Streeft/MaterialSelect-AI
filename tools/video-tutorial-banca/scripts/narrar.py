"""Synthesize the narration with Piper (local, offline), one sentence at a time.

Writes, per scene, a 48 kHz mono WAV and a JSON with each sentence's start and end
inside the scene. Those timings drive both the screen actions (the recorder waits
for a sentence before acting on what it names) and the subtitles.

Usage: python narrar.py --voz VOZ.onnx --saida DIR [--escala 1.12] [--cena ID ...]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice
from piper.config import SynthesisConfig

HERE = Path(__file__).resolve().parent.parent
GAP_S = 0.45  # pause between sentences
RATE = 48000


def tts_text(text: str, mapa: dict[str, str]) -> str:
    # Longest keys first, so "MaterialSelect AI" wins over any shorter overlap.
    for src in sorted(mapa, key=len, reverse=True):
        text = text.replace(src, mapa[src])
    return text


def synth(voice: PiperVoice, text: str, escala: float) -> np.ndarray:
    cfg = SynthesisConfig(length_scale=escala)
    chunks = [c.audio_float_array for c in voice.synthesize(text, syn_config=cfg)]
    audio = np.concatenate(chunks) if chunks else np.zeros(0, np.float32)
    # Resample 22.05 kHz -> 48 kHz with ffmpeg (soxr), so the mix runs at one rate.
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(voice.config.sample_rate), "-ac", "1",
         "-i", "-", "-af", "aresample=resampler=soxr", "-ar", str(RATE), "-f", "f32le", "-"],
        input=audio.astype(np.float32).tobytes(), capture_output=True, check=True,
    ).stdout
    out = np.frombuffer(raw, np.float32)
    # Trim the model's leading/trailing near-silence so the timings are the speech.
    idx = np.where(np.abs(out) > 0.01)[0]
    return out[max(idx[0] - 480, 0): idx[-1] + 960] if idx.size else out


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voz", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--escala", type=float, default=1.12)
    ap.add_argument("--cena", nargs="*")
    args = ap.parse_args()

    spec = json.loads((HERE / "cenas.json").read_text(encoding="utf-8"))
    voice = PiperVoice.load(args.voz)
    out = Path(args.saida)
    out.mkdir(parents=True, exist_ok=True)

    for cena in spec["cenas"]:
        if args.cena and cena["id"] not in args.cena:
            continue
        if not cena["frases"]:
            continue
        parts, timings, t = [], [], 0.0
        gap = np.zeros(int(GAP_S * RATE), np.float32)
        for i, frase in enumerate(cena["frases"]):
            a = synth(voice, tts_text(frase, spec["pronuncia"]), args.escala)
            if i:
                parts.append(gap)
                t += GAP_S
            parts.append(a)
            dur = len(a) / RATE
            timings.append({"texto": frase, "inicio": round(t, 3), "fim": round(t + dur, 3)})
            t += dur
        write_wav(out / f"{cena['id']}.wav", np.concatenate(parts))
        (out / f"{cena['id']}.json").write_text(
            json.dumps({"id": cena["id"], "duracao": round(t, 3), "frases": timings},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"{cena['id']}: {t:.1f} s")


if __name__ == "__main__":
    main()
