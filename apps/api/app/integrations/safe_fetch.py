"""Fetch a URL a student typed, without letting it reach anything but the public web.

This is the only code in the application that requests an arbitrary,
user-supplied address (D-97), so it is where server-side request forgery is
stopped or not stopped at all. The policy, in the order it runs on **every**
hop — the first request and each redirect alike:

1. **Parse and normalise** (:func:`normalise_url`): ``http``/``https`` only, no
   user information, the two web ports only, an IDNA host that is not a local
   name (``localhost``, ``*.local``, ``*.internal``…) and not an IP address
   spelled in one of the abbreviated forms ``inet_aton`` accepts
   (``2130706433``, ``0x7f.1``, ``0177.0.0.1``). The fragment and tracking
   parameters are dropped, which is also what makes the result usable as the
   deduplication key of a source.
2. **Resolve once**, and refuse if **any** address is not public. The blocklist
   is an explicit list of networks rather than ``ipaddress.is_global`` or
   ``is_private``: those changed meaning between patch releases of the Python
   versions CI runs, and a security boundary cannot move with the interpreter.
   An IPv4-mapped IPv6 address is unwrapped and judged as the IPv4 it carries.
3. **Pin**: the request goes to the validated address itself — the URL host is
   rewritten to the IP, the ``Host`` header and the TLS ``sni_hostname``
   extension carry the name. Nothing resolves the name a second time, so a DNS
   answer that changes between the check and the connection (rebinding) has
   nothing left to change. httpcore passes ``sni_hostname`` to
   ``SSLContext.wrap_socket(server_hostname=...)``, which drives both SNI and
   the certificate hostname check. ``Connection: close`` keeps a TLS
   connection opened for one name from being reused, from the pool, for
   another name pinned to the same address.
4. **Redirects by hand**, at most ``max_redirects``, each one resolved against
   the logical (not the pinned) URL and sent back through steps 1–3.
5. **Bounded reading**: one deadline for the whole fetch, checked between
   chunks, and a cap on the bytes *after* decompression, enforced inside the
   decompressor (``max_length``) so a small gzip body that inflates to
   gigabytes is stopped after at most ``max_bytes`` of output — httpx's own
   decoder would inflate a whole network chunk before anyone could count it.
   A declared ``Content-Length`` over the cap is refused before reading.
6. **Allowed content types**: HTML, XHTML, plain text, Markdown and PDF, the
   last also checked by its ``%PDF`` signature.

Every refusal is a :class:`~app.domain.errors.ValidationError` in pt-BR, and no
message ever contains an address the resolver returned: the student learns
*why* the page cannot be read, never where the server's network points.
"""

from __future__ import annotations

import codecs
import ipaddress
import re
import socket
import time
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, unquote_plus, urljoin, urlsplit

import httpx
import idna

from app.domain.errors import ValidationError

#: ``(host, port) -> [ip, ...]``. The default wraps :func:`socket.getaddrinfo`;
#: tests pass a fake so that no test ever reaches a real resolver.
Resolver = Callable[[str, int], list[str]]

#: The longest URL accepted here, before and after normalisation. Generous on
#: purpose: a redirect link from a search grounding can run past a thousand
#: characters. The tighter cap on what a student *types* (500, the width of
#: ``NotebookSource.origin``) belongs to the request schema, not to this module.
DEFAULT_MAX_URL_LENGTH = 2048

_DEFAULT_PORTS = {"http": 80, "https": 443}
_ALLOWED_PORTS = frozenset({80, 443})

#: A redirect answer; every other 3xx is a failure (no conditional request is
#: ever sent, so 304 cannot be legitimate).
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

#: How many of a name's validated addresses are tried when the connection
#: itself fails (an IPv6 address on a host without an IPv6 route, typically).
#: All of them were checked before the first attempt; none is resolved again.
_MAX_CONNECT_ATTEMPTS = 3

# --- the blocklist ----------------------------------------------------------

