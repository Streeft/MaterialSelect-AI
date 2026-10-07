"""The fixed list of chemical elements a composition row may name (D-105).

Public reference data, not a material property: the 118 elements named by
IUPAC, by symbol, atomic number and Portuguese name. It is code and not a
seeded table for the same reason a load case is code (D-64): it does not
change with the catalogue, nobody curates it, and a typo in a symbol must be
caught where the row is written — by the importer, the seed and the database
``CHECK`` alike — not after it has become a composition nobody can search.

Symbols are unique ignoring case (there is no ``Co``/``CO`` pair among the
elements), which is what lets a reader type ``comp:cr>=12`` and still mean
chromium.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Element:
    symbol: str
    number: int
    name: str


#: (symbol, Portuguese name) in atomic-number order.
_TABLE: tuple[tuple[str, str], ...] = (
    ("H", "Hidrogênio"),
    ("He", "Hélio"),
    ("Li", "Lítio"),
    ("Be", "Berílio"),
    ("B", "Boro"),
    ("C", "Carbono"),
    ("N", "Nitrogênio"),
    ("O", "Oxigênio"),
    ("F", "Flúor"),
    ("Ne", "Neônio"),
    ("Na", "Sódio"),
    ("Mg", "Magnésio"),
    ("Al", "Alumínio"),
    ("Si", "Silício"),
    ("P", "Fósforo"),
    ("S", "Enxofre"),
    ("Cl", "Cloro"),
    ("Ar", "Argônio"),
    ("K", "Potássio"),
    ("Ca", "Cálcio"),
    ("Sc", "Escândio"),
    ("Ti", "Titânio"),
    ("V", "Vanádio"),
    ("Cr", "Cromo"),
    ("Mn", "Manganês"),
    ("Fe", "Ferro"),
    ("Co", "Cobalto"),
    ("Ni", "Níquel"),
    ("Cu", "Cobre"),
    ("Zn", "Zinco"),
    ("Ga", "Gálio"),
    ("Ge", "Germânio"),
    ("As", "Arsênio"),
    ("Se", "Selênio"),
    ("Br", "Bromo"),
    ("Kr", "Criptônio"),
    ("Rb", "Rubídio"),
    ("Sr", "Estrôncio"),
    ("Y", "Ítrio"),
    ("Zr", "Zircônio"),
    ("Nb", "Nióbio"),
    ("Mo", "Molibdênio"),
    ("Tc", "Tecnécio"),
    ("Ru", "Rutênio"),
    ("Rh", "Ródio"),
    ("Pd", "Paládio"),
    ("Ag", "Prata"),
    ("Cd", "Cádmio"),
    ("In", "Índio"),
    ("Sn", "Estanho"),
    ("Sb", "Antimônio"),
    ("Te", "Telúrio"),
    ("I", "Iodo"),
    ("Xe", "Xenônio"),
    ("Cs", "Césio"),
    ("Ba", "Bário"),
    ("La", "Lantânio"),
    ("Ce", "Cério"),
    ("Pr", "Praseodímio"),
    ("Nd", "Neodímio"),
    ("Pm", "Promécio"),
    ("Sm", "Samário"),
    ("Eu", "Európio"),
    ("Gd", "Gadolínio"),
    ("Tb", "Térbio"),
    ("Dy", "Disprósio"),
    ("Ho", "Hólmio"),
    ("Er", "Érbio"),
    ("Tm", "Túlio"),
    ("Yb", "Itérbio"),
    ("Lu", "Lutécio"),
    ("Hf", "Háfnio"),
    ("Ta", "Tântalo"),
    ("W", "Tungstênio"),
    ("Re", "Rênio"),
    ("Os", "Ósmio"),
    ("Ir", "Irídio"),
    ("Pt", "Platina"),
    ("Au", "Ouro"),
    ("Hg", "Mercúrio"),
    ("Tl", "Tálio"),
    ("Pb", "Chumbo"),
    ("Bi", "Bismuto"),
    ("Po", "Polônio"),
    ("At", "Astato"),
    ("Rn", "Radônio"),
    ("Fr", "Frâncio"),
    ("Ra", "Rádio"),
    ("Ac", "Actínio"),
    ("Th", "Tório"),
    ("Pa", "Protactínio"),
    ("U", "Urânio"),
    ("Np", "Netúnio"),
    ("Pu", "Plutônio"),
    ("Am", "Amerício"),
    ("Cm", "Cúrio"),
    ("Bk", "Berquélio"),
    ("Cf", "Califórnio"),
    ("Es", "Einstênio"),
    ("Fm", "Férmio"),
    ("Md", "Mendelévio"),
    ("No", "Nobélio"),
    ("Lr", "Laurêncio"),
    ("Rf", "Rutherfórdio"),
    ("Db", "Dúbnio"),
    ("Sg", "Seabórgio"),
    ("Bh", "Bóhrio"),
    ("Hs", "Hássio"),
    ("Mt", "Meitnério"),
    ("Ds", "Darmstádio"),
    ("Rg", "Roentgênio"),
    ("Cn", "Copernício"),
    ("Nh", "Nihônio"),
    ("Fl", "Fleróvio"),
    ("Mc", "Moscóvio"),
    ("Lv", "Livermório"),
    ("Ts", "Tennessino"),
    ("Og", "Oganessônio"),
)

ELEMENTS: tuple[Element, ...] = tuple(
    Element(symbol=symbol, number=index + 1, name=name)
    for index, (symbol, name) in enumerate(_TABLE)
)

#: Every valid symbol, in its canonical capitalisation.
SYMBOLS: tuple[str, ...] = tuple(element.symbol for element in ELEMENTS)

_BY_FOLDED_SYMBOL: dict[str, Element] = {element.symbol.casefold(): element for element in ELEMENTS}


def element_for(symbol: str) -> Element | None:
    """The element a symbol names, ignoring case; ``None`` for anything else."""
    return _BY_FOLDED_SYMBOL.get(symbol.strip().casefold())
