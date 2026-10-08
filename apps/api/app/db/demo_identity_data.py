"""Fictitious designations and compositions for the demo catalogue (D-105).

⚠️  Dados exclusivamente demonstrativos. Não utilizar em projetos reais.

This is data in Python on purpose, and it does not violate principle 1 (no
invented material properties): every row it feeds is written with
``is_demo=True`` through ``app.db.seed_extended_identity``, which
``python -m app.db.seed_extended`` — the module ``semear_demo`` runs — calls
(docs/15). ``clear_demo`` removes every one of them by that mark.

What the numbers are, and are not:

* **Metals** carry mass-percent ranges, maxima, minima, nominals and a balance,
  in the *order of magnitude* a public specification writes for that family of
  alloy, altered on purpose. They come from nowhere citable — not from ASM,
  MatWeb, Total Materia, Granta or the Cérebro — and no row claims that this
  material *is* the alloy its name recalls.
* **Polymers, ceramics, composites and elastomers** are written by element, the
  only form the model accepts (D-105). The main elements follow the repeat unit
  or the oxide formula of the family (textbook stoichiometry, widened into a
  range for additives and process variation), carbon or oxygen is declared
  **balance**, never computed, and a few elements the "source" did not give are
  declared **absent** (``=missing``) instead of getting a number. No phase,
  filler content or additive package is invented beyond a ``<=`` ceiling.
* **Designations** all start with ``DEMO-`` (trade names with ``Demo``): a real
  code pasted on a fictitious material would assert it *is* that material.
  Nothing here states an equivalence between two designations (that is TM1).

Grammar of a composition string, one token per element, separated by spaces::

    Fe=balance        # "resto": declared, never computed
    Mo=missing        # the source gave no value for this element
    C<=0.07           # maximum only          Cu>=99.9   # minimum only
    Cr=17.5-19.5      # range                 Mg=0.8-1.2~1.0   # range + nominal
    Au=75.0           # nominal only          Ti<=1500ppm      # unit suffix

Mass percent unless the suffix says ``ppm``. A designation is
``SYSTEM:CODE`` or ``SYSTEM:CODE@region``, SYSTEM being a ``DesignationSystem``
name.
"""

from __future__ import annotations

import re

from app.models.enums import DesignationSystem

