"""Verified reader for the canonical official-catalogue ZIP bundle."""

from __future__ import annotations

import hashlib
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from collections.abc import Iterator

MAX_MANIFEST_BYTES = 1_000_000
MAX_RECORD_BYTES = 10_000_000
SCHEMA_VERSION = 1


class BundleValidationError(ValueError):
    """The bundle is malformed, incomplete or fails an integrity check."""


@dataclass(frozen=True)
class BundleFile:
    name: str
    sha256: str
    count: int


@dataclass(frozen=True)
class VerifiedBundle:
    path: Path
    bundle_sha256: str
    manifest_sha256: str
    manifest: dict
    files: dict[str, BundleFile]

    def iter_records(self, name: str) -> Iterator[dict]:
        """Yield decoded NDJSON records from a verified declared file."""
        if name not in self.files:
            return
        with zipfile.ZipFile(self.path) as archive, archive.open(name, "r") as stream:
            for number, raw in enumerate(stream, start=1):
                if not raw.strip():
                    continue
                if len(raw) > MAX_RECORD_BYTES:
                    raise BundleValidationError(
                        f"{name}:{number} excede {MAX_RECORD_BYTES} bytes."
                    )
                try:
                    value = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise BundleValidationError(
                        f"{name}:{number} não é JSON válido."
                    ) from exc
                if not isinstance(value, dict):
                    raise BundleValidationError(
                        f"{name}:{number} precisa ser um objeto JSON."
                    )
                yield value


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_member_name(name: str) -> None:
    part = PurePosixPath(name)
    if part.is_absolute() or ".." in part.parts or "\\" in name:
        raise BundleValidationError(f"Caminho inseguro no ZIP: {name!r}")


def _hash_member(archive: zipfile.ZipFile, name: str) -> tuple[str, int]:
    digest = hashlib.sha256()
    count = 0
    with archive.open(name, "r") as stream:
        for raw in stream:
            digest.update(raw)
            if raw.strip():
                count += 1
    return digest.hexdigest(), count


def verify_bundle(path: str | Path) -> VerifiedBundle:
    """Verify ZIP structure, manifest, hashes and declared record counts."""
    bundle_path = Path(path)
    if not bundle_path.is_file():
        raise BundleValidationError(f"Bundle não encontrado: {bundle_path}")

    bundle_sha = _sha256_file(bundle_path)
    try:
        archive = zipfile.ZipFile(bundle_path)
    except zipfile.BadZipFile as exc:
        raise BundleValidationError("O bundle não é um ZIP válido.") from exc

    with archive:
        names = archive.namelist()
        if "manifest.json" not in names:
            raise BundleValidationError("manifest.json ausente.")
        for name in names:
            _validate_member_name(name)

        info = archive.getinfo("manifest.json")
        if info.file_size > MAX_MANIFEST_BYTES:
            raise BundleValidationError("manifest.json excede o limite de tamanho.")
        raw_manifest = archive.read("manifest.json")
        manifest_sha = hashlib.sha256(raw_manifest).hexdigest()
        try:
            manifest = json.loads(raw_manifest)
        except json.JSONDecodeError as exc:
            raise BundleValidationError("manifest.json inválido.") from exc

        if not isinstance(manifest, dict):
            raise BundleValidationError("manifest.json precisa ser um objeto.")
        if manifest.get("schema_version") != SCHEMA_VERSION:
            raise BundleValidationError(
                f"schema_version incompatível: {manifest.get('schema_version')!r}"
            )

        dataset = manifest.get("dataset")
        required_dataset = {
            "slug",
            "name",
            "source_sha256",
            "license_label",
        }
        if not isinstance(dataset, dict) or not required_dataset.issubset(dataset):
            missing = sorted(required_dataset - set(dataset or {}))
            raise BundleValidationError(
                f"Metadados obrigatórios do dataset ausentes: {missing}"
            )

        declared = manifest.get("files")
        if not isinstance(declared, dict):
            raise BundleValidationError("manifest.files precisa ser um objeto.")

        files: dict[str, BundleFile] = {}
        allowed_names = {"manifest.json"}
        for name, spec in declared.items():
            _validate_member_name(name)
            if not isinstance(spec, dict):
                raise BundleValidationError(f"Especificação inválida de {name}.")
            if name not in names:
                raise BundleValidationError(f"Arquivo declarado ausente: {name}")
            expected_sha = spec.get("sha256")
            expected_count = spec.get("count")
            if not isinstance(expected_sha, str) or len(expected_sha) != 64:
                raise BundleValidationError(f"sha256 inválido em {name}.")
            if not isinstance(expected_count, int) or expected_count < 0:
                raise BundleValidationError(f"count inválido em {name}.")
            actual_sha, actual_count = _hash_member(archive, name)
            if actual_sha != expected_sha:
                raise BundleValidationError(f"Checksum divergente em {name}.")
            if actual_count != expected_count:
                raise BundleValidationError(
                    f"Contagem divergente em {name}: "
                    f"manifest={expected_count}, arquivo={actual_count}."
                )
            files[name] = BundleFile(name, actual_sha, actual_count)
            allowed_names.add(name)

        undeclared = [
            name for name in names if not name.endswith("/") and name not in allowed_names
        ]
        if undeclared:
            raise BundleValidationError(
                "Arquivos não declarados no manifest: " + ", ".join(sorted(undeclared))
            )

    return VerifiedBundle(
        path=bundle_path,
        bundle_sha256=bundle_sha,
        manifest_sha256=manifest_sha,
        manifest=manifest,
        files=files,
    )
