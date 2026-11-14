"""Final script (roteiro-final.md) and YouTube description, from the cut timelines.

Chapter times come from the timeline the video was rendered from, so the
description's timestamps match the published file to the second.
Usage: python textos_finais.py --completo timeline-completo.json --curto timeline-curto.json --saida DIR
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

CAPITULOS = {
    "A0": "Abertura",
    "C1": "1. O método",
    "C2": "2. Seleção",
    "C3": "3. Mapas e comparação",
    "C4": "4. Dados confiáveis",
    "C5": "5. Dimensionar e custo",
    "C6": "6. Demais recursos",
    "C7": "7. Verificação e limites",
    "C8": "Encerramento",
}


def mmss(t: float) -> str:
    t = int(t)
    return f"{t // 60:d}:{t % 60:02d}"


def capitulos(tl: dict) -> list[tuple[float, str]]:
    out = []
    for it in tl["itens"]:
        if it["id"] in CAPITULOS:
            nome = CAPITULOS[it["id"]]
            if tl["corte"] == "curto" and nome[0].isdigit():
                nome = nome.split(". ", 1)[1]
            out.append((it["inicio"], nome))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--completo", required=True)
    ap.add_argument("--curto", required=True)
    ap.add_argument("--saida", required=True)
    args = ap.parse_args()
    comp = json.loads(Path(args.completo).read_text(encoding="utf-8"))
    curto = json.loads(Path(args.curto).read_text(encoding="utf-8"))
    out = Path(args.saida)

    md = [
        "# Roteiro final — vídeo de apresentação do MaterialSelect AI",
        "",
        f"Versão completa: **{mmss(comp['duracao'])}** ({comp['duracao']:.1f} s). "
        f"Corte curto: **{mmss(curto['duracao'])}** ({curto['duracao']:.1f} s).",
        "Narração: versão completa com a voz \"Marcio\" (ElevenLabs, `eleven_v4`); corte curto com a voz "
        "\"Andre\" (ElevenLabs, via Higgsfield). Valores do catálogo: demonstrativos (fictícios). "
        "Texto aprovado: versão completa em [`roteiro-v3.md`](roteiro-v3.md); corte curto em "
        "[`roteiro-mestre.md`](roteiro-mestre.md) com a decisão R1(b).",
        "",
        "## Capítulos (versão completa)",
        "",
        "| Capítulo | Início |",
        "|---|---|",
    ]
    md += [f"| {n} | {mmss(t)} |" for t, n in capitulos(comp)]
    md += ["", "## Cenas (versão completa)", "", "| Cena | Bloco | Início | Duração (s) | Narração |", "|---|---|---|---|---|"]
    for it in comp["itens"]:
        if it["tipo"] == "cartela":
            txt = f"(cartela: {it['titulo']})"
        else:
            fr = it.get("narracao", {}).get("frases", [])
            txt = " ".join(f["texto"] for f in fr) if fr else "(sem narração)"
        md.append(f"| {it['id']} | {it['bloco']} | {mmss(it['inicio'])} | {it['duracao']:.1f} | {txt} |")
    md += ["", "## Corte curto", "", "| Capítulo | Início |", "|---|---|"]
    md += [f"| {n} | {mmss(t)} |" for t, n in capitulos(curto)]
    md += ["", "Cenas: " + " → ".join(it["id"] for it in curto["itens"]) + ".", ""]
    (out / "roteiro-final.md").write_text("\n".join(md), encoding="utf-8")

    desc = [
        "MaterialSelect AI: seleção de materiais pelo método de Ashby",
        "",
        "Apresentação da ferramenta desenvolvida no Trabalho de Conclusão de Curso em Engenharia de Materiais (UFRGS).",
        "Autor: Francisco de Almeida Lemos. Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez.",
        "",
        "O vídeo mostra o método (função, objetivo, limites e índice de desempenho), a seleção passo a passo de um tirante leve e rígido, os mapas de propriedades com a reta do índice, a comparação lado a lado, a rastreabilidade dos dados, o dimensionamento com estimativa de custo, um passeio pelos demais recursos e os limites da ferramenta.",
        "Todo número é calculado no servidor, de forma determinística. A inteligência artificial é opcional: só interpreta o texto do pedido e redige explicações; não produz valores e não decide.",
        "",
        "IMPORTANTE: os materiais e valores mostrados são demonstrativos (fictícios). Servem para ensinar o método, não para especificar material para um projeto real.",
        "",
        "Teste de usabilidade (estudantes de Engenharia de Materiais): [LINK DO FORMULÁRIO]",
        "Aplicação: https://material-select-ai-web.vercel.app",
        "Código: https://github.com/Streeft/MaterialSelect-AI",
        "",
        "Capítulos",
    ]
    desc += [f"{mmss(t)} {n}" for t, n in capitulos(comp)]
    desc += [
        "",
        "Referência do método: ASHBY, M. F. Materials Selection in Mechanical Design. 5. ed. Oxford: Butterworth-Heinemann, 2017.",
        "",
        "Créditos",
        "Música: \"Wallpaper\" Kevin MacLeod (incompetech.com)",
        "Licensed under Creative Commons: By Attribution 4.0 License",
        "http://creativecommons.org/licenses/by/4.0/",
        "Narração: voz sintética \"Marcio\" (ElevenLabs). Sons de interface: síntese própria. Animações: Remotion.",
        "Telas: gravação real da aplicação, rodando localmente com dados demonstrativos.",
        "",
        f"Há também um corte curto ({mmss(curto['duracao'])}), narrado com a voz sintética \"Andre\" (ElevenLabs, via Higgsfield).",
    ]
    (out / "descricao_youtube.txt").write_text("\n".join(desc) + "\n", encoding="utf-8")
    print("roteiro-final.md e descricao_youtube.txt em", out)


if __name__ == "__main__":
    main()
