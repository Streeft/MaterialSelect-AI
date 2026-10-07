#!/usr/bin/env python3
"""Build a hash-verified canonical catalogue ZIP from prepared NDJSON files."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

KNOWN_FILES = [
    "material_classes.ndjson",
    "property_definitions.ndjson",
    "materials.ndjson",
    "material_values.ndjson",
    "process_classes.ndjson",
    "process_attribute_definitions.ndjson",
    "processes.ndjson",
    "process_attribute_values.ndjson",
    "material_process_links.ndjson",
    "transport_modes.ndjson",
    "supplemental_values.ndjson",
    "dataset_values.ndjson",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def count_records(path: Path) -> int:
    count = 0
    with path.open("rb") as stream:
        for number, raw in enumerate(stream, start=1):
            if not raw.strip():
                continue
            try:
                value = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{number}: JSON inválido") from exc
            if not isinstance(value, dict):
                raise SystemExit(f"{path}:{number}: esperado objeto JSON")
            count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging-dir", required=True)
    parser.add_argument("--dataset-json", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    staging = Path(args.staging_dir)
    dataset_path = Path(args.dataset_json)
    output = Path(args.output)

    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    required = {"slug", "name", "source_sha256", "license_label"}
    missing = required - set(dataset)
    if missing:
        raise SystemExit(f"dataset.json sem campos obrigatórios: {sorted(missing)}")

    files: dict[str, dict[str, object]] = {}
    selected: list[Path] = []
    for name in KNOWN_FILES:
        path = staging / name
        if not path.exists():
            continue
        selected.append(path)
        files[name] = {"sha256": sha256(path), "count": count_records(path)}

    manifest = {
        "schema_version": 1,
        "dataset": dataset,
        "files": files,
    }
    raw_manifest = json.dumps(
        manifest, ensure_ascii=False, indent=2, sort_keys=True
    ).encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", raw_manifest)
        for path in selected:
            archive.write(path, arcname=path.name)

    print(
        json.dumps(
            {
                "output": str(output),
                "sha256": sha256(output),
                "files": files,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