#: Only the materials that do not already carry the row in ``app.db.seed``
#: (Alumínio Demo A and Aço Demo B have both; Polímero Demo C has a trade-name
#: designation and gets its composition here).
DESIGNATIONS: dict[str, tuple[str, ...]] = {
    # --- the three baseline materials that lacked identity -----------------
    "Cerâmica Demo D": ("ISO:DEMO-OXIDO-D", "COMERCIAL:Democeram D"),
    "Compósito Demo E": ("ISO:DEMO-LAMINADO-E", "COMERCIAL:Democomp E"),
    # --- metals --------------------------------------------------------------
    "Liga de Alumínio 6061-T6": ("UNS:DEMO-A96061", "ABNT:DEMO-6061-T6", "COMERCIAL:Demoluma 6061"),
    "Aço Carbono 1045": ("AISI_SAE:DEMO-1045", "UNS:DEMO-G10450", "ABNT:DEMO-1045"),
    "Aço Inoxidável 316L": ("AISI_SAE:DEMO-316L", "UNS:DEMO-S31603", "EN:DEMO-1.4404@Europa"),
    "Aço Ferramenta D2": ("AISI_SAE:DEMO-D2", "DIN:DEMO-X153CrMoV12@Alemanha"),
    "Bronze Fosforoso": ("UNS:DEMO-C51000", "COMERCIAL:Demobronze P5"),
    "Latão Cartucho 70/30": ("UNS:DEMO-C26000", "ISO:DEMO-CuZn30"),
    "Liga de Titânio Ti-6Al-4V": ("UNS:DEMO-R56400", "ASTM:DEMO-GR5"),
    "Superliga Inconel 718": ("UNS:DEMO-N07718", "COMERCIAL:Demoliga 718"),
    "Liga de Magnésio AZ31B": ("ASTM:DEMO-AZ31B", "UNS:DEMO-M11311"),
    "Zamak 3": ("UNS:DEMO-Z33520", "COMERCIAL:Demozamak 3"),
    "Tungstênio Puro": ("ASTM:DEMO-W1", "COMERCIAL:Demotungstênio W-1"),
    "Ferro Fundido Cinzento FC250": ("ISO:DEMO-250", "ABNT:DEMO-FC250"),
    "Ferro Fundido Nodular FE500": ("ISO:DEMO-500-7", "ABNT:DEMO-FE500"),
    "Cobre Eletrolítico (ETP)": ("UNS:DEMO-C11000", "ISO:DEMO-CuETP"),
    "Aço Inoxidável Martensítico 420": (
        "AISI_SAE:DEMO-420",
        "UNS:DEMO-S42000",
        "EN:DEMO-1.4021@Europa",
    ),
    "Aço Estrutural A36": ("ASTM:DEMO-A36", "UNS:DEMO-K02600"),
    "Aço Maraging 250": ("ASTM:DEMO-18Ni250", "UNS:DEMO-K92890"),
    "Liga de Alumínio 7075-T6": ("UNS:DEMO-A97075", "ABNT:DEMO-7075-T6"),
    "Ouro 18K": ("COMERCIAL:Demoouro 750", "ISO:DEMO-AU750"),
    "Prata de Lei": ("COMERCIAL:Demoprata 925", "ISO:DEMO-AG925"),
    # --- polymers ------------------------------------------------------------
    "Polietileno de Alta Densidade (PEAD)": ("ISO:DEMO-PE-HD", "COMERCIAL:Demolene HD"),
    "Polipropileno (PP)": ("ISO:DEMO-PP", "COMERCIAL:Demopropil"),
    "Policloreto de Vinila (PVC)": ("ISO:DEMO-PVC", "COMERCIAL:Demovinil"),
    "Poliestireno (PS)": ("ISO:DEMO-PS", "COMERCIAL:Demoestireno"),
    "Acrilonitrila Butadieno Estireno (ABS)": ("ISO:DEMO-ABS", "COMERCIAL:Demoabs"),
    "Policarbonato (PC)": ("ISO:DEMO-PC", "COMERCIAL:Democarbon PC"),
    "Poli(metacrilato de metila) (PMMA)": ("ISO:DEMO-PMMA", "COMERCIAL:Demoacrílico"),
    "Poliamida 6 (Nylon 6)": ("ISO:DEMO-PA6", "COMERCIAL:Demonylon 6"),
    "Poli(tereftalato de etileno) (PET)": ("ISO:DEMO-PET", "COMERCIAL:Demopet"),
    "Politetrafluoretileno (PTFE)": ("ISO:DEMO-PTFE", "COMERCIAL:Demoflon"),
    "Poliacetal (POM)": ("ISO:DEMO-POM", "COMERCIAL:Demoacetal"),
    "Resina Epóxi Padrão": ("ISO:DEMO-EP", "COMERCIAL:Demoxi 100"),
    "Resina Fenólica": ("ISO:DEMO-PF", "COMERCIAL:Demofenol"),
    "Poliéster Insaturado": ("ISO:DEMO-UP", "COMERCIAL:Demoéster UP"),
    "Poli-éter-éter-cetona (PEEK)": ("ISO:DEMO-PEEK", "COMERCIAL:Demopeek"),
    "Polieterimida (PEI)": ("ISO:DEMO-PEI", "COMERCIAL:Demoimida"),
    "Polissulfona (PSU)": ("ISO:DEMO-PSU", "COMERCIAL:Demosulfona"),
    "Poliamida 66 (Nylon 66)": ("ISO:DEMO-PA66", "COMERCIAL:Demonylon 66"),
    # --- ceramics ------------------------------------------------------------
    "Alumina (Al2O3) 99%": ("ISO:DEMO-AL2O3-99", "COMERCIAL:Demoalumina 99"),
    "Zircônia Estabilizada com Ítrio (YSZ)": ("ISO:DEMO-YSZ", "COMERCIAL:Demozircônia Y"),
    "Carbeto de Silício (SiC)": ("ISO:DEMO-SIC", "COMERCIAL:Demosic"),
    "Nitreto de Silício (Si3N4)": ("ISO:DEMO-SI3N4", "COMERCIAL:Demonitreto S"),
    "Carbeto de Tungstênio (WC)": ("ISO:DEMO-WC", "COMERCIAL:Demowidia"),
    "Vidro Borossilicato": ("ISO:DEMO-BOROSSILICATO", "COMERCIAL:Demovidro B"),
    "Vidro Soda-Cal": ("ISO:DEMO-SODA-CAL", "COMERCIAL:Demovidro SC"),
    "Porcelana Elétrica": ("ISO:DEMO-PORCELANA-E", "COMERCIAL:Demoporcelana"),
    "Mulita": ("ISO:DEMO-MULITA", "COMERCIAL:Demomulita"),
    "Cordierita": ("ISO:DEMO-CORDIERITA", "COMERCIAL:Democordierita"),
    "Cerâmica Piezoelétrica (PZT)": ("ISO:DEMO-PZT", "COMERCIAL:Demopiezo"),
    "Sialon": ("ISO:DEMO-SIALON", "COMERCIAL:Demosialon"),
    # --- composites ----------------------------------------------------------
    "CFRP (Fibras de Carbono Contínuas)": ("ISO:DEMO-CFRP", "COMERCIAL:Democarbono UD"),
    "GFRP (Fibras de Vidro-E)": ("ISO:DEMO-GFRP", "COMERCIAL:Demofibra E"),
    "Compósito Aramida (Kevlar) / Epóxi": ("ISO:DEMO-AFRP", "COMERCIAL:Demoaramida"),
    "Compósito de Boro / Alumínio": ("ISO:DEMO-BAL", "COMERCIAL:Demoboro Al"),
    "Concreto Armado Padrão": ("ABNT:DEMO-C30", "COMERCIAL:Democoncreto"),
    "Madeira Compensada (Pinho)": ("ABNT:DEMO-COMPENSADO-PINHO", "COMERCIAL:Demolaminado P"),
    "Cermet (WC-Co)": ("ISO:DEMO-WC-CO", "COMERCIAL:Democermet"),
    "Compósito Carbono-Carbono (C/C)": ("ISO:DEMO-CC", "COMERCIAL:Democarbono C/C"),
    "Compósito Basalto / Epóxi": ("ISO:DEMO-BFRP", "COMERCIAL:Demobasalto"),
    "Compósito de Vidro-S / Epóxi": ("ISO:DEMO-SGFRP", "COMERCIAL:Demovidro S"),
    "Compósito Linho / Resina Bio": ("ISO:DEMO-LINHO-BIO", "COMERCIAL:Demolinho"),
    "Compósito Matriz Cerâmica (SiC/SiC)": ("ISO:DEMO-CMC", "COMERCIAL:Demosic/sic"),
    # --- elastomers ----------------------------------------------------------
    "Borracha Natural (NR)": ("ISO:DEMO-NR", "COMERCIAL:Demoborracha N"),
    "Silicone (VMQ)": ("ISO:DEMO-VMQ", "COMERCIAL:Demosilicone"),
    "Neoprene (CR)": ("ISO:DEMO-CR", "COMERCIAL:Demopreno"),
    "Borracha Nitrílica (NBR)": ("ISO:DEMO-NBR", "COMERCIAL:Demonitrila"),
    "EPDM": ("ISO:DEMO-EPDM", "COMERCIAL:Demoepdm"),
    "Poliuretano Termoplástico (TPU)": ("ISO:DEMO-TPU", "COMERCIAL:Demoteepu"),
    "Fluorelastômero (FKM)": ("ISO:DEMO-FKM", "COMERCIAL:Demofluor"),
    "Borracha Estireno-Butadieno (SBR)": ("ISO:DEMO-SBR", "COMERCIAL:Demosbr"),
}

