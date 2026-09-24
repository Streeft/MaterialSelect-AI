"""Re-reads apps/web/app/globals.css and checks WCAG contrast for all 16
[data-section] routes x 2 themes, against the file as it actually is on
disk -- not against generator output, which could differ from what was
transcribed. Checks: --accent vs white(light)/near-black(dark surface),
and --brand-700 vs --brand-50 (both themes). Floor: 4.5:1 (text).
"""
import re
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from oklch import contrast

CSS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "web", "app", "globals.css")

def parse_blocks(css: str):
    # Each block: selector { ...declarations... }
    blocks = {}
    for m in re.finditer(r'((?:\[data-theme="dark"\])?\[data-section="([\w-]+)"\])\s*\{([^}]*)\}', css):
        selector, section, body = m.groups()
        dark = 'data-theme="dark"' in selector
        vars_ = {}
        for vm in re.finditer(r'--([\w-]+):\s*([^;]+);', body):
            vars_[vm.group(1)] = vm.group(2).strip()
        blocks[(section, dark)] = vars_
    return blocks

def parse_root(css: str, dark: bool):
    if dark:
        m = re.search(r'\[data-theme="dark"\]\s*\{([^}]*)\}', css)
    else:
        m = re.search(r':root,\s*\n?\[data-theme="light"\]\s*\{([^}]*)\}', css)
    vars_ = {}
    for vm in re.finditer(r'--([\w-]+):\s*([^;]+);', m.group(1)):
        vars_[vm.group(1)] = vm.group(2).strip()
    return vars_

def rgb_triple(s: str):
    parts = s.split()
    return tuple(int(p) for p in parts[:3])

def main():
    css = open(CSS_PATH).read()
    blocks = parse_blocks(css)
    root_light = parse_root(css, False)
    root_dark = parse_root(css, True)

    sections = sorted({s for s, _ in blocks.keys()})
    white = (255, 255, 255)
    surface_dark = rgb_triple(root_dark["surface"])

    fails = []
    print(f"{'route':16s} {'accent/white(L)':>16s} {'700/50(L)':>10s} {'accent/surf(D)':>16s} {'700/50(D)':>10s}")
    for s in sections:
        light = {**root_light, **blocks.get((s, False), {})}
        dark = {**root_dark, **blocks.get((s, True), {})}
        al = rgb_triple(light["accent"])
        b700l = rgb_triple(light["brand-700"])
        b50l = rgb_triple(light["brand-50"])
        ad = rgb_triple(dark["accent"])
        b700d = rgb_triple(dark["brand-700"])
        b50d = rgb_triple(dark["brand-50"])

        c1 = contrast(al, white)
        c2 = contrast(b700l, b50l)
        c3 = contrast(ad, surface_dark)
        c4 = contrast(b700d, b50d)
        ok = min(c1, c2, c3, c4) >= 4.5
        print(f"{s:16s} {c1:16.2f} {c2:10.2f} {c3:16.2f} {c4:10.2f} {'OK' if ok else 'FAIL <<<<'}")
        if not ok:
            fails.append(s)

    print()
    print(f"{len(sections)} routes checked, {len(fails)} failing 4.5:1 floor.")
    if fails:
        print("FAILED:", fails)
        sys.exit(1)
    print("All routes pass.")

if __name__ == "__main__":
    main()
