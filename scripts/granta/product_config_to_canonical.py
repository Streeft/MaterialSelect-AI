#!/usr/bin/env python3
"""Convert Granta ProductConfig.xml into canonical transport/support records.

The script does not copy ProductConfig.xml into git. It reads a licensed local
file and writes canonical NDJSON that can be reviewed before bundle creation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def slugify(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def element_hash(element: ET.Element) -> str:
    raw = ET.tostring(element, encoding="utf-8")
    return hashlib.sha256(raw).hexdigest()


def text(element: ET.Element, name: str) -> str | None:
    node = element.find(name)
    if node is None or node.text is None:
        return None
    value = node.text.strip()
    return value or None


def number(element: ET.Element, name: str) -> float | None:
    value = text(element, name)
    return float(value) if value is not None else None


def write_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            stream.write("\n")


def supplemental(
    *,
    target_type: str,
    target_external_id: str,
    external_table: str,
    external_record_id: str,
    attribute_id: str,
    attribute_name: str,
    payload: Any,
    raw_sha256: str,
    original_unit: str | None = None,
    value_kind: str = "scalar",
) -> dict[str, Any]:
    return {
        "target_type": target_type,
        "target_external_id": target_external_id,
        "external_table": external_table,
        "external_record_id": external_record_id,
        "external_attribute_id": attribute_id,
        "attribute_name": attribute_name,
        "value_kind": value_kind,
        "original_unit": original_unit,
        "payload": payload,
        "raw_sha256": raw_sha256,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xml", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--process-map",
        help=(
            "Optional JSON object mapping ProductConfig process GRUID/name to "
            "the canonical ProcessUniverse external_id."
        ),
    )
    args = parser.parse_args()

    xml_path = Path(args.xml)
    output_dir = Path(args.output_dir)
    root = ET.parse(xml_path).getroot()

    process_map: dict[str, str] = {}
    if args.process_map:
        loaded = json.loads(Path(args.process_map).read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise SystemExit("--process-map precisa ser um objeto JSON.")
        process_map = {str(k): str(v) for k, v in loaded.items()}

    transports: list[dict[str, Any]] = []
    supplements: list[dict[str, Any]] = []
    order = 10

    transportation = root.find("Transportation")
    if transportation is not None:
        for node in transportation.findall("Transport"):
            name = text(node, "Name")
            if not name or set(name) <= {"-"}:
                continue
            raw_hash = element_hash(node)
            external_id = name
            transports.append(
                {
                    "external_table": "ProductConfig/Transportation",
                    "external_id": external_id,
                    "raw_sha256": raw_hash,
                    "slug": slugify(name),
                    "name": name,
                    "description": "Modal importado do ProductConfig licenciado.",
                    "energy_intensity": number(node, "EmbodiedEnergy"),
                    "carbon_intensity": number(node, "CO2footprint"),
                    "display_order": order,
                }
            )
            order += 10
            extra_fields = [
                ("OilEquivalence", "Equivalência de petróleo", "MJ/MJ"),
                ("CriticalMinimumDensity", "Densidade crítica mínima", "kg/m^3"),
                ("SwitchDistance", "Distância de mudança de regime", "km"),
                ("T1", "Fator de correção de transporte T1", None),
                ("T2", "Custo fixo de transporte T2", "USD/kgkm"),
                ("T3", "Custo variável de transporte T3", "USD/kgkm"),
            ]
            for field, label, unit in extra_fields:
                value = number(node, field)
                if value is None:
                    continue
                supplements.append(
                    supplemental(
                        target_type="transport",
                        target_external_id=external_id,
                        external_table="ProductConfig/Transportation",
                        external_record_id=external_id,
                        attribute_id=field,
                        attribute_name=label,
                        payload=value,
                        raw_sha256=hashlib.sha256(
                            f"{raw_hash}:{field}:{value}".encode()
                        ).hexdigest(),
                        original_unit=unit,
                    )
                )

    # Process defaults enrich ProcessUniverse only when an explicit reviewed
    # mapping is supplied. No fuzzy/name-only merge is performed implicitly.
    for section_name in ("PrimaryProcesses", "SecondaryProcesses", "FinishingProcesses"):
        section = root.find(section_name)
        if section is None:
            continue
        for node in section.findall("Process"):
            name = text(node, "Name")
            if not name or set(name) <= {"-"}:
                continue
            gruid = text(node, "GRUID")
            canonical_id = process_map.get(gruid or "") or process_map.get(name)
            if canonical_id is None:
                continue
            raw_hash = element_hash(node)
            fields: list[tuple[str, str, Any, str | None, str]] = [
                ("Energy", "Referência de energia", text(node, "Energy"), None, "reference"),
                ("Carbon", "Referência de carbono", text(node, "Carbon"), None, "reference"),
                ("EnergyValue", "Energia padrão", number(node, "EnergyValue"), None, "scalar"),
                ("CarbonValue", "Carbono padrão", number(node, "CarbonValue"), None, "scalar"),
                ("LaborTime", "Tempo de mão de obra", number(node, "LaborTime"), "hour", "scalar"),
                (
                    "EnergyConversionFactor",
                    "Fator de conversão de energia",
                    number(node, "EnergyConversionFactor"),
                    None,
                    "scalar",
                ),
                ("FuelType", "Tipo de combustível", text(node, "FuelType"), None, "text"),
                ("FuelRate", "Tarifa de combustível", text(node, "FuelRate"), None, "text"),
                ("Unit", "Unidade do processo", text(node, "Unit"), None, "text"),
            ]
            for field, label, value, unit, kind in fields:
                if value is None:
                    continue
                supplements.append(
                    supplemental(
                        target_type="process",
                        target_external_id=canonical_id,
                        external_table=f"ProductConfig/{section_name}",
                        external_record_id=gruid or name,
                        attribute_id=field,
                        attribute_name=label,
                        payload=value,
                        raw_sha256=hashlib.sha256(
                            f"{raw_hash}:{field}:{value}".encode()
                        ).hexdigest(),
                        original_unit=unit,
                        value_kind=kind,
                    )
                )

    write_ndjson(output_dir / "transport_modes.ndjson", transports)
    write_ndjson(output_dir / "product_config_supplemental.ndjson", supplements)
    print(
        json.dumps(
            {
                "transport_modes": len(transports),
                "supplemental_values": len(supplements),
                "note": (
                    "Mescle product_config_supplemental.ndjson ao "
                    "supplemental_values.ndjson após revisar o process-map."
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
