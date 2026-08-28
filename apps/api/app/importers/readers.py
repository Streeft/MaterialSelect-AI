"""File readers for the import wizard (CSV and XLSX).

Both readers return the same shape — ``TabularData`` with headers and rows of
raw cell values — so the rest of the pipeline is format-agnostic. Design notes:

* CSV: encoding tried as UTF-8 (with BOM) first, then Latin-1; the delimiter is
  sniffed among ``;``, ``,`` and TAB (Brazilian spreadsheets commonly use ";").
* XLSX: read with ``openpyxl`` in ``data_only=True`` mode, so formula cells
  yield their cached values and never formula text. ``read_only=True`` bounds
  memory usage.
* stdlib ``csv`` + ``openpyxl`` were chosen over pandas: every needed feature
  is covered without a heavyweight dependency (documented in docs/06-importacao.md).
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field

from charset_normalizer import from_bytes
from openpyxl import load_workbook

from app.domain.errors import ValidationError

ALLOWED_EXTENSIONS = {".csv", ".xlsx"}


@dataclass
class TabularData:
    """Headers plus raw data rows read from one sheet/file."""

    headers: list[str]
    rows: list[list[object]]
    sheet_names: list[str] = field(default_factory=list)
    sheet_name: str | None = None


def _decode_csv(data: bytes) -> str:
    # utf-8-sig first: strict, so it never falsely matches non-UTF-8 bytes.
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    # charset-normalizer scores candidate encodings by how "natural" the
    # decoded text looks (character frequency, mojibake detection) instead of
    # accepting the first encoding that merely doesn't raise — which is why
    # Latin-1 alone (every byte is valid Latin-1) used to mask cp1252/other
    # Windows encodings silently.
    best = from_bytes(data).best()
    if best is not None:
        return str(best)
    # Latin-1 never raises, so this is the final, always-successful fallback
    # for any byte sequence charset-normalizer scored too low to trust.
    try:
        return data.decode("latin-1")
    except UnicodeDecodeError as exc:
        raise ValidationError("Não foi possível decodificar o arquivo CSV (tente UTF-8).") from exc


def _sniff_delimiter(text: str) -> str:
    sample = text[:4096]
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    except csv.Error:
        # Fall back to the delimiter that appears most in the first line.
        first_line = sample.splitlines()[0] if sample.splitlines() else ""
        counts = {d: first_line.count(d) for d in (";", ",", "\t")}
        best = max(counts, key=counts.get)  # type: ignore[arg-type]
        return best if counts[best] > 0 else ","


def read_csv(data: bytes, max_rows: int) -> TabularData:
    """Parse CSV bytes into headers + rows.

    Raises:
        ValidationError: empty file, undecodable content or too many rows.
    """
    text = _decode_csv(data)
    delimiter = _sniff_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = [row for row in reader if any(str(c).strip() for c in row)]
    if not all_rows:
        raise ValidationError("O arquivo está vazio.")
    headers = [str(h).strip() for h in all_rows[0]]
    rows = all_rows[1:]
    if len(rows) > max_rows:
        raise ValidationError(f"O arquivo tem {len(rows)} linhas de dados; o limite é {max_rows}.")
    return TabularData(headers=headers, rows=rows)


def read_xlsx(data: bytes, max_rows: int, sheet_name: str | None = None) -> TabularData:
    """Parse XLSX bytes into headers + rows for one sheet.

    Raises:
        ValidationError: corrupt file, unknown sheet, empty sheet or row limit.
    """
    try:
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # openpyxl raises various types for corrupt files
        raise ValidationError("Arquivo XLSX inválido ou corrompido.") from exc

    try:
        sheet_names = list(workbook.sheetnames)
        if sheet_name is not None and sheet_name not in sheet_names:
            raise ValidationError(f"Aba não encontrada: {sheet_name}")
        sheet = workbook[sheet_name] if sheet_name else workbook[sheet_names[0]]

        raw_rows = [
            list(row)
            for row in sheet.iter_rows(values_only=True)
            if any(c is not None and str(c).strip() for c in row)
        ]
    finally:
        workbook.close()

    if not raw_rows:
        raise ValidationError("A aba selecionada está vazia.")
    headers = [str(h).strip() if h is not None else "" for h in raw_rows[0]]
    rows = raw_rows[1:]
    if len(rows) > max_rows:
        raise ValidationError(f"A aba tem {len(rows)} linhas de dados; o limite é {max_rows}.")
    return TabularData(headers=headers, rows=rows, sheet_names=sheet_names, sheet_name=sheet.title)


def read_tabular(
    data: bytes, file_format: str, max_rows: int, sheet_name: str | None = None
) -> TabularData:
    """Dispatch to the reader for ``file_format`` ("csv" | "xlsx")."""
    if file_format == "csv":
        return read_csv(data, max_rows)
    if file_format == "xlsx":
        return read_xlsx(data, max_rows, sheet_name)
    raise ValidationError(f"Formato não suportado: {file_format}")
