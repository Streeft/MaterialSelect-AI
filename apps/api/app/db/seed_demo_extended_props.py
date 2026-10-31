"""Fictitious values of the extended catalogue on every demo material (D-188).

The 33 numeric definitions of ``app.db.property_catalog_extended`` and twelve
ordinal ones (durability against nine agents, flammability, transparency and
biocompatibility, D-126) get a value on **every** catalogue demo material — the
5 of ``seed``, the 70 of ``seed_extended``, the 593 lots of D-185 and the 10 of
the demo releases — and on nothing else. The rules this module keeps, each
with a test in ``test_seed_demo_extended_props.py``:

* **Demo only.** It reads and writes only materials with ``is_demo=True``, no
  owner and not synthesized. A real or official record, even one sharing a
  name, is never touched.
* **Additive and idempotent (D-189).** It writes a (material, property) pair
  only when no row exists for it; an existing value — demo or edited — is
  never changed, and a second run writes nothing. This is what lets
  ``semear_demo`` run again on a database that already holds the demo.
* **Deterministic.** A value is a point inside its family's band, chosen by a
  stable hash of the material name (no RNG), so two runs write the same
  numbers. The bands live in ``app.db.demo_extended_data``.
* **Physics ties the numbers together.** What a formula relates is derived,
  not drawn: G = E/2(1+ν) and K = E/3(1−2ν) for isotropic solids, Gc = K²/E,
  thermal diffusivity = k/ρcp, electrical conductivity = 1/resistivity,
  thermal-shock ΔT = σ(1−ν)/Eα, cost per litre = cost per kg × ρ, CO₂ of
  processing = energy × a grid factor; a brittle solid's elongation is σ/E;
  Tg < Tm and HDT below the melt; the flammability level follows the LOI.
* **The material's own values are the basis.** The 593 lots of D-185 passed a
  physical QA, so their core values are always used. The 70 materials of
  ``seed_extended`` carry RNG numbers (D-24 demo), some outside physics (a
  brass at 4 g/cm³); for them a core value outside its family's plausible
  range is replaced, *for the derivation only*, by the family's typical one —
  the stored core value is never changed.
* **Absence only where the quantity does not apply** (Tg of a metal, the
  melting point of a thermoset, a dielectric constant of a conductor):
  written as a declared absence with a note saying why, never as zero.
* Every row cites the demo source and is ``ESTIMADO``; ``clear_demo`` removes
  values, ordinal definitions and levels together with the demo.
"""

from __future__ import annotations

import math
import re
import unicodedata
import zlib
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.units import to_canonical
from app.db.demo_catalog import read_lot_files
from app.db.demo_extended_data import (
    CLASS_FALLBACK,
    DURABILITY_ORDER,
    GROUP_DEFAULTS,
    PROFILES,
)
from app.db.property_catalog_extended import EXTENDED_PROPERTIES, EXTENDED_SLUGS
from app.domain.data_quality import build_scalar_value, missing_value
from app.domain.ordinal import validate_scale
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.ordinal_property import (
    MaterialOrdinalValue,
    OrdinalPropertyDefinition,
    OrdinalScaleLevel,
)
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

DEMO_NOTE = "Valor de exemplo (D-188)."
SIGNIFICANT_DIGITS = 4

# --- ordinal definitions (D-126 tables, demo) -------------------------------------

DURABILITY_SCALE = ("Muito pobre", "Pobre", "Aceitável", "Bom", "Excelente")
FLAMMABILITY_SCALE = (
    "Altamente inflamável",
    "Inflamável",
    "Lentamente inflamável",
    "Autoextinguível",
    "Não inflamável",
)
TRANSPARENCY_SCALE = ("Opaco", "Translúcido", "Transparente", "Qualidade ótica")
BIOCOMPATIBILITY_SCALE = (
    "Não indicado",
    "Contato superficial",
    "Dispositivo de curta duração",
    "Implantável",
)


@dataclass(frozen=True)
class OrdinalSpec:
    slug: str
    name: str
    description: str
    scale: tuple[str, ...]
    key: str  # where the rank comes from: a DURABILITY_ORDER item or INFL/TRANS/BIO


def _durability(slug: str, agent: str, key: str) -> OrdinalSpec:
    return OrdinalSpec(
        slug=slug,
        name=f"Resistência {agent}",
        description=(
            "Propriedade ordinal (D-126, D-188): nível de resistência do material "
            f"{agent}, numa escala de cinco níveis."
        ),
        scale=DURABILITY_SCALE,
        key=key,
    )


ORDINAL_SPECS: tuple[OrdinalSpec, ...] = (
    _durability("resistencia-agua-doce", "à água doce", "agua_doce"),
    _durability("resistencia-agua-salgada", "à água salgada", "agua_salgada"),
    _durability("resistencia-acidos-fracos", "a ácidos fracos", "acidos_fracos"),
    _durability("resistencia-acidos-fortes", "a ácidos fortes", "acidos_fortes"),
    _durability("resistencia-alcalis-fracos", "a álcalis fracos", "alcalis_fracos"),
    _durability("resistencia-alcalis-fortes", "a álcalis fortes", "alcalis_fortes"),
    _durability(
        "resistencia-solventes-organicos", "a solventes orgânicos", "solventes"
    ),
    _durability("resistencia-radiacao-uv", "à radiação UV", "uv"),
    _durability("resistencia-oxidacao-500c", "à oxidação a 500 °C", "oxidacao_500c"),
    OrdinalSpec(
        slug="inflamabilidade",
        name="Inflamabilidade",
        description=(
            "Propriedade ordinal (D-126, D-188): comportamento na chama, do pior "
            "(altamente inflamável) ao melhor (não inflamável)."
        ),
        scale=FLAMMABILITY_SCALE,
        key="INFL",
    ),
    OrdinalSpec(
        slug="transparencia",
        name="Transparência",
        description=(
            "Propriedade ordinal (D-126, D-188): quanto da luz visível atravessa "
            "uma peça de espessura usual."
        ),
        scale=TRANSPARENCY_SCALE,
        key="TRANS",
    ),
    OrdinalSpec(
        slug="biocompatibilidade",
        name="Biocompatibilidade",
        description=(
            "Propriedade ordinal (D-126, D-188): uso em contato com o corpo que a "
            "família costuma admitir. Nível de exemplo, não qualificação regulatória."
        ),
        scale=BIOCOMPATIBILITY_SCALE,
        key="BIO",
    ),
)
ORDINAL_SLUGS: tuple[str, ...] = tuple(spec.slug for spec in ORDINAL_SPECS)

# --- quantities: slug -> (key in the profile, reading unit) ------------------------

_READING_UNIT: dict[str, str] = {
    spec["slug"]: spec.get("display_unit") or spec["canonical_unit"]
    for spec in EXTENDED_PROPERTIES
}
_READING_UNIT["resistividade_eletrica"] = "ohm*m"
_READING_UNIT["condutividade_eletrica"] = "S/m"

#: Why a quantity is absent where it is, written on the row (D-24).
NOT_APPLICABLE: dict[str, str] = {
    "temp_fusao": "Não se aplica: sem ponto de fusão definido (amorfo, termofixo, "
    "multifásico ou decompõe antes de fundir).",
    "temp_transicao_vitrea": "Não se aplica: material sem transição vítrea.",
    "temp_deflexao_termica": "Não se aplica: ensaio de deflexão térmica é de "
    "plásticos rígidos.",
    "dureza_shore_a": "Não se aplica: fora da escala Shore A.",
    "dureza_shore_d": "Não se aplica: fora da escala Shore D.",
    "constante_dieletrica": "Não se aplica: material condutor.",
    "rigidez_dieletrica": "Não se aplica: material condutor ou não usado como isolante.",
    "fator_perda_dieletrica": "Não se aplica: material condutor.",
    "indice_refracao": "Não se aplica: material opaco e heterogêneo ou condutor.",
    "indice_oxigenio_limite": "Não se aplica: material não combustível.",
    "modulo_volumetrico": "Não se aplica: material anisotrópico.",
    "modulo_flexao": "Não se aplica: material flexível, sem ensaio de flexão.",
    "resistencia_flexao": "Não se aplica: material flexível, sem ensaio de flexão.",
    "resistencia_compressao": "Não se aplica: material em lâmina flexível.",
    "resistencia_cisalhamento": "Não se aplica: material em lâmina flexível.",
    "resistencia_impacto": "Não se aplica: sem ensaio Charpy usual para a família.",
    "resistencia_choque_termico": "Não se aplica: o critério supõe ruptura frágil "
    "e material isotrópico.",
}


