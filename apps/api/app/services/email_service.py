"""Handing a message to a mail server (D-242).

Two providers, chosen by ``EMAIL_PROVIDER``:

* ``mock`` — the default in the code and in every test. It records that the
  message *would* have gone (a log line with counts, never an address) and sends
  nothing; the delivery row it leaves says ``simulado``, not ``enviado``.
* ``smtp`` — ``smtplib`` from the standard library, no new dependency. STARTTLS
  on port 587 (``SMTP_STARTTLS``), implicit TLS on 465, one short socket timeout
  for every step. Credentials never travel in the clear to a remote host: with a
  username and no TLS the send is refused before connecting.

What a failure says is **ours, in Portuguese, and secret-free**. ``smtplib``'s own
text can carry the server's banner or a login echo, so it is never shown, stored
or logged: the log line has the exception *class* and the SMTP code, nothing else
(``SMTP_PASSWORD`` cannot reach a log or a response from here).

The callers are plain ``def`` routes, which FastAPI runs in its worker thread
pool, so a slow mail server holds one pool thread and never the event loop. A
small gate (``EMAIL_SEND_CONCURRENCY``) keeps a slow server from holding all of
them: the next send waits briefly and is then refused with 503 and ``Retry-After``.
"""

from __future__ import annotations

import logging
import smtplib
import socket
import ssl
import threading
from dataclasses import dataclass, field
from email import policy
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from app.config import settings
from app.domain.errors import ServiceUnavailableError
from app.services.heavy_request_gate import RETRY_AFTER_SECONDS, HeavyRequestGate

logger = logging.getLogger(__name__)

IMPLICIT_TLS_PORT = 465
_LOOPBACK = frozenset({"localhost", "127.0.0.1", "::1"})


class EmailSendError(Exception):
    """A send that did not happen. ``str(exc)`` is the Portuguese reason, fit to show."""


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    maintype: str = "text"
    subtype: str = "html"


@dataclass(frozen=True)
class OutgoingEmail:
    to: tuple[str, ...]
    subject: str
    text: str
    html: str
    cc: tuple[str, ...] = ()
    attachments: tuple[EmailAttachment, ...] = field(default_factory=tuple)


def _domain_of(address: str) -> str:
    return address.rsplit("@", 1)[-1] if "@" in address else "localhost"


def build_message(
    email: OutgoingEmail, *, sender: str, sender_name: str, reply_to: str | None = None
) -> EmailMessage:
    """The MIME message: text and HTML alternatives, the attachments, safe headers.

    ``EmailMessage`` under the SMTP policy refuses a line break in any header, so
    a subject or an address that smuggled one raises here instead of adding a
    ``Bcc:`` line — the validation upstream is the first wall, this is the second.
    """
    message = EmailMessage(policy=policy.SMTP)
    message["Subject"] = email.subject
    local, _, domain = sender.partition("@")
    message["From"] = Address(display_name=sender_name, username=local, domain=domain)
    message["To"] = ", ".join(email.to)
    if email.cc:
        message["Cc"] = ", ".join(email.cc)
    if reply_to:
        message["Reply-To"] = reply_to
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=_domain_of(sender))
    message.set_content(email.text)
    message.add_alternative(email.html, subtype="html")
    for item in email.attachments:
        # Bytes in base64, so the attachment is the frozen document to the last byte;
        # a text part says its charset, so a client never has to guess.
        params = {"charset": "utf-8"} if item.maintype == "text" else None
        message.add_attachment(
            item.content,
            maintype=item.maintype,
            subtype=item.subtype,
            filename=item.filename,
            params=params,
        )
    return message


def explain_smtp_failure(exc: BaseException, timeout_seconds: float) -> str:
    """Our sentence for what went wrong. Never the exception's own text."""
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return (
            "O servidor de e-mail recusou o usuário ou a senha configurados. "
            "Quem administra o servidor precisa conferir as credenciais SMTP."
        )
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "O servidor de e-mail recusou um ou mais destinatários. Confira os endereços."
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return (
            "O servidor de e-mail recusou o remetente configurado. "
            "Quem administra o servidor precisa conferir o endereço de envio."
        )
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return (
            "O servidor de e-mail não oferece a conexão segura ou o login configurados. "
            "Quem administra o servidor precisa conferir a porta e o STARTTLS."
        )
    if isinstance(exc, smtplib.SMTPServerDisconnected):
        return "O servidor de e-mail encerrou a conexão no meio do envio. Tente de novo."
    if isinstance(exc, smtplib.SMTPConnectError):
        return "Não foi possível conectar ao servidor de e-mail."
    if isinstance(exc, smtplib.SMTPResponseException):
        return (
            f"O servidor de e-mail recusou a mensagem (código {exc.smtp_code}). "
            "Tente de novo em instantes."
        )
    if isinstance(exc, TimeoutError):
        return (
            f"O servidor de e-mail não respondeu em {timeout_seconds:g} s. "
            "Tente de novo em instantes."
        )
    if isinstance(exc, ssl.SSLError):
        return "Não foi possível abrir a conexão segura (TLS) com o servidor de e-mail."
    if isinstance(exc, socket.gaierror):
        return (
            "Não foi possível encontrar o servidor de e-mail. O endereço configurado não resolve."
        )
    if isinstance(exc, OSError):
        return "Não foi possível conectar ao servidor de e-mail."
    return "O servidor de e-mail recusou o envio."