_BLOCKED_V4 = tuple(
    ipaddress.IPv4Network(network)
    for network in (
        "0.0.0.0/8",  # "this network"
        "10.0.0.0/8",  # private
        "100.64.0.0/10",  # carrier-grade NAT
        "127.0.0.0/8",  # loopback
        "169.254.0.0/16",  # link-local — the cloud metadata endpoints live here
        "172.16.0.0/12",  # private
        "192.0.0.0/24",  # IETF protocol assignments
        "192.0.2.0/24",  # TEST-NET-1
        "192.88.99.0/24",  # deprecated 6to4 relay anycast
        "192.168.0.0/16",  # private
        "198.18.0.0/15",  # benchmarking
        "198.51.100.0/24",  # TEST-NET-2
        "203.0.113.0/24",  # TEST-NET-3
        "224.0.0.0/4",  # multicast
        "240.0.0.0/4",  # reserved
        "255.255.255.255/32",  # limited broadcast
    )
)

_BLOCKED_V6 = tuple(
    ipaddress.IPv6Network(network)
    for network in (
        "::/128",  # unspecified
        "::1/128",  # loopback
        "::/96",  # deprecated IPv4-compatible addresses
        "::ffff:0:0:0/96",  # IPv4-translated (SIIT)
        "64:ff9b::/96",  # NAT64 — would reach any IPv4 behind the translator
        "64:ff9b:1::/48",  # local-use NAT64
        "100::/64",  # discard-only
        "2001::/32",  # Teredo — tunnels to an embedded IPv4
        "2001:db8::/32",  # documentation
        "2002::/16",  # 6to4 — tunnels to an embedded IPv4
        "fc00::/7",  # unique local (Fly's private network is fdaa::/16)
        "fd00:ec2::254/128",  # AWS metadata over IPv6 (inside fc00::/7; named)
        "fe80::/10",  # link-local
        "fec0::/10",  # deprecated site-local
        "ff00::/8",  # multicast
    )
)

_V4_MAPPED = ipaddress.IPv6Network("::ffff:0:0/96")

#: Names that resolve inside a network, never on the public web. The IP check
#: would catch most of them anyway; refusing the name is cheaper and does not
#: depend on what the local resolver happens to answer.
_LOCAL_SUFFIXES = (
    "localhost",
    "localdomain",
    "local",
    "internal",
    "intranet",
    "lan",
    "home.arpa",
    "flycast",
)

_LABEL = re.compile(r"[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?")

#: A last label that ``inet_aton`` (and the WHATWG URL parser) would read as a
#: number turns the whole host into an IPv4 address: ``2130706433``,
#: ``0x7f.1``, ``127.1``. No real top-level domain is numeric.
_NUMERIC_LABEL = re.compile(r"(?:0x[0-9a-f]*|[0-9]+)")

#: Query parameters that identify a click, not a document. Dropped so that the
#: same page shared from two campaigns is the same source.
_TRACKING_PARAMS = frozenset(
    {
        "fbclid",
        "gclid",
        "dclid",
        "gbraid",
        "wbraid",
        "msclkid",
        "yclid",
        "igshid",
        "mc_cid",
        "mc_eid",
        "_ga",
        "_gl",
    }
)

#: Printable ASCII: left alone by :func:`quote`, so an existing ``%XX`` escape
#: is never escaped twice and only non-ASCII text is percent-encoded.
_ASCII_SAFE = "".join(chr(code) for code in range(0x21, 0x7F))

_ALLOWED_TYPES = frozenset(
    {"text/html", "application/xhtml+xml", "text/plain", "text/markdown", "application/pdf"}
)
_TYPE_ALIASES = {"text/x-markdown": "text/markdown"}

_ACCEPT = (
    "text/html,application/xhtml+xml,text/plain;q=0.9,text/markdown;q=0.9,application/pdf;q=0.8"
)