def _note_missing(slug: str) -> str:
    return NOT_APPLICABLE.get(slug, "Não se aplica a esta família.")


# --- classification -----------------------------------------------------------------


def normalize(text: str | None) -> str:
    """Lowercase without accents, for the name rules."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


#: (class slug, name pattern, profile). First match wins, in order. The
#: pattern is searched in "subclass | name", normalized.
_RULES: tuple[tuple[str, str, str], ...] = (
    # metals
    ("metais", r"espuma de", "metal_foam"),
    ("metais", r"9% niquel", "steel_low_alloy"),
    ("metais", r"inoxidavel.*(duplex|2205|2304|2507)", "ss_duplex"),
    ("metais", r"inoxidavel.*(ph |17-4|15-5|precipit)", "ss_ph"),
    ("metais", r"inoxidavel.*ferrit", "ss_ferritic"),
    ("metais", r"inoxidavel.*(martensit|420|410|416|431|440)", "ss_martensitic"),
    ("metais", r"inoxidavel", "ss_austenitic"),
    ("metais", r"ferramenta|rapido|aco ferramenta", "steel_tool"),
    ("metais", r"maraging", "steel_low_alloy"),
    ("metais", r"cinzento|fc\d", "iron_gray"),
    ("metais", r"maleavel", "iron_malleable"),
    ("metais", r"vermicular", "iron_cgi"),
    ("metais", r"nodular|ferro fundido", "iron_ductile"),
    ("metais", r"aco carbono fundido", "steel_cast"),
    ("metais", r"baixa liga", "steel_low_alloy"),
    ("metais", r"\baco", "steel_carbon"),
    ("metais", r"magnesio", "mg"),
    ("metais", r"titanio comercialmente puro", "ti_cp"),
    ("metais", r"titanio", "ti_alloy"),
    ("metais", r"cobre-berilio", "cu_be"),
    ("metais", r"cupro-niquel", "cu_ni"),
    ("metais", r"alpaca", "nickel_silver"),
    ("metais", r"bronze aluminio", "al_bronze"),
    ("metais", r"latao", "brass"),
    ("metais", r"bronze", "bronze"),
    ("metais", r"niquel-(cobre|cromo|molibdenio)|ferro-niquel|niquel comercialmente", "nickel"),
    ("metais", r"superliga|inconel", "superalloy"),
    ("metais", r"cobre", "cu_pure"),
    ("metais", r"aluminio de fundicao|fundicao sob pressao 380", "al_cast"),
    ("metais", r"alumin", "al_wrought"),
    ("metais", r"zinco|zamak", "zinc"),
    ("metais", r"estanho|chumbo|solda|metal patente", "lead_tin"),
    ("metais", r"superliga|inconel", "superalloy"),
    ("metais", r"niquel", "nickel"),
    ("metais", r"cobalto", "cobalt"),
    ("metais", r"tantalo", "tantalum"),
    ("metais", r"pesada de tungstenio", "tungsten_heavy"),
    ("metais", r"tungstenio", "tungsten"),
    ("metais", r"molibdenio", "molybdenum"),
    ("metais", r"niobio", "niobium"),
    ("metais", r"platina", "platinum"),
    ("metais", r"paladio", "palladium"),
    ("metais", r"ouro fino|24k", "gold"),
    ("metais", r"ouro", "gold_alloy"),
    ("metais", r"prata de lei", "silver_alloy"),
    ("metais", r"prata", "silver"),
    # polymer foams
    ("polimeros", r"poliestireno expandido", "foam_eps"),
    ("polimeros", r"\(xps\)", "foam_xps"),
    ("polimeros", r"poli-isocianurato", "foam_pir"),
    ("polimeros", r"espuma.*semirrigida", "foam_pur_semi"),
    ("polimeros", r"espuma.*poliuretano", "foam_pur"),
    ("polimeros", r"espuma de pvc", "foam_pvc"),
    ("polimeros", r"polimetacrilimida", "foam_pmi"),
    ("polimeros", r"espuma de pet", "foam_pet"),
    ("polimeros", r"polietileno expandido", "foam_epe"),
    ("polimeros", r"polipropileno expandido", "foam_epp"),
    # reinforced thermoplastics
    ("polimeros", r"pbt com .*carbono", "rtp_pbt_cf"),
    ("polimeros", r"pbt com", "rtp_pbt_gf"),
    ("polimeros", r"pet com", "rtp_pet_gf"),
    ("polimeros", r"poliacetal com", "rtp_pom_gf"),
    ("polimeros", r"poliamida 46 com", "rtp_pa46_gf"),
    ("polimeros", r"poliamida 66 com .*carga mineral", "rtp_pa66_mineral"),
    ("polimeros", r"poliamida 66 com", "rtp_pa66_gf"),
    ("polimeros", r"poliamida 6 com", "rtp_pa6_gf"),
    ("polimeros", r"policarbonato com .*carbono", "rtp_pc_cf"),
    ("polimeros", r"policarbonato com", "rtp_pc_gf"),
    # thermosets
    ("polimeros", r"ctbn", "epoxy_ctbn"),
    ("polimeros", r"tgddm|tetrafuncional", "epoxy_tgddm"),
    ("polimeros", r"epoxi com carga de silica", "epoxy_silica"),
    ("polimeros", r"epoxi novolac", "epoxy_novolac"),
    ("polimeros", r"anidrido", "epoxy_anhydride"),
    ("polimeros", r"amina alifatica", "epoxy_aliphatic"),
    ("polimeros", r"epoxi", "epoxy"),
    ("polimeros", r"fenolica novolac moldavel", "phenolic_wood"),
    ("polimeros", r"fenolica com carga mineral", "phenolic_mineral"),
    ("polimeros", r"fenolica", "phenolic"),
    ("polimeros", r"ftalato de dialila", "dap"),
    ("polimeros", r"melamina", "melamine"),
    ("polimeros", r"ureia", "urea"),
    ("polimeros", r"vinil ester novolac", "vinylester_novolac"),
    ("polimeros", r"vinil ester", "vinylester"),
    ("polimeros", r"poliester insaturado (isoftalico|tereftalico)", "polyester_iso"),
    ("polimeros", r"poliester insaturado", "polyester"),
    ("polimeros", r"bismaleimida", "bmi"),
    ("polimeros", r"cianato", "cyanate"),
    ("polimeros", r"benzoxazina", "benzoxazine"),
    # thermoplastics
    ("polimeros", r"\(ectfe\)", "ectfe"),
    ("polimeros", r"\(pctfe\)", "pctfe"),
    ("polimeros", r"\(etfe\)", "etfe"),
    ("polimeros", r"\(fep\)", "fep"),
    ("polimeros", r"\(pfa\)", "pfa"),
    ("polimeros", r"ptfe", "ptfe"),
    ("polimeros", r"\(pvdf\)", "pvdf"),
    ("polimeros", r"pekk", "pekk"),
    ("polimeros", r"peek", "peek"),
    ("polimeros", r"\(pps\)", "pps"),
    ("polimeros", r"\(ppsu\)", "ppsu"),
    ("polimeros", r"\(pes\)", "pes"),
    ("polimeros", r"polissulfona", "psu"),
    ("polimeros", r"polieterimida", "pei"),
    ("polimeros", r"\(pai\)", "pai"),
    ("polimeros", r"poliimida", "pi"),
    ("polimeros", r"\(lcp\)", "lcp"),
    ("polimeros", r"pc/abs retardante", "pc_abs_fr"),
    ("polimeros", r"pc/abs", "pc_abs"),
    ("polimeros", r"pc/pbt", "pc_pbt"),
    ("polimeros", r"ppe/pa", "ppe_pa"),
    ("polimeros", r"ppe/ps", "ppe_ps"),
    ("polimeros", r"policarbonato grau optico", "pc_optical"),
    ("polimeros", r"policarbonato retardante", "pc_fr"),
    ("polimeros", r"policarbonato", "pc"),
    ("polimeros", r"\(asa\)", "asa"),
    ("polimeros", r"\(san\)", "san"),
    ("polimeros", r"abs retardante", "abs_fr"),
    ("polimeros", r"abs", "abs"),
    ("polimeros", r"alto impacto \(hips\)", "hips"),
    ("polimeros", r"poliestireno", "ps"),
    ("polimeros", r"pvc semiflexivel", "pvc_flexible"),
    ("polimeros", r"pvc rigido para perfis", "pvc_impact"),
    ("polimeros", r"pvc|policloreto de vinila", "pvc_rigid"),
    ("polimeros", r"pmma modificado", "pmma_impact"),
    ("polimeros", r"pmma|metacrilato", "pmma"),
    ("polimeros", r"glicol", "petg"),
    ("polimeros", r"rpet", "pet_recycled"),
    ("polimeros", r"pet cristalizado", "pet_crystal"),
    ("polimeros", r"\bpet\b|tereftalato de etileno", "pet"),
    ("polimeros", r"pbt retardante", "pbt_fr"),
    ("polimeros", r"pbt", "pbt"),
    ("polimeros", r"poliamida 6 condicionada", "pa6_conditioned"),
    ("polimeros", r"poliamida 66 condicionada", "pa66_conditioned"),
    ("polimeros", r"poliamida 6 fundida", "pa6_cast"),
    ("polimeros", r"poliamida 6 modificada", "pa6_impact"),
    ("polimeros", r"poliamida 610", "pa610"),
    ("polimeros", r"poliamida 612", "pa612"),
    ("polimeros", r"poliamida 12", "pa12"),
    ("polimeros", r"poliamida 46", "pa46"),
    ("polimeros", r"poliamida 66", "pa66"),
    ("polimeros", r"poliamida 6", "pa6"),
    ("polimeros", r"poliacetal homopolimero", "pom_h"),
    ("polimeros", r"poliacetal modificado", "pom_impact"),
    ("polimeros", r"poliacetal", "pom_c"),
    ("polimeros", r"ultra-alto peso", "pe_uhmw"),
    ("polimeros", r"reticulado \(pex", "pex"),
    ("polimeros", r"polibuteno", "pb1"),
    ("polimeros", r"linear de baixa", "pe_lld"),
    ("polimeros", r"baixa densidade", "pe_ld"),
    ("polimeros", r"media densidade", "pe_md"),
    ("polimeros", r"alta densidade", "pe_hd"),
    ("polimeros", r"polipropileno com talco", "pp_talc"),
    ("polimeros", r"copolimero de impacto", "pp_impact"),
    ("polimeros", r"randomico", "pp_random"),
    ("polimeros", r"polipropileno", "pp_homo"),
    ("polimeros", r"amido", "starch_pla"),
    ("polimeros", r"pla tenacificado", "pla_tough"),
    ("polimeros", r"pla semicristalino", "pla_crystal"),
    ("polimeros", r"pla biorientado", "pla_film"),
    ("polimeros", r"\bpla\b", "pla"),
    ("polimeros", r"4-hidroxibutirato", "p3hb4hb"),
    ("polimeros", r"valerato", "phbv"),
    ("polimeros", r"hidroxibutirato", "phb"),
    ("polimeros", r"succinato", "pbs"),
    ("polimeros", r"acetato butirato", "cab"),
    ("polimeros", r"acetato de celulose", "cellulose_acetate"),
    ("polimeros", r"demo tecnico", "pa6"),
    # elastomers
    ("elastomeros", r"perfluorelastomero", "ffkm"),
    ("elastomeros", r"fluorsilicone", "fvmq"),
    ("elastomeros", r"fluorelastomero para baixa", "fkm_lt"),
    ("elastomeros", r"fluorelastomero", "fkm"),
    ("elastomeros", r"silicone", "vmq"),
    ("elastomeros", r"tpu alifatico", "tpu_aliphatic"),
    ("elastomeros", r"tpu base polieter", "tpu_ether"),
    ("elastomeros", r"tpu|poliuretano termoplastico", "tpu"),
    ("elastomeros", r"poliuretano fundido base polieter", "pu_cast_ether"),
    ("elastomeros", r"poliuretano fundido", "pu_cast"),
    ("elastomeros", r"copoliester", "tpc"),
    ("elastomeros", r"polieter-bloco-amida", "peba"),
    ("elastomeros", r"sbs composto", "sbs_compound"),
    ("elastomeros", r"sbs", "sbs"),
    ("elastomeros", r"sebs grau medico", "sebs_medical"),
    ("elastomeros", r"sebs (composto|para sobremoldagem)", "sebs_compound"),
    ("elastomeros", r"sebs", "sebs"),
    ("elastomeros", r"termoplastico nbr", "tpv_nbr"),
    ("elastomeros", r"vulcanizado termoplastico", "tpv_epdm"),
    ("elastomeros", r"poliolefina termoplastica", "tpo"),
    ("elastomeros", r"etileno-acrilico", "aem"),
    ("elastomeros", r"poliacrilico", "acm"),
    ("elastomeros", r"epicloridrina", "eco"),
    ("elastomeros", r"clorossulfonado", "csm"),
    ("elastomeros", r"nitrilica hidrogenada", "hnbr"),
    ("elastomeros", r"nitrilica alta", "nbr_high"),
    ("elastomeros", r"nitrilica baixa", "nbr_low"),
    ("elastomeros", r"nitrilica media", "nbr_med"),
    ("elastomeros", r"nitrilica", "nbr"),
    ("elastomeros", r"epdm alta carga", "epdm_filled"),
    ("elastomeros", r"epdm", "epdm"),
    ("elastomeros", r"policloropreno alta carga", "cr_filled"),
    ("elastomeros", r"policloropreno|neoprene", "cr"),
    ("elastomeros", r"butilica", "iir"),
    ("elastomeros", r"polibutadieno", "br"),
    ("elastomeros", r"poli-isopreno", "ir"),
    ("elastomeros", r"nr/br", "nr_br"),
    ("elastomeros", r"sbr/br", "sbr_br"),
    ("elastomeros", r"sbr .*(carregada|silica)", "sbr_filled"),
    ("elastomeros", r"sbr", "sbr"),
    ("elastomeros", r"epoxidada", "enr"),
    ("elastomeros", r"negro de fumo", "nr_black"),
    ("elastomeros", r"goma pura|desproteinizada|\(nr\)", "nr"),
    ("elastomeros", r"borracha natural", "nr_filled"),
    # ceramics
    ("ceramicas", r"espuma ceramica de mulita", "ceramic_foam_mullite"),
    ("ceramicas", r"espuma de carbeto", "ceramic_foam_sic"),
    ("ceramicas", r"espuma", "ceramic_foam"),
    ("ceramicas", r"vitroceramica.*transparente", "glass_ceramic_clear"),
    ("ceramicas", r"vitroceramica", "glass_ceramic"),
    ("ceramicas", r"silica fundida", "glass_silica"),
    ("ceramicas", r"sem alcalis", "glass_display"),
    ("ceramicas", r"aluminossilicato para lampadas", "glass_alumino_lamp"),
    ("ceramicas", r"aluminossilicato", "glass_alumino"),
    ("ceramicas", r"crown", "glass_crown"),
    ("ceramicas", r"flint", "glass_flint"),
    ("ceramicas", r"cristal de chumbo", "glass_lead"),
    ("ceramicas", r"vidro-e", "glass_e"),
    ("ceramicas", r"farmaceutico", "glass_pharma"),
    ("ceramicas", r"borossilicato", "glass_boro"),
    ("ceramicas", r"vidro", "glass_soda"),
    ("ceramicas", r"diamante", "diamond"),
    ("ceramicas", r"carbono vitreo", "carbon_glassy"),
    ("ceramicas", r"carbono mecanico", "carbon_mech"),
    ("ceramicas", r"grafite (extrudado|moldado)", "graphite_coarse"),
    ("ceramicas", r"grafite", "graphite"),
    ("ceramicas", r"titanato-zirconato.*mole", "pzt_soft"),
    ("ceramicas", r"titanato-zirconato|pzt", "pzt"),
    ("ceramicas", r"titanato de bario", "batio3"),
    ("ceramicas", r"ferrita de manganes", "ferrite_mnzn"),
    ("ceramicas", r"ferrita de niquel", "ferrite_nizn"),
    ("ceramicas", r"ferrita de estroncio", "ferrite_sr"),
    ("ceramicas", r"hidroxiapatita", "hydroxyapatite"),
    ("ceramicas", r"nitreto de boro", "bn_hex"),
    ("ceramicas", r"alta alumina", "refractory_alumina"),
    ("ceramicas", r"refrataria|refratario", "refractory"),
    ("ceramicas", r"esteatita", "steatite"),
    ("ceramicas", r"porcelana (aluminosa|eletrica)", "porcelain_hv"),
    ("ceramicas", r"porcelana", "porcelain"),
    ("ceramicas", r"gres", "stoneware"),
    ("ceramicas", r"louca sanitaria", "sanitaryware"),
    ("ceramicas", r"bloco ceramico vazado", "brick_hollow"),
    ("ceramicas", r"bloco de concreto", "concrete_block"),
    ("ceramicas", r"fibrocimento", "fibrocement"),
    ("ceramicas", r"cimento", "cement_paste"),
    ("ceramicas", r"gesso alfa", "gypsum_alpha"),
    ("ceramicas", r"gesso", "gypsum"),
    ("ceramicas", r"telha", "roof_tile"),
    ("ceramicas", r"tijolo", "brick"),
    ("ceramicas", r"ardosia", "stone_slate"),
    ("ceramicas", r"arenito", "stone_sandstone"),
    ("ceramicas", r"basalto", "stone_basalt"),
    ("ceramicas", r"calcario", "stone_limestone"),
    ("ceramicas", r"gabro", "stone_gabbro"),
    ("ceramicas", r"gnaisse", "stone_gneiss"),
    ("ceramicas", r"granito", "stone_granite"),
    ("ceramicas", r"marmore", "stone_marble"),
    ("ceramicas", r"quartzito", "stone_quartzite"),
    ("ceramicas", r"travertino", "stone_travertine"),
    ("ceramicas", r"safira", "sapphire"),
    ("ceramicas", r"espinelio", "spinel"),
    ("ceramicas", r"\(zta\)", "zta"),
    ("ceramicas", r"3y-tzp", "zirconia_tzp"),
    ("ceramicas", r"mg-psz", "zirconia_psz"),
    ("ceramicas", r"zirconia", "zirconia_ysz"),
    ("ceramicas", r"alumina 99,[58]", "alumina_bio"),
    ("ceramicas", r"alumina 9[26]%", "alumina_low"),
    ("ceramicas", r"alumina", "alumina"),
    ("ceramicas", r"infiltrado com silicio", "sic_si"),
    ("ceramicas", r"recristalizado", "sic_recryst"),
    ("ceramicas", r"silicio por deposicao", "sic_cvd"),
    ("ceramicas", r"carbeto de silicio", "sic"),
    ("ceramicas", r"ligado por reacao", "rbsn"),
    ("ceramicas", r"sialon", "sialon"),
    ("ceramicas", r"nitreto de silicio", "si3n4"),
    ("ceramicas", r"nitreto de aluminio", "aln"),
    ("ceramicas", r"carbeto de boro", "b4c"),
    ("ceramicas", r"carbeto de titanio", "tic"),
    ("ceramicas", r"carbeto de tungstenio", "wc_mono"),
    ("ceramicas", r"carbeto de zirconio", "zrc"),
    ("ceramicas", r"diboreto de titanio", "tib2"),
    ("ceramicas", r"diboreto de zirconio", "zrb2"),
    ("ceramicas", r"berilio", "beo"),
    ("ceramicas", r"mulita", "mullite"),
    ("ceramicas", r"cordierita", "cordierite"),
    # composites
    ("compositos", r"carbono-carbono", "carbon_carbon"),
    ("compositos", r"concreto celular", "concrete_aac"),
    ("compositos", r"ultra-alto desempenho", "concrete_uhpc"),
    ("compositos", r"alto desempenho", "concrete_hp"),
    ("compositos", r"concreto leve", "concrete_light"),
    ("compositos", r"argamassa mista", "mortar_lime"),
    ("compositos", r"argamassa", "mortar"),
    ("compositos", r"graute", "grout"),
    ("compositos", r"concreto", "concrete"),
    ("compositos", r"wc-15co", "cermet_wc_tough"),
    ("compositos", r"ticn", "cermet_ticn"),
    ("compositos", r"cr3c2", "cermet_cr3c2"),
    ("compositos", r"metal duro|cermet", "cermet_wc"),
    ("compositos", r"oxido/oxido", "cmc_oxide"),
    ("compositos", r"\bc/sic .*silicio liquido", "cmc_csic_lsi"),
    ("compositos", r"\bc/sic", "cmc_csic"),
    ("compositos", r"infiltracao de fundido", "cmc_sic_mi"),
    ("compositos", r"sic/sic", "cmc_sic"),
    ("compositos", r"boro / aluminio", "mmc_b_al"),
    ("compositos", r"matriz metalica|mmc ", "mmc_al"),
    ("compositos", r"cortica aglomerada", "cork_agglomerated"),
    ("compositos", r"cortica", "cork"),
    ("compositos", r"couro", "leather"),
    ("compositos", r"bambu laminado", "bamboo_laminated"),
    ("compositos", r"bambu", "bamboo"),
    ("compositos", r"compensado fenolico", "plywood_phenolic"),
    ("compositos", r"madeira compensada", "plywood"),
    ("compositos", r"compensado", "plywood"),
    ("compositos", r"\(lvl\)", "lvl"),
    ("compositos", r"\(mlc\)", "glulam"),
    ("compositos", r"\(hdf\)", "fibreboard_hd"),
    ("compositos", r"\(mdf\)", "fibreboard"),
    ("compositos", r"\(mdp\)", "particleboard"),
    ("compositos", r"\(osb\)", "osb"),
    ("compositos", r"madeira de (ipe|cumaru|macaranduba|teca|jatoba|eucalipto citriodora)",
     "wood_durable"),
    ("compositos", r"madeira de (carvalho|mogno|cedro|peroba)", "wood_moderate"),
    ("compositos", r"madeira de", "wood_light"),
    ("compositos", r"polipropileno", "nfrp_pp"),
    ("compositos", r"poliamida 11", "nfrp_pa11"),
    ("compositos", r"(juta|sisal|canhamo|linho).*poliester", "nfrp_polyester"),
    ("compositos", r"linho", "nfrp_epoxy"),
    ("compositos", r"hibrido carbono-aramida", "hybrid_carbon"),
    ("compositos", r"hibrido carbono-vidro", "hybrid_carbon_glass"),
    ("compositos", r"hibrido aramida-vidro", "hybrid_aramid_glass"),
    ("compositos", r"aramida.*fenolica", "afrp_phenolic"),
    ("compositos", r"afrp ud", "afrp_ud"),
    ("compositos", r"aramida", "afrp"),
    ("compositos", r"basalto.*vinilester", "bfrp_ve"),
    ("compositos", r"basalto", "bfrp"),
    ("compositos", r"(carbono|cfrp).*peek", "cfrp_ud_peek"),
    ("compositos", r"(carbono|cfrp).*pps", "cfrp_pps"),
    ("compositos", r"cfrp tecido / poliamida", "cfrp_pa6"),
    ("compositos", r"cianato", "cfrp_qi_cyanate"),
    ("compositos", r"quase-isotropico modulo intermediario", "cfrp_qi_tough"),
    ("compositos", r"cfrp quase-isotropico", "cfrp_qi"),
    ("compositos", r"cfrp enrolado", "cfrp_fw"),
    ("compositos", r"cfrp tecido (cetim|tela).*(intermediario|180)", "cfrp_woven_180"),
    ("compositos", r"cfrp tecido", "cfrp_woven"),
    ("compositos", r"cfrp ud .*vinilester", "cfrp_ud_ve"),
    ("compositos", r"cfrp ud .*tenacificado", "cfrp_ud_tough"),
    ("compositos", r"cfrp ud .*180", "cfrp_ud_180"),
    ("compositos", r"cfrp|fibras de carbono|demo e|demo laminado", "cfrp_ud"),
    ("compositos", r"\bbmc\b", "gfrp_bmc"),
    ("compositos", r"smc estrutural", "gfrp_smc_ve"),
    ("compositos", r"\bsmc\b", "gfrp_smc"),
    ("compositos", r"manta", "gfrp_mat"),
    ("compositos", r"vergalhao", "gfrp_ud_ve"),
    ("compositos", r"perfil pultrudado", "gfrp_pultruded"),
    ("compositos", r"gfrp enrolado", "gfrp_fw"),
    ("compositos", r"vidro-e / fenolica", "gfrp_woven_phenolic"),
    ("compositos", r"vidro-e / poliamida", "gfrp_woven_pa66"),
    ("compositos", r"laminacao manual", "gfrp_woven_poly"),
    ("compositos", r"gfrp quase-isotropico", "gfrp_qi"),
    ("compositos", r"gfrp ud .*180", "gfrp_ud_180"),
    ("compositos", r"gfrp ud", "gfrp_ud"),
    ("compositos", r"gfrp tecido", "gfrp_woven"),
    ("compositos", r"vidro", "gfrp_ud"),
)

_COMPILED = tuple((cls, re.compile(pattern), key) for cls, pattern, key in _RULES)

#: The few families the name does not say and the subclass does; read first.
_SUBCLASS_RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("metais", re.compile(r"^acos baixa liga$"), "steel_low_alloy"),
    ("metais", re.compile(r"^espumas metalicas$"), "metal_foam"),
)


def classify(class_slug: str, subclass: str | None, name: str) -> str:
    """The profile a demo material reads its bands from.

    The rules read the **name**: a subclass such as "Concretos e Argamassas" or
    "Compósitos de Aramida, Basalto e Híbridos" names several families at once.
    """
    sub = normalize(subclass)
    for cls, pattern, key in _SUBCLASS_RULES:
        if cls == class_slug and pattern.search(sub):
            return key
    text = normalize(name)
    for cls, pattern, key in _COMPILED:
        if cls == class_slug and pattern.search(text):
            return key
    return CLASS_FALLBACK[class_slug]


def resolve_profile(key: str) -> dict:
    """Group defaults, then the ``base`` chain, then the profile's own keys."""
    chain: list[dict] = []
    current: str | None = key
    while current is not None:
        profile = PROFILES[current]
        chain.append(profile)
        current = profile.get("base")
    merged = dict(GROUP_DEFAULTS[chain[-1]["group"]])
    for profile in reversed(chain):
        merged.update({k: v for k, v in profile.items() if k != "base"})
    return merged