class MockEmailSender:
    """Records that a message would have gone. Sends nothing."""

    provider = "mock"

    def send(self, email: OutgoingEmail) -> None:
        # Counts only: an address is personal data and the log is not the place for it.
        logger.info(
            "E-mail simulado (EMAIL_PROVIDER=mock): %d destinatário(s), %d em cópia, "
            "%d anexo(s); nada foi enviado.",
            len(email.to),
            len(email.cc),
            len(email.attachments),
        )


class SmtpEmailSender:
    """``smtplib`` against ``SMTP_HOST``, with the settings read at send time."""

    provider = "smtp"

    def send(self, email: OutgoingEmail) -> None:
        host = settings.smtp_host.strip()
        sender = settings.email_from.strip()
        port = settings.smtp_port
        username = settings.smtp_username.strip()
        timeout = max(float(settings.smtp_timeout_seconds), 1.0)
        implicit_tls = port == IMPLICIT_TLS_PORT
        use_tls = implicit_tls or settings.smtp_starttls

        if username and not use_tls and host.lower() not in _LOOPBACK:
            # Refuse before connecting: a password must not cross the network in the clear.
            raise EmailSendError(
                "O envio por e-mail está configurado sem conexão segura, e as credenciais não "
                "viajam sem TLS. Quem administra o servidor precisa ligar o STARTTLS "
                "(SMTP_STARTTLS=true) ou usar a porta 465."
            )

        message = build_message(
            email,
            sender=sender,
            sender_name=settings.email_from_name.strip() or "MaterialSelect AI",
            reply_to=settings.email_reply_to.strip() or None,
        )
        envelope = [*email.to, *email.cc]
        context = ssl.create_default_context()
        # The EHLO name defaults to ``socket.getfqdn()``, a DNS lookup that can stall
        # a worker for seconds; the sender's own domain is a name the server accepts.
        helo = _domain_of(sender)

        with get_email_gate().slot():
            try:
                if implicit_tls:
                    client: smtplib.SMTP = smtplib.SMTP_SSL(
                        host, port, local_hostname=helo, timeout=timeout, context=context
                    )
                else:
                    client = smtplib.SMTP(host, port, local_hostname=helo, timeout=timeout)
                with client:
                    if use_tls and not implicit_tls:
                        client.starttls(context=context)
                    if username:
                        client.login(username, settings.smtp_password)
                    client.send_message(message, from_addr=sender, to_addrs=envelope)
            except EmailSendError:
                raise
            except (smtplib.SMTPException, OSError) as exc:
                # The class and the SMTP code, never ``str(exc)``: it can echo the server.
                logger.warning(
                    "E-mail: falha ao enviar por SMTP (%s, código %s)",
                    exc.__class__.__name__,
                    getattr(exc, "smtp_code", None),
                )
                raise EmailSendError(explain_smtp_failure(exc, timeout)) from None


EmailSender = MockEmailSender | SmtpEmailSender


def get_email_sender() -> EmailSender:
    """The provider the settings name; a gap in the configuration is a 503 that says which."""
    name = settings.email_provider_name
    if name == "mock":
        return MockEmailSender()
    if name == "smtp":
        missing = [
            label
            for label, value in (
                ("SMTP_HOST", settings.smtp_host),
                ("EMAIL_FROM", settings.email_from),
            )
            if not value.strip()
        ]
        if missing:
            raise ServiceUnavailableError(
                "O envio por e-mail está ligado (EMAIL_PROVIDER=smtp), mas falta configurar "
                + " e ".join(missing)
                + " no servidor."
            )
        return SmtpEmailSender()
    raise ServiceUnavailableError(f"EMAIL_PROVIDER desconhecido: '{name}'. Use 'mock' ou 'smtp'.")


# --- The send gate ----------------------------------------------------------

_gate: HeavyRequestGate | None = None
_gate_lock = threading.Lock()


def get_email_gate() -> HeavyRequestGate:
    """How many sends one process holds at once, rebuilt when the setting changes."""
    global _gate
    capacity = settings.email_send_concurrency
    with _gate_lock:
        if _gate is None or _gate.capacity != capacity:
            _gate = HeavyRequestGate(
                capacity,
                wait_seconds=5.0,
                busy_message=(
                    "O servidor de e-mail está ocupado com outros envios agora. "
                    f"Tente de novo em {RETRY_AFTER_SECONDS} segundos."
                ),
            )
        return _gate