COMPOSITIONS: dict[str, str] = {
    # --- baseline materials that lacked it -----------------------------------
    "Polímero Demo C": "C=balance H=13.2-14.8 Ca<=1.5 Fe=missing",
    "Cerâmica Demo D": "O=balance Al=49.0-53.0 Si<=0.4 Ca<=0.1 Fe=missing",
    "Compósito Demo E": "C=balance H=2.0-4.0 N=1.0-3.0 O=6.0-12.0",
    # --- metals --------------------------------------------------------------
    "Liga de Alumínio 6061-T6": (
        "Al=balance Si=0.5-0.9 Fe<=0.7 Cu=0.2-0.4 Mn<=0.15 Mg=0.9-1.3~1.1 "
        "Cr=0.05-0.30 Zn<=0.3 Ti<=1200ppm"
    ),
    "Aço Carbono 1045": "Fe=balance C=0.42-0.51 Mn=0.55-0.95 Si<=0.35 P<=0.04 S<=0.05",
    "Aço Inoxidável 316L": (
        "Fe=balance C<=0.03 Mn<=2.0 Si<=0.8 P<=0.04 S<=0.03 Cr=16.0-18.5 "
        "Ni=10.0-13.0 Mo=2.0-2.8 N<=0.12"
    ),
    "Aço Ferramenta D2": "Fe=balance C=1.45-1.60 Cr=11.0-12.5 Mo=0.7-1.0 V=0.8-1.0 Mn<=0.6 Si<=0.6",
    "Bronze Fosforoso": "Cu=balance Sn=4.5-5.8 P=0.03-0.35 Zn<=0.3 Fe<=0.1 Pb<=0.05",
    "Latão Cartucho 70/30": "Zn=balance Cu=68.5-71.5 Pb<=0.07 Fe<=0.05",
    "Liga de Titânio Ti-6Al-4V": (
        "Ti=balance Al=5.5-6.8 V=3.5-4.5 Fe<=0.25 O<=0.20 C<=0.08 N<=0.05 H<=150ppm"
    ),
    "Superliga Inconel 718": (
        "Fe=balance Ni=50.0-55.0 Cr=17.0-21.0 Nb=4.75-5.5 Mo=2.8-3.3 Ti=0.65-1.15 "
        "Al=0.2-0.8 Co<=1.0 C<=0.08"
    ),
    "Liga de Magnésio AZ31B": "Mg=balance Al=2.5-3.5 Zn=0.6-1.4 Mn=0.2-1.0 Si<=0.1 Ca<=0.04 Cu<=0.05",
    "Zamak 3": "Zn=balance Al=3.5-4.3 Mg=0.02-0.05 Cu<=0.25 Fe<=0.1 Pb<=50ppm",
    "Tungstênio Puro": "W>=99.9 Mo<=0.01 Fe<=50ppm",
    "Ferro Fundido Cinzento FC250": "Fe=balance C=3.0-3.5 Si=1.8-2.5 Mn=0.5-0.9 P<=0.2 S<=0.12",
    "Ferro Fundido Nodular FE500": (
        "Fe=balance C=3.4-3.9 Si=2.2-2.8 Mn<=0.4 Mg=0.03-0.06 P<=0.08 S<=0.02"
    ),
    "Cobre Eletrolítico (ETP)": "Cu>=99.9 O=0.02-0.04 Bi<=5ppm Pb<=10ppm",
    "Aço Inoxidável Martensítico 420": (
        "Fe=balance C=0.15-0.40 Cr=12.0-14.0 Mn<=1.0 Si<=1.0 P<=0.04 S<=0.03 Mo=missing"
    ),
    "Aço Estrutural A36": "Fe=balance C<=0.26 Mn=0.6-1.2 Si<=0.4 P<=0.04 S<=0.05 Cu>=0.2",
    "Aço Maraging 250": "Fe=balance Ni=17.0-19.0 Co=7.0-8.5 Mo=4.6-5.2 Ti=0.3-0.5 Al=0.05-0.15 C<=0.03",
    "Liga de Alumínio 7075-T6": (
        "Al=balance Zn=5.1-6.1 Mg=2.1-2.9 Cu=1.2-2.0 Cr=0.18-0.28 Fe<=0.5 Si<=0.4 "
        "Mn<=0.3 Ti<=0.2"
    ),
    "Ouro 18K": "Ag=balance Au=74.0-76.0~75.0 Cu=10.0-15.0 Zn<=2.0",
    "Prata de Lei": "Cu=balance Ag=92.0-93.0~92.5 Zn<=0.5",
    # --- polymers (C balance; main heteroatoms by range around the repeat unit)
    "Polietileno de Alta Densidade (PEAD)": "C=balance H=13.5-14.8",
    "Polipropileno (PP)": "C=balance H=13.5-14.8 Ti<=0.5",
    "Policloreto de Vinila (PVC)": "C=balance H=4.2-5.2 Cl=54.0-58.0 Ca<=2.0 Ti<=3.0",
    "Poliestireno (PS)": "C=balance H=7.3-8.1",
    "Acrilonitrila Butadieno Estireno (ABS)": "C=balance H=7.5-8.7 N=4.0-7.5",
    "Policarbonato (PC)": "C=balance H=5.0-5.9 O=17.5-19.8",
    "Poli(metacrilato de metila) (PMMA)": "C=balance H=7.7-8.5 O=30.5-32.8",
    "Poliamida 6 (Nylon 6)": "C=balance H=9.4-10.2 N=11.5-13.0 O=13.0-15.0",
    "Poli(tereftalato de etileno) (PET)": "C=balance H=3.8-4.6 O=31.5-34.5",
    "Politetrafluoretileno (PTFE)": "C=balance F=74.0-76.5",
    "Poliacetal (POM)": "C=balance H=6.2-7.2 O=51.5-54.5",
    "Resina Epóxi Padrão": "C=balance H=6.5-7.7 O=17.0-20.0 N=missing",
    "Resina Fenólica": "C=balance H=5.2-6.2 O=14.0-16.5",
    "Poliéster Insaturado": "C=balance H=4.4-5.4 O=36.0-40.0",
    "Poli-éter-éter-cetona (PEEK)": "C=balance H=3.8-4.6 O=15.5-17.5",
    "Polieterimida (PEI)": "C=balance H=3.7-4.5 N=4.2-5.2 O=15.0-17.5",
    "Polissulfona (PSU)": "C=balance H=4.5-5.5 O=13.5-15.5 S=6.5-7.8",
    "Poliamida 66 (Nylon 66)": "C=balance H=9.4-10.2 N=11.5-13.0 O=13.0-15.0",
    # --- ceramics (O or the anion declared balance) --------------------------
    "Alumina (Al2O3) 99%": "O=balance Al=51.0-53.0 Si<=0.3 Na<=0.1 Ca<=0.1 Mg<=0.1",
    "Zircônia Estabilizada com Ítrio (YSZ)": "O=balance Zr=62.0-65.0 Y=9.5-11.5 Hf<=1.5 Al<=0.05",
    "Carbeto de Silício (SiC)": "C=balance Si=68.0-70.5 O<=1.0 Fe<=0.1",
    "Nitreto de Silício (Si3N4)": "N=balance Si=58.0-60.0 Y=1.0-4.0 O<=2.5 Al<=1.5",
    "Carbeto de Tungstênio (WC)": "W=balance C=5.9-6.2 Fe<=0.1",
    "Vidro Borossilicato": "O=balance Si=35.0-38.5 B=3.2-4.2 Na=2.2-3.2 Al=0.8-1.6 K<=1.0",
    "Vidro Soda-Cal": "O=balance Si=32.0-35.0 Na=8.5-10.5 Ca=4.5-6.5 Mg=1.5-3.0 Al=0.3-1.2 K<=1.0",
    "Porcelana Elétrica": "O=balance Si=26.0-31.0 Al=14.0-19.0 K=1.5-3.5 Na<=1.0 Ca<=0.5 Fe<=1.0",
    "Mulita": "O=balance Al=36.0-39.5 Si=12.0-14.0 Fe<=0.5 Ti<=0.3",
    "Cordierita": "O=balance Mg=7.5-8.8 Al=17.5-19.5 Si=22.5-25.0 Fe<=1.0",
    "Cerâmica Piezoelétrica (PZT)": "O=balance Pb=61.5-65.0 Zr=13.0-15.5 Ti=6.5-8.0 Sr=missing",
    "Sialon": "N=balance Si=38.0-41.0 Al=17.5-20.0 O=10.0-12.5 Y<=3.0",
    # --- composites (fibre + matrix, by element) -----------------------------
    "CFRP (Fibras de Carbono Contínuas)": "C=balance H=1.0-3.0 N=0.5-2.5 O=3.0-8.0",
    "GFRP (Fibras de Vidro-E)": (
        "O=balance Si=14.0-19.0 Ca=5.0-8.5 Al=3.0-5.5 C=14.0-24.0 H=1.5-3.0 B<=2.0 Mg<=1.0"
    ),
    "Compósito Aramida (Kevlar) / Epóxi": "C=balance H=4.0-5.5 N=5.0-9.0 O=8.0-14.0",
    "Compósito de Boro / Alumínio": "Al=balance B=38.0-48.0 W<=2.5 Fe<=0.2",
    "Concreto Armado Padrão": (
        "O=balance Ca=6.0-14.0 Si=14.0-24.0 Al=1.0-4.0 Fe=1.5-4.0 Mg<=1.5 S<=0.5 "
        "C=0.5-2.0 H=0.5-1.0"
    ),
    "Madeira Compensada (Pinho)": "O=balance C=47.0-51.0 H=5.6-6.4 N=0.1-0.5",
    "Cermet (WC-Co)": "W=balance Co=8.0-12.0~10.0 C=5.0-6.0 Cr<=0.5",
    "Compósito Carbono-Carbono (C/C)": "C>=98.0 Si<=1.0 H<=0.1 O<=0.5",
    "Compósito Basalto / Epóxi": (
        "C=balance O=24.0-32.0 Si=9.0-15.0 Al=2.5-5.0 Fe=2.0-5.0 Ca=2.0-4.5 Mg=1.0-2.5 H=2.0-4.0"
    ),
    "Compósito de Vidro-S / Epóxi": "C=balance O=25.0-35.0 Si=14.0-18.0 Al=6.0-9.0 Mg=2.5-4.5 H=2.0-4.0",
    "Compósito Linho / Resina Bio": "C=balance H=5.5-6.5 O=34.0-42.0 N=0.2-1.0",
    "Compósito Matriz Cerâmica (SiC/SiC)": "Si=balance C=29.0-31.5 O<=1.0 B<=0.5",
    # --- elastomers ----------------------------------------------------------
    "Borracha Natural (NR)": "C=balance H=11.0-12.2 S<=2.5 Zn<=3.0",
    "Silicone (VMQ)": "O=balance Si=36.0-39.0 C=30.0-34.0 H=7.5-8.8",
    "Neoprene (CR)": "C=balance H=5.0-6.2 Cl=36.0-41.0 Mg<=4.0 Zn<=5.0",
    "Borracha Nitrílica (NBR)": "C=balance H=8.0-9.5 N=4.5-13.0 S<=2.0",
    "EPDM": "C=balance H=13.5-14.4 S<=1.0 Zn<=3.0",
    "Poliuretano Termoplástico (TPU)": "C=balance H=8.2-9.6 N=4.5-6.5 O=17.0-23.0",
    "Fluorelastômero (FKM)": "C=balance F=64.0-69.0 H=1.2-2.0 Ca<=3.0 Mg<=3.0",
    "Borracha Estireno-Butadieno (SBR)": "C=balance H=8.4-9.4 S<=2.0 Zn<=3.0",
}