# --- messages ---------------------------------------------------------------
#
# None of them interpolates an address. Only numbers the student can act on
# (a limit, an HTTP status) are ever written into one.

_MSG_EMPTY = "Informe o endereço da página."
_MSG_BAD_CHARS = "O endereço contém espaços ou caracteres que não podem aparecer num link."
_MSG_MALFORMED = "O endereço não está bem formado. Confira se ele foi copiado por inteiro."
_MSG_SCHEME = "Só é possível ler endereços que começam com http:// ou https://."
_MSG_USERINFO = "Endereços com usuário ou senha embutidos não são aceitos."
_MSG_PORT = "Só são aceitos endereços nas portas padrão da web (80 e 443)."
_MSG_HOST = "O domínio do endereço não é válido."
_MSG_LOCAL = "Este endereço aponta para uma rede local e não pode ser lido."
_MSG_NUMERIC = (
    "Endereços IP escritos de forma abreviada ou numérica não são aceitos. Use o nome do site."
)
_MSG_PRIVATE = "Este endereço aponta para uma rede interna ou reservada e não pode ser lido."
_MSG_NOT_FOUND = (
    "Não foi possível encontrar este endereço. Confira se ele está escrito corretamente."
)
_MSG_REDIRECT_REFUSED = "A página redirecionou para um endereço que não pode ser lido. "
_MSG_REDIRECT_EMPTY = "A página pediu um redirecionamento sem dizer para onde."
_MSG_CONNECT = "Não foi possível conectar à página. O site pode estar fora do ar."
_MSG_INTERRUPTED = "A conexão com a página foi interrompida antes do fim."
_MSG_NO_TYPE = "A página não informou o tipo do conteúdo, então não pode ser lida."
_MSG_ENCODING = "A página foi enviada com uma compressão que não é suportada."
_MSG_CORRUPT = "O conteúdo compactado da página está corrompido."
_MSG_NOT_PDF = "O endereço diz trazer um PDF, mas o conteúdo não é um PDF válido."


def _too_long(limit: int) -> str:
    return (
        f"O endereço tem mais de {limit} caracteres. Abra a página no navegador e "
        "copie o endereço dela sem os parâmetros de rastreamento."
    )


def _too_many_redirects(limit: int) -> str:
    return (
        f"A página redirecionou mais de {limit} vezes. Abra-a no navegador e use o "
        "endereço em que ela termina."
    )


def _timeout(seconds: float) -> str:
    return f"A página demorou mais de {_format_number(seconds)} segundos para responder."


def _too_big(max_bytes: int) -> str:
    return (
        f"A página passa do limite de {_format_size(max_bytes)}. "
        "Baixe o arquivo e envie-o como fonte, ou cole o trecho que interessa."
    )


def _format_number(value: float) -> str:
    """``10.0`` → ``"10"``, ``2.5`` → ``"2,5"``: the pt-BR convention of D-30."""
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def _format_size(size: int) -> str:
    if size >= 1_000_000:
        return f"{_format_number(size / 1_000_000)} MB"
    if size >= 1_000:
        return f"{_format_number(size / 1_000)} kB"
    return f"{size} bytes"


def _status_message(status: int) -> str:
    if status in (401, 403):
        return (
            f"A página exige login ou bloqueou o acesso (código {status}). "
            "Copie o texto e cole como fonte."
        )
    if status in (404, 410):
        return f"A página não foi encontrada (código {status}). Confira o endereço."
    if status == 429:
        return "O site limitou o número de acessos (código 429). Tente de novo mais tarde."
    if status >= 500:
        return f"O site está com problema no momento (código {status}). Tente mais tarde."
    return f"A página respondeu com o código {status} e não pôde ser lida."


# --- public types -------------------------------------------------------------


