"""Assemble the defense video from the recorded frames, the narration and the sounds.

Video: each recorded scene becomes a 30 fps H.264 clip (frames sampled on the virtual
clock, 400 ms eased zooms, "demonstrative values" badge, Part 3 labels). Title, chapter
and closing cards are drawn here with PIL (all text rendered by this script, never by
an AI model). Audio: narration placed per scene, sound effects at the logged clicks,
music bed ducked under speech and raised on the cards, final loudnorm at -16 LUFS.

Usage: python montar.py [--gravacao DIR] [--narracao DIR] [--sons DIR] [--saida DIR]
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import wave
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent.parent
W, H, FPS, SR = 1920, 1080, 30, 48000
ZOOM_S = 0.4
FADE = 0.25
CARD_S = 2.0
NAME = "TCC_MaterialSelectAI_Video_Tutorial_Banca"
FONT_DIR = Path("/usr/share/fonts")


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    names = {"regular": "Inter-Regular", "medium": "Inter-Medium", "semibold": "Inter-SemiBold",
             "bold": "Inter-Bold", "mono": "JetBrainsMono-Regular"}
    for p in FONT_DIR.rglob(names[weight] + ".*tf"):
        return ImageFont.truetype(str(p), size)
    for p in FONT_DIR.rglob("Inter*.ttf"):  # variable font fallback
        f = ImageFont.truetype(str(p), size)
        try:
            f.set_variation_by_name({"regular": "Regular", "medium": "Medium", "semibold": "SemiBold", "bold": "Bold"}.get(weight, "Regular"))
        except Exception:
            pass
        return f
    return ImageFont.truetype("DejaVuSans.ttf", size)


# ---------------------------------------------------------------- overlays
def pill(text: str, fg, bg, size=24, pad=(18, 9), weight="semibold") -> Image.Image:
    f = font(weight, size)
    tw, th = f.getbbox(text)[2], f.getbbox("Ág")[3]
    im = Image.new("RGBA", (tw + 2 * pad[0], th + 2 * pad[1]), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=im.height // 2, fill=bg)
    d.text((pad[0], pad[1] - 2), text, font=f, fill=fg)
    return im


BADGE = None


def badge() -> Image.Image:
    global BADGE
    if BADGE is None:
        BADGE = pill("Valores demonstrativos (fictícios) — não são medições",
                     (60, 36, 0, 255), (255, 214, 140, 235), size=21)
    return BADGE


def label_img(text: str) -> Image.Image:
    return pill(text, (255, 255, 255, 255), (20, 30, 52, 230), size=26, weight="bold")


# ---------------------------------------------------------------- scene clips
def ease(p: float) -> float:
    p = max(0.0, min(1.0, p))
    return p * p * (3 - 2 * p)


def rect_at(zooms: list[dict], t: float) -> tuple[float, float, float, float]:
    """Crop rectangle at time t: each zoom event eases from where the frame was."""
    prev = cur = (0.0, 0.0, float(W), float(H))
    t0 = -1e9
    instant = False
    for z in zooms:
        if z["t"] > t:
            break
        p = 1.0 if instant else ease((z["t"] - t0) / ZOOM_S)
        prev = tuple(a + (b - a) * p for a, b in zip(prev, cur))
        cur, t0, instant = (z["x"], z["y"], z["width"], z["height"]), z["t"], bool(z.get("instant"))
    p = 1.0 if instant else ease((t - t0) / ZOOM_S)
    return tuple(a + (b - a) * p for a, b in zip(prev, cur))


def encode(frames_iter, out: Path) -> None:
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", "-r", str(FPS), "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE,
    )
    for fr in frames_iter:
        proc.stdin.write(fr)
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError(f"ffmpeg falhou em {out}")


def fade_factor(t: float, dur: float, fin: float, fout: float) -> float:
    f = 1.0
    if fin and t < fin:
        f = min(f, t / fin)
    if fout and t > dur - fout:
        f = min(f, (dur - t) / fout)
    return max(0.0, min(1.0, f))


def render_scene(job: dict) -> str:
    d = Path(job["dir"])
    meta = json.loads((d / "cena.json").read_text(encoding="utf-8"))
    frames, zooms, labels = meta["frames"], meta["zooms"], meta["labels"]
    dur = job["dur"]
    n = int(round(dur * FPS))
    demo = job["demo"]
    lab_imgs = {l["text"]: label_img(l["text"]) for l in labels}

    def gen():
        fi, cache_key, cache_bytes, src, src_name = 0, None, None, None, None
        for k in range(n):
            t = k / FPS
            while fi + 1 < len(frames) and frames[fi + 1]["t"] <= t:
                fi += 1
            name = frames[fi]["f"] if frames else None
            r = tuple(round(v, 1) for v in rect_at(zooms, t))
            lab = None
            for l in labels:
                if l["t"] <= t:
                    lab = l["text"]
            fade = round(fade_factor(t, dur, job["fin"], job["fout"]), 3)
            key = (name, r, lab, fade)
            if key == cache_key:
                yield cache_bytes
                continue
            if name != src_name:
                src = Image.open(d / name).convert("RGB") if name else Image.new("RGB", (W, H), "white")
                if src.size != (W, H):
                    src = src.resize((W, H), Image.BICUBIC)
                src_name = name
            x, y, w, h = r
            img = src if (w >= W - 0.5) else src.resize((W, H), Image.BICUBIC, box=(x, y, x + w, y + h))
            img = img.convert("RGBA")
            if demo:
                b = badge()
                img.alpha_composite(b, (W - b.width - 24, 12))
            if lab:
                li = lab_imgs[lab]
                img.alpha_composite(li, (W - li.width - 24, 12 + (badge().height + 10 if demo else 0)))
            img = img.convert("RGB")
            if fade < 1:
                img = Image.eval(img, lambda v, f=fade: int(v * f))
            cache_key, cache_bytes = key, img.tobytes()
            yield cache_bytes

    encode(gen(), Path(job["out"]))
    return job["out"]


# ---------------------------------------------------------------- cards
_BG = None


def background() -> Image.Image:
    """A large dark canvas with a faint log-log grid and soft class envelopes."""
    global _BG
    if _BG is not None:
        return _BG
    BW, BH = W + 240, H + 160
    yy, xx = np.mgrid[0:BH, 0:BW]
    g = (yy / BH)[..., None]
    top, bot = np.array([14, 24, 44]), np.array([10, 16, 30])
    arr = (top * (1 - g) + bot * g).astype(np.uint8)
    bg = Image.fromarray(arr, "RGB").convert("RGBA")
    layer = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(-2, 14):  # decades and the 2/5 sub-lines, as on an Ashby chart
        for sub, a in ((0, 26), (math.log10(2), 10), (math.log10(5), 10)):
            x = int((i + sub) * 190)
            d.line([(x, 0), (x, BH)], fill=(255, 255, 255, a), width=1)
            y = int((i + sub) * 150)
            d.line([(0, y), (BW, y)], fill=(255, 255, 255, a), width=1)
    bg.alpha_composite(layer)
    okabe = [(230, 159, 0), (86, 180, 233), (0, 158, 115), (204, 121, 167), (213, 94, 0)]
    blobs = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    for (cx, cy, rx, ry, ang), col in zip(
        [(520, 760, 420, 150, -32), (1200, 420, 520, 170, -35), (1650, 700, 380, 120, -30),
         (860, 300, 300, 110, -38), (1450, 980, 260, 90, -28)], okabe):
        e = Image.new("RGBA", (2 * rx + 40, 2 * ry + 40), (0, 0, 0, 0))
        ImageDraw.Draw(e).ellipse([20, 20, 20 + 2 * rx, 20 + 2 * ry], fill=col + (36,), outline=col + (70,), width=2)
        e = e.rotate(-ang, expand=True, resample=Image.BICUBIC)
        blobs.alpha_composite(e, (cx - e.width // 2, cy - e.height // 2))
    blobs = blobs.filter(ImageFilter.GaussianBlur(2))
    bg.alpha_composite(blobs)
    _BG = bg
    return bg


def bg_frame(t: float) -> Image.Image:
    bg = background()
    ox = 120 + 100 * math.sin(t * 0.06)
    oy = 80 + 60 * math.cos(t * 0.045)
    return bg.crop((int(ox), int(oy), int(ox) + W, int(oy) + H))


def text_layer(items: list[dict], t: float) -> Image.Image:
    """items: {text, font, size, xy, fill, at, anchor}. Each fades/slides in at 'at'."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for it in items:
        p = ease((t - it.get("at", 0.0)) / 0.6)
        if p <= 0:
            continue
        tl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(tl)
        x, y = it["xy"]
        fill = it.get("fill", (255, 255, 255))
        d.text((x, y + (1 - p) * 14), it["text"], font=font(it.get("font", "regular"), it["size"]),
               fill=tuple(fill) + (int(255 * p),), anchor=it.get("anchor", "la"))
        if it.get("rule"):
            d.line([(x, y + it["size"] + 18), (x + int(it["rule"] * p), y + it["size"] + 18)],
                   fill=(255, 214, 140, int(255 * p)), width=3)
        layer.alpha_composite(tl)
    return layer