# --- name-level facts from the open literature -----------------------------------
#
# A band from a family is replaced by the material's own typical value where the
# material is a real, well-known grade. Values are typical figures taught in
# open sources (textbook tables, standards); bands, so the hash still applies.

OVERRIDES: dict[str, dict] = {
    "Liga de Alumínio 6061-T6": {"A": (12, 17), "KIC": (29, 29), "FAT_ABS": (96, 97),
                                 "TM": (582, 652), "RES": (3.99e-8, 3.99e-8)},
    "Liga de Alumínio 7075-T6": {"A": (11, 11), "KIC": (20, 29), "FAT_ABS": (159, 160),
                                 "TM": (477, 635), "RES": (5.15e-8, 5.15e-8)},
    "Liga de Alumínio 2024-T3": {"A": (18, 18), "KIC": (26, 37), "FAT_ABS": (138, 138),
                                 "TM": (502, 638), "RES": (5.82e-8, 5.82e-8)},
    "Liga de Titânio Ti-6Al-4V": {"A": (10, 14), "KIC": (55, 75), "FAT_ABS": (510, 610),
                                  "RES": (1.78e-6, 1.78e-6), "TM": (1604, 1660)},
    "Liga de Titânio Ti-6Al-4V ELI Recozida (Grau 23)": {"A": (10, 15), "BIO": 3},
    "Liga de Titânio Ti-6Al-7Nb": {"BIO": 3},
    "Liga de Titânio Ti-3Al-2,5V (Grau 9)": {"BIO": 2},
    "Liga de Cobalto Co-Cr-Mo Fundida para Implantes": {"A": (8, 12), "BIO": 3},
    "Liga de Cobalto Co-Cr-W-C de Revestimento Duro (Grau 6)": {"A": (1, 2),
                                                                "KIC": (15, 25),
                                                                "IMP": (20, 60)},
    "Liga de Cobalto Co-Cr-W-Ni L-605 Laminada": {"A": (45, 60)},
    "Aço Inoxidável 316L": {"BIO": 3, "A": (40, 50)},
    "Aço Inoxidável Austenítico AISI 304 Recozido": {"A": (55, 60),
                                                     "DUR": (4, 2, 4, 2, 4, 3, 4, 4, 4)},
    "Aço Inoxidável Austenítico AISI 304L Recozido": {"DUR": (4, 2, 4, 2, 4, 3, 4, 4, 4)},
    "Aço Inoxidável Austenítico AISI 303 de Corte Fácil": {"DUR": (4, 2, 3, 1, 4, 3, 4, 4, 4)},
    "Aço Inoxidável Austenítico AISI 301 Meio Duro": {"DUR": (4, 2, 4, 2, 4, 3, 4, 4, 4)},
    "Aço Inoxidável Superaustenítico 6Mo (20Cr-18Ni-6Mo-N)": {
        "DUR": (4, 4, 4, 3, 4, 3, 4, 4, 4)},
    "Aço Inoxidável Martensítico 420": {"BIO": 2},
    "Aço Inoxidável Martensítico AISI 440A Temperado e Revenido": {"BIO": 2},
    "Aço Inoxidável Ferrítico AISI 409 para Escapamentos": {"DUR": (3, 1, 2, 0, 4, 3, 4, 4, 4)},
    "Aço 9% Níquel ASTM A553 para Criogenia": {"TMIN": (-196, -196), "KIC": (150, 200)},
    "Aço Patinável ASTM A588 Grau A": {"DUR": (3, 1, 1, 0, 3, 3, 4, 4, 2)},
    "Aço Maraging 250": {"A": (8, 10), "KIC": (90, 120), "RES": (6.0e-7, 6.5e-7)},
    "Ferro Fundido Nodular Austemperado ADI 900": {"A": (8, 11), "KIC": (50, 60)},
    "Cobre Isento de Oxigênio (OF) Recozido": {"A": (45, 50), "RES": (1.71e-8, 1.72e-8)},
    "Cobre Eletrolítico (ETP)": {"RES": (1.72e-8, 1.72e-8)},
    "Cobre Desoxidado com Fósforo (DHP) Meio-Duro": {"RES": (2.0e-8, 2.1e-8)},
    "Cobre-Prata CuAg0,1 Encruado": {"RES": (1.75e-8, 1.76e-8)},
    "Alumínio Condutor 1350-H19": {"RES": (2.8e-8, 2.82e-8)},
    "Níquel Comercialmente Puro 201 Meio-Duro": {"RES": (8.5e-8, 9.5e-8),
                                                 "TM": (1435, 1446)},
    "Liga Níquel-Cromo 80/20 para Resistências Elétricas": {"RES": (1.08e-6, 1.10e-6),
                                                            "TM": (1390, 1400)},
    "Liga Níquel-Cobre 400 Recozida": {"RES": (5.4e-7, 5.5e-7), "TM": (1300, 1350)},
    "Liga Níquel-Cobre-Alumínio K-500 Envelhecida": {"RES": (6.1e-7, 6.2e-7),
                                                     "TM": (1315, 1350)},
    "Liga Níquel-Cromo-Ferro 600 Recozida": {"RES": (1.03e-6, 1.04e-6),
                                             "TM": (1354, 1413)},
    "Liga Níquel-Cromo-Molibdênio 625 Recozida": {"RES": (1.29e-6, 1.29e-6),
                                                  "TM": (1290, 1350)},
    "Liga Níquel-Molibdênio-Cromo C-276": {"RES": (1.30e-6, 1.30e-6), "TM": (1323, 1371)},
    "Liga Ferro-Níquel-Cromo 800H": {"RES": (9.9e-7, 9.9e-7), "TM": (1357, 1385)},
    "Superliga Inconel 718": {"RES": (1.25e-6, 1.25e-6), "TM": (1260, 1336), "A": (12, 20)},
    "Solda Estanho-Chumbo Sn63Pb37 Eutética": {"TM": (183, 183), "RES": (1.45e-7, 1.5e-7)},
    "Solda sem Chumbo SnAg3Cu0,5": {"TM": (217, 220), "RES": (1.3e-7, 1.32e-7)},
    "Chumbo Antimonial PbSb6 Laminado": {"TM": (251, 290), "RES": (2.5e-7, 2.6e-7)},
    "Metal Patente à Base de Estanho SnSb8Cu4": {"TM": (233, 354),
                                                  "RES": (1.4e-7, 1.6e-7)},
    "Zamak 3": {"TM": (381, 387), "RES": (6.4e-8, 6.4e-8)},
    "Liga de Zinco ZnAl4Cu1 Injetada": {"TM": (380, 386)},
    "Liga de Zinco ZnAl4Cu3 Injetada": {"TM": (379, 390)},
    "Liga de Zinco ZnAl8Cu1 (ZA-8) Injetada": {"TM": (375, 404)},
    "Liga de Zinco ZnAl27Cu2 (ZA-27) Fundida em Areia": {"TM": (375, 484)},
    "Molibdênio TZM": {"TM": (2620, 2623)},
    "Platina-Ródio Pt-10Rh": {"TM": (1830, 1850), "RES": (1.9e-7, 1.9e-7)},
    "Liga Paládio-Prata Pd60Ag40": {"TM": (1330, 1400), "RES": (3.8e-7, 4.2e-7)},
    "Ouro 18K": {"TM": (900, 940)},
    "Silicone Líquido Injetável 40 Shore A": {"TRANS": 1, "BIO": 2},
}