@dataclass(frozen=True)
class FetchLimits:
    """How much one fetch may cost the server. Tests pass these directly."""

    max_bytes: int = 5_000_000
    timeout_seconds: float = 10.0
    max_redirects: int = 3
    max_url_length: int = DEFAULT_MAX_URL_LENGTH

    @classmethod
    def from_settings(cls, settings: Any) -> FetchLimits:
        """Read the limits from settings, falling back to the defaults.

        By attribute with fallbacks rather than by field, so that a settings
        object older than the D-97 fields still yields the documented limits.
        """
        default = cls()
        return cls(
            max_bytes=max(1, int(getattr(settings, "notebook_fetch_max_bytes", default.max_bytes))),
            timeout_seconds=max(
                0.001,
                float(getattr(settings, "notebook_fetch_timeout_seconds", default.timeout_seconds)),
            ),
            max_redirects=max(
                0, int(getattr(settings, "notebook_fetch_max_redirects", default.max_redirects))
            ),
            max_url_length=max(
                1,
                int(getattr(settings, "notebook_fetch_max_url_length", default.max_url_length)),
            ),
        )


@dataclass(frozen=True)
class Fetched:
    """A page that passed every check.

    ``final_url`` is the normalised address after redirects — the logical URL,
    never the pinned one. ``content_type`` is the bare media type (lowercase,
    no parameters) and ``charset`` the declared one, when Python knows it.
    """

    final_url: str
    content_type: str
    body: bytes
    charset: str | None


def default_resolver(host: str, port: int) -> list[str]:
    """Every address ``host`` resolves to, in the system's preferred order."""
    infos = socket.getaddrinfo(
        host,
        port,
        type=socket.SOCK_STREAM,
        proto=socket.IPPROTO_TCP,
        flags=socket.AI_ADDRCONFIG,
    )
    addresses: list[str] = []
    for family, _type, _proto, _canonname, sockaddr in infos:
        if family not in (socket.AF_INET, socket.AF_INET6):
            continue
        address = str(sockaddr[0])
        if address not in addresses:
            addresses.append(address)
    return addresses


