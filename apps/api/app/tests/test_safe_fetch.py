"""The SSRF policy of :mod:`app.integrations.safe_fetch`, one refusal at a time.

This is the only code in the application that requests an address a student
typed, so each rule here is pinned by a test that would fail if the rule were
loosened: the parse (scheme, userinfo, port, local names, abbreviated IPs),
the resolution (any non-public answer refuses the name), the pinning (the
request goes to the address that was checked, with the name in ``Host`` and in
``sni_hostname``), the redirects (every hop re-checked, one resolution each)
and the reading (size cap after decompression, total deadline, content type).

No test reaches the network: a fake resolver answers every name, an
``httpx.MockTransport`` answers every request, and the fixture below makes the
system resolver and ``socket.create_connection`` raise, so a test that forgot
to inject one of the fakes fails instead of going out.
"""

from __future__ import annotations

import gzip
import socket
import tracemalloc
import zlib
from collections.abc import Callable, Iterator
from types import SimpleNamespace

import httpx
import pytest

from app import __version__
from app.domain.errors import ValidationError
from app.integrations import http as http_module
from app.integrations.http import build_client, get_http_transport, get_resolver, user_agent
from app.integrations.safe_fetch import (
    DEFAULT_MAX_URL_LENGTH,
    Fetched,
    FetchLimits,
    _BodyTooLarge,
    _Inflate,
    default_resolver,
    fetch,
    is_public_address,
    normalise_url,
)

PUBLIC = "93.184.215.14"
PUBLIC_2 = "151.101.1.69"
PUBLIC_V6 = "2606:2800:21f:cb07:6820:80da:af6b:8b2c"
METADATA = "169.254.169.254"

SETTINGS = SimpleNamespace(frontend_url="https://app.example.org", external_contact="")
LIMITS = FetchLimits(max_bytes=5_000, timeout_seconds=10.0, max_redirects=3)

HTML = "text/html; charset=utf-8"


# --- the fakes ------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _no_real_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("a test tried to reach the real network")

    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)


class FakeResolver:
    """Answers from a table; ``sequence`` answers change call by call (rebinding)."""

    def __init__(
        self,
        table: dict[str, list[str]] | None = None,
        *,
        sequence: dict[str, list[list[str]]] | None = None,
    ) -> None:
        self.table = table or {}
        self.sequence = {host: list(answers) for host, answers in (sequence or {}).items()}
        self.calls: list[tuple[str, int]] = []

    def __call__(self, host: str, port: int) -> list[str]:
        self.calls.append((host, port))
        if self.sequence.get(host):
            return self.sequence[host].pop(0)
        if host in self.table:
            return list(self.table[host])
        raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")


Handler = Callable[[httpx.Request], httpx.Response]


class Web:
    """A fake internet keyed by ``(Host header, path)``, recording every request."""

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], Handler] = {}
        self.requests: list[httpx.Request] = []

    def page(
        self,
        host: str,
        path: str,
        body: bytes | Iterator[bytes] = b"<html><body>ok</body></html>",
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        response_headers = {"content-type": HTML} if headers is None else headers

        def respond(_request: httpx.Request) -> httpx.Response:
            # Bytes are served as a one-chunk stream, as off a socket: given
            # bytes, httpx.Response would read (and decode) them up front, and
            # the bounded reading path would never run.
            content = iter([body]) if isinstance(body, bytes) else body
            return httpx.Response(status, headers=response_headers, content=content)

        self.routes[(host, path)] = respond

    def redirect(self, host: str, path: str, location: str | None, status: int = 302) -> None:
        headers = {} if location is None else {"location": location}
        self.routes[(host, path)] = lambda _r: httpx.Response(status, headers=headers)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        handler = self.routes.get((request.headers["host"], request.url.path))
        if handler is None:
            return httpx.Response(404, headers={"content-type": HTML})
        return handler(request)

    def client(self) -> httpx.Client:
        return build_client(SETTINGS, httpx.MockTransport(self.handle))


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


def _fetch(
    url: str,
    web: Web,
    resolver: FakeResolver,
    *,
    limits: FetchLimits = LIMITS,
    clock: Callable[[], float] | None = None,
) -> Fetched:
    with web.client() as client:
        if clock is None:
            return fetch(url, client=client, resolver=resolver, settings=SETTINGS, limits=limits)
        return fetch(
            url, client=client, resolver=resolver, settings=SETTINGS, limits=limits, clock=clock
        )


def _refused(
    url: str,
    web: Web,
    resolver: FakeResolver,
    *,
    limits: FetchLimits = LIMITS,
    clock: Callable[[], float] | None = None,
) -> str:
    with pytest.raises(ValidationError) as caught:
        _fetch(url, web, resolver, limits=limits, clock=clock)
    return str(caught.value)


# --- normalise_url ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("HTTPS://Example.COM:443/Path?a=1", "https://example.com/Path?a=1"),
        ("http://example.com:80", "http://example.com/"),
        ("https://example.com", "https://example.com/"),
        ("https://example.com./a", "https://example.com/a"),
        ("  https://example.com/a  ", "https://example.com/a"),
        ("https://example.com:80/a", "https://example.com:80/a"),
        ("https://example.com/a#section-2", "https://example.com/a"),
        ("https://example.com/a?", "https://example.com/a"),
        ("https://Ação.com.br/x", "https://xn--ao-siap.com.br/x"),
        ("https://pt.wikipedia.org/wiki/Aço", "https://pt.wikipedia.org/wiki/A%C3%A7o"),
        ("https://pt.wikipedia.org/wiki/A%C3%A7o", "https://pt.wikipedia.org/wiki/A%C3%A7o"),
        ("https://[2606:4700:4700:0::1111]/", "https://[2606:4700:4700::1111]/"),
    ],
)
def test_normalise_url_canonical_form(raw: str, expected: str) -> None:
    assert normalise_url(raw) == expected


