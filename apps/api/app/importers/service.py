"""Import wizard orchestration.

Lifecycle (see :class:`app.models.enums.ImportStatus`)::

    upload  -> PENDENTE   (file stored, headers/sample/suggestions returned)
    validate-> VALIDADO   (dry run: per-row report, nothing written)
    commit  -> IMPORTADO  (valid rows created in ONE transaction)
    cancel  -> CANCELADO
    rollback-> REVERTIDO  (materials created by the job are removed)

Every imported value goes through the exact same domain builders as manual
entry (``MaterialService._build_value_from_input``), so unit conversion,
interval rules and the missing-≠-zero policy hold by construction.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.slug import slugify
from app.importers.parsing import (
    CellParseError,
    header_without_unit,
    parse_cell,
    sanitize_text_cell,
    unit_from_header,
)
from app.importers.readers import ALLOWED_EXTENSIONS, TabularData, read_tabular
from app.models.enums import DataQuality, ImportStatus
from app.models.import_job import ImportJob, ImportMappingTemplate
from app.models.material import Material
from app.repositories.import_repository import ImportRepository
from app.repositories.material_repository import MaterialRepository
from app.schemas.imports import (
    ColumnSuggestion,
    CommitResult,
    ImportJobOut,
    ImportMapping,
    RowIssue,
    RowReport,
    TemplateIn,
    TemplateOut,
    UploadResult,
    ValidationReport,
)
from app.schemas.material import PropertyValueIn
from app.services.material_service import MaterialService

_SAMPLE_ROWS = 10
_SAFE_FILENAME_RE = re.compile(r"[^\w.\- ]", flags=re.UNICODE)

# Header names (lowercase) auto-suggested for identity fields.
_NAME_HEADERS = {"nome", "name", "material", "material_name"}
_CLASS_HEADERS = {"classe", "class", "familia", "família", "family"}
_SUBCLASS_HEADERS = {"subclasse", "subclass"}
_DESCRIPTION_HEADERS = {"descricao", "descrição", "description"}
_KEYWORDS_HEADERS = {"palavras_chave", "palavras-chave", "keywords", "tags"}


def sanitize_filename(raw: str) -> str:
    """Keep only the basename with a conservative character set."""
    base = Path(raw).name
    cleaned = _SAFE_FILENAME_RE.sub("_", base).strip() or "arquivo"
    return cleaned[:255]


class ImportService:
    """Drives the import wizard endpoints."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ImportRepository(db)
        self.materials = MaterialRepository(db)
        self.material_service = MaterialService(db)

    # --- upload -----------------------------------------------------------

    def upload(self, filename: str, data: bytes) -> UploadResult:
        """Store the file, parse headers/sample and return mapping suggestions."""
        if len(data) == 0:
            raise ValidationError("O arquivo está vazio.")
        if len(data) > settings.max_upload_bytes:
            limit_mb = settings.max_upload_bytes / (1024 * 1024)
            raise ValidationError(f"Arquivo excede o limite de {limit_mb:.0f} MB.")

        safe_name = sanitize_filename(filename)
        extension = Path(safe_name).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise ValidationError(
                f"Extensão não suportada: {extension or '(nenhuma)'} — use .csv ou .xlsx."
            )
        file_format = extension.lstrip(".")

        # Parse BEFORE persisting anything, so a malformed file leaves no job.
        table = read_tabular(data, file_format, settings.max_import_rows)

        job = ImportJob(filename=safe_name, stored_path="", file_format=file_format)
        self.repo.add(job)
        self.repo.flush()  # allocates job.id used in the storage filename

        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        stored = upload_dir / f"job-{job.id}.{file_format}"
        stored.write_bytes(data)

        job.stored_path = str(stored)
        job.sheet_name = table.sheet_name
        job.row_count = len(table.rows)
        self.repo.commit()

        return self._upload_result(job, table)

    def preview_sheet(self, job_id: int, sheet_name: str | None) -> UploadResult:
        """Re-read headers/sample for another sheet of an uploaded XLSX."""
        job = self._job_in_status(job_id, {ImportStatus.PENDENTE, ImportStatus.VALIDADO})
        table = self._read_job_file(job, sheet_name)
        job.sheet_name = table.sheet_name
        job.row_count = len(table.rows)
        self.repo.commit()
        return self._upload_result(job, table)

    def _upload_result(self, job: ImportJob, table: TabularData) -> UploadResult:
        sample = [
            [None if cell is None else str(cell) for cell in row]
            for row in table.rows[:_SAMPLE_ROWS]
        ]
        return UploadResult(
            job_id=job.id,
            filename=job.filename,
            file_format=job.file_format,
            sheet_names=table.sheet_names,
            sheet_name=table.sheet_name,
            headers=table.headers,
            sample_rows=sample,
            row_count=len(table.rows),
            suggestions=self._suggest(table.headers),
        )

    def _suggest(self, headers: list[str]) -> list[ColumnSuggestion]:
        """Heuristic mapping suggestions from header names (UI pre-fill only)."""
        # Keyed by `slugify(p.slug)`, not `p.slug` itself: a stored slug like
        # "modulo_young" uses underscores, but `slugify(prop_base)` below always
        # produces hyphens — comparing the two forms directly meant every
        # property whose slug has more than one word (most of them) could never
        # be auto-suggested from a header, however the header spelled it.
        properties = {slugify(p.slug): p for p in self.repo.list_properties()}
        suggestions: list[ColumnSuggestion] = []
        for header in headers:
            base = header_without_unit(header).strip().lower()
            unit = unit_from_header(header)
            suggestion = ColumnSuggestion(column=header, suggested_unit=unit)

            role = "value"
            prop_base = base
            for suffix, mapped_role in (("_min", "min"), ("_max", "max"), ("_tipico", "typical")):
                if base.endswith(suffix):
                    role = mapped_role
                    prop_base = base[: -len(suffix)]
                    break

            if base in _NAME_HEADERS:
                suggestion.suggested_target = "name"
            elif base in _CLASS_HEADERS:
                suggestion.suggested_target = "class"
            elif base in _SUBCLASS_HEADERS:
                suggestion.suggested_target = "subclass"
            elif base in _DESCRIPTION_HEADERS:
                suggestion.suggested_target = "description"
            elif base in _KEYWORDS_HEADERS:
                suggestion.suggested_target = "keywords"
            else:
                slug_guess = slugify(prop_base)
                if slug_guess in properties:
                    prop = properties[slug_guess]
                    suggestion.suggested_target = "property"
                    suggestion.suggested_property_slug = prop.slug
                    suggestion.suggested_role = role  # type: ignore[assignment]
                    if suggestion.suggested_unit is None:
                        suggestion.suggested_unit = prop.canonical_unit
            suggestions.append(suggestion)
        return suggestions

    # --- validate ----------------------------------------------------------

    def validate(
        self, job_id: int, mapping: ImportMapping, sheet_name: str | None = None
    ) -> ValidationReport:
        """Dry-run the mapping over every row; store and return the report."""
        job = self._job_in_status(job_id, {ImportStatus.PENDENTE, ImportStatus.VALIDADO})
        table = self._read_job_file(job, sheet_name or job.sheet_name)
        self._check_mapping_columns(mapping, table.headers)

        rows, counts = self._validate_rows(mapping, table)

        job.mapping = mapping.model_dump()
        job.sheet_name = table.sheet_name
        job.status = ImportStatus.VALIDADO
        job.row_count = len(table.rows)
        job.valid_count = counts["ok"]
        job.error_count = counts["error"]
        job.duplicate_count = counts["duplicate"]
        job.report = {"rows": [r.model_dump() for r in rows]}
        self.repo.commit()

        return ValidationReport(
            job_id=job.id,
            status=job.status,
            row_count=job.row_count,
            valid_count=job.valid_count,
            error_count=job.error_count,
            duplicate_count=job.duplicate_count,
            rows=rows,
        )

    def _check_mapping_columns(self, mapping: ImportMapping, headers: list[str]) -> None:
        header_set = set(headers)
        referenced = [mapping.name_column] + [c.column for c in mapping.columns]
        for optional in (
            mapping.class_column,
            mapping.subclass_column,
            mapping.description_column,
            mapping.keywords_column,
        ):
            if optional:
                referenced.append(optional)
        missing = sorted({c for c in referenced if c not in header_set})
        if missing:
            raise ValidationError(f"Colunas ausentes no arquivo: {', '.join(missing)}")
        if mapping.class_column is None and mapping.default_class_id is None:
            raise ValidationError(
                "Defina uma coluna de classe ou uma classe padrão para os materiais."
            )
        if mapping.default_class_id is not None and (
            self.repo.get_class(mapping.default_class_id) is None
        ):
            raise NotFoundError(f"Classe não encontrada: {mapping.default_class_id}")
        for column in mapping.columns:
            if self.materials.get_property_by_slug(column.property_slug) is None:
                raise NotFoundError(f"Propriedade não encontrada: {column.property_slug}")

    def _validate_rows(
        self, mapping: ImportMapping, table: TabularData
    ) -> tuple[list[RowReport], dict[str, int]]:
        index = {header: i for i, header in enumerate(table.headers)}
        seen_names: set[str] = set()
        reports: list[RowReport] = []
        counts = {"ok": 0, "error": 0, "duplicate": 0}

        for row_number, row in enumerate(table.rows, start=1):
            report = self._validate_row(mapping, index, row, row_number, seen_names)
            counts[report.status] += 1
            reports.append(report)
        return reports, counts

    def _validate_row(
        self,
        mapping: ImportMapping,
        index: dict[str, int],
        row: list[object],
        row_number: int,
        seen_names: set[str],
    ) -> RowReport:
        def cell(column: str | None) -> object:
            if column is None:
                return None
            i = index[column]
            return row[i] if i < len(row) else None

        issues: list[RowIssue] = []
        warnings: list[str] = []

        name, was_sanitized = sanitize_text_cell(cell(mapping.name_column))
        if was_sanitized:
            warnings.append("Nome continha caracteres de fórmula e foi sanitizado.")
        if not name:
            issues.append(RowIssue(column=mapping.name_column, message="Nome vazio."))
            return RowReport(row_number=row_number, name=None, status="error", issues=issues)

        # Duplicates: within the file, then against the catalogue.
        lowered = name.lower()
        if lowered in seen_names:
            return RowReport(
                row_number=row_number,
                name=name,
                status="duplicate",
                issues=[RowIssue(message="Nome repetido dentro do arquivo.")],
                warnings=warnings,
            )
        seen_names.add(lowered)
        if self.materials.name_exists(name):
            return RowReport(
                row_number=row_number,
                name=name,
                status="duplicate",
                issues=[RowIssue(message="Já existe um material com este nome no catálogo.")],
                warnings=warnings,
            )

        # Class resolution.
        if mapping.class_column is not None:
            raw_class = cell(mapping.class_column)
            class_text, _ = sanitize_text_cell(raw_class)
            if class_text:
                if self.repo.class_by_name_or_slug(class_text) is None:
                    issues.append(
                        RowIssue(
                            column=mapping.class_column,
                            message=f"Classe desconhecida: {class_text}",
                        )
                    )
            elif mapping.default_class_id is None:
                issues.append(
                    RowIssue(column=mapping.class_column, message="Classe vazia e sem padrão.")
                )

        # Property values: parse + full domain validation (dry run). The
        # source_label is stripped here so the dry run cannot create Source
        # rows as a side effect — sources are only created on commit.
        for value_in, issue in self._row_values(mapping, cell):
            if issue is not None:
                issues.append(issue)
                continue
            assert value_in is not None
            try:
                dry = value_in.model_copy(update={"source_label": None})
                self.material_service._build_value_from_input(dry, is_demo=False)
            except (ValidationError, NotFoundError) as exc:
                issues.append(RowIssue(message=str(exc)))

        status = "error" if issues else "ok"
        return RowReport(
            row_number=row_number, name=name, status=status, issues=issues, warnings=warnings
        )

    def _row_values(
        self, mapping: ImportMapping, cell
    ) -> list[tuple[PropertyValueIn | None, RowIssue | None]]:
        """Assemble PropertyValueIn objects for one row from the mapped columns.

        Columns with role min/max/typical for the same property are merged into
        a single interval value. Cells carrying their own unit override the
        mapped unit. Missing cells produce explicit ``kind="missing"`` values.
        """
        by_property: dict[str, dict] = {}
        results: list[tuple[PropertyValueIn | None, RowIssue | None]] = []

        for column in mapping.columns:
            raw = cell(column.column)
            try:
                parsed = parse_cell(raw)
            except CellParseError as exc:
                results.append((None, RowIssue(column=column.column, message=str(exc))))
                continue

            bucket = by_property.setdefault(
                column.property_slug,
                {
                    "unit": None,
                    "value": None,
                    "min": None,
                    "max": None,
                    "typical": None,
                    "missing_cells": 0,
                    "cells": 0,
                },
            )
            bucket["cells"] += 1
            effective_unit = parsed.unit or column.unit
            if effective_unit:
                bucket["unit"] = effective_unit

            if parsed.kind == "missing":
                bucket["missing_cells"] += 1
            elif parsed.kind == "range":
                bucket["min"], bucket["max"] = parsed.value_min, parsed.value_max
            elif column.role == "value":
                bucket["value"] = parsed.value
            else:
                bucket[column.role] = parsed.value

        for slug, b in by_property.items():
            if b["missing_cells"] == b["cells"]:
                results.append(
                    (
                        PropertyValueIn(
                            property_slug=slug, kind="missing", data_quality=DataQuality.IMPORTADO
                        ),
                        None,
                    )
                )
            elif b["min"] is not None and b["max"] is not None:
                results.append(
                    (
                        PropertyValueIn(
                            property_slug=slug,
                            kind="interval",
                            value_min=b["min"],
                            value_max=b["max"],
                            value_typical=b["typical"],
                            unit=b["unit"],
                            source_label=mapping.source_label,
                            data_quality=DataQuality.IMPORTADO,
                        ),
                        None,
                    )
                )
            elif b["value"] is not None:
                results.append(
                    (
                        PropertyValueIn(
                            property_slug=slug,
                            kind="scalar",
                            value=b["value"],
                            unit=b["unit"],
                            source_label=mapping.source_label,
                            data_quality=DataQuality.IMPORTADO,
                        ),
                        None,
                    )
                )
            else:
                # e.g. only min without max — incomplete interval.
                results.append(
                    (
                        None,
                        RowIssue(
                            message=f"Intervalo incompleto para '{slug}' (min e max são obrigatórios)."
                        ),
                    )
                )
        return results

    # --- commit / cancel / rollback ----------------------------------------

    def commit(self, job_id: int) -> CommitResult:
        """Create materials for every valid row, in a single transaction."""
        job = self._job_in_status(job_id, {ImportStatus.VALIDADO})
        mapping = ImportMapping.model_validate(job.mapping)
        table = self._read_job_file(job, job.sheet_name)
        index = {header: i for i, header in enumerate(table.headers)}

        # Re-validate right before writing: the catalogue may have changed
        # between validate and commit (new duplicates, deleted classes...).
        rows, counts = self._validate_rows(mapping, table)

        imported = 0
        try:
            for report, row in zip(rows, table.rows, strict=True):
                if report.status != "ok":
                    continue
                self._create_material_from_row(mapping, index, row, job)
                imported += 1
        except Exception:
            self.db.rollback()
            raise

        job.status = ImportStatus.IMPORTADO
        job.imported_count = imported
        job.valid_count = counts["ok"]
        job.error_count = counts["error"]
        job.duplicate_count = counts["duplicate"]
        job.report = {"rows": [r.model_dump() for r in rows]}
        job.committed_at = datetime.now(UTC)
        self.repo.commit()

        return CommitResult(
            job_id=job.id,
            status=job.status,
            imported_count=imported,
            skipped_count=job.row_count - imported,
        )

    def _create_material_from_row(
        self, mapping: ImportMapping, index: dict[str, int], row: list[object], job: ImportJob
    ) -> None:
        def cell(column: str | None) -> object:
            if column is None:
                return None
            i = index[column]
            return row[i] if i < len(row) else None

        name, _ = sanitize_text_cell(cell(mapping.name_column))
        subclass, _ = sanitize_text_cell(cell(mapping.subclass_column))
        description, _ = sanitize_text_cell(cell(mapping.description_column))
        keywords_text, _ = sanitize_text_cell(cell(mapping.keywords_column))
        keywords = (
            [k.strip() for k in re.split(r"[;,]", keywords_text) if k.strip()]
            if keywords_text
            else []
        )

        class_id = mapping.default_class_id
        if mapping.class_column is not None:
            class_text, _ = sanitize_text_cell(cell(mapping.class_column))
            if class_text:
                material_class = self.repo.class_by_name_or_slug(class_text)
                assert material_class is not None  # guaranteed by validation
                class_id = material_class.id
        assert name is not None and class_id is not None  # guaranteed by validation

        material = Material(
            name=name,
            class_id=class_id,
            subclass=subclass,
            description=description,
            keywords=keywords,
            is_demo=False,
            is_active=True,
            import_job_id=job.id,
        )
        self.repo.add(material)
        self.repo.flush()

        for value_in, issue in self._row_values(mapping, cell):
            if issue is not None or value_in is None:  # pragma: no cover - filtered upstream
                continue
            value_row = self.material_service._build_value_from_input(value_in, is_demo=False)
            value_row.material_id = material.id
            self.repo.add(value_row)

    def cancel(self, job_id: int) -> ImportJobOut:
        job = self._job_in_status(job_id, {ImportStatus.PENDENTE, ImportStatus.VALIDADO})
        job.status = ImportStatus.CANCELADO
        self.repo.commit()
        self._delete_stored_file(job)
        return _job_out(job)

    def rollback(self, job_id: int) -> ImportJobOut:
        """Remove every material created by a committed job (logical rollback)."""
        job = self._job_in_status(job_id, {ImportStatus.IMPORTADO})
        for material in self.repo.materials_for_job(job.id):
            self.repo.delete_material(material)
        job.status = ImportStatus.REVERTIDO
        self.repo.commit()
        return _job_out(job)

    # --- history / templates ------------------------------------------------

    def list_jobs(self) -> list[ImportJobOut]:
        return [_job_out(job) for job in self.repo.list_jobs()]

    def get_report(self, job_id: int) -> ValidationReport:
        job = self.repo.get_job(job_id)
        if job is None:
            raise NotFoundError(f"Importação não encontrada: {job_id}")
        if not job.report:
            raise ValidationError("Esta importação ainda não foi validada.")
        rows = [RowReport.model_validate(r) for r in job.report.get("rows", [])]
        return ValidationReport(
            job_id=job.id,
            status=job.status,
            row_count=job.row_count,
            valid_count=job.valid_count,
            error_count=job.error_count,
            duplicate_count=job.duplicate_count,
            rows=rows,
        )

    def list_templates(self) -> list[TemplateOut]:
        return [
            TemplateOut(
                id=t.id,
                name=t.name,
                description=t.description,
                mapping=ImportMapping.model_validate(t.mapping),
                created_at=t.created_at,
            )
            for t in self.repo.list_templates()
        ]

    def create_template(self, payload: TemplateIn) -> TemplateOut:
        if self.repo.template_name_exists(payload.name):
            raise ConflictError(f"Já existe um template com o nome: {payload.name}")
        template = ImportMappingTemplate(
            name=payload.name.strip(),
            description=payload.description,
            mapping=payload.mapping.model_dump(),
        )
        self.repo.add(template)
        self.repo.commit()
        return TemplateOut(
            id=template.id,
            name=template.name,
            description=template.description,
            mapping=payload.mapping,
            created_at=template.created_at,
        )

    # --- helpers ------------------------------------------------------------

    def _job_in_status(self, job_id: int, allowed: set[ImportStatus]) -> ImportJob:
        job = self.repo.get_job(job_id)
        if job is None:
            raise NotFoundError(f"Importação não encontrada: {job_id}")
        if job.status not in allowed:
            raise ConflictError(
                f"Operação não permitida no estado atual da importação ({job.status.value})."
            )
        return job

    def _read_job_file(self, job: ImportJob, sheet_name: str | None) -> TabularData:
        path = Path(job.stored_path)
        if not path.is_file():
            raise ValidationError(
                "Arquivo da importação não está mais disponível; envie novamente."
            )
        return read_tabular(
            path.read_bytes(), job.file_format, settings.max_import_rows, sheet_name
        )

    def _delete_stored_file(self, job: ImportJob) -> None:
        try:
            Path(job.stored_path).unlink(missing_ok=True)
        except OSError:  # pragma: no cover - best-effort cleanup
            pass


def _job_out(job: ImportJob) -> ImportJobOut:
    return ImportJobOut(
        id=job.id,
        filename=job.filename,
        file_format=job.file_format,
        sheet_name=job.sheet_name,
        status=job.status,
        row_count=job.row_count,
        valid_count=job.valid_count,
        error_count=job.error_count,
        duplicate_count=job.duplicate_count,
        imported_count=job.imported_count,
        created_at=job.created_at,
        committed_at=job.committed_at,
    )
