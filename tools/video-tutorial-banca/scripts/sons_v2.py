"""Extra interface sounds for the v2 full cut (own synthesis, numpy only, fixed seed).

Writes 48 kHz mono WAVs into --saida:
  pop.wav      short pitched blip for chips, counters and badges
  tic.wav      tiny tick for steps, rows and digits
  impacto.wav  low hit (sine drop + noise burst) for stamps and the index line
  swish.wav    short filtered-noise swish for whip pans and zoom-through exits
  riser.wav    2 s rising noise + tone that leads into the cold open

Usage: python sons_v2.py --saida DIR
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from sons import SR, one_pole_lowpass, write

RNG = np.random.default_rng(20261112)


def env(n: int, a: float, d: float) -> np.ndarray:
    """Attack/decay envelope over n samples (seconds)."""
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def pop() -> np.ndarray:
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 18) + 520  # quick downward glide
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.035)
    return 0.6 * x


def tic() -> np.ndarray:
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 2400 * t) * env(n, 0.0005, 0.008) + 0.3 * RNG.standard_normal(n) * env(n, 0.0003, 0.003)
    return 0.4 * x


def impacto() -> np.ndarray:
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-t * 6) + 42
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 0.22)
    burst = one_pole_lowpass(RNG.standard_normal(n), 1800.0) * env(n, 0.001, 0.04)
    return 0.85 * np.tanh(1.6 * (body + 0.6 * burst))


def swish() -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    cut = 400 + 5200 * np.sin(np.pi * t / t[-1]) ** 2  # filter opens and closes
    x = one_pole_lowpass(RNG.standard_normal(n), cut) * np.sin(np.pi * t / t[-1]) ** 1.5
    return 0.5 * x / (np.max(np.abs(x)) + 1e-9)


def riser() -> np.ndarray:
    n = int(2.0 * SR)
    t = np.arange(n) / SR
    cut = 200 + 4000 * (t / t[-1]) ** 2
    noise = one_pole_lowpass(RNG.standard_normal(n), cut)
    noise /= np.max(np.abs(noise)) + 1e-9
    tone = np.sin(2 * np.pi * np.cumsum(180 + 260 * (t / t[-1]) ** 2) / SR)
    x = (0.6 * noise + 0.25 * tone) * (t / t[-1]) ** 2
    return 0.55 * x


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", required=True)
    out = Path(ap.parse_args().saida)
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in (("pop", pop), ("tic", tic), ("impacto", impacto), ("swish", swish), ("riser", riser)):
        write(out / f"{name}.wav", fn())
        print("ok", name)


if __name__ == "__main__":
    main()