def test_normalise_url_strips_tracking_parameters_and_keeps_the_rest_verbatim() -> None:
    url = (
        "https://example.com/a?utm_source=news&id=7&fbclid=abc&UTM_Medium=x"
        "&gclid=z&q=a+b%20c&msclkid=1#top"
    )
    assert normalise_url(url) == "https://example.com/a?id=7&q=a+b%20c"
    assert normalise_url("https://example.com/a?utm_campaign=x&gclid=1") == (
        "https://example.com/a"
    )


@pytest.mark.parametrize("limit", [DEFAULT_MAX_URL_LENGTH, 500])
def test_normalise_url_length_limit(limit: int) -> None:
    base = "https://example.com/"
    exactly = base + "a" * (limit - len(base))
    assert normalise_url(exactly, max_length=limit) == exactly
    with pytest.raises(ValidationError, match=f"{limit} caracteres"):
        normalise_url(exactly + "a", max_length=limit)


def test_the_default_url_limit_admits_long_redirect_links() -> None:
    # Search-grounding redirect links run past a thousand characters; the
    # 500-character cap on what a student types lives in the request schema.
    assert DEFAULT_MAX_URL_LENGTH == 2048
    long_link = "https://example.com/grounding-api-redirect/" + "A" * 1_500
    assert normalise_url(long_link) == long_link


def test_normalise_url_refuses_a_normalised_form_over_the_limit() -> None:
    # 200 "ç" are 200 characters typed and 1,200 once percent-encoded; the
    # stored origin is the encoded one, and it has to fit the column.
    with pytest.raises(ValidationError, match="500 caracteres"):
        normalise_url("https://example.com/" + "ç" * 200, max_length=500)


def test_fetch_applies_the_url_limit_to_the_first_address_and_to_redirects() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.redirect("example.com", "/", "/" + "b" * 100)
    short = FetchLimits(max_bytes=5_000, timeout_seconds=10.0, max_redirects=3, max_url_length=60)

    assert "60 caracteres" in _refused(
        "https://example.com/" + "a" * 60, web, resolver, limits=short
    )
    assert web.requests == []
    message = _refused("https://example.com/", web, resolver, limits=short)
    assert message.startswith("A página redirecionou")
    assert "60 caracteres" in message
    assert len(web.requests) == 1


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "gopher://example.com:70/_GET",
        "ftp://example.com/file.txt",
        "javascript:alert(1)",
        "data:text/html,<h1>x</h1>",
        "ws://example.com/",
        "example.com/page",
        "//example.com/page",
    ],
)
def test_refuses_schemes_other_than_http_and_https(url: str) -> None:
    with pytest.raises(ValidationError, match="http:// ou https://"):
        normalise_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://user:secret@example.com/",
        "https://user@example.com/",
        "https://example.com@evil.example/",
        "https://@example.com/",
    ],
)
def test_refuses_userinfo(url: str) -> None:
    with pytest.raises(ValidationError, match="usuário ou senha"):
        normalise_url(url)


