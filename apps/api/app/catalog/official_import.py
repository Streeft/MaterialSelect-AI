"""CLI for validating or committing a canonical official catalogue bundle."""

from __future__ import annotations

import argparse
import json

from app.catalog.bundle import verify_bundle
from app.catalog.importer import OfficialCatalogImporter, validate_semantics
from app.db.base import SessionLocal


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, help="Canonical .zip bundle path")
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Commit to DATABASE_URL. Without this flag the command is read-only.",
    )
    parser.add_argument(
        "--reviewer-email",
        help="Existing MaterialSelect user who reviewed source/licence; required on commit.",
    )
    return parser


def main() -> None:
    args = _parser().parse_args()
    bundle = verify_bundle(args.bundle)
    semantic_counts = validate_semantics(bundle)
    summary = {
        "mode": "commit" if args.commit else "dry-run",
        "bundle_sha256": bundle.bundle_sha256,
        "manifest_sha256": bundle.manifest_sha256,
        "dataset": bundle.manifest["dataset"],
        "declared_counts": semantic_counts,
    }

    if not args.commit:
        print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
        return

    if not args.reviewer_email:
        raise SystemExit("--reviewer-email é obrigatório com --commit.")

    with SessionLocal() as db:
        result = OfficialCatalogImporter(db, bundle, reviewer_email=args.reviewer_email).run()
    summary["result"] = result
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
