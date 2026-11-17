"""QR code for an issued laudo's verification URL, as inline SVG (D-241).

``segno`` (pure Python, MIT, no native dependency) does the encoding; the SVG it
writes is text like every other figure in the document, so it prints sharp and
survives the ``default-src 'none'`` policy. Same input, same bytes.
"""

from __future__ import annotations

import segno

from app.exporters.laudo_theme import token


def qr_svg(url: str) -> str:
    """The QR for ``url``: error correction M, dark ink on white, no fixed size."""
    code = segno.make(url, error="m", micro=False)
    svg = code.svg_inline(
        scale=4,
        border=2,
        dark=token("ink"),
        light=token("surface-raised"),
        title="QR code de verificação do laudo",
        omitsize=True,
    )
    return svg.replace(
        "<svg ",
        '<svg xmlns="http://www.w3.org/2000/svg" role="img" '
        'aria-label="QR code de verificação do laudo" ',
        1,
    )