@pytest.mark.parametrize(
    "url",
    ["https://example.com:8080/", "http://example.com:22/", "https://example.com:0/"],
)
def test_refuses_ports_other_than_80_and_443(url: str) -> None:
    with pytest.raises(ValidationError, match="portas padrão"):
        normalise_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com:http/",
        "https://example.com:99999/",
        "http://[::1/",
        "http://[not-an-ip]/",
    ],
)
def test_refuses_malformed_urls(url: str) -> None:
    with pytest.raises(ValidationError):
        normalise_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com\\@evil.example/",
        "https://exa mple.com/",
        "https://example.com/a\tb",
        "https://example.com/a\x00b",
        "https://example.com/\x7f",
    ],
)
def test_refuses_whitespace_control_characters_and_backslash(url: str) -> None:
    with pytest.raises(ValidationError, match="caracteres"):
        normalise_url(url)


@pytest.mark.parametrize("url", ["", "   ", None])
def test_refuses_an_empty_address(url: str | None) -> None:
    with pytest.raises(ValidationError, match="Informe"):
        normalise_url(url)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/",
        "http://LOCALHOST./",
        "http://api.localhost/",
        "http://printer.local/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://_api.internal/",
        "http://my-app.flycast/",
        "http://router.lan/",
        "http://nas.home.arpa/",
        "http://intranet/",
    ],
)
def test_refuses_local_names(url: str) -> None:
    with pytest.raises(ValidationError, match="rede local"):
        normalise_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://2130706433/",  # 127.0.0.1 as one decimal number
        "http://0177.0.0.1/",  # octal
        "http://0x7f.0.0.1/",  # hex label
        "http://0x7f000001/",  # one hex number
        "http://127.1/",  # abbreviated dotted form
        "http://0/",
        "http://169.254.43518/",  # 169.254.169.254, abbreviated
        "http://%31%32%37.0.0.1/",
    ],
)
def test_abbreviated_ip_hosts_are_refused_without_resolving(url: str) -> None:
    web, resolver = Web(), FakeResolver({"2130706433": ["127.0.0.1"]})
    message = _refused(url, web, resolver)
    assert "forma abreviada" in message
    assert resolver.calls == []
    assert web.requests == []


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        f"http://{METADATA}/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://[::ffff:7f00:1]/",
        "http://[::ffff:a9fe:a9fe]/",
        "http://[fe80::1%25eth0]/",
        "http://[fd00:ec2::254]/",
        "http://１２７。０。０。１/",  # fullwidth digits and ideographic full stop
    ],
)
def test_private_ip_literals_are_refused_before_any_request(url: str) -> None:
    web, resolver = Web(), FakeResolver()
    message = _refused(url, web, resolver)
    assert "rede interna" in message
    assert web.requests == []
    assert resolver.calls == []


# --- the address policy -----------------------------------------------------------


@pytest.mark.parametrize(
    "address",
    [
        "0.0.0.0",
        "0.1.2.3",
        "10.1.2.3",
        "100.64.0.1",
        "100.127.255.254",
        "127.0.0.1",
        "127.255.255.254",
        METADATA,
        "172.16.0.1",
        "172.31.255.255",
        "192.0.0.8",
        "192.0.2.1",
        "192.168.1.1",
        "198.18.0.1",
        "198.19.255.255",
        "198.51.100.1",
        "203.0.113.5",
        "224.0.0.1",
        "239.255.255.250",
        "240.0.0.1",
        "255.255.255.255",
        "::",
        "::1",
        "fc00::1",
        "fd12:3456::1",
        "fdaa::2",
        "fe80::1",
        "fe80::1%eth0",
        "ff02::1",
        "64:ff9b::a00:1",
        "2002:7f00:1::1",
        "2001:0:4136:e378::1",
        "2001:db8::1",
        "fd00:ec2::254",
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "::ffff:169.254.169.254",
        "::127.0.0.1",
        "not-an-ip",
        "",
    ],
)
def test_non_public_addresses(address: str) -> None:
    assert is_public_address(address) is False


@pytest.mark.parametrize(
    "address",
    [
        PUBLIC,
        "8.8.8.8",
        "1.1.1.1",
        "172.32.0.1",
        "100.128.0.1",
        "2606:4700:4700::1111",
        PUBLIC_V6,
        "::ffff:8.8.8.8",
    ],
)
def test_public_addresses(address: str) -> None:
    assert is_public_address(address) is True


# --- pinning ----------------------------------------------------------------------


