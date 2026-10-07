#!/usr/bin/env python3
"""Build a semantic dictionary from Granta EduPack exporter .exp XML files.

The exporter configurations are useful as a provider-authored vocabulary:
tables are identified by GUID and properties by StandardName; EntireGraph=true
marks attributes that must not be flattened to one scalar. The script emits
metadata only — never material records or property values.

Example:
    python scripts/granta/exporter_configs_to_dictionary.py \
      --exporters-dir "C:/Program Files/ANSYS Inc/v252/edupack/Exporters" \
      --output exporter_dictionary.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bool_attr(value: str | None) -> bool:
    return str(value).lower() == "true"


def parse_exporter(path: Path, root_dir: Path) -> dict[str, Any]:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        raise SystemExit(f"{path}: XML inválido: {exc}") from exc

    details = root.find("Details")
    tables: list[dict[str, Any]] = []
    for table in root.findall(".//Table"):
        attrs: list[dict[str, Any]] = []
        for attribute in table.findall("./DbAttributes/DBAttribute"):
            standard_name = attribute.get("StandardName")
            if not standard_name:
                continue
            attrs.append(
                {
                    "standard_name": standard_name,
                    "entire_graph": bool_attr(attribute.get("EntireGraph")),
                    "standard_name_as_alias": bool_attr(
                        attribute.get("StandardNameAsAlias")
                    ),
                    "raw_attributes": dict(sorted(attribute.attrib.items())),
                }
            )
        tables.append(
            {
                "name": table.get("Name"),
                "guid": table.get("Guid"),
                "attributes": attrs,
            }
        )

    return {
        "file": path.relative_to(root_dir).as_posix(),
        "sha256": sha256(path),
        "config_name": root.get("Name"),
        "package": details.findtext("Package") if details is not None else None,
        "model": details.findtext("Model") if details is not None else None,
        "description": (
            details.findtext("Description") if details is not None else None
        ),
        "unit_systems": sorted(
            {
                node.get("Name")
                for node in root.findall(".//UnitSystem")
                if node.get("Name")
            }
        ),
        "tables": tables,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exporters-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    root_dir = Path(args.exporters_dir).resolve()
    files = sorted(root_dir.rglob("*.exp"))
    if not files:
        raise SystemExit(f"Nenhum .exp encontrado em {root_dir}")

    configs = [parse_exporter(path, root_dir) for path in files]

    table_acc: dict[tuple[str | None, str | None], dict[str, Any]] = {}
    property_acc: dict[str, dict[str, Any]] = {}
    for config in configs:
        for table in config["tables"]:
            key = (table["guid"], table["name"])
            aggregate = table_acc.setdefault(
                key,
                {
                    "guid": table["guid"],
                    "name": table["name"],
                    "exporter_files": set(),
                    "standard_names": set(),
                    "graph_standard_names": set(),
                },
            )
            aggregate["exporter_files"].add(config["file"])
            for attribute in table["attributes"]:
                standard_name = attribute["standard_name"]
                aggregate["standard_names"].add(standard_name)
                if attribute["entire_graph"]:
                    aggregate["graph_standard_names"].add(standard_name)

                prop = property_acc.setdefault(
                    standard_name,
                    {
                        "standard_name": standard_name,
                        "tables": set(),
                        "exporter_files": set(),
                        "seen_as_graph": False,
                        "seen_as_scalar": False,
                    },
                )
                prop["tables"].add(table["name"] or table["guid"] or "<unknown>")
                prop["exporter_files"].add(config["file"])
                if attribute["entire_graph"]:
                    prop["seen_as_graph"] = True
                else:
                    prop["seen_as_scalar"] = True

    tables = []
    for aggregate in table_acc.values():
        tables.append(
            {
                "guid": aggregate["guid"],
                "name": aggregate["name"],
                "exporter_files": sorted(aggregate["exporter_files"]),
                "standard_names": sorted(aggregate["standard_names"]),
                "graph_standard_names": sorted(
                    aggregate["graph_standard_names"]
                ),
            }
        )
    tables.sort(key=lambda row: ((row["name"] or ""), (row["guid"] or "")))

    properties = []
    for prop in property_acc.values():
        properties.append(
            {
                "standard_name": prop["standard_name"],
                "tables": sorted(prop["tables"]),
                "exporter_files": sorted(prop["exporter_files"]),
                "seen_as_graph": prop["seen_as_graph"],
                "seen_as_scalar": prop["seen_as_scalar"],
            }
        )
    properties.sort(key=lambda row: row["standard_name"].casefold())

    output = {
        "format_version": 1,
        "source": "Granta EduPack exporter .exp metadata",
        "exporter_file_count": len(configs),
        "table_count": len(tables),
        "standard_name_count": len(properties),
        "graph_standard_name_count": sum(
            1 for row in properties if row["seen_as_graph"]
        ),
        "configs": configs,
        "tables": tables,
        "properties": properties,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(output_path),
                "exporter_file_count": len(configs),
                "table_count": len(tables),
                "standard_name_count": len(properties),
                "graph_standard_name_count": output[
                    "graph_standard_name_count"
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
