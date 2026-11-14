"""Hand check of the two sizing cases shown in the video (scene V1).

For each case the app's answer (POST /api/solver/resolver, 50 materials) is compared
with a recomputation done here, from the values exactly as the catalog stores them
(original value + original unit), exact unit factors and 50-digit decimal arithmetic:

  tie    m = S · L² · ρ / E
  plate  m = (12 · S · L⁶ · w² / C)^(1/3) · ρ / E^(1/3)

The largest relative difference is what scene V1 shows. It is floating-point rounding
(machine epsilon ≈ 2.2 × 10⁻¹⁶): e.g. 3.9 g/cm³ is stored as 3899.9999999999995 kg/m³.

Reads the LOCAL recording database read-only; refuses any non-local API.
Usage: python verificar_casos.py --db gravacao.db [--api http://127.0.0.1:8811] [--saida verificacao.json]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import urllib.request
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 50
COOKIE = "msai_session=video-banca-local-session-0001"
# Exact factors to SI (by definition, not floats).
TO_SI = {
    "kg/m**3": Decimal(1),
    "g/cm**3": Decimal(1000),
    "Mg/m**3": Decimal(1000),
    "Pa": Decimal(1),
    "MPa": Decimal(10) ** 6,
    "GPa": Decimal(10) ** 9,
}
CASES = {
    "tirante": {"case_key": "tirante-rigidez", "inputs": {"comprimento": 0.5, "rigidez": 2e7}},
    "placa": {"case_key": "placa-rigidez", "inputs": {"comprimento": 0.4, "largura": 0.3, "rigidez": 5000, "constante_apoio": 48}},
}


def solve(api: str, body: dict) -> dict:
    req = urllib.request.Request(
        api + "/api/solver/resolver",
        data=json.dumps({**body, "limit": 50}).encode(),
        headers={"Content-Type": "application/json", "Cookie": COOKIE},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def value(db: sqlite3.Connection, material_id: int, slug: str) -> Decimal:
    row = db.execute(
        "select v.value_scalar, v.original_unit from material_property_value v "
        "join property_definition pd on pd.id = v.property_id "
        "where v.material_id = ? and pd.slug = ? and v.is_missing = 0",
        (material_id, slug),
    ).fetchone()
    if row is None or row[0] is None:
        raise LookupError(f"{material_id}: sem {slug}")
    # Decimal(str(x)) is the number the source wrote (2.7, not 2.70000000000000017…).
    return Decimal(str(row[0])) * TO_SI[row[1]]


def cbrt(x: Decimal) -> Decimal:
    return (x.ln() / 3).exp()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--api", default="http://127.0.0.1:8811")
    ap.add_argument("--saida", default=str(Path(__file__).resolve().parents[3] / ".." / "motion" / "src" / "verificacao.json"))
    args = ap.parse_args()
    if "127.0.0.1" not in args.api and "localhost" not in args.api:
        raise SystemExit("Recusado: só contra a API local de gravação.")
    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    report = {}
    for name, body in CASES.items():
        res = solve(args.api, body)
        x = {k: Decimal(str(v)) for k, v in body["inputs"].items()}
        worst = Decimal(0)
        n = 0
        for rec in res["solved"]:
            rho = value(db, rec["record_id"], "densidade")
            e = value(db, rec["record_id"], "modulo_young")
            if name == "tirante":
                m = x["rigidez"] * x["comprimento"] ** 2 * rho / e
            else:
                k = cbrt(12 * x["rigidez"] * x["comprimento"] ** 6 * x["largura"] ** 2 / x["constante_apoio"])
                m = k * rho / cbrt(e)
            app = Decimal(repr(rec["objective_value"]))
            rel = abs(app - m) / m
            worst = max(worst, rel)
            n += 1
        mant, exp = f"{worst:.1E}".split("E")
        report[name] = {"materiais": n, "maior_diferenca_relativa": float(worst), "texto": f"{mant.replace('.', ',')} × 10{''.join('⁰¹²³⁴⁵⁶⁷⁸⁹'[int(d)] if d.isdigit() else '⁻' for d in str(int(exp)))}"}
        print(f"{name}: {n} materiais, maior diferença relativa {worst:.3E}")
    out = {"tirante": report["tirante"]["texto"], "placa": report["placa"]["texto"], "detalhe": report}
    Path(args.saida).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("gravado em", args.saida)


if __name__ == "__main__":
    main()