def test_the_request_goes_to_the_validated_address_with_the_name_in_host_and_sni() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/artigo", b"<html><body>Texto</body></html>")

    fetched = _fetch("https://Example.com/artigo?utm_source=x#topo", web, resolver)

    assert fetched == Fetched(
        final_url="https://example.com/artigo",
        content_type="text/html",
        body=b"<html><body>Texto</body></html>",
        charset="utf-8",
    )
    (request,) = web.requests
    assert request.url.host == PUBLIC
    assert request.url.scheme == "https"
    assert request.url.path == "/artigo"
    assert request.url.query == b""
    assert request.headers["host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"
    assert request.headers["connection"] == "close"
    assert request.headers["user-agent"].startswith(f"MaterialSelectAI/{__version__}")
    assert resolver.calls == [("example.com", 443)]


def test_pins_an_ipv6_answer_in_brackets() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC_V6]})
    web.page("example.com", "/")

    _fetch("https://example.com/", web, resolver)

    (request,) = web.requests
    assert request.url.host == PUBLIC_V6
    assert f"[{PUBLIC_V6}]" in str(request.url)
    assert request.headers["host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"


def test_pins_the_ipv4_inside_a_mapped_answer() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [f"::ffff:{PUBLIC}"]})
    web.page("example.com", "/")

    _fetch("https://example.com/", web, resolver)

    assert web.requests[0].url.host == PUBLIC


def test_plain_http_carries_no_sni_and_a_non_default_port_goes_into_host() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com:443", "/")

    _fetch("http://example.com:443/", web, resolver)

    (request,) = web.requests
    assert "sni_hostname" not in request.extensions
    assert request.headers["host"] == "example.com:443"
    assert request.url.port == 443
    assert resolver.calls == [("example.com", 443)]


def test_a_public_ip_literal_is_its_own_resolution() -> None:
    web, resolver = Web(), FakeResolver()
    web.page(PUBLIC, "/x")

    fetched = _fetch(f"https://{PUBLIC}/x", web, resolver)

    assert fetched.final_url == f"https://{PUBLIC}/x"
    assert resolver.calls == []
    (request,) = web.requests
    assert request.url.host == PUBLIC
    # SNI names a host; an address has none, and the certificate is then
    # checked against the address.
    assert "sni_hostname" not in request.extensions


def test_any_private_answer_refuses_the_whole_name() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC, "10.0.0.7"]})
    web.page("example.com", "/")

    message = _refused("https://example.com/", web, resolver)

    assert "rede interna" in message
    assert "10.0.0.7" not in message
    assert web.requests == []


def test_a_name_resolving_to_the_metadata_endpoint_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"127.0.0.1.nip.io": ["127.0.0.1"], "x.io": [METADATA]})

    assert "rede interna" in _refused("http://127.0.0.1.nip.io/", web, resolver)
    message = _refused("http://x.io/latest/meta-data/", web, resolver)
    assert "rede interna" in message
    assert METADATA not in message
    assert web.requests == []


def test_an_answer_that_is_not_an_address_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"example.com": ["example.net"]})
    assert "rede interna" in _refused("https://example.com/", web, resolver)
    assert web.requests == []


@pytest.mark.parametrize("table", [{}, {"example.com": []}])
def test_an_unknown_name_is_refused(table: dict[str, list[str]]) -> None:
    web, resolver = Web(), FakeResolver(table)
    assert "Não foi possível encontrar" in _refused("https://example.com/", web, resolver)
    assert web.requests == []


# --- redirects --------------------------------------------------------------------


def test_dns_rebinding_between_hops_is_refused_with_one_resolution_per_hop() -> None:
    web = Web()
    resolver = FakeResolver(sequence={"example.com": [[PUBLIC], ["127.0.0.1"]]})
    web.redirect("example.com", "/", "/depois")
    web.page("example.com", "/depois")

    message = _refused("https://example.com/", web, resolver)

    assert message.startswith("A página redirecionou")
    assert "rede interna" in message
    assert "127.0.0.1" not in message
    assert resolver.calls == [("example.com", 443), ("example.com", 443)]
    assert [request.url.host for request in web.requests] == [PUBLIC]