def render_card(job: dict) -> str:
    items, dur = job["items"], job["dur"]
    n = int(round(dur * FPS))

    def gen():
        for k in range(n):
            t = k / FPS
            img = bg_frame(job.get("t0", 0) + t)
            img.alpha_composite(text_layer(items, t))
            img = img.convert("RGB")
            f = fade_factor(t, dur, job["fin"], job["fout"])
            if f < 1:
                img = Image.eval(img, lambda v, f=f: int(v * f))
            yield img.tobytes()

    encode(gen(), Path(job["out"]))
    return job["out"]


def fmt_dur(s: float) -> str:
    m, r = divmod(int(round(s)), 60)
    return f"{m} min {r:02d} s" if m else f"{r} s"


def card_items(kind: str, narr: dict | None, extra: dict) -> list[dict]:
    off = 0.5
    st = lambda k: off + narr["frases"][k]["inicio"] if narr else 0.4 + 0.5 * k  # noqa: E731
    L, C = 220, W // 2
    gold, soft = (255, 214, 140), (196, 208, 228)
    if kind == "vinheta":
        return [
            {"text": "MaterialSelect AI", "font": "bold", "size": 104, "xy": (L, 300), "at": 0.3, "rule": 520},
            {"text": "Seleção de materiais pelo método de Ashby", "font": "medium", "size": 44, "xy": (L, 450), "at": 0.9, "fill": soft},
            {"text": "Trabalho de Conclusão de Curso · Engenharia de Materiais · UFRGS", "size": 30, "xy": (L, 600), "at": 1.6, "fill": soft},
            {"text": "Francisco de Almeida Lemos", "font": "semibold", "size": 40, "xy": (L, 680), "at": 2.2},
            {"text": "Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez", "size": 30, "xy": (L, 744), "at": 2.6, "fill": soft},
        ]
    if kind == "cartela-sumario":
        return [
            {"text": "Neste vídeo", "font": "bold", "size": 64, "xy": (L, 250), "at": 0.2, "rule": 300},
            {"text": "1   O método", "font": "semibold", "size": 46, "xy": (L, 420), "at": st(1)},
            {"text": "2   A ferramenta, passo a passo: tirante e placa", "font": "semibold", "size": 46, "xy": (L, 510), "at": st(2)},
            {"text": "3   Demais recursos e o que a ferramenta não faz", "font": "semibold", "size": 46, "xy": (L, 600), "at": st(3)},
            {"text": "Catálogo demonstrativo: valores fictícios, não são medições.", "font": "medium", "size": 34, "xy": (L, 760), "at": st(4), "fill": gold},
        ]
    if kind == "capitulo":
        return [
            {"text": extra["rotulo"], "font": "medium", "size": 32, "xy": (C, 400), "at": 0.1, "fill": gold, "anchor": "ma"},
            {"text": extra["titulo"], "font": "bold", "size": 76, "xy": (C, 470), "at": 0.15, "anchor": "ma"},
            {"text": "duração: " + extra["tempo"], "font": "regular", "size": 34, "xy": (C, 600), "at": 0.3, "fill": soft, "anchor": "ma"},
        ]
    if kind == "cartela-limites":
        return [
            {"text": "O que a ferramenta não faz", "font": "bold", "size": 64, "xy": (L, 230), "at": 0.2, "rule": 420},
            {"text": "—  Não substitui ensaio.", "font": "semibold", "size": 46, "xy": (L, 400), "at": st(1)},
            {"text": "—  Não traz valores medidos: o catálogo é demonstrativo.", "font": "semibold", "size": 46, "xy": (L, 490), "at": st(2)},
            {"text": "—  Não especifica material para projeto real.", "font": "semibold", "size": 46, "xy": (L, 580), "at": st(3)},
            {"text": "Serve para ensinar o método e para uma triagem inicial.", "font": "medium", "size": 36, "xy": (L, 740), "at": st(4), "fill": gold},
        ]
    if kind == "cartela-final":
        return [
            {"text": "Teste de usabilidade com estudantes", "font": "bold", "size": 60, "xy": (L, 230), "at": 0.2, "rule": 420},
            {"text": "de Engenharia de Materiais", "font": "bold", "size": 60, "xy": (L, 305), "at": 0.4},
            {"text": "Quer participar? Fale com o autor.", "font": "medium", "size": 40, "xy": (L, 450), "at": st(1), "fill": gold},
            {"text": "material-select-ai-web.vercel.app", "font": "mono", "size": 36, "xy": (L, 520), "at": st(1) + 0.3, "fill": soft},
            {"text": "Francisco de Almeida Lemos · Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez · UFRGS", "size": 28, "xy": (L, 760), "at": st(2)},
            {"text": "Narração: voz sintética Piper (pt-BR). Trilha e sons: síntese própria. Créditos em CREDITOS.md.", "size": 24, "xy": (L, 810), "at": st(2) + 0.3, "fill": soft},
        ]
    raise ValueError(kind)


