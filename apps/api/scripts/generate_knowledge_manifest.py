"""Gera (ou atualiza) Cérebro/manifesto.json a partir da convenção de pastas.

Conservador por princípio (mesmo raciocínio de D-21): só declara o que a
estrutura do repositório já deixa inequívoco. `autor` só é preenchido quando
o próprio nome do arquivo traz um sobrenome reconhecível antes de um hífen
separador — nunca por dedução de conteúdo.

Rodar de novo não sobrescreve entrada já presente no manifesto: se um humano
editou `titulo`/`autor`/`autoridade` à mão, a edição fica. Só caminhos ainda
não declarados são adicionados.

Uso::

    python scripts/generate_knowledge_manifest.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

_FOLDER_RULES: list[tuple[str, str, str]] = [
    # (prefixo do caminho relativo, tipo, autoridade) — primeira regra que
    # casar vence, então a ordem importa: prefixos mais específicos primeiro.
    ("01-Bibliografia/", "LIVRO", "CIENTIFICA"),
    ("02-Material-de-Curso-ENG02016/Topicos-de-Aula/", "SLIDE", "TECNICA"),
    ("02-Material-de-Curso-ENG02016/Trabalhos-Entregues/", "EXERCICIO", "TECNICA"),
    ("02-Material-de-Curso-ENG02016/Ferramentas-Avaliativas/", "OUTRO", "TECNICA"),
    ("02-Material-de-Curso-ENG02016/", "OUTRO", "TECNICA"),
    ("03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/", "FICHA", "TECNICA"),
    ("04-Ferramentas-e-Diagramas/", "OUTRO", "TECNICA"),
    ("05-Artigos-Cientificos/", "ARTIGO", "CIENTIFICA"),
]

# Um sobrenome antes de um separador " - " é inequívoco o bastante para
# declarar; qualquer outra coisa fica sem autor.
# Conservador: só match nomes sem underscores (que indicam convenção de arquivo)
# e de tamanho razoável para um sobrenome (3-15 chars).
_AUTHOR_PREFIX = re.compile(r"^([A-ZÀ-Ý][a-zA-Zà-ÿ]{2,14})\s*-\s+")


def infer_provenance(relative_path: str) -> dict:
    """Um item de ``manifesto.json`` inferido só da estrutura do caminho."""
    kind, authority = "OUTRO", "NAO_VERIFICADA"
    for prefix, k, a in _FOLDER_RULES:
        if relative_path.startswith(prefix):
            kind, authority = k, a
            break

    stem = Path(relative_path).stem
    entry: dict = {
        "path": relative_path,
        "titulo": stem.replace("-", " ").replace("_", " ").strip(),
        "tipo": kind,
        "autoridade": authority,
    }

    match = _AUTHOR_PREFIX.match(Path(relative_path).name)
    if match:
        entry["autor"] = match.group(1)

    return entry


def main() -> None:
    root = Path(__file__).resolve().parents[3] / "Cérebro"
    if not root.is_dir():
        print(f"[manifesto] {root} não existe; nada a fazer.")
        sys.exit(1)

    manifest_path = root / "manifesto.json"
    existing: dict[str, dict] = {}
    if manifest_path.is_file():
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        existing = {entry["path"]: entry for entry in payload.get("documentos", [])}

    added = 0
    for path in sorted(root.rglob("*.pdf")):
        relative = path.relative_to(root).as_posix()
        if relative in existing:
            continue
        existing[relative] = infer_provenance(relative)
        added += 1

    manifest_path.write_text(
        json.dumps({"documentos": list(existing.values())}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"[manifesto] {len(existing)} documentos declarados ({added} novos). Gravado em {manifest_path}."
    )


if __name__ == "__main__":
    main()