def test_a_relative_redirect_is_joined_to_the_logical_url_and_re_pinned() -> None:
    web = Web()
    resolver = FakeResolver({"example.com": [PUBLIC], "www.example.com": [PUBLIC_2]})
    web.redirect("example.com", "/a", "https://www.example.com/b?utm_medium=x&id=3", 301)
    web.redirect("www.example.com", "/b", "c", 308)
    web.page("www.example.com", "/c", b"fim", headers={"content-type": "text/plain"})

    fetched = _fetch("https://example.com/a", web, resolver)

    assert fetched.final_url == "https://www.example.com/c"
    assert fetched.body == b"fim"
    assert [(r.url.host, r.headers["host"], r.url.path) for r in web.requests] == [
        (PUBLIC, "example.com", "/a"),
        (PUBLIC_2, "www.example.com", "/b"),
        (PUBLIC_2, "www.example.com", "/c"),
    ]
    assert web.requests[1].url.query == b"id=3"
    assert resolver.calls == [
        ("example.com", 443),
        ("www.example.com", 443),
        ("www.example.com", 443),
    ]


@pytest.mark.parametrize(
    "location",
    [
        "http://10.0.0.5/admin",
        f"http://{METADATA}/latest/meta-data/",
        "http://[::ffff:169.254.169.254]/",
        "http://metadata.internal/",
    ],
)
def test_a_redirect_into_the_private_network_never_reaches_it(location: str) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.redirect("example.com", "/", location)

    message = _refused("https://example.com/", web, resolver)

    assert message.startswith("A página redirecionou")
    assert [request.url.host for request in web.requests] == [PUBLIC]
    assert METADATA not in message
    assert "10.0.0.5" not in message


@pytest.mark.parametrize(
    ("location", "reason"),
    [
        ("file:///etc/passwd", "http:// ou https://"),
        ("gopher://example.com/", "http:// ou https://"),
        ("https://example.com:8080/", "portas padrão"),
        ("https://user@example.com/", "usuário ou senha"),
        ("http://2130706433/", "forma abreviada"),
    ],
)
def test_a_redirect_is_parsed_by_the_same_rules(location: str, reason: str) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.redirect("example.com", "/", location)

    message = _refused("https://example.com/", web, resolver)

    assert message.startswith("A página redirecionou")
    assert reason in message
    assert len(web.requests) == 1


def test_a_redirect_without_location_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.redirect("example.com", "/", None)
    assert "sem dizer para onde" in _refused("https://example.com/", web, resolver)


def test_three_redirects_are_followed_and_the_fourth_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    for hop in range(4):  # /0 -> /1 -> /2 -> /3 -> /4
        web.redirect("example.com", f"/{hop}", f"/{hop + 1}")
    web.page("example.com", "/4", b"four")

    assert _fetch("https://example.com/1", web, resolver).body == b"four"
    assert len(web.requests) == 4

    web.requests.clear()
    message = _refused("https://example.com/0", web, resolver)
    assert "mais de 3 vezes" in message
    assert len(web.requests) == 4


def test_a_client_built_to_follow_redirects_is_not_obeyed() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.redirect("example.com", "/", f"http://{METADATA}/")
    client = httpx.Client(transport=httpx.MockTransport(web.handle), follow_redirects=True)

    with client, pytest.raises(ValidationError, match="redirecionou"):
        fetch(
            "https://example.com/",
            client=client,
            resolver=resolver,
            settings=SETTINGS,
            limits=LIMITS,
        )
    assert len(web.requests) == 1


# --- connection failures ----------------------------------------------------------


def test_a_failed_connection_falls_back_to_the_next_validated_address() -> None:
    web = Web()
    resolver = FakeResolver({"example.com": [PUBLIC_V6, PUBLIC]})
    web.page("example.com", "/")

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == PUBLIC_V6:
            web.requests.append(request)
            raise httpx.ConnectError("Network is unreachable", request=request)
        return web.handle(request)

    with build_client(SETTINGS, httpx.MockTransport(handle)) as client:
        fetched = fetch(
            "https://example.com/",
            client=client,
            resolver=resolver,
            settings=SETTINGS,
            limits=LIMITS,
        )

    assert fetched.content_type == "text/html"
    assert [request.url.host for request in web.requests] == [PUBLIC_V6, PUBLIC]
    assert resolver.calls == [("example.com", 443)]