# ---------------------------------------------------------------- audio
def read_wav(p: Path) -> np.ndarray:
    with wave.open(str(p)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2)
        if w.getframerate() != SR:
            raise ValueError(f"{p}: {w.getframerate()} Hz")
    return x


def write_wav(p: Path, x: np.ndarray) -> None:
    x = np.asarray(x, np.float32)
    if x.ndim == 1:
        x = x[:, None]
    with wave.open(str(p), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def lufs(p: Path) -> float:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(p), "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(m[-1])


def place(track: np.ndarray, clip: np.ndarray, t: float, gain: float = 1.0) -> None:
    i = int(round(t * SR))
    if i >= len(track):
        return
    j = min(len(track), i + len(clip))
    track[i:j] += clip[: j - i] * gain


def envelope(x: np.ndarray, attack=0.05, release=0.45) -> np.ndarray:
    hop = 480
    n = len(x) // hop + 1
    rms = np.sqrt(np.add.reduceat(np.pad(x, (0, n * hop - len(x))) ** 2, np.arange(0, n * hop, hop)) / hop)
    env = np.zeros(n)
    a_at, a_rel = math.exp(-hop / SR / attack), math.exp(-hop / SR / release)
    acc = 0.0
    for i, v in enumerate(rms):
        a = a_at if v > acc else a_rel
        acc = a * acc + (1 - a) * v
        env[i] = acc
    return np.repeat(env, hop)[: len(x)]


# ---------------------------------------------------------------- subtitles
def ts(s: float) -> str:
    ms = int(round(s * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def wrap2(text: str, width=44) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


def cues_for(text: str, start: float, end: float) -> list[tuple[float, float, str]]:
    lines = wrap2(text)
    chunks = [lines[i:i + 2] for i in range(0, len(lines), 2)]
    total = sum(len(" ".join(c)) for c in chunks)
    out, t = [], start
    for c in chunks:
        d = (end - start) * len(" ".join(c)) / total
        out.append((t, t + d, "\n".join(c)))
        t += d
    return out


# ---------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravacao", default=str(HERE / "tmp/gravacao"))
    ap.add_argument("--narracao", default=str(HERE / "tmp/narracao"))
    ap.add_argument("--sons", default=str(HERE / "tmp/sons"))
    ap.add_argument("--saida", default=str(HERE / "out"))
    ap.add_argument("--jobs", type=int, default=3)
    args = ap.parse_args()
    G, N, S, O = Path(args.gravacao), Path(args.narracao), Path(args.sons), Path(args.saida)
    clips = HERE / "tmp/clipes"
    clips.mkdir(parents=True, exist_ok=True)
    O.mkdir(parents=True, exist_ok=True)

    spec = json.loads((HERE / "cenas.json").read_text(encoding="utf-8"))
    chap_title = {c["id"]: c["titulo"] for c in spec["capitulos"]}
    narr = {c["id"]: json.loads((N / f"{c['id']}.json").read_text(encoding="utf-8"))
            for c in spec["cenas"] if (N / f"{c['id']}.json").exists()}

    # 1) Timeline: scene durations come from the recording (or the narration, for cards).
    segs = []
    for c in spec["cenas"]:
        kind = c.get("tipo", "app")
        if kind == "app" or kind not in ("vinheta",) and not kind.startswith("cartela"):
            meta = json.loads((G / c["id"] / "cena.json").read_text(encoding="utf-8"))
            dur = meta["duracao"]
        elif kind == "vinheta":
            dur = float(c["duracao"])
        else:
            dur = 0.5 + narr[c["id"]]["duracao"] + (2.5 if c["id"] == "4.2" else 1.0)
        segs.append({"id": c["id"], "kind": kind if kind != "app" else "app", "cap": c["capitulo"],
                     "dur": dur, "demo": bool(c.get("demo")), "narr": c["id"] in narr})
    chap_dur: dict[str, float] = {}
    for s in segs:
        chap_dur[s["cap"]] = chap_dur.get(s["cap"], 0) + s["dur"]

    timeline = []
    prev_cap = None
    for s in segs:
        if s["cap"] != prev_cap and s["cap"] != "abertura":
            t = chap_title[s["cap"]]
            rot, tit = (t.split(" · ", 1) + [""])[:2] if " · " in t else ("", t)
            timeline.append({"id": "cap-" + s["cap"], "kind": "capitulo", "cap": s["cap"], "dur": CARD_S,
                             "extra": {"rotulo": rot, "titulo": tit or t, "tempo": fmt_dur(chap_dur[s["cap"]] + CARD_S)}})
        timeline.append(s)
        prev_cap = s["cap"]
    # Fades: 0.25 s out at the end of a chapter, 0.25 s in after a card (0.5 s transition).
    for i, s in enumerate(timeline):
        nxt = timeline[i + 1] if i + 1 < len(timeline) else None
        prv = timeline[i - 1] if i else None
        edge = lambda a, b: a["kind"] in ("capitulo", "vinheta") or b["kind"] in ("capitulo", "vinheta")  # noqa: E731
        s["fin"] = 0.5 if i == 0 else (FADE if edge(prv, s) else 0)
        s["fout"] = 1.2 if nxt is None else (FADE if edge(s, nxt) else 0)
    t = 0.0
    for s in timeline:
        s["start"] = t
        t += s["dur"]
    total = t
    print(f"duração total: {total:.1f} s ({fmt_dur(total)})")

    # 2) Clips.
    jobs_app, jobs_card = [], []
    for s in timeline:
        out = clips / f"{s['id']}.mp4"
        s["clip"] = str(out)
        if s["kind"] == "app":
            jobs_app.append({"dir": str(G / s["id"]), "dur": s["dur"], "demo": s["demo"], "out": str(out),
                             "fin": s["fin"], "fout": s["fout"]})
        else:
            items = card_items(s["kind"], narr.get(s["id"]), s.get("extra", {}))
            jobs_card.append({"items": items, "dur": s["dur"], "out": str(out), "fin": s["fin"], "fout": s["fout"],
                              "t0": s["start"]})
    with ProcessPoolExecutor(args.jobs) as ex:
        for p in ex.map(render_card, jobs_card):
            print("cartela", Path(p).name)
        for p in ex.map(render_scene, jobs_app):
            print("cena", Path(p).name)
    (clips / "lista.txt").write_text("".join(f"file '{s['clip']}'\n" for s in timeline), encoding="utf-8")
    video = clips / "video.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(clips / "lista.txt"),
                    "-c", "copy", str(video)], check=True)

    # 3) Audio stems.
    n = int(math.ceil(total * SR)) + SR
    voz = np.zeros(n, np.float32)
    sfx = np.zeros(n, np.float32)
    clique, confirma, trans = (read_wav(S / f"{k}.wav") for k in ("clique", "confirma", "transicao"))
    def sentence_times(s: dict) -> list[float]:
        """Scene-relative start of each sentence: as recorded (the screen may have made
        a sentence wait), or as scheduled for cards."""
        fr = narr[s["id"]]["frases"]
        if s["kind"] == "app":
            meta = json.loads((G / s["id"] / "cena.json").read_text(encoding="utf-8"))
            if meta.get("frases_t"):
                return meta["frases_t"]
        return [0.5 + f["inicio"] for f in fr]

    for s in timeline:
        if s.get("narr"):
            wav = read_wav(N / f"{s['id']}.wav")
            for f, t0 in zip(narr[s["id"]]["frases"], sentence_times(s)):
                a, b = int(f["inicio"] * SR), int(f["fim"] * SR)
                place(voz, wav[a:b], s["start"] + t0)
        if s["kind"] == "app":
            meta = json.loads((G / s["id"] / "cena.json").read_text(encoding="utf-8"))
            for c in meta["clicks"]:
                place(sfx, clique, s["start"] + c)
            for c in meta["confirms"]:
                place(sfx, confirma, s["start"] + c)
        if s["kind"] in ("capitulo", "vinheta"):
            place(sfx, trans, s["start"] + 0.05)
    tmp = HERE / "tmp/audio"
    tmp.mkdir(parents=True, exist_ok=True)
    write_wav(tmp / "voz.wav", voz)
    gv = 10 ** ((-16 - lufs(tmp / "voz.wav")) / 20)
    voz *= gv
    music = read_wav(S / "trilha.wav")[:n]
    if len(music) < n:
        music = np.pad(music, ((0, n - len(music)), (0, 0)))
    write_wav(tmp / "trilha.wav", music)
    gm = 10 ** ((-25 - lufs(tmp / "trilha.wav")) / 20)
    music = music * gm
    # Music comes up on the title, the chapter cards and the closing, and dips under speech.
    lift = np.ones(n, np.float32)
    for s in timeline:
        if s["kind"] in ("vinheta", "capitulo") or s["id"] == "4.2":
            a, b = int(s["start"] * SR), int((s["start"] + s["dur"]) * SR)
            lift[a:b] = 1.8
    k = int(0.6 * SR)
    lift = np.convolve(lift, np.ones(k) / k, mode="same").astype(np.float32)
    env = envelope(voz)
    duck = 1 - 0.45 * np.clip(env / 0.03, 0, 1)
    write_wav(tmp / "sfx.wav", sfx)
    mix = music * (lift * duck)[:, None] + (voz + sfx)[:, None]
    write_wav(tmp / "mix.wav", mix * 0.9)
    seco = music * lift[:, None] + sfx[:, None]
    write_wav(tmp / "sem_narracao.wav", seco)

    def loudnorm(src: Path, dst: Path, target: float) -> None:
        m = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af",
                            f"lowpass=f=9000,loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True).stderr
        js = json.loads(m[m.rindex("{"): m.rindex("}") + 1])
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af",
                        f"lowpass=f=9000,loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={js['input_i']}:"
                        f"measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:"
                        f"offset={js['target_offset']}:linear=true", "-ar", str(SR), "-c:a", "aac", "-b:a", "192k", str(dst)],
                       check=True)

    loudnorm(tmp / "mix.wav", tmp / "mix.m4a", -16)
    loudnorm(tmp / "sem_narracao.wav", tmp / "sem_narracao.m4a", -20)

    # 4) Subtitles.
    cues = []
    for s in timeline:
        if not s.get("narr"):
            continue
        for f, t0 in zip(narr[s["id"]]["frases"], sentence_times(s)):
            d = f["fim"] - f["inicio"]
            cues += cues_for(f["texto"], s["start"] + t0, s["start"] + t0 + d + 0.25)
    srt = "".join(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n\n" for i, (a, b, txt) in enumerate(cues, 1))
    (O / f"{NAME}.srt").write_text(srt, encoding="utf-8")

    # 5) Final files.
    full = O / f"{NAME}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(tmp / "mix.m4a"), "-i", str(O / f"{NAME}.srt"),
                    "-map", "0:v", "-map", "1:a", "-map", "2", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
                    "-metadata:s:a:0", "language=por", "-metadata:s:s:0", "language=por", "-disposition:s:0", "default",
                    "-shortest", "-movflags", "+faststart", str(full)], check=True)
    style = ("FontName=Inter,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
             "BackColour=&H99000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=22")
    srt_path = str(O / f"{NAME}.srt").replace(":", r"\:")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(tmp / "sem_narracao.m4a"),
                    "-vf", f"subtitles={srt_path}:force_style='{style}'", "-map", "0:v", "-map", "1:a",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy",
                    "-shortest", "-movflags", "+faststart", str(O / f"{NAME}_sem_narracao.mp4")], check=True)

    # 6) Chapters and the final script with the timing table.
    def mmss(x: float) -> str:
        m, s2 = divmod(int(x), 60)
        return f"{m:02d}:{s2:02d}"
    starts = {}
    for s in timeline:
        starts.setdefault(s["cap"], s["start"])
    (O / "capitulos.txt").write_text("".join(f"{mmss(starts[c['id']])} {c['titulo']}\n" for c in spec["capitulos"]),
                                     encoding="utf-8")
    rows = []
    for s in timeline:
        texto = " ".join(f["texto"] for f in narr[s["id"]]["frases"]) if s.get("narr") else (
            "(cartela: " + s.get("extra", {}).get("titulo", s["kind"]) + ")" if s["kind"] == "capitulo" else "(sem narração)")
        rows.append((s["id"], chap_title[s["cap"]], mmss(s["start"]), f"{s['dur']:.1f}", texto))
    md = ["# Roteiro final — vídeo tutorial do MaterialSelect AI\n",
          f"Duração total da versão completa: **{fmt_dur(total)}** ({total:.1f} s).\n",
          "Narração: voz sintética Piper `pt_BR-cadu-medium` (local). Valores do catálogo: demonstrativos (fictícios).\n",
          "\n## Capítulos\n\n| Capítulo | Início | Duração |\n|---|---|---|\n"]
    for c in spec["capitulos"]:
        md.append(f"| {c['titulo']} | {mmss(starts[c['id']])} | {fmt_dur(chap_dur[c['id']] + (CARD_S if c['id'] != 'abertura' else 0))} |\n")
    md.append("\n## Cenas\n\n| Cena | Capítulo | Início | Duração (s) | Narração |\n|---|---|---|---|---|\n")
    for r in rows:
        md.append("| " + " | ".join(r) + " |\n")
    (O / "roteiro-final.md").write_text("".join(md), encoding="utf-8")
    (HERE / "tmp/linha_do_tempo.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")
    print("pronto:", full)


if __name__ == "__main__":
    main()