_TOKEN = re.compile(
    r"""^(?P<el>[A-Z][a-z]?)
        (?:
            =(?P<body>balance|missing|[\d.]+(?:-[\d.]+)?(?:~[\d.]+)?)
          |
            (?P<op><=|>=)(?P<limit>[\d.]+)
        )
        (?P<unit>ppm)?$""",
    re.VERBOSE,
)


class DemoIdentityDataError(ValueError):
    """A string in this module that the grammar above cannot read."""


def parse_designation(raw: str) -> dict:
    """``"EN:DEMO-1.4404@Europa"`` -> the dict ``_seed_demo_identity`` reads."""
    system, _, rest = raw.partition(":")
    code, _, region = rest.partition("@")
    try:
        enum_system = DesignationSystem[system]
    except KeyError as exc:
        raise DemoIdentityDataError(f"Sistema de designação desconhecido: {raw!r}") from exc
    if not code:
        raise DemoIdentityDataError(f"Designação sem código: {raw!r}")
    return {"system": enum_system, "code": code, "region": region or None}


def parse_composition(raw: str) -> list[dict]:
    """``"Fe=balance C<=0.07 Cr=17.5-19.5"`` -> the dicts ``_seed_demo_identity`` reads."""
    entries: list[dict] = []
    for token in raw.split():
        match = _TOKEN.match(token)
        if match is None:
            raise DemoIdentityDataError(f"Token de composição ilegível: {token!r}")
        element = match["el"]
        unit = match["unit"] or "%"
        if match["op"] == "<=":
            entries.append({"element": element, "max": float(match["limit"]), "unit": unit})
        elif match["op"] == ">=":
            entries.append({"element": element, "min": float(match["limit"]), "unit": unit})
        elif match["body"] == "balance":
            entries.append({"element": element, "balance": True})
        elif match["body"] == "missing":
            entries.append({"element": element, "missing": True})
        else:
            body = match["body"]
            body, _, nominal = body.partition("~")
            low, dash, high = body.partition("-")
            spec: dict = {"element": element, "unit": unit}
            if dash:
                spec["min"], spec["max"] = float(low), float(high)
                if nominal:
                    spec["nominal"] = float(nominal)
            else:
                spec["nominal"] = float(low)
            entries.append(spec)
    return entries


def designation_table() -> dict[str, list[dict]]:
    return {name: [parse_designation(raw) for raw in rows] for name, rows in DESIGNATIONS.items()}


def composition_table() -> dict[str, list[dict]]:
    return {name: parse_composition(raw) for name, raw in COMPOSITIONS.items()}