def test_connection_errors_are_pt_br_and_never_name_the_address() -> None:
    resolver = FakeResolver({"example.com": [PUBLIC, PUBLIC_2]})

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"connection to {request.url.host} refused", request=request)

    with build_client(SETTINGS, httpx.MockTransport(refuse)) as client:
        with pytest.raises(ValidationError) as caught:
            fetch("https://example.com/", client=client, resolver=resolver, settings=SETTINGS)

    message = str(caught.value)
    assert "Não foi possível conectar" in message
    assert PUBLIC not in message and PUBLIC_2 not in message


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (httpx.ReadTimeout, "demorou mais de 10 segundos"),
        (httpx.ConnectTimeout, "demorou mais de 10 segundos"),
        (httpx.RemoteProtocolError, "interrompida"),
    ],
)
def test_transport_errors_become_validation_errors(
    error: type[httpx.TransportError], expected: str
) -> None:
    resolver = FakeResolver({"example.com": [PUBLIC]})

    def fail(request: httpx.Request) -> httpx.Response:
        raise error(f"failure talking to {PUBLIC}", request=request)

    with build_client(SETTINGS, httpx.MockTransport(fail)) as client:
        with pytest.raises(ValidationError) as caught:
            fetch("https://example.com/", client=client, resolver=resolver, settings=SETTINGS)
    assert expected in str(caught.value)
    assert PUBLIC not in str(caught.value)


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (404, "não foi encontrada (código 404)"),
        (403, "exige login"),
        (429, "código 429"),
        (503, "código 503"),
        (304, "código 304"),
    ],
)
def test_error_statuses_are_refused_with_the_code(status: int, expected: str) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", status=status)
    assert expected in _refused("https://example.com/", web, resolver)


# --- reading ----------------------------------------------------------------------


class _Stream:
    """A body that counts how much of it was pulled."""

    def __init__(self, chunks: list[bytes], on_chunk: Callable[[], None] | None = None) -> None:
        self.chunks = chunks
        self.pulled = 0
        self.on_chunk = on_chunk

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self.chunks:
            self.pulled += 1
            if self.on_chunk is not None:
                self.on_chunk()
            yield chunk


def test_a_declared_length_over_the_cap_is_refused_before_reading() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    stream = _Stream([b"x" * 100])
    web.page(
        "example.com", "/", iter(stream), headers={"content-type": HTML, "content-length": "5001"}
    )

    message = _refused("https://example.com/", web, resolver)

    assert "limite de 5 kB" in message
    assert stream.pulled == 0


def test_a_streamed_body_over_the_cap_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    stream = _Stream([b"x" * 1_000] * 10)
    web.page("example.com", "/", iter(stream))

    assert "limite de" in _refused("https://example.com/", web, resolver)
    assert stream.pulled == 6


def test_a_body_exactly_at_the_cap_is_read() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", iter(_Stream([b"x" * 1_000] * 5)))
    assert len(_fetch("https://example.com/", web, resolver).body) == 5_000


@pytest.mark.parametrize(
    ("max_bytes", "written"),
    [
        (5_000_000, "5 MB"),
        (2_500_000, "2,5 MB"),
        (1_050_000, "1,05 MB"),
        (5_000, "5 kB"),
        (5, "5 bytes"),
    ],
)
def test_the_size_limit_is_written_for_people(max_bytes: int, written: str) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", b"", headers={"content-type": HTML, "content-length": "9999999"})
    limits = FetchLimits(max_bytes=max_bytes, timeout_seconds=10.0, max_redirects=3)
    assert f"limite de {written}." in _refused("https://example.com/", web, resolver, limits=limits)


@pytest.mark.parametrize("encoding", ["gzip", "x-gzip"])
def test_a_gzip_bomb_is_stopped_at_the_cap(encoding: str) -> None:
    bomb = gzip.compress(b"\0" * 2_000_000)
    assert len(bomb) < LIMITS.max_bytes  # small on the wire
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", bomb, headers={"content-type": HTML, "content-encoding": encoding})

    assert "limite de" in _refused("https://example.com/", web, resolver)


def test_inflating_a_bomb_never_holds_more_than_the_room_it_was_given() -> None:
    bomb = gzip.compress(b"\0" * 50_000_000)  # ~50 KB that inflates to 50 MB
    inflater = _Inflate(gzip=True)
    tracemalloc.start()
    try:
        with pytest.raises(_BodyTooLarge):
            inflater.feed(bomb, 10_000)
        _current, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    # httpx's decoder would have materialised all 50 MB in that one call.
    assert peak < 1_000_000


def _raw_deflate(data: bytes) -> bytes:
    compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
    return compressor.compress(data) + compressor.flush()


@pytest.mark.parametrize(
    ("encoding", "encode"),
    [
        ("gzip", gzip.compress),
        ("deflate", zlib.compress),  # what the RFC says deflate is
        ("deflate", _raw_deflate),  # what some servers send instead
        ("identity", bytes),
    ],
)
def test_compressed_bodies_are_decoded(encoding: str, encode: Callable[[bytes], bytes]) -> None:
    text = "Aço inoxidável 304. ".encode() * 50
    payload = encode(text)
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    # Split the payload so the decoder sees it in pieces, as off a socket.
    pieces = [payload[i : i + 7] for i in range(0, len(payload), 7)]
    web.page(
        "example.com",
        "/",
        iter(pieces),
        headers={"content-type": "text/plain", "content-encoding": encoding},
    )

    assert _fetch("https://example.com/", web, resolver).body == text


