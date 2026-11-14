"""Build the edit timeline of one cut from the recorded scenes, the narration and the script.

One JSON drives everything downstream, so picture, sound and subtitles never drift:
  - the Remotion project in ./motion renders the picture from it;
  - mixar.py builds the soundtrack (voice, music, interface sounds) from it;
  - the SRT is written here, from the script's own sentences (never from a transcript).

Steps:
  1. Each recorded scene (frames + cena.json from gravar.js) becomes a constant 30 fps
     MP4 in --videos (the screencast only sends a frame when the screen changes, so
     every frame is held until the next one).
  2. Scenes are laid out in order with the chapter cards; every sentence gets its
     absolute start time; captions are split to at most 2 lines x 42 characters.

Usage:
  python montar_linha.py --corte completo --gravacoes DIR --narracao DIR --videos DIR --saida timeline.json --srt out.srt
  python montar_linha.py --corte curto ...   (same, with the short cut's scenes)
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
FPS = 30
# The full cut (motion v2) opens on an 8 s cold open and gives the kinetic chapter cards 2.5 s;
# the short cut keeps its approved 5 s / 2 s.
CARD_S = {"completo": 2.5, "curto": 2.0}
OPEN_S = {"completo": 8.0, "curto": 5.0}
FADE_S = 0.25
NARR_OFFSET = 0.5
TAIL_S = 0.5
MAX_LINE = 42
# Words a caption block or line should not end on (they belong to what follows).
WEAK = set("a o as os um uma de do da dos das que e é em no na nos nas se por para com já ao à sobre seu sua".split())

CARDS = {
    "C1": ("1", "O método"),
    "C2": ("2", "Seleção"),
    "C3": ("3", "Mapas"),
    "C4": ("4", "Dados confiáveis"),
    "C5": ("5", "Dimensionar"),
    "C6": ("6", "Demais recursos"),
    "C7": ("7", "Verificação e limites"),
    "C8": ("", "Encerramento"),
}
# Scenes whose screens show catalog values: the fixed demo badge stays on.
SELO = {"S1", "S2", "S4", "S5", "S6", "S7", "S8", "P1", "P2", "P3", "D1", "D2", "D3", "Z1", "Z2"}
# R1 screens with values get the badge too (by the label of the screen).
SELO_R1 = {"Comparar", "Processos", "Painel", "Custo", "Eco", "Baterias", "Sintetizar"}
# Scenes made only of motion graphics (no screen recording).
GRAFICAS = {"A0", "V1", "V2", "E1"}
E1_HOLD_S = 6.0
MAX_SILENCE = 2.0


def wrap_caption(text: str) -> list[str]:
    """Split a sentence into caption blocks of at most 2 lines x MAX_LINE characters.

    Uses the fewest blocks that fit; among the possible break points it picks the ones
    that keep the blocks even, strongly preferring a break right after punctuation
    (a clause per block reads better than a balanced cut mid-phrase).
    """
    words = text.split()

    def fits(ws: list[str]) -> bool:
        return len(_relines(" ".join(ws))) <= 2

    def best(ws: list[str], n: int) -> tuple[float, list[list[str]]] | None:
        if n == 1:
            return (0.0, [ws]) if fits(ws) else None
        target = len(" ".join(ws)) / n
        out = None
        for i in range(1, len(ws)):
            head = ws[:i]
            if not fits(head):
                break
            rest = best(ws[i:], n - 1)
            if rest is None:
                continue
            cost = abs(len(" ".join(head)) - target) + rest[0]
            if head[-1][-1] in ",;:.":
                cost -= 18
            if head[-1].lower() in WEAK:
                cost += 30
            if out is None or cost < out[0]:
                out = (cost, [head] + rest[1])
        return out

    for n in range(1, 6):
        r = best(words, n)
        if r:
            return ["\n".join(_relines(" ".join(b))) for b in r[1]]
    return ["\n".join(_relines(text))]


def _relines(text: str) -> list[str]:
    """Lines of at most MAX_LINE characters; a two-line block is balanced (no orphan word)."""
    words = text.replace("\n", " ").split()
    flat = " ".join(words)
    if len(flat) <= MAX_LINE:
        return [flat]
    best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        if len(a) <= MAX_LINE and len(b) <= MAX_LINE:
            score = max(len(a), len(b)) + (12 if words[i - 1].lower() in WEAK else 0)
            if best is None or score < best[0]:
                best = (score, [a, b])
    if best:
        return best[1]
    out, cur = [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) <= MAX_LINE:
            cur = f"{cur} {w}" if cur else w
        else:
            out.append(cur)
            cur = w
    out.append(cur)
    return out


def compress(cena: dict, narr: dict | None, keep_gap: float = 0.35) -> dict:
    """Cut the stretches where nothing moves on screen and nobody speaks.

    On this 2-core machine the app sometimes takes seconds to react to a click while the
    recorder's clock runs; those seconds are a frozen screen. The screencast only sends a
    frame when the picture changes, so a stretch with no frames is a still image: cutting
    it is invisible. Narration, camera moves and every frame change are kept, and each cut
    keeps a short breath (keep_gap) of the still picture.
    """
    dur = cena["duracao"]
    keep: list[tuple[float, float]] = [(0, 0.6), (dur - 0.6, dur)]
    fr = sorted(f["t"] for f in cena["frames"])
    for i, t in enumerate(fr):
        prev = fr[i - 1] if i else None
        keep.append((t - (0.12 if prev is not None and t - prev < 0.6 else 0.05), t + 0.3))
    if narr:
        for k, f in enumerate(narr["frases"]):
            t0 = cena.get("frases_t", [])[k] if k < len(cena.get("frases_t", [])) else None
            if t0 is not None:
                keep.append((t0 - 0.25, t0 + (f["fim"] - f["inicio"]) + 0.35))
    for z in cena.get("zooms", []):
        if not z.get("instant"):
            keep.append((z["t"] - 0.2, z["t"] + 0.95))
    for lab in cena.get("labels", []):
        keep.append((lab["t"] - 0.3, lab["t"] + 0.6))
    keep = sorted((max(0.0, a), min(dur, b)) for a, b in keep if b > a)
    merged: list[list[float]] = []
    for a, b in keep:
        if merged and a <= merged[-1][1] + keep_gap:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    # Removed spans: between kept spans, minus the breath kept at the start of each gap.
    cuts = []
    for (a1, b1), (a2, b2) in zip(merged, merged[1:]):
        if a2 - b1 > keep_gap:
            cuts.append((b1 + keep_gap, a2))

    def m(t: float) -> float:
        out = t
        for a, b in cuts:
            if t >= b:
                out -= b - a
            elif t > a:
                out -= t - a
        return round(out, 4)

    # Long silent stretches that do have action (typing, a map redrawing) are sped up,
    # at most 2x, so that no silence runs much past MAX_SILENCE.
    speed: list[tuple[float, float, float]] = []  # (start, end, factor) in cut time
    if narr and cena.get("frases_t"):
        ends, starts = [0.0], []
        for k, f in enumerate(narr["frases"]):
            t0 = m(cena["frases_t"][k])
            starts.append(t0)
            ends.append(t0 + f["fim"] - f["inicio"])
        starts.append(m(dur))
        for a, b in zip(ends, starts):
            gap = b - a
            if gap > MAX_SILENCE + 0.3:
                f = min(2.0, gap / MAX_SILENCE)
                speed.append((a + 0.2, b - 0.2, f))

    def m2(t: float) -> float:
        out = t
        for a, b, f in speed:
            if t >= b:
                out -= (b - a) * (1 - 1 / f)
            elif t > a:
                out -= (t - a) * (1 - 1 / f)
        return round(out, 4)

    m1 = m
    m = lambda t: m2(m1(t))  # noqa: E731
    c = dict(cena)
    c["frames"] = [dict(f, t=m(f["t"])) for f in cena["frames"]]
    for key in ("clicks", "confirms", "frases_t"):
        c[key] = [m(t) for t in cena.get(key, [])]
    for key in ("zooms", "marks", "labels"):
        c[key] = [dict(z, t=m(z["t"])) for z in cena.get(key, [])]
    c["duracao"] = m(dur)
    c["cortes_tempo_morto"] = [[round(a, 3), round(b, 3)] for a, b in cuts]
    c["acelerados"] = [[round(a, 3), round(b, 3), round(f, 2)] for a, b, f in speed]
    return c


def encode_scene(frames_dir: Path, cena: dict, out: Path) -> None:
    """Constant-frame-rate MP4 from the screencast frames (each held until the next)."""
    frames = cena["frames"]
    dur = cena["duracao"]
    lst = frames_dir / "concat.txt"
    lines = []
    for i, f in enumerate(frames):
        t0 = max(0.0, f["t"])
        t1 = frames[i + 1]["t"] if i + 1 < len(frames) else dur
        lines.append(f"file '{f['f']}'\nduration {max(1 / FPS, t1 - t0):.4f}")
    lines.append(f"file '{frames[-1]['f']}'")
    lst.write_text("\n".join(lines) + "\n", encoding="utf-8")
    first_t = max(0.0, frames[0]["t"])
    vf = f"tpad=start_duration={first_t:.3f}:start_mode=clone," if first_t > 0.01 else ""
    vf += f"fps={FPS},scale=1920:1080:flags=lanczos,format=yuv420p"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
        "-vf", vf, "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
        "-g", "30", "-movflags", "+faststart", str(out),
    ], check=True, cwd=frames_dir)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corte", choices=["completo", "curto"], required=True)
    ap.add_argument("--gravacoes", required=True, help="pasta com uma subpasta por cena (gravar.js)")
    ap.add_argument("--narracao", required=True)
    ap.add_argument("--videos", required=True, help="onde gravar os MP4 por cena")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--srt", required=True)
    ap.add_argument("--sem-codificar", action="store_true")
    ap.add_argument("--spec", default="cenas.json", help="scene spec, relative to tools/video-tutorial-banca")
    args = ap.parse_args()

    spec = json.loads((HERE / args.spec).read_text(encoding="utf-8"))
    # A spec may carry its own chapter cards and badge list (cenas-v3.json does).
    global CARDS, SELO
    CARDS = {k: tuple(v) for k, v in spec.get("cartelas", CARDS).items()}
    SELO = set(spec.get("selo", SELO))
    by_id = {c["id"]: c for c in spec["cenas"]}
    order = spec["curto"] if args.corte == "curto" else [c["id"] for c in spec["cenas"]]
    rec_dir, narr_dir, vid_dir = Path(args.gravacoes), Path(args.narracao), Path(args.videos).resolve()
    vid_dir.mkdir(parents=True, exist_ok=True)

    items, t = [], 0.0
    for idx, cid in enumerate(order):
        c = by_id[cid]
        nxt = order[idx + 1] if idx + 1 < len(order) else None
        prev = order[idx - 1] if idx else None
        item = {"id": cid, "bloco": c["bloco"], "inicio": round(t, 3)}
        if cid in CARDS:
            num, name = CARDS[cid]
            item.update(tipo="cartela", numero=num if args.corte == "completo" else "", titulo=name, duracao=CARD_S[args.corte])
        else:
            narr = None
            nf = narr_dir / f"{cid}.json"
            if nf.exists():
                narr = json.loads(nf.read_text(encoding="utf-8"))
            if cid in GRAFICAS:
                frases_t, dur = [], OPEN_S[args.corte] if cid == "A0" else 0.0
                if narr:
                    tt = NARR_OFFSET
                    for k, f in enumerate(narr["frases"]):
                        tt = max(NARR_OFFSET + f["inicio"], tt)
                        frases_t.append(round(tt, 3))
                        tt += f["fim"] - f["inicio"] + 0.45 if k + 1 < len(narr["frases"]) else 0
                    last = narr["frases"][-1]
                    dur = frases_t[-1] + (last["fim"] - last["inicio"]) + TAIL_S
                    if cid == "E1":
                        dur += E1_HOLD_S
                item.update(tipo="grafica", duracao=round(dur, 3))
            else:
                cdir = rec_dir / cid
                cena = compress(json.loads((cdir / "cena.json").read_text(encoding="utf-8")), narr)
                mp4 = vid_dir / f"{cid}.mp4"
                if not args.sem_codificar and (not mp4.exists() or mp4.stat().st_mtime < (cdir / "cena.json").stat().st_mtime):
                    encode_scene(cdir, cena, mp4)
                frases_t = cena.get("frases_t", [])
                item.update(
                    tipo="tela", duracao=round(cena["duracao"], 3), video=mp4.name,
                    zooms=cena.get("zooms", []), marks=cena.get("marks", []), labels=cena.get("labels", []),
                    clicks=cena.get("clicks", []), confirms=cena.get("confirms", []), linha=cena.get("linha"),
                    issues=cena.get("issues", []),
                )
            if narr:
                off = narr.get("inicio_audio", 0.0)
                item["narracao"] = {
                    "arquivo": f"{cid}.wav",
                    "frases": [
                        {"texto": f["texto"], "t": frases_t[k], "src_ini": round(off + f["inicio"], 3), "src_fim": round(off + f["fim"], 3)}
                        for k, f in enumerate(narr["frases"])
                    ],
                }
            item["selo"] = cid in SELO
        # Fade through black around chapter cards and at the very start/end.
        item["fade_in"] = bool(prev in CARDS or cid in CARDS or prev == "A0" or idx == 0)
        item["fade_out"] = bool(nxt in CARDS or cid in CARDS or cid == "A0" or nxt is None)
        items.append(item)
        t += item["duracao"]

    # Captions: one or more blocks per sentence, timed by characters within the sentence.
    caps = []
    for it in items:
        for f in it.get("narracao", {}).get("frases", []):
            start = it["inicio"] + f["t"]
            end = start + (f["src_fim"] - f["src_ini"])
            blocks = wrap_caption(f["texto"])
            total = sum(len(b) for b in blocks)
            acc = start
            for b in blocks:
                d = (end - start) * len(b) / total
                caps.append({"texto": b, "ini": round(acc, 3), "fim": round(acc + d, 3)})
                acc += d
    # Hold each caption until the next one if the gap is short (no flicker between sentences).
    for a, b in zip(caps, caps[1:]):
        if 0 < b["ini"] - a["fim"] < 0.6:
            a["fim"] = b["ini"]

    timeline = {"corte": args.corte, "fps": FPS, "duracao": round(t, 3), "itens": items, "legendas": caps}
    Path(args.saida).write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")

    def ts(x: float) -> str:
        ms = int(round(x * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

    srt = []
    for i, cap in enumerate(caps, 1):
        srt.append(f"{i}\n{ts(cap['ini'])} --> {ts(cap['fim'])}\n{cap['texto']}\n")
    Path(args.srt).write_text("\n".join(srt), encoding="utf-8")
    longest = max((max(len(l) for l in c["texto"].split("\n")) for c in caps), default=0)
    print(f"{args.corte}: {int(t // 60)} min {t % 60:04.1f} s, {len(items)} itens, {len(caps)} legendas (linha mais longa {longest})")


if __name__ == "__main__":
    main()
