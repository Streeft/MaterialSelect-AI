"""Decompression limits for the OOXML archives users upload (D-177).

A DOCX or XLSX is a zip. The upload ceilings (15 MB for a notebook source,
5 MB for an import) bound the *compressed* bytes only, and a deflated XML of
repeated text shrinks by a factor of hundreds: a 209 KB DOCX inflated its
``word/document.xml`` to 60 MB, and lxml then built a tree of roughly nine
times that — +547 MB on a VM of 512 MB. The parser never stops on its own.

So every archive a user sends is checked here **before** any parser sees it:
number of entries, size of each member, total size, and the compression ratio
of each large member — first from the declared sizes in the central directory,
then by reading every member in bounded chunks, so a header that lies about a
size is caught by the bytes themselves rather than trusted. One helper for
every reader, so the limits cannot drift apart between DOCX and XLSX.

The ceilings are sized for real documents: a 300-page thesis is a few MB of
XML, and photos (already compressed, ratio near 1) are not penalised by the
ratio rule, which only looks at members above :data:`RATIO_MIN_BYTES`.
"""

from __future__ import annotations

import io
import zipfile

from app.domain.errors import ValidationError

MIB = 1024 * 1024

#: Entries in one archive. A long Word document has a few dozen.
MAX_ENTRIES = 1000
#: Uncompressed bytes of any single member — the XML part a parser builds a
#: whole tree of. lxml takes ~9x this in memory.
MAX_MEMBER_BYTES = 20 * MIB
#: Uncompressed bytes of the whole archive.
MAX_TOTAL_BYTES = 50 * MIB
#: Uncompressed/compressed ratio allowed for a member above
#: :data:`RATIO_MIN_BYTES`. Prose XML deflates 5-20x; a bomb, hundreds.
MAX_RATIO = 100
RATIO_MIN_BYTES = 1 * MIB

_CHUNK = 64 * 1024


def check_zip_archive(data: bytes, *, kind: str) -> None:
    """Refuse an archive that would inflate past the limits, before parsing.

    ``kind`` names the format in the message ("DOCX", "XLSX").

    Raises:
        ValidationError: not a zip, too many entries, a member or the whole
            archive too large uncompressed, or a member compressed beyond
            :data:`MAX_RATIO` — each said in Portuguese.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, OSError) as exc:
        raise ValidationError(f"Arquivo {kind} inválido ou corrompido.") from exc

    with archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES:
            raise ValidationError(
                f"O {kind} tem {len(infos)} partes internas; o limite é {MAX_ENTRIES}."
            )
        declared_total = 0
        for info in infos:
            _check_declared(info, kind)
            declared_total += info.file_size
            if declared_total > MAX_TOTAL_BYTES:
                raise _too_large(kind)

        # The central directory can lie; count the bytes that actually come out.
        actual_total = 0
        for info in infos:
            if info.is_dir():
                continue
            member_bytes = 0
            try:
                with archive.open(info) as stream:
                    while chunk := stream.read(_CHUNK):
                        member_bytes += len(chunk)
                        actual_total += len(chunk)
                        if member_bytes > MAX_MEMBER_BYTES:
                            raise _member_too_large(info, kind)
                        if actual_total > MAX_TOTAL_BYTES:
                            raise _too_large(kind)
            except ValidationError:
                raise
            except NotImplementedError as exc:  # before RuntimeError, its base
                raise ValidationError(f"Arquivo {kind} usa compressão não suportada.") from exc
            except (zipfile.BadZipFile, OSError, EOFError, RuntimeError, ValueError) as exc:
                # BadZipFile: bad CRC or truncated data; RuntimeError: encrypted.
                raise ValidationError(f"Arquivo {kind} inválido ou corrompido.") from exc


def _check_declared(info: zipfile.ZipInfo, kind: str) -> None:
    if info.file_size > MAX_MEMBER_BYTES:
        raise _member_too_large(info, kind)
    if info.file_size >= RATIO_MIN_BYTES:
        ratio = info.file_size / max(info.compress_size, 1)
        if ratio > MAX_RATIO:
            raise ValidationError(
                f"O {kind} parece uma bomba de descompressão: a parte "
                f"'{info.filename[:80]}' cresce {ratio:.0f} vezes ao descomprimir "
                f"(o limite é {MAX_RATIO})."
            )


def _member_too_large(info: zipfile.ZipInfo, kind: str) -> ValidationError:
    return ValidationError(
        f"A parte '{info.filename[:80]}' do {kind} passa de "
        f"{MAX_MEMBER_BYTES // MIB} MB descomprimida. Divida o documento em partes."
    )


def _too_large(kind: str) -> ValidationError:
    return ValidationError(
        f"O {kind} passa de {MAX_TOTAL_BYTES // MIB} MB descomprimido. "
        "Divida o documento em partes."
    )