@pytest.mark.parametrize("encoding", ["br", "zstd", "gzip, gzip", "compress"])
def test_unsupported_or_stacked_encodings_are_refused(encoding: str) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page(
        "example.com", "/", b"xx", headers={"content-type": HTML, "content-encoding": encoding}
    )
    assert "compressão" in _refused("https://example.com/", web, resolver)


def test_a_corrupt_gzip_body_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page(
        "example.com",
        "/",
        b"\x1f\x8b\x08\x00garbage-not-deflate",
        headers={"content-type": HTML, "content-encoding": "gzip"},
    )
    assert "corrompido" in _refused("https://example.com/", web, resolver)


def test_a_response_read_up_front_by_the_transport_is_still_capped() -> None:
    # httpx.Response(content=b"...") arrives already read — the shape other
    # modules' tests build. The real transport never does this.
    resolver = FakeResolver({"example.com": [PUBLIC]})

    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": HTML}, content=b"x" * 10)

    with build_client(SETTINGS, httpx.MockTransport(handle)) as client:
        fetched = fetch(
            "https://example.com/",
            client=client,
            resolver=resolver,
            settings=SETTINGS,
            limits=LIMITS,
        )
        assert fetched.body == b"x" * 10
        tiny = FetchLimits(max_bytes=5, timeout_seconds=10.0, max_redirects=3)
        with pytest.raises(ValidationError, match="limite de 5 bytes"):
            fetch(
                "https://example.com/",
                client=client,
                resolver=resolver,
                settings=SETTINGS,
                limits=tiny,
            )


def test_a_slow_stream_is_cut_at_the_deadline() -> None:
    clock = FakeClock()

    def tick() -> None:
        clock.now += 4.0

    stream = _Stream([b"a", b"b", b"c", b"d", b"e"], on_chunk=tick)
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", iter(stream))

    message = _refused("https://example.com/", web, resolver, clock=clock)

    assert "demorou mais de 10 segundos" in message
    assert stream.pulled == 3  # 12 s > 10 s: the rest is never pulled


def test_the_deadline_spans_redirects() -> None:
    clock = FakeClock()
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})

    def slow_redirect(_request: httpx.Request) -> httpx.Response:
        clock.now += 11.0
        return httpx.Response(302, headers={"location": "/b"})

    web.routes[("example.com", "/a")] = slow_redirect
    web.page("example.com", "/b")

    assert "demorou" in _refused("https://example.com/a", web, resolver, clock=clock)
    assert len(web.requests) == 1


def test_the_request_timeout_is_what_is_left_of_the_deadline() -> None:
    clock = FakeClock()
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})

    def slow_redirect(_request: httpx.Request) -> httpx.Response:
        clock.now += 6.0
        return httpx.Response(302, headers={"location": "/b"})

    web.routes[("example.com", "/a")] = slow_redirect
    web.page("example.com", "/b")

    _fetch("https://example.com/a", web, resolver, clock=clock)

    assert web.requests[0].extensions["timeout"]["read"] == pytest.approx(10.0)
    assert web.requests[1].extensions["timeout"]["read"] == pytest.approx(4.0)


# --- content type -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("header", "media", "charset"),
    [
        ("text/html", "text/html", None),
        ("TEXT/HTML; charset=UTF-8", "text/html", "utf-8"),
        ('text/html; charset="ISO-8859-1"', "text/html", "iso-8859-1"),
        ("text/html; boundary=x; charset=windows-1252", "text/html", "windows-1252"),
        ("text/html; charset=x-no-such-charset", "text/html", None),
        ("application/xhtml+xml", "application/xhtml+xml", None),
        ("text/plain; charset=utf-8", "text/plain", "utf-8"),
        ("text/markdown", "text/markdown", None),
        ("text/x-markdown", "text/markdown", None),
    ],
)
def test_allowed_content_types_and_charset(header: str, media: str, charset: str | None) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", b"texto", headers={"content-type": header})

    fetched = _fetch("https://example.com/", web, resolver)

    assert (fetched.content_type, fetched.charset) == (media, charset)


