"""Synthesize the music bed and the interface sounds (own work, no third-party audio).

Everything here is generated from sine waves and filtered noise with numpy, so the
only "license" is this script. Writes 48 kHz WAVs into the given folder:
  trilha.wav (stereo, the requested length), clique.wav, confirma.wav, transicao.wav
Usage: python sons.py --saida DIR --duracao SEGUNDOS
"""

from __future__ import annotations

import argparse
import wave
from pathlib import Path

import numpy as np

SR = 48000
RNG = np.random.default_rng(20261104)  # fixed seed: same sounds on every run


def write(path: Path, x: np.ndarray) -> None:
    x = np.asarray(x, np.float32)
    if x.ndim == 1:
        x = x[:, None]
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def one_pole_lowpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    c = np.broadcast_to(np.asarray(cutoff, np.float64), x.shape)
    a = np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # short signals only (sound effects)
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def db(v: float) -> float:
    return 10 ** (v / 20)


def clique() -> np.ndarray:
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    tick = np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.012) * 0.5
    noise = RNG.standard_normal(n) * np.exp(-t / 0.003) * 0.25
    x = tick + body + noise
    return x / np.abs(x).max() * db(-16)


def confirma() -> np.ndarray:
    out = []
    for f, d in ((659.25, 0.12), (987.77, 0.22)):
        n = int(d * SR)
        t = np.arange(n) / SR
        env = np.minimum(1, t / 0.008) * np.exp(-t / (d * 0.55))
        tone = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
        out.append(tone * env)
    x = np.concatenate(out)
    return x / np.abs(x).max() * db(-18)


def transicao() -> np.ndarray:
    n = int(0.75 * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    cutoff = 300 + 3200 * np.sin(np.pi * t / t[-1]) ** 2
    x = one_pole_lowpass(noise, cutoff)
    env = np.abs(np.sin(np.pi * t / t[-1])) ** 1.5
    x = x * env
    return x / np.abs(x).max() * db(-22)


# ---------------------------------------------------------------- music bed
CHORDS = [  # (bass, chord tones) in Hz — Cmaj9, Am9, Fmaj7, G6sus2
    (65.41, [261.63, 329.63, 392.00, 493.88, 587.33]),
    (55.00, [220.00, 261.63, 329.63, 392.00, 493.88]),
    (43.65, [174.61, 220.00, 261.63, 329.63, 440.00]),
    (49.00, [196.00, 220.00, 293.66, 329.63, 392.00]),
]
CHORD_S = 8.0


def pad_segment(bass: float, tones: list[float], start: float) -> np.ndarray:
    n = int(CHORD_S * SR)
    t = np.arange(n) / SR + start
    seg = np.zeros((n, 2))
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t)
    for k, f in enumerate(tones):
        for ch, det in ((0, -0.6), (1, 0.6)):
            ph = 2 * np.pi * (f + det) * t + k
            v = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
            seg[:, ch] += v * (0.11 - 0.012 * k) * (0.75 + 0.25 * lfo)
    b = np.sin(2 * np.pi * bass * t) + 0.3 * np.sin(4 * np.pi * bass * t)
    seg += (b * 0.16)[:, None]
    # Sparse plucks on chord tones, about one every 2 s, quiet.
    for j in range(4):
        onset = int((j * 2.0 + 0.5) * SR)
        f = tones[(j * 2 + 1) % len(tones)] * 2
        m = n - onset
        tt = np.arange(m) / SR
        pl = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt / 0.9)
        pl *= np.minimum(1, tt / 0.004) * 0.07
        pan = 0.3 + 0.4 * (j % 2)
        seg[onset:, 0] += pl * (1 - pan)
        seg[onset:, 1] += pl * pan
    return seg


def trilha(duracao: float) -> np.ndarray:
    total = int(duracao * SR)
    xf = int(1.5 * SR)  # crossfade between chords: no clicks, slow harmonic motion
    out = np.zeros((total + int(CHORD_S * SR), 2))
    pos, i = 0, 0
    while pos < total:
        bass, tones = CHORDS[i % len(CHORDS)]
        seg = pad_segment(bass, tones, pos / SR)
        env = np.ones(len(seg))
        env[:xf] = np.linspace(0, 1, xf)
        env[-xf:] = np.linspace(1, 0, xf)
        end = min(len(out), pos + len(seg))
        out[pos:end] += (seg * env[:, None])[: end - pos]
        pos += len(seg) - xf
        i += 1
    out = out[:total]
    # Simple room: a few feedback-free delayed copies, then gentle lowpass per channel.
    rev = np.zeros_like(out)
    for d, g in ((0.031, 0.35), (0.067, 0.28), (0.113, 0.22), (0.171, 0.16), (0.257, 0.1)):
        k = int(d * SR)
        rev[k:, 0] += out[:-k, 1] * g
        rev[k:, 1] += out[:-k, 0] * g
    out = out + rev
    # Lowpass (3.5 kHz) is applied by ffmpeg at mix time (montar.py).
    fade = int(3 * SR)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out / np.abs(out).max() * db(-6)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", required=True)
    ap.add_argument("--duracao", type=float, required=True)
    args = ap.parse_args()
    out = Path(args.saida)
    out.mkdir(parents=True, exist_ok=True)
    write(out / "clique.wav", clique())
    write(out / "confirma.wav", confirma())
    write(out / "transicao.wav", transicao())
    write(out / "trilha.wav", trilha(args.duracao))
    print("sons prontos em", out)


if __name__ == "__main__":
    main()
