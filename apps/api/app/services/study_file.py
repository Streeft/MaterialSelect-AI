"""The study file: a saved selection study as a portable, versioned JSON (D-122).

The file is **data and nothing else**. Reading one never evaluates anything in
it — no expression is run, no formula opens, no path is followed, no markup is
rendered: the document is parsed as JSON, checked field by field against the
same ``StudyIn`` schema that saving a study through the API uses, and handed to
``SelectionService.create_study``, which re-validates it against *this* user's
catalogue exactly as if they had typed it. A file that names a property, class
or process the importing user cannot see fails there with the ordinary message.

Three properties are deliberate:

* **Strict.** An unknown field anywhere in the document is refused with its
  path, not ignored — silently dropping a key the author wrote is the shape of
  a "why does the result differ" bug (the rule ``StageIn`` states for stages).
  ``StudyIn`` itself stays tolerant because the editor posts it; the strictness
  lives here, at the boundary that receives a stranger's file.
* **Bounded.** A byte ceiling is applied while the body is being read, before
  any parsing, and the stage count is bounded by the schema.
* **Versioned.** ``version`` is checked first, so a future format fails with
  "this file is from a newer version" and not with a field error.

The file carries no record ids, no owner and no number the engine computed: only
what the author wrote (constraints, stages, index, criteria, notes). Property,
class and process are named by slug, so exporting never exposes another user's
record — there is none in the file to expose.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic import ValidationError as PydanticValidationError

from app.domain.errors import ValidationError
from app.exporters.report import LIMITATION_NOTICE
from app.schemas.selection import StageIn, StudyIn, StudyOut

STUDY_FILE_FORMAT = "materialselect-ai/estudo"
STUDY_FILE_VERSION = 1
#: A study of twenty stages with generous constraint trees is a few tens of KB;
#: 256 KiB is far past any real one and far below anything that costs to parse.
MAX_STUDY_FILE_BYTES = 256 * 1024


class StudyFile(BaseModel):
    """The envelope. ``extra="forbid"`` so a stray top-level key is an error."""

    model_config = ConfigDict(extra="forbid")

    format: str
    version: int
    notice: str | None = Field(default=None, max_length=1000)
    exported_at: datetime | None = None
    study: StudyIn


def filename_stem(name: str) -> str:
    """Fold a study name into a safe ASCII stem for the download."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", folded).strip("-").lower()
    return f"estudo-{cleaned or 'sem-nome'}"[:80]


def build_study_file(study: StudyOut) -> dict[str, Any]:
    """A saved study as the file's JSON-ready dict.

    Built from ``StudyOut`` — what the owner can already read — and never from
    the ORM row, so the file can only carry what the API already exposes.
    """
    stages = [
        StageIn(
            **stage.model_dump(exclude={"position"}),
        )
        for stage in study.stages
    ]
    payload = StudyIn(
        name=study.name,
        description=study.description,
        function_text=study.function_text,
        objective_text=study.objective_text,
        free_variables=list(study.free_variables),
        universe=study.universe,
        stages=stages,
        index=study.index,
        normalization=study.normalization,  # type: ignore[arg-type]
        method=study.method,  # type: ignore[arg-type]
        criteria=list(study.criteria),
        notes=study.notes,
    )
    document = StudyFile(
        format=STUDY_FILE_FORMAT,
        version=STUDY_FILE_VERSION,
        notice=LIMITATION_NOTICE,
        exported_at=datetime.now(UTC),
        study=payload,
    )
    return document.model_dump(mode="json")


def _unknown_keys(raw: Any, known: Any, path: str) -> Iterator[str]:
    """Paths present in the file but absent from the fully-dumped model."""
    if isinstance(raw, dict) and isinstance(known, dict):
        for key, value in raw.items():
            here = f"{path}.{key}" if path else str(key)
            if key not in known:
                yield here
            else:
                yield from _unknown_keys(value, known[key], here)
    elif isinstance(raw, list) and isinstance(known, list):
        for index, (item, model_item) in enumerate(zip(raw, known, strict=False)):
            yield from _unknown_keys(item, model_item, f"{path}[{index}]")


def parse_study_file(body: bytes) -> StudyIn:
    """Parse and validate an uploaded study file; never executes anything in it.

    Raises ``ValidationError`` (HTTP 400) with a Portuguese message saying what
    is wrong. The returned ``StudyIn`` is still to be checked against the
    importing user's catalogue by ``SelectionService.create_study``.
    """
    if len(body) > MAX_STUDY_FILE_BYTES:
        raise ValidationError(
            f"O arquivo passa do limite de {MAX_STUDY_FILE_BYTES // 1024} KB para um estudo."
        )
    try:
        raw = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise ValidationError("O arquivo não é um JSON válido em UTF-8.") from exc
    if not isinstance(raw, dict):
        raise ValidationError("O arquivo não é um estudo exportado: a raiz deve ser um objeto.")
    if raw.get("format") != STUDY_FILE_FORMAT:
        raise ValidationError(
            "O arquivo não é um estudo do MaterialSelect AI "
            f"(campo format deveria ser «{STUDY_FILE_FORMAT}»)."
        )
    version = raw.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise ValidationError("O arquivo não informa a versão do formato.")
    if version > STUDY_FILE_VERSION:
        raise ValidationError(
            f"O arquivo é da versão {version} do formato, mais nova que a {STUDY_FILE_VERSION} "
            "que esta instalação lê."
        )
    if version < 1:
        raise ValidationError(f"Versão de formato inválida: {version}.")
    try:
        document = StudyFile.model_validate(raw)
    except PydanticValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"]) or "raiz"
        raise ValidationError(f"Arquivo de estudo inválido em «{where}»: {first['msg']}.") from exc
    except RecursionError as exc:
        raise ValidationError("O arquivo tem aninhamento profundo demais.") from exc

    extras = list(_unknown_keys(raw, document.model_dump(mode="json"), ""))
    if extras:
        listed = ", ".join(extras[:5])
        raise ValidationError(f"O arquivo tem campos desconhecidos: {listed}.")
    return document.study