#: Aluminium series: melting range, resistivity and sea-water behaviour.
_AL_SERIES: tuple[tuple[str, dict], ...] = (
    (r"\b1\d{3}|\b1350", {"TM": (643, 657), "RES": (2.8e-8, 3.0e-8)}),
    (r"\b2\d{3}", {"TM": (500, 640), "RES": (4.5e-8, 6.1e-8),
                   "DUR": (3, 1, 3, 1, 2, 0, 4, 4, 4)}),
    (r"\b3\d{3}", {"TM": (630, 655), "RES": (3.4e-8, 4.2e-8)}),
    (r"\b5\d{3}", {"TM": (570, 640), "RES": (4.9e-8, 5.9e-8),
                   "DUR": (4, 4, 3, 1, 2, 0, 4, 4, 4)}),
    (r"\b6\d{3}", {"TM": (580, 650), "RES": (3.2e-8, 4.3e-8)}),
    (r"\b7\d{3}", {"TM": (475, 635), "RES": (4.3e-8, 5.7e-8),
                   "DUR": (4, 2, 3, 1, 2, 0, 4, 4, 4)}),
)

_SHORE = re.compile(r"(\d{2,3})\s*shore\s*([ad])\b")
_CONCRETE_CLASS = re.compile(r"\bc(\d{2,3})\b")

