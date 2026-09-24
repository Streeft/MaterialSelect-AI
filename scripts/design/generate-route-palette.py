"""Generates + contrast-validates the 9 new [data-section] route palettes (D-73).

Re-implements, from the RGB stops already checked into app/globals.css, the
same OKLCH-ramp recipe the original 6 routes use (D-38/D-49): a fixed
lightness ladder per --brand-* step, a target chroma gamut-clipped to sRGB
per hue, and dark theme as the light ramp read in reverse. Run with
`python3 scripts/design/generate-route-palette.py` from the repo root (or
this directory) — stdout prints the sanity check against the known 6 routes
and the contrast table for all 16; generated_routes.json holds the raw hex.
Only the 9 new routes' output was ported into app/globals.css; the original
6 blocks are untouched.
"""

from oklch import *
import json

L_LADDER = {
 '50':0.9640,'100':0.9290,'200':0.8799,'300':0.8196,'400':0.7199,
 '500':0.6223,'600':0.5639,'700':0.4456,'800':0.3845,'900':0.3036,'950':0.2225,
}
C_TARGET = {
 '50':0.0257,'100':0.0452,'200':0.0661,'300':0.0904,'400':0.1102,
 '500':0.1310,'600':0.1310,'700':0.1209,'800':0.1006,'900':0.0807,'950':0.0610,
}
STOPS = ['50','100','200','300','400','500','600','700','800','900','950']

def in_gamut(rgb_float):
    return all(-0.0005 <= c/255.0 <= 1.0005 for c in rgb_float)

def max_chroma_rgb(L, H, C_target, tol=0.0002):
    # binary search largest C <= C_target that stays in sRGB gamut
    lo, hi = 0.0, C_target
    def rgb_at(C):
        return oklch_to_rgb(L, C, H)
    def ok(C):
        hr = __import__('math').radians(H)
        A = C*__import__('math').cos(hr); B = C*__import__('math').sin(hr)
        l_ = L + 0.3963377774*A + 0.2158037573*B
        m_ = L - 0.1055613458*A - 0.0638541728*B
        s_ = L - 0.0894841775*A - 1.2914855480*B
        l,m,s = l_**3, m_**3, s_**3
        r = +4.0767416621*l - 3.3077115913*m + 0.2309699292*s
        g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
        b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
        return all(-0.001 <= v <= 1.001 for v in (r,g,b))
    if ok(hi):
        return hi
    while hi - lo > tol:
        mid = (lo+hi)/2
        if ok(mid):
            lo = mid
        else:
            hi = mid
    return lo

def gen_light_ramp(H):
    ramp = {}
    for s in STOPS:
        L = L_LADDER[s]
        C = max_chroma_rgb(L, H, C_TARGET[s])
        ramp[s] = oklch_to_rgb(L, C, H)
    return ramp

def invert_ramp(light):
    order = STOPS
    rev = list(reversed(order))
    return {order[i]: light[rev[i]] for i in range(len(order))}

def gen_accent_light(H, white=(255,255,255), min_contrast=5.5):
    C = 0.11
    for Lx in [0.50, 0.49, 0.48, 0.47, 0.46, 0.45, 0.44, 0.43, 0.42]:
        Cc = max_chroma_rgb(Lx, H, C)
        rgb = oklch_to_rgb(Lx, Cc, H)
        if contrast(rgb, white) >= min_contrast:
            return rgb
    # fallback: darkest tried
    Cc = max_chroma_rgb(0.42, H, C)
    return oklch_to_rgb(0.42, Cc, H)

def gen_accent_dark(H):
    C = max_chroma_rgb(0.80, H, 0.11)
    return oklch_to_rgb(0.80, C, H)

def rgbstr(rgb):
    return '%d %d %d' % rgb

def hexstr(rgb):
    return rgb_to_hex(rgb)

ROUTE_HUES = {
 'selecao': 300, 'mapas': 185, 'comparar': 350, 'catalogo': 225, 'painel': 40, 'importar': 150,
 # New routes (D-73): OKLCH hue angles chosen empirically so the resulting
 # *output* HSL hue (what a viewer actually perceives) clears the existing
 # six and each other by >=15 degrees -- OKLCH angle and perceived hue are
 # not the same scale, especially in the yellow/green band, so picking these
 # by OKLCH angle alone (as an earlier pass here did) put custo and painel,
 # and eco and importar, too close together. Two are semantic, not just
 # spaced: custo must read as orange, eco must read as green (both asked
 # for explicitly).
 'dimensionar': 110, 'custo': 80, 'eco': 140, 'baterias': 130, 'processos': 250,
 'sintetizar': 270, 'meus-registros': 320, 'classes': 330, 'propriedades': 20,
}

result = {}
for route, H in ROUTE_HUES.items():
    light = gen_light_ramp(H)
    dark = invert_ramp(light)
    accent_l = gen_accent_light(H)
    accent_fg_l = (255,255,255) if contrast(accent_l,(255,255,255)) >= 4.5 else (23,26,33)
    accent_d = gen_accent_dark(H)
    accent_fg_d = (20,22,28)
    result[route] = dict(H=H, light=light, dark=dark, accent_l=accent_l, accent_fg_l=accent_fg_l,
                          accent_d=accent_d, accent_fg_d=accent_fg_d)

# Validate against KNOWN existing routes to sanity check the recipe reproduces close results
KNOWN_ACCENT_L = {
 'selecao': (115,89,158), 'mapas': (0,107,96), 'comparar': (151,76,114),
 'catalogo': (0,111,146), 'painel': (144,69,41), 'importar': (29,104,53),
}
print("=== sanity check vs existing 6 routes ===")
for r,expected in KNOWN_ACCENT_L.items():
    got = result[r]['accent_l']
    print(r, 'expected', expected, 'got', got, 'dE~', sum(abs(a-b) for a,b in zip(expected,got)))

print()
print("=== contrast validation, all 16 (new 10 + reused 6) ===")
white=(255,255,255)
surface_dark=(20,22,28)
fails = []
for r,d in result.items():
    c1 = contrast(d['accent_l'], white)
    c2 = contrast(d['light']['700'], d['light']['50'])
    c3 = contrast(d['accent_d'], surface_dark)
    c4 = contrast(d['dark']['700'], d['dark']['50'])
    ok = c1>=4.5 and c2>=4.5 and c3>=4.5 and c4>=4.5
    print(f"{r:16s} accent/white={c1:.2f} brand700/50(light)={c2:.2f} accent/surface(dark)={c3:.2f} brand700/50(dark)={c4:.2f} {'OK' if ok else 'FAIL'}")
    if not ok:
        fails.append(r)
print("FAILS:", fails)

json.dump({r: {
    'H': d['H'],
    'light': {s: hexstr(d['light'][s]) for s in STOPS},
    'dark': {s: hexstr(d['dark'][s]) for s in STOPS},
    'accent_l': hexstr(d['accent_l']), 'accent_fg_l': hexstr(d['accent_fg_l']),
    'accent_d': hexstr(d['accent_d']), 'accent_fg_d': hexstr(d['accent_fg_d']),
} for r,d in result.items()}, open('generated_routes.json','w'), indent=2)
print("written generated_routes.json")
