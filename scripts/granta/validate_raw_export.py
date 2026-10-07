#!/usr/bin/env python3
"""Validate one raw export produced by export_access_gdb.ps1.

Checks the schema hash, every table NDJSON hash/row count and every binary
sidecar referenced from a row. The validator is read-only and fails closed on
missing or inconsistent artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_binary_refs(value: Any):
    if isinstance(value, dict):
        if value.get("$type") == "binary":
            yield value
        for child in value.values():
            yield from iter_binary_refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_binary_refs(child)


def validate(export_dir: Path) -> dict[str, int]:
    manifest_path = export_dir / "raw_manifest.json"
    schema_path = export_dir / "schema.json"
    if not manifest_path.is_file():
        raise ValueError("raw_manifest.json ausente.")
    if not schema_path.is_file():
        raise ValueError("schema.json ausente.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    if manifest.get("format_version") != 1:
        raise ValueError(f"format_version incompatível: {manifest.get('format_version')!r}")
    if sha256(schema_path) != manifest.get("schema_sha256"):
        raise ValueError("SHA-256 de schema.json diverge do manifest.")

    checked_rows = 0
    checked_blobs: set[str] = set()
    tables = manifest.get("tables")
    if not isinstance(tables, dict):
        raise ValueError("manifest.tables precisa ser um objeto.")

    for table_name, spec in tables.items():
        if not isinstance(spec, dict):
            raise ValueError(f"Manifest inválido para tabela {table_name!r}.")
        relative = spec.get("file")
        expected_rows = spec.get("rows")
        expected_sha = spec.get("sha256")
        if not isinstance(relative, str):
            raise ValueError(f"Tabela {table_name!r} sem file.")
        path = export_dir / relative
        if not path.is_file():
            raise ValueError(f"Arquivo ausente para tabela {table_name!r}: {relative}")
        if sha256(path) != expected_sha:
            raise ValueError(f"SHA-256 divergente na tabela {table_name!r}.")

        rows = 0
        with path.open("r", encoding="utf-8-sig") as stream:
            for line_number, line in enumerate(stream, start=1):
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        f"{relative}:{line_number}: JSON inválido."
                    ) from exc
                if not isinstance(row, dict):
                    raise ValueError(
                        f"{relative}:{line_number}: esperado objeto JSON."
                    )
                rows += 1
                for ref in iter_binary_refs(row):
                    sidecar = ref.get("sidecar")
                    expected_blob_sha = ref.get("sha256")
                    expected_length = ref.get("length")
                    if not isinstance(sidecar, str) or not isinstance(
                        expected_blob_sha, str
                    ):
                        raise ValueError(
                            f"{relative}:{line_number}: referência binária inválida."
                        )
                    blob_path = export_dir / sidecar
                    if not blob_path.is_file():
                        raise ValueError(f"Blob ausente: {sidecar}")
                    actual_size = blob_path.stat().st_size
                    if actual_size != expected_length:
                        raise ValueError(
                            f"Blob {sidecar} com tamanho divergente: "
                            f"{actual_size} != {expected_length}."
                        )
                    if expected_blob_sha not in checked_blobs:
                        if sha256(blob_path) != expected_blob_sha:
                            raise ValueError(f"SHA-256 divergente no blob {sidecar}.")
                        checked_blobs.add(expected_blob_sha)

        if rows != expected_rows:
            raise ValueError(
                f"Contagem divergente em {table_name!r}: {rows} != {expected_rows}."
            )
        checked_rows += rows

    return {
        "tables": len(tables),
        "rows": checked_rows,
        "blobs": len(checked_blobs),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", required=True)
    args = parser.parse_args()
    result = validate(Path(args.export_dir).resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