@pytest.mark.parametrize(
    ("header", "shown"),
    [
        ("image/png", "“image/png”"),
        ("application/octet-stream", "“application/octet-stream”"),
        ("application/json", "“application/json”"),
        ("video/mp4", "“video/mp4”"),
        ("<script>/x", "tipo desconhecido"),
    ],
)
def test_other_content_types_are_refused_before_reading(header: str, shown: str) -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    stream = _Stream([b"\x89PNG"])
    web.page("example.com", "/", iter(stream), headers={"content-type": header})

    message = _refused("https://example.com/", web, resolver)

    assert shown in message
    assert stream.pulled == 0


def test_a_missing_content_type_is_refused() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", b"texto", headers={})
    assert "não informou o tipo" in _refused("https://example.com/", web, resolver)


def test_a_pdf_must_carry_the_pdf_signature() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page(
        "example.com", "/ok.pdf", b"%PDF-1.7\n...", headers={"content-type": "application/pdf"}
    )
    web.page(
        "example.com",
        "/late.pdf",
        b"\n" * 10 + b"%PDF-1.4\n",
        headers={"content-type": "application/pdf"},
    )
    web.page(
        "example.com",
        "/fake.pdf",
        b"<html>login</html>",
        headers={"content-type": "application/pdf"},
    )

    assert _fetch("https://example.com/ok.pdf", web, resolver).content_type == "application/pdf"
    assert _fetch("https://example.com/late.pdf", web, resolver).body.endswith(b"%PDF-1.4\n")
    assert "não é um PDF" in _refused("https://example.com/fake.pdf", web, resolver)


# --- limits, client and dependencies ------------------------------------------------


def test_limits_fall_back_to_the_documented_defaults() -> None:
    assert FetchLimits.from_settings(SimpleNamespace()) == FetchLimits(
        max_bytes=5_000_000, timeout_seconds=10.0, max_redirects=3, max_url_length=2048
    )
    configured = SimpleNamespace(
        notebook_fetch_max_bytes=1_000,
        notebook_fetch_timeout_seconds=2.5,
        notebook_fetch_max_redirects=1,
    )
    assert FetchLimits.from_settings(configured) == FetchLimits(1_000, 2.5, 1, 2048)


def test_fetch_reads_the_limits_from_settings_when_none_are_passed() -> None:
    web, resolver = Web(), FakeResolver({"example.com": [PUBLIC]})
    web.page("example.com", "/", b"x" * 20)
    settings = SimpleNamespace(notebook_fetch_max_bytes=10, frontend_url="", external_contact="")

    with web.client() as client, pytest.raises(ValidationError, match="limite de"):
        fetch("https://example.com/", client=client, resolver=resolver, settings=settings)


def test_build_client_neither_trusts_the_environment_nor_follows_redirects() -> None:
    with build_client(SETTINGS) as client:
        assert client.trust_env is False
        assert client.follow_redirects is False
        assert client.timeout.read == 10.0
        assert client.headers["user-agent"] == (
            f"MaterialSelectAI/{__version__} (+https://app.example.org; https://app.example.org)"
        )


def test_user_agent_names_the_contact_and_cannot_be_used_to_inject_headers() -> None:
    settings = SimpleNamespace(
        frontend_url="https://app.example.org",
        external_contact="ops@example.org\r\nX-Evil: 1 (x); y",
    )
    agent = user_agent(settings)
    assert agent.startswith(f"MaterialSelectAI/{__version__} (+https://app.example.org; ops@")
    assert "\r" not in agent and "\n" not in agent
    assert agent.count("(") == 1 and agent.count(")") == 1
    assert user_agent(SimpleNamespace()) == f"MaterialSelectAI/{__version__}"


def test_the_dependencies_default_to_the_real_transport_and_resolver() -> None:
    assert get_http_transport() is None
    assert get_resolver() is None
    assert http_module.build_client is build_client


def test_default_resolver_returns_unique_addresses_in_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[object, ...]] = []

    def fake_getaddrinfo(*args: object, **kwargs: object) -> list[tuple[object, ...]]:
        seen.append((*args, kwargs))
        return [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (PUBLIC_V6, 443, 0, 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC, 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC, 443)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    assert default_resolver("example.com", 443) == [PUBLIC_V6, PUBLIC]
    assert seen[0][:2] == ("example.com", 443)


def test_fetch_without_a_resolver_uses_the_system_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_a, **_k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443))],
    )
    web = Web()
    with web.client() as client, pytest.raises(ValidationError, match="rede interna"):
        fetch("https://example.com/", client=client, resolver=None, settings=SETTINGS)
    assert web.requests == []