def is_public_address(address: str) -> bool:
    """Whether ``address`` may be connected to. Unparsable means no."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return _public_ip(ip) is not None


# --- step 1: parse and normalise ----------------------------------------------


@dataclass(frozen=True)
class _Target:
    scheme: str
    #: ASCII host: IDNA-encoded name, or the compressed IP of a literal.
    host: str
    port: int
    #: Path plus ``?query`` when there is one; ASCII only.
    path_query: str
    #: Set when the host is an IP literal: it is then its own resolution.
    literal: ipaddress.IPv4Address | ipaddress.IPv6Address | None

    @property
    def netloc(self) -> str:
        host = f"[{self.host}]" if ":" in self.host else self.host
        if self.port == _DEFAULT_PORTS[self.scheme]:
            return host
        return f"{host}:{self.port}"

    @property
    def url(self) -> str:
        return f"{self.scheme}://{self.netloc}{self.path_query}"


def normalise_url(url: str, *, max_length: int = DEFAULT_MAX_URL_LENGTH) -> str:
    """The canonical form of ``url``, or :class:`ValidationError` if it is refused.

    Checks everything that can be checked without the network (step 1 of the
    module docstring) and returns the address with a lowercase scheme and host,
    the IDNA host, no default port, no fragment and no tracking parameters.
    It is the deduplication key of a site source: two links that normalise to
    the same string are the same source.

    ``max_length`` bounds the address before and after normalisation (which
    can lengthen it: percent-encoding, IDNA). A caller that stores the result
    in a narrower column passes that width.
    """
    return _parse(url, max_length).url


def _parse(url: str, max_length: int) -> _Target:
    if not isinstance(url, str) or not url.strip():
        raise ValidationError(_MSG_EMPTY)
    raw = url.strip()
    if len(raw) > max_length:
        raise ValidationError(_too_long(max_length))
    # Whitespace, control characters and the backslash are where URL parsers
    # disagree with each other (a browser reads "\" as "/"); none of them
    # belongs in a link someone copied, so none is interpreted.
    if any(ord(char) <= 0x20 or ord(char) == 0x7F or char == "\\" for char in raw):
        raise ValidationError(_MSG_BAD_CHARS)
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise ValidationError(_MSG_MALFORMED) from None

    scheme = parts.scheme.lower()
    if scheme not in _DEFAULT_PORTS:
        raise ValidationError(_MSG_SCHEME)
    if "@" in parts.netloc:
        raise ValidationError(_MSG_USERINFO)
    if port is None:
        port = _DEFAULT_PORTS[scheme]
    if port not in _ALLOWED_PORTS:
        raise ValidationError(_MSG_PORT)

    host, literal = _parse_host(parts.netloc, parts.hostname)

    path = quote(parts.path or "/", safe=_ASCII_SAFE)
    if not path.startswith("/"):
        raise ValidationError(_MSG_MALFORMED)
    query = _strip_tracking(parts.query)
    path_query = f"{path}?{query}" if query else path

    target = _Target(scheme=scheme, host=host, port=port, path_query=path_query, literal=literal)
    if len(target.url) > max_length:
        raise ValidationError(_too_long(max_length))
    return target


def _parse_host(
    netloc: str, hostname: str | None
) -> tuple[str, ipaddress.IPv4Address | ipaddress.IPv6Address | None]:
    if not hostname:
        raise ValidationError(_MSG_HOST)

    if netloc.startswith("["):
        # A bracketed IPv6 literal. A zone ("%eth0") only means something on
        # the server's own links, which are exactly what may not be reached.
        if "%" in hostname:
            raise ValidationError(_MSG_PRIVATE)
        try:
            v6 = ipaddress.IPv6Address(hostname)
        except ValueError:
            raise ValidationError(_MSG_MALFORMED) from None
        return v6.compressed, v6

    host = hostname[:-1] if hostname.endswith(".") else hostname
    if not host:
        raise ValidationError(_MSG_HOST)
    if not host.isascii():
        try:
            host = idna.encode(host, uts46=True).decode("ascii")
        except (idna.IDNAError, UnicodeError, ValueError):
            raise ValidationError(_MSG_HOST) from None
    host = host.lower()

    # After IDNA, not before: UTS #46 maps fullwidth digits and the ideographic
    # full stop, so "１２７。０。０。１" only shows itself as 127.0.0.1 here.
    try:
        v4 = ipaddress.IPv4Address(host)
    except ValueError:
        v4 = None
    if v4 is not None:
        return v4.compressed, v4

    labels = host.split(".")
    if _NUMERIC_LABEL.fullmatch(labels[-1]):
        raise ValidationError(_MSG_NUMERIC)
    if len(host) > 253 or any(not _LABEL.fullmatch(label) for label in labels):
        raise ValidationError(_MSG_HOST)
    if host in _LOCAL_SUFFIXES or any(host.endswith(f".{suffix}") for suffix in _LOCAL_SUFFIXES):
        raise ValidationError(_MSG_LOCAL)
    if len(labels) < 2:
        # A single-label name is completed by the server's search domains —
        # the company network, not the web.
        raise ValidationError(_MSG_LOCAL)
    return host, None


def _strip_tracking(query: str) -> str:
    kept = []
    for pair in query.split("&"):
        if not pair:
            continue
        key = unquote_plus(pair.split("=", 1)[0]).strip().lower()
        if key.startswith("utm_") or key in _TRACKING_PARAMS:
            continue
        kept.append(quote(pair, safe=_ASCII_SAFE))
    return "&".join(kept)


# --- step 2: resolve and check ----------------------------------------------


def _public_ip(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """The address to connect to, or ``None`` if ``ip`` is not public.

    An IPv4-mapped IPv6 address is judged — and connected to — as the IPv4 it
    carries: ``::ffff:127.0.0.1`` is the loopback in a costume.
    """
    if isinstance(ip, ipaddress.IPv6Address):
        if ip in _V4_MAPPED:
            mapped = ip.ipv4_mapped
            return _public_ip(mapped) if mapped is not None else None
        if any(ip in network for network in _BLOCKED_V6):
            return None
        # Drop a scope ("%eth0"): only link-local addresses carry one, and
        # they were refused above.
        return ipaddress.IPv6Address(int(ip))
    if any(ip in network for network in _BLOCKED_V4):
        return None
    return ip


def _addresses(target: _Target, resolver: Resolver) -> list[str]:
    """Validated addresses for ``target``: one resolution, all-or-nothing."""
    if target.literal is not None:
        candidates = [target.literal]
    else:
        try:
            answers = resolver(target.host, target.port)
        except (OSError, UnicodeError, ValueError):
            raise ValidationError(_MSG_NOT_FOUND) from None
        if not answers:
            raise ValidationError(_MSG_NOT_FOUND)
        candidates = []
        for answer in answers:
            try:
                candidates.append(ipaddress.ip_address(answer))
            except ValueError:
                # A resolver answer that is not an address is not trusted to
                # be a public one.
                raise ValidationError(_MSG_PRIVATE) from None

    pinned: list[str] = []
    for candidate in candidates:
        public = _public_ip(candidate)
        # Any non-public answer refuses the whole name, not just that answer:
        # a name that points inside is not a public page, whichever address
        # the connection would have used.
        if public is None:
            raise ValidationError(_MSG_PRIVATE)
        if public.compressed not in pinned:
            pinned.append(public.compressed)
    return pinned


# --- step 3: pin and send -----------------------------------------------------


def _pinned_url(target: _Target, address: str) -> httpx.URL:
    host = f"[{address}]" if ":" in address else address
    port = "" if target.port == _DEFAULT_PORTS[target.scheme] else f":{target.port}"
    return httpx.URL(f"{target.scheme}://{host}{port}{target.path_query}")


def _send(
    client: httpx.Client,
    target: _Target,
    addresses: list[str],
    limits: FetchLimits,
    deadline: float,
    clock: Callable[[], float],
) -> httpx.Response:
    headers = {
        "Host": target.netloc,
        "Accept": _ACCEPT,
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Connection": "close",
    }
    # SNI names a host; an IP literal has none, and then httpcore verifies the
    # certificate against the address, which is what the student asked for.
    extensions = (
        {"sni_hostname": target.host} if target.scheme == "https" and target.literal is None else {}
    )

    last_error: httpx.TransportError | None = None
    for address in addresses[:_MAX_CONNECT_ATTEMPTS]:
        remaining = deadline - clock()
        if remaining <= 0:
            raise ValidationError(_timeout(limits.timeout_seconds))
        try:
            request = client.build_request(
                "GET",
                _pinned_url(target, address),
                headers=headers,
                extensions=extensions,
                timeout=httpx.Timeout(remaining),
            )
        except httpx.InvalidURL:
            raise ValidationError(_MSG_MALFORMED) from None
        try:
            # follow_redirects is passed, not inherited: a client built with
            # it on would otherwise follow a redirect none of the checks saw.
            return client.send(request, stream=True, follow_redirects=False)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            # Nothing reached the server; the next validated address may.
            last_error = exc
        except httpx.TimeoutException:
            raise ValidationError(_timeout(limits.timeout_seconds)) from None
        except httpx.TransportError:
            raise ValidationError(_MSG_INTERRUPTED) from None
    if isinstance(last_error, httpx.ConnectTimeout):
        raise ValidationError(_timeout(limits.timeout_seconds))
    raise ValidationError(_MSG_CONNECT)


# --- step 5: bounded reading ----------------------------------------------------


class _BodyTooLarge(Exception):
    pass


class _Identity:
    def feed(self, data: bytes, room: int) -> bytes:
        if len(data) > room:
            raise _BodyTooLarge
        return data

    def finish(self, room: int) -> bytes:
        return b""


class _Inflate:
    """``gzip``/``deflate`` decoding that never produces more than it is allowed.

    ``zlib``'s ``max_length`` bounds each call's output, and the rest of the
    input waits in ``unconsumed_tail``; so memory holds at most ``room + 1``
    decoded bytes no matter how far one network chunk would inflate.
    """

    def __init__(self, *, gzip: bool) -> None:
        self._gzip = gzip
        self._first = True
        self._decoder = zlib.decompressobj(16 + zlib.MAX_WBITS if gzip else zlib.MAX_WBITS)

    def feed(self, data: bytes, room: int) -> bytes:
        try:
            output = self._inflate(data, room)
        except zlib.error:
            if not (self._first and not self._gzip):
                raise
            # "deflate" is meant to be zlib-wrapped, and some servers send the
            # raw stream; the header check fails on the first bytes, before
            # anything was produced, so starting over loses nothing.
            self._decoder = zlib.decompressobj(-zlib.MAX_WBITS)
            output = self._inflate(data, room)
        self._first = False
        return output

    def _inflate(self, data: bytes, room: int) -> bytes:
        parts: list[bytes] = []
        produced = 0
        pending = data
        while pending and not self._decoder.eof:
            chunk = self._decoder.decompress(pending, room - produced + 1)
            produced += len(chunk)
            if produced > room:
                raise _BodyTooLarge
            parts.append(chunk)
            pending = self._decoder.unconsumed_tail
        return b"".join(parts)

    def finish(self, room: int) -> bytes:
        tail = self._decoder.flush()
        if len(tail) > room:
            raise _BodyTooLarge
        return tail


def _decoder_for(content_encoding: str | None) -> _Identity | _Inflate:
    codings = [
        coding.strip().lower()
        for coding in (content_encoding or "").split(",")
        if coding.strip() and coding.strip().lower() != "identity"
    ]
    if not codings:
        return _Identity()
    if codings == ["gzip"] or codings == ["x-gzip"]:
        return _Inflate(gzip=True)
    if codings == ["deflate"]:
        return _Inflate(gzip=False)
    # br and zstd would need decoders this module cannot bound the same way,
    # and stacked codings exist mostly to smuggle a bomb past a single check.
    raise ValidationError(_MSG_ENCODING)


def _read_body(
    response: httpx.Response,
    limits: FetchLimits,
    deadline: float,
    clock: Callable[[], float],
) -> bytes:
    declared = response.headers.get("content-length")
    if declared is not None:
        try:
            length = int(declared.strip())
        except ValueError:
            length = None
        if length is not None and length > limits.max_bytes:
            raise ValidationError(_too_big(limits.max_bytes))

    decoder = _decoder_for(response.headers.get("content-encoding"))
    if response.is_stream_consumed:
        # Only a transport that hands back a response already read gets here —
        # httpx.MockTransport given ``content=b"..."``, in other modules'
        # tests. httpx's HTTPTransport never does: over a socket the body is
        # always streamed through the bounded path below. What is left to do
        # is apply the same cap to what was read.
        if len(response.content) > limits.max_bytes:
            raise ValidationError(_too_big(limits.max_bytes))
        return response.content
    body = bytearray()
    received = 0
    try:
        for chunk in response.iter_raw():
            # The wire bytes are capped too: a compressed stream can be long
            # and decode to nothing, and it still costs the transfer.
            received += len(chunk)
            if received > limits.max_bytes:
                raise _BodyTooLarge
            body += decoder.feed(chunk, limits.max_bytes - len(body))
            # The deadline is checked between chunks; a single read is bounded
            # by the httpx timeout set from the time that was left.
            if clock() > deadline:
                raise ValidationError(_timeout(limits.timeout_seconds))
        body += decoder.finish(limits.max_bytes - len(body))
    except _BodyTooLarge:
        raise ValidationError(_too_big(limits.max_bytes)) from None
    except zlib.error:
        raise ValidationError(_MSG_CORRUPT) from None
    except httpx.TimeoutException:
        raise ValidationError(_timeout(limits.timeout_seconds)) from None
    except httpx.TransportError:
        raise ValidationError(_MSG_INTERRUPTED) from None
    return bytes(body)


# --- step 6: content type -------------------------------------------------------


def _content_type(value: str | None) -> tuple[str, str | None]:
    """``(media type, charset)`` from a ``Content-Type`` header, or refusal."""
    if not value or not value.strip():
        raise ValidationError(_MSG_NO_TYPE)
    media, _, params = value.partition(";")
    media = media.strip().lower()
    media = _TYPE_ALIASES.get(media, media)
    if media not in _ALLOWED_TYPES:
        shown = media if re.fullmatch(r"[a-z0-9.+-]{1,40}/[a-z0-9.+-]{1,60}", media) else None
        described = f"do tipo “{shown}”" if shown else "de um tipo desconhecido"
        raise ValidationError(
            f"Este endereço traz um conteúdo {described}, que não pode ser lido como "
            "fonte. São aceitas páginas da web, texto e PDF."
        )
    charset = None
    for param in params.split(";"):
        name, _, raw = param.partition("=")
        if name.strip().lower() != "charset":
            continue
        label = raw.strip().strip("\"'").strip().lower()
        try:
            codecs.lookup(label)
        except (LookupError, ValueError):
            continue
        charset = label
    return media, charset


def _looks_like_pdf(body: bytes) -> bool:
    # The PDF reference lets the header sit anywhere in the first 1024 bytes.
    return b"%PDF-" in body[:1024]


# --- the whole policy -----------------------------------------------------------


def fetch(
    url: str,
    *,
    client: httpx.Client,
    resolver: Resolver | None,
    settings: Any,
    limits: FetchLimits | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> Fetched:
    """Fetch ``url`` under the SSRF policy of this module.

    ``resolver`` is ``None`` in production (the system resolver) and a fake in
    tests; ``limits`` defaults to the ones in ``settings``; ``clock`` is
    injectable so the deadline can be tested without sleeping.

    The deadline is total: resolution, redirects and reading all spend it. It
    is checked before every request and between chunks, so the worst case is
    the deadline plus one read or one blocking resolution —
    :func:`socket.getaddrinfo` takes no timeout.
    """
    limits = limits or FetchLimits.from_settings(settings)
    resolve = resolver or default_resolver
    deadline = clock() + limits.timeout_seconds

    target = _parse(url, limits.max_url_length)
    redirects = 0
    while True:
        try:
            addresses = _addresses(target, resolve)
        except ValidationError as exc:
            if redirects:
                raise ValidationError(_MSG_REDIRECT_REFUSED + str(exc)) from None
            raise

        response = _send(client, target, addresses, limits, deadline, clock)
        try:
            if response.status_code in _REDIRECT_STATUSES:
                location = response.headers.get("location", "").strip()
                if not location:
                    raise ValidationError(_MSG_REDIRECT_EMPTY)
                redirects += 1
                if redirects > limits.max_redirects:
                    raise ValidationError(_too_many_redirects(limits.max_redirects))
                try:
                    # Joined against the logical URL: the pinned one would turn
                    # a relative redirect into a request for the bare address.
                    target = _parse(urljoin(target.url, location), limits.max_url_length)
                except ValidationError as exc:
                    raise ValidationError(_MSG_REDIRECT_REFUSED + str(exc)) from None
                continue

            if not 200 <= response.status_code < 300:
                raise ValidationError(_status_message(response.status_code))
            media, charset = _content_type(response.headers.get("content-type"))
            body = _read_body(response, limits, deadline, clock)
        finally:
            response.close()

        if media == "application/pdf" and not _looks_like_pdf(body):
            raise ValidationError(_MSG_NOT_PDF)
        return Fetched(final_url=target.url, content_type=media, body=body, charset=charset)
