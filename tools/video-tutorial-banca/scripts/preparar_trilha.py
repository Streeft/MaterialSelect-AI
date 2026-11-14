"""Turn the licensed music track into a music bed of the requested length.

The track (Kevin MacLeod, "Wallpaper", CC BY 4.0, incompetech.com) is shorter than the
full video, so it is chained with itself through a 4 s crossfade, cut to length,
lowpassed at 3.5 kHz (keeps it out of the voice band's top), given 2 s / 3 s fades,
and normalized to -36 LUFS, i.e. 20 dB under the -16 LUFS narration.
Output: 48 kHz stereo WAV.

Usage: python preparar_trilha.py --faixa track.mp3 --saida trilha.wav --duracao 460
"""

from __future__ import annotations

import argparse
import math
import subprocess

XFADE_S = 4.0
TARGET_LUFS = -36


def probe_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--faixa", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--duracao", type=float, required=True)
    args = ap.parse_args()

    track = probe_duration(args.faixa)
    copies = max(1, math.ceil((args.duracao - XFADE_S) / (track - XFADE_S)))
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for _ in range(copies):
        cmd += ["-i", args.faixa]
    chain, last = [], "[0:a]"
    for i in range(1, copies):
        label = f"[x{i}]"
        chain.append(f"{last}[{i}:a]acrossfade=d={XFADE_S}:c1=tri:c2=tri{label}")
        last = label
    fade_out_start = args.duracao - 3
    chain.append(
        f"{last}atrim=0:{args.duracao},asetpts=N/SR/TB,aresample=48000,"
        f"lowpass=f=3500,afade=t=in:d=2,afade=t=out:st={fade_out_start}:d=3,"
        f"loudnorm=I={TARGET_LUFS}:TP=-9:LRA=7,aresample=48000[out]"
    )
    cmd += ["-filter_complex", ";".join(chain), "-map", "[out]", "-ac", "2", args.saida]
    subprocess.run(cmd, check=True)
    print(f"{args.saida}: {args.duracao:.1f} s, {copies} cópia(s) da faixa")


if __name__ == "__main__":
    main()
