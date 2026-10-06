"""Gera (ou atualiza) Cérebro/manifesto.json a partir da convenção de pastas.

Conservador por princípio (mesmo raciocínio de D-21): só declara o que a
estrutura do repositório já deixa inequívoco. `autor` só é preenchido quando
o próprio nome do arquivo traz um sobrenome reconhecível antes de um hífen
separador — nunca por dedução de conteúdo.

Rodar de novo não sobrescreve entrada já presente no manifesto: se um humano
editou `titulo`/`autor`/`autoridade` à mão, a edição fica. Só caminhos ainda
não declarados são adicionados.

O que está em `Cérebro/removidos.txt` (D-100) nunca é declarado — pelo caminho
ou pelo conteúdo (as linhas `sha256:`) —, e uma entrada que já estivesse no
manifesto sai: o manifesto descreve a base, e o que saiu dela não é mais parte
dela.

Só PDFs são descobertos aqui. Um Markdown entra na base apenas quando alguém o
declara à mão (D-100, `Links.md`), e uma entrada declarada à mão nunca é
tocada.

Uso::

    python scripts/generate_knowledge_manifest.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

# Rodado como `python scripts/generate_knowledge_manifest.py`, o diretório do
# script vem primeiro no sys.path, e não `apps/api` — mesmo remendo de
# backfill_material_keywords.py.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.errors import ValidationError  # noqa: E402
from app.knowledge.removal import load_from_root  # noqa: E402

_FOLDER_RULES: list[tuple[str, str, str]] = [
    # (prefixo do caminho relativo, tipo, autoridade) — primeira regra que
    # casar vence, então a ordem importa: prefixos mais específicos primeiro.
    # Não há regra para `02-`: era o material de curso, retirado no D-100.
    ("01-Bibliografia/", "LIVRO", "CIENTIFICA"),
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

    # Autor só é extraído de livros (LIVRO) e artigos (ARTIGO) — nunca de
    # fichas técnicas (FICHA) ou outros documentos onde " - " é separador
    # de material/propriedade, não de título de obra.
    if kind in ("LIVRO", "ARTIGO"):
        match = _AUTHOR_PREFIX.match(Path(relative_path).name)
        if match:
            entry["autor"] = match.group(1)

    return entry


def update_manifest(root: Path) -> tuple[int, int, int]:
    """Atualiza ``<root>/manifesto.json``; devolve (declarados, novos, retirados)."""
    removed = load_from_root(root)
    manifest_path = root / "manifesto.json"
    existing: dict[str, dict] = {}
    if manifest_path.is_file():
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        existing = {entry["path"]: entry for entry in payload.get("documentos", [])}

    dropped = [path for path in existing if removed.matches(path)]
    for path in dropped:
        del existing[path]

    added = 0
    for path in sorted(root.rglob("*.pdf")):
        relative = path.relative_to(root).as_posix()
        if relative in existing or removed.matches(relative):
            continue
        if removed.checksums and removed.matches_checksum(
            hashlib.sha256(path.read_bytes()).hexdigest()
        ):
            continue
        existing[relative] = infer_provenance(relative)
        added += 1

    manifest_path.write_text(
        json.dumps({"documentos": list(existing.values())}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(existing), added, len(dropped)


def main() -> None:
    root = Path(__file__).resolve().parents[3] / "Cérebro"
    if not root.is_dir():
        print(f"[manifesto] {root} não existe; nada a fazer.")
        sys.exit(1)

    try:
        declared, added, dropped = update_manifest(root)
    except ValidationError as exc:
        # A removal list that does not parse (a misspelled prefix) stops the
        # script before the manifest is written: declaring what the list meant
        # to remove is exactly what it exists to prevent.
        print(f"[manifesto] ERRO: {exc}")
        sys.exit(1)
    print(
        f"[manifesto] {declared} documentos declarados ({added} novos, {dropped} retirados "
        f"pela lista de remoção). Gravado em {root / 'manifesto.json'}."
    )


if __name__ == "__main__":
    main()