#: Shore A ↔ Shore D, the usual conversion points of the two durometers.
_SHORE_A_TO_D: tuple[tuple[float, float], ...] = (
    (80, 27), (85, 32), (90, 39), (95, 47), (100, 58),
)


def _interp(points: tuple[tuple[float, float], ...], x: float) -> float:
    for (x0, y0), (x1, y1) in zip(points, points[1:], strict=False):
        if x0 <= x <= x1:
            return y0 + (x - x0) * (y1 - y0) / (x1 - x0)
    return points[0][1] if x < points[0][0] else points[-1][1]


def profile_for(class_slug: str, subclass: str | None, name: str) -> dict:
    """The resolved profile with the name-level facts applied."""
    profile = resolve_profile(classify(class_slug, subclass, name))
    norm = normalize(name)
    if profile.get("group") == "metal" and "alumin" in norm and "fundicao" not in norm:
        for pattern, facts in _AL_SERIES:
            if re.search(pattern, norm):
                profile.update(facts)
                break
    if class_slug == "compositos" and (match := _CONCRETE_CLASS.search(norm)):
        fck = float(match.group(1))
        profile["COMP_ABS"] = (fck + 6, fck + 10)  # fcm ≈ fck + 8 MPa (EN 1992)
    profile.update(OVERRIDES.get(name, {}))
    return profile


# --- the computation ----------------------------------------------------------------


@dataclass
class Basis:
    """Core values the derivations read, in reading units."""

    rho: float  # kg/m³
    E: float  # GPa
    nu: float
    su: float  # MPa
    sy: float | None  # MPa
    k: float  # W/(m·K)
    cp: float  # J/(kg·K)
    a: float  # 1e-6/K
    cm: float  # cost per kg
    tmax: float | None = None  # °C


@dataclass
class Result:
    """Numbers (reading unit) or ``None`` (does not apply), plus ordinal ranks."""

    values: dict[str, float | None] = field(default_factory=dict)
    ranks: dict[str, int] = field(default_factory=dict)


def _fraction(name: str, key: str) -> float:
    return (zlib.crc32(f"{name}|{key}|D-188".encode()) % 1000) / 999.0


def _round(value: float) -> float:
    return float(f"{value:.{SIGNIFICANT_DIGITS}g}")


def _pick(band: tuple[float, float], f: float) -> float:
    low, high = band
    if low > 0 and high / low > 20:
        return math.exp(math.log(low) + f * (math.log(high) - math.log(low)))
    return low + f * (high - low)


_GATES = {
    "rho": (0.75, 1.33),
    "E": (0.7, 1.43),
    "nu": (0.8, 1.25),
    "su": (0.5, 2.0),
    "sy": (0.5, 2.0),
    "k": (0.4, 2.5),
    "cp": (0.7, 1.43),
    "a": (0.5, 2.0),
    "cm": (0.1, 10.0),
}


def build_basis(profile: Mapping, own: Mapping[str, float | None], *, trusted: bool) -> Basis:
    """The material's core values, or the family's where absent or implausible."""
    chosen: dict[str, float | None] = {}
    for key in ("rho", "E", "nu", "su", "sy", "k", "cp", "a", "cm"):
        typical = profile.get(key)
        mine = own.get(key)
        if mine is not None and mine > 0 and (trusted or typical is None):
            chosen[key] = mine
        elif mine is not None and mine > 0 and typical:
            low, high = _GATES[key]
            chosen[key] = mine if low <= mine / typical <= high else typical
        else:
            chosen[key] = typical
    su = chosen["su"]
    sy = chosen["sy"]
    if sy is not None and su is not None and sy > su:
        typical_ratio = (profile.get("sy") or su) / (profile.get("su") or su)
        sy = su * min(typical_ratio, 1.0)
    if chosen["E"] is None or su is None:
        raise ValueError("perfil sem módulo ou resistência típicos")
    return Basis(
        rho=float(chosen["rho"]),
        E=float(chosen["E"]),
        nu=float(chosen["nu"]),
        su=float(su),
        sy=None if sy is None else float(sy),
        k=float(chosen["k"]),
        cp=float(chosen["cp"]),
        a=float(chosen["a"]),
        cm=float(chosen["cm"] or 0.0),
        tmax=own.get("tmax"),
    )


def _inflammability(loi: float | None, fallback: int | None) -> int:
    if loi is None:
        return 4 if fallback is None else fallback
    if loi < 19:
        return 0
    if loi < 21:
        return 1
    if loi < 26:
        return 2
    if loi < 60:
        return 3
    return 4


def compute(name: str, profile: Mapping, basis: Basis) -> Result:  # noqa: C901
    """Every extended quantity of one material. Pure: no database."""
    result = Result()
    v = result.values
    group = profile["group"]

    def f(key: str) -> float:
        return _fraction(name, key)

    def band(key: str) -> tuple[float, float] | None:
        return profile.get(key)

    sub = profile.get("SUB") or (0.6 * (profile.get("su") or basis.su), 1.6 * basis.su)
    span = max(sub[1] - sub[0], 1e-9)
    strength = min(max((basis.su - sub[0]) / span, 0.0), 1.0)

    def tough(key: str) -> float:
        """Position in a toughness band: stronger in the family, less tough."""
        return 0.75 * (1.0 - strength) + 0.25 * f(key)

    E_pa = basis.E * 1e9
    rho = basis.rho
    density_ratio = rho / profile["solid_rho"] if profile.get("solid_rho") else None

    # --- elongation, toughness ------------------------------------------------------
    brittle = profile.get("A_BRITTLE")
    if brittle:
        v["alongamento"] = basis.su / (basis.E * 1000.0) * 100.0 * _pick(brittle, f("A"))
    elif band("A") is not None:
        v["alongamento"] = _pick(band("A"), tough("A"))
    else:  # pragma: no cover - every profile has one or the other
        v["alongamento"] = None

    if band("GC") is not None:
        gc_kj = _pick(band("GC"), tough("GC"))
        v["tenacidade_gc"] = _round(gc_kj)
        v["tenacidade_fratura"] = math.sqrt(E_pa * v["tenacidade_gc"] * 1e3) / 1e6
    else:
        if band("KIC") is not None:
            kic = _pick(band("KIC"), tough("KIC"))
        else:  # woods: toughness across the grain scales with density
            kic = rho / 100.0 * _pick((0.8, 1.2), f("KIC"))
        kic = _round(kic)
        v["tenacidade_fratura"] = kic
        v["tenacidade_gc"] = (kic * 1e6) ** 2 / E_pa / 1e3

    # --- strengths ------------------------------------------------------------------
    if band("FAT_ABS") is not None:
        v["resistencia_fadiga"] = _pick(band("FAT_ABS"), f("FAT"))
    else:
        v["resistencia_fadiga"] = basis.su * _pick(band("FAT"), f("FAT"))

    def base_stress(which: str | None) -> float:
        return basis.sy if which == "sy" and basis.sy is not None else basis.su

    if band("COMP_ABS") is not None:
        v["resistencia_compressao"] = _pick(band("COMP_ABS"), f("COMP"))
    elif band("COMP") is not None:
        v["resistencia_compressao"] = base_stress(profile.get("COMP_BASE")) * _pick(
            band("COMP"), f("COMP")
        )
    else:
        v["resistencia_compressao"] = None

    if band("FLEX") is not None:
        v["resistencia_flexao"] = base_stress(profile.get("FLEX_BASE")) * _pick(
            band("FLEX"), f("FLEX")
        )
    else:
        v["resistencia_flexao"] = None

    if band("SHEAR_ABS") is not None:
        v["resistencia_cisalhamento"] = _pick(band("SHEAR_ABS"), f("SHEAR"))
    elif band("SHEAR") is not None:
        v["resistencia_cisalhamento"] = basis.su * _pick(band("SHEAR"), f("SHEAR"))
    else:
        v["resistencia_cisalhamento"] = None

    # --- moduli ---------------------------------------------------------------------
    gmod = profile.get("GMOD")
    if gmod == "iso":
        v["modulo_cisalhamento"] = basis.E / (2.0 * (1.0 + basis.nu))
    elif isinstance(gmod, tuple) and gmod[0] == "abs":
        v["modulo_cisalhamento"] = min(_pick(gmod[1:], f("G")), basis.E / 2.0)
    elif isinstance(gmod, tuple) and gmod[0] == "ratio":
        v["modulo_cisalhamento"] = basis.E * _pick(gmod[1:], f("G"))
    else:
        v["modulo_cisalhamento"] = None

    kmod = profile.get("KMOD")
    if kmod == "iso" and basis.nu < 0.49:
        v["modulo_volumetrico"] = basis.E / (3.0 * (1.0 - 2.0 * basis.nu))
    elif isinstance(kmod, tuple):
        v["modulo_volumetrico"] = _pick(kmod, f("K"))
    else:
        v["modulo_volumetrico"] = None

    v["modulo_flexao"] = (
        basis.E * _pick(band("FMOD"), f("FMOD")) if band("FMOD") is not None else None
    )

    # --- impact and damping ---------------------------------------------------------
    if "IMP" in profile:
        v["resistencia_impacto"] = (
            _pick(band("IMP"), tough("IMP")) if band("IMP") is not None else None
        )
    else:  # woods: impact energy scales with density
        v["resistencia_impacto"] = rho / 10.0 * _pick((0.8, 1.2), f("IMP"))
    v["coef_perda_mecanica"] = _pick(band("ETA"), f("ETA"))

    # --- hardness -------------------------------------------------------------------
    shore = _SHORE.search(normalize(name))
    sha = shd = None
    if shore and shore.group(2) == "a":
        sha = float(shore.group(1))
    elif shore and shore.group(2) == "d":
        shd = float(shore.group(1))
    if group == "elastomer":
        if sha is None and shd is None:
            sha = round(_pick(band("SHA") or (50, 70), f("SHA")))
        if sha is not None and shd is None:
            shd = round(_interp(_SHORE_A_TO_D, sha)) if sha >= 80 else None
        elif shd is not None and sha is None:
            inverse = tuple((d, a) for a, d in _SHORE_A_TO_D)
            sha = round(_interp(inverse, shd))
    else:
        sha = round(_pick(band("SHA"), f("SHA"))) if band("SHA") is not None else None
        shd = round(_pick(band("SHD"), f("SHD"))) if band("SHD") is not None else None
    v["dureza_shore_a"] = sha
    v["dureza_shore_d"] = shd

    # --- temperatures (°C) ----------------------------------------------------------
    tm = _pick(band("TM"), f("TM")) if band("TM") is not None else None
    tg = _pick(band("TG"), f("TG")) if band("TG") is not None else None
    if tm is not None and tg is not None and tg > tm - 10:
        tg = tm - 10
    tmin = _pick(band("TMIN"), f("TMIN"))
    if basis.tmax is not None and tmin > basis.tmax - 20:
        tmin = basis.tmax - 20
    hdt = _pick(band("HDT"), f("HDT")) if band("HDT") is not None else None
    if hdt is not None and tm is not None:
        hdt = min(hdt, tm - 5)
    elif hdt is not None and tg is not None:
        hdt = min(hdt, tg + 5)
    v["temp_fusao"] = tm
    v["temp_transicao_vitrea"] = tg
    v["temp_min_servico"] = tmin
    v["temp_deflexao_termica"] = hdt

    v["difusividade_termica"] = basis.k / (rho * basis.cp) * 1e6  # mm²/s
    shock = profile.get("SHOCK")
    if shock and basis.a > 0:
        sigma = base_stress(shock) * 1e6
        v["resistencia_choque_termico"] = sigma * (1 - basis.nu) / (E_pa * basis.a * 1e-6)
    else:
        v["resistencia_choque_termico"] = None

    # --- electrical and optical -----------------------------------------------------
    if band("RES_FOAM_OF") is not None and density_ratio:
        resistivity = _pick(band("RES_FOAM_OF"), f("RES")) * density_ratio**-1.5
    else:
        resistivity = _pick(band("RES"), f("RES"))
    resistivity = _round(resistivity)
    v["resistividade_eletrica"] = resistivity
    v["condutividade_eletrica"] = 1.0 / resistivity

    if "EPS" in profile:
        eps = _pick(band("EPS"), f("EPS")) if band("EPS") is not None else None
    elif profile.get("solid_eps") and density_ratio:
        eps = profile["solid_eps"] ** density_ratio  # Lichtenecker: solid and air
    else:
        eps = None
    v["constante_dieletrica"] = eps
    dielectric = eps is not None
    v["rigidez_dieletrica"] = (
        _pick(band("RIG"), f("RIG")) if dielectric and band("RIG") is not None else None
    )
    v["fator_perda_dieletrica"] = (
        _pick(band("TAN"), f("TAN")) if dielectric and band("TAN") is not None else None
    )
    v["indice_refracao"] = _pick(band("N"), f("N")) if band("N") is not None else None

    # --- water, fire ----------------------------------------------------------------
    if band("ABS_VOL") is not None:
        v["absorcao_agua"] = _pick(band("ABS_VOL"), f("ABS")) * 1000.0 / rho
    elif band("ABS_OPEN") is not None and density_ratio:
        porosity = max(1.0 - density_ratio, 0.0)
        v["absorcao_agua"] = porosity * 1000.0 / rho * 100.0 * _pick(band("ABS_OPEN"), f("ABS"))
    elif band("ABS") is not None:
        v["absorcao_agua"] = _pick(band("ABS"), f("ABS"))
    else:  # woods: a fraction of the cell-wall voids fills in a day
        voids = max(1.0 / rho - 1.0 / 1500.0, 0.0)
        v["absorcao_agua"] = voids * 1000.0 * 100.0 * _pick((0.15, 0.3), f("ABS"))

    if "LOI" in profile:
        loi = _pick(band("LOI"), f("LOI")) if band("LOI") is not None else None
    else:  # woods: denser burns more slowly
        loi = (20.0 + rho / 200.0) * _pick((0.95, 1.05), f("LOI"))
    if loi is not None:
        loi = _round(loi)
    v["indice_oxigenio_limite"] = loi

    # --- economic and eco -------------------------------------------------------------
    v["custo_volume"] = basis.cm * rho / 1000.0 if basis.cm else None
    v["pegada_hidrica"] = _pick(band("WAT"), f("WAT"))
    v["fracao_reciclada"] = _pick(band("REC"), f("REC"))
    energy = _round(_pick(band("PROC"), f("PROC")))
    v["energia_processamento"] = energy
    v["co2_processamento"] = energy * _pick(band("CO2P"), f("CO2P"))

    for slug, value in list(v.items()):
        if value is not None:
            v[slug] = _round(value)

    # --- ordinals -------------------------------------------------------------------
    durability = profile["DUR"]
    for spec in ORDINAL_SPECS:
        if spec.key in DURABILITY_ORDER:
            result.ranks[spec.slug] = int(durability[DURABILITY_ORDER.index(spec.key)])
        elif spec.key == "INFL":
            result.ranks[spec.slug] = _inflammability(loi, profile.get("INFL"))
        else:
            result.ranks[spec.slug] = int(profile[spec.key])
    return result


# --- reading the database -----------------------------------------------------------

_CORE_READ: dict[str, tuple[str, str]] = {
    "densidade": ("rho", "kg/m**3"),
    "modulo_young": ("E", "GPa"),
    "coef_poisson": ("nu", "dimensionless"),
    "resistencia_tracao": ("su", "MPa"),
    "limite_escoamento": ("sy", "MPa"),
    "condutividade_termica": ("k", "W/(m*K)"),
    "calor_especifico": ("cp", "J/(kg*K)"),
    "coef_expansao_termica": ("a", "1/K"),
    "custo_massa": ("cm", "dimensionless"),
    "temp_max_servico": ("tmax", "degC"),
}


def trusted_names() -> frozenset[str]:
    """Names of the 593 lots of D-185, whose core values passed a physical QA."""
    return frozenset(m["name"] for lot in read_lot_files() for m in lot["materiais"])


def _own_values(db: Session, material_ids: list[int]) -> dict[int, dict[str, float]]:
    props = {
        p.slug: p
        for p in db.execute(
            select(PropertyDefinition).where(PropertyDefinition.slug.in_(list(_CORE_READ)))
        ).scalars()
    }
    by_id = {p.id: slug for slug, p in props.items()}
    own: dict[int, dict[str, float]] = {mid: {} for mid in material_ids}
    for start in range(0, len(material_ids), 500):
        rows = db.execute(
            select(
                MaterialPropertyValue.material_id,
                MaterialPropertyValue.property_id,
                MaterialPropertyValue.normalized_value,
                MaterialPropertyValue.value_min,
                MaterialPropertyValue.value_max,
                MaterialPropertyValue.value_typical,
            ).where(
                MaterialPropertyValue.material_id.in_(material_ids[start : start + 500]),
                MaterialPropertyValue.property_id.in_(list(by_id)),
                MaterialPropertyValue.is_missing.is_(False),
            )
        ).all()
        for material_id, property_id, normalized, low, high, typical in rows:
            slug = by_id[property_id]
            canonical = props[slug].canonical_unit
            number = normalized
            if number is None:
                number = typical if typical is not None else None
            if number is None and low is not None and high is not None:
                number = (low + high) / 2.0
            if number is None:
                continue
            key, unit = _CORE_READ[slug]
            own[material_id][key] = to_canonical(float(number), canonical, unit)[0]
    for values in own.values():
        if "a" in values:
            values["a"] = values["a"] * 1e6  # 1/K -> 1e-6/K, the profile's unit
    return own


def demo_catalogue_materials(db: Session) -> list[tuple[Material, str]]:
    """Every catalogue demo material with its class slug; never a real one."""
    return list(
        db.execute(
            select(Material, MaterialClass.slug)
            .join(MaterialClass, MaterialClass.id == Material.class_id)
            .where(
                Material.is_demo.is_(True),
                Material.owner_id.is_(None),
                Material.is_synthesized.is_(False),
            )
            .order_by(Material.id)
        ).all()
    )


def _ensure_ordinal(db: Session, spec: OrdinalSpec) -> tuple[OrdinalPropertyDefinition, bool]:
    existing = db.execute(
        select(OrdinalPropertyDefinition).where(OrdinalPropertyDefinition.slug == spec.slug)
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False
    definition = OrdinalPropertyDefinition(
        slug=spec.slug, name=spec.name, description=spec.description, is_demo=True
    )
    definition.levels = [
        OrdinalScaleLevel(rank=rank, label=label)
        for rank, label in enumerate(validate_scale(spec.scale))
    ]
    db.add(definition)
    db.flush()
    return definition, True


def seed_demo_extended_properties(
    db: Session, source: Source, *, names: Iterable[str] | None = None
) -> dict[str, int]:
    """Fill every missing extended pair on the demo catalogue. Additive, idempotent.

    ``names`` narrows the run to some materials (tests). Returns the counts the
    ``semear_demo`` log prints.
    """
    if not source.is_demo:  # pragma: no cover - guarded by callers
        raise ValueError("Valores ampliados fictícios só podem citar a fonte demo.")
    definitions = {
        p.slug: p
        for p in db.execute(
            select(PropertyDefinition).where(PropertyDefinition.slug.in_(EXTENDED_SLUGS))
        ).scalars()
    }
    if len(definitions) != len(EXTENDED_SLUGS):
        missing = sorted(set(EXTENDED_SLUGS) - set(definitions))
        raise ValueError(f"Definições ampliadas ausentes (rode o seed principal antes): {missing}")

    wanted = None if names is None else set(names)
    materials = [
        (m, cls)
        for m, cls in demo_catalogue_materials(db)
        if wanted is None or m.name in wanted
    ]
    ids = [m.id for m, _ in materials]
    own = _own_values(db, ids)
    trusted = trusted_names()

    present: set[tuple[int, int]] = set()
    prop_ids = [p.id for p in definitions.values()]
    for start in range(0, len(ids), 500):
        present.update(
            db.execute(
                select(MaterialPropertyValue.material_id, MaterialPropertyValue.property_id)
                .where(
                    MaterialPropertyValue.material_id.in_(ids[start : start + 500]),
                    MaterialPropertyValue.property_id.in_(prop_ids),
                )
            ).all()
        )

    ordinals: list[tuple[OrdinalSpec, OrdinalPropertyDefinition]] = []
    counts = {
        "extended_values_created": 0,
        "extended_missing_declared": 0,
        "extended_ordinal_definitions_created": 0,
        "extended_ordinal_values_created": 0,
    }
    for spec in ORDINAL_SPECS:
        definition, created = _ensure_ordinal(db, spec)
        counts["extended_ordinal_definitions_created"] += int(created)
        ordinals.append((spec, definition))
    ordinal_present: set[tuple[int, int]] = set()
    for start in range(0, len(ids), 500):
        ordinal_present.update(
            db.execute(
                select(MaterialOrdinalValue.material_id, MaterialOrdinalValue.definition_id)
                .where(
                    MaterialOrdinalValue.material_id.in_(ids[start : start + 500]),
                    MaterialOrdinalValue.definition_id.in_([d.id for _, d in ordinals]),
                )
            ).all()
        )

    rows: list = []
    for material, class_slug in materials:
        profile = profile_for(class_slug, material.subclass, material.name)
        basis = build_basis(
            profile, own.get(material.id, {}), trusted=material.name in trusted
        )
        result = compute(material.name, profile, basis)
        for slug in EXTENDED_SLUGS:
            prop = definitions[slug]
            if (material.id, prop.id) in present:
                continue
            value = result.values.get(slug)
            if value is None:
                nv = missing_value()
                note = _note_missing(slug)
                counts["extended_missing_declared"] += 1
            else:
                nv = build_scalar_value(value, _READING_UNIT[slug], prop.canonical_unit)
                note = DEMO_NOTE
                counts["extended_values_created"] += 1
            rows.append(
                MaterialPropertyValue(
                    material_id=material.id,
                    property_id=prop.id,
                    value_scalar=nv.value_scalar,
                    value_min=nv.value_min,
                    value_max=nv.value_max,
                    value_typical=nv.value_typical,
                    original_unit=nv.original_unit,
                    normalized_value=nv.normalized_value,
                    canonical_unit=nv.canonical_unit,
                    conversion_method=nv.conversion_method,
                    notes=note,
                    source_id=source.id,
                    data_quality=DataQuality.ESTIMADO,
                    is_missing=nv.is_missing,
                )
            )
        for spec, definition in ordinals:
            if (material.id, definition.id) in ordinal_present:
                continue
            level = {lv.rank: lv for lv in definition.levels}[result.ranks[spec.slug]]
            rows.append(
                MaterialOrdinalValue(
                    material_id=material.id,
                    definition_id=definition.id,
                    level_id=level.id,
                    is_missing=False,
                    source_id=source.id,
                    data_quality=DataQuality.ESTIMADO,
                    notes=DEMO_NOTE,
                    is_demo=True,
                )
            )
            counts["extended_ordinal_values_created"] += 1
    db.add_all(rows)
    db.flush()
    return counts
