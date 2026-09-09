"""Grant or revoke access for one account, without going through Stripe.

Run with::

    python -m app.admin.grant_subscription --email pessoa@exemplo.com
    python -m app.admin.grant_subscription --email pessoa@exemplo.com --revoke

Why this exists: `require_active_subscription` gates every product router and
has no exception, and `/billing/checkout` answers 503 while `STRIPE_API_KEY` is
empty (D-36 keeps it empty by default). Deployed as-is, nobody could reach the
tool — not the operator, not an examiner invited to look at it — and nobody
could buy their way in either. The alternative was an environment variable that
switches the gate off, which would loosen in production the very rule D-46
established on purpose, and would sit there waiting to be left on.

So the gate stays exactly as D-46 wrote it and the access becomes a row, granted
deliberately, one account at a time, by someone who already holds the database
credentials. That is a far smaller and far more visible privilege than a global
off switch.

The account must have logged in through Google at least once: this grants a
subscription to an existing user and never invents one. Creating users here
would mean fabricating a `google_sub`, and a fabricated identity is exactly what
the login design refuses (D-42).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.user_repository import UserRepository

#: Stripe ids are opaque strings the API hands us, so a comped row still has to
#: put *something* in the non-null, unique `stripe_customer_id`. This prefix is
#: deliberately not a shape Stripe ever emits (`cus_…`): it keeps the two kinds
#: of row apart at a glance, and a later reconciliation against Stripe can skip
#: these instead of reporting them as customers that vanished.
COMPED_CUSTOMER_PREFIX = "cortesia:"


def comped_customer_id(user_id: int) -> str:
    return f"{COMPED_CUSTOMER_PREFIX}{user_id}"


@dataclass(frozen=True)
class Outcome:
    """What the command did, so `main` only has to print and pick an exit code."""

    ok: bool
    message: str
    #: The subscription status after the call, when there is one to report.
    status: str | None = None


def apply_grant(db: Session, *, email: str, revoke: bool = False) -> Outcome:
    """Move one account's subscription to active (or canceled). Does not commit."""
    users = UserRepository(db).list_by_email(email)

    if not users:
        return Outcome(
            ok=False,
            message=(
                f"Nenhuma conta com o e-mail {email}. A pessoa precisa entrar pelo "
                "Google uma vez antes — este comando concede acesso a quem já "
                "existe, não cria conta."
            ),
        )

    # `email` is not unique (identity is `google_sub`), so more than one row can
    # carry the same address. Picking one would be a guess about which person
    # the operator meant; the ids go in the message so they can decide.
    if len(users) > 1:
        ids = ", ".join(str(u.id) for u in users)
        return Outcome(
            ok=False,
            message=f"{len(users)} contas têm o e-mail {email}: ids {ids}. Ambíguo — nada foi alterado.",
        )

    user = users[0]
    subscriptions = SubscriptionRepository(db)
    subscription = subscriptions.get_by_user_id(user.id)
    target = "canceled" if revoke else "active"

    if subscription is None:
        if revoke:
            return Outcome(
                ok=True,
                message=f"{email} (id {user.id}) não tem assinatura; nada a revogar.",
            )
        subscriptions.create(
            user_id=user.id,
            stripe_customer_id=comped_customer_id(user.id),
            stripe_subscription_id=None,
            status=target,
        )
    elif subscription.status == target:
        return Outcome(
            ok=True,
            status=target,
            message=f"{email} (id {user.id}) já está '{target}'. Nada a fazer.",
        )
    else:
        subscription.status = target
        subscription.updated_at = datetime.now(UTC)

    verbo = "revogado" if revoke else "concedido"
    return Outcome(
        ok=True,
        status=target,
        message=f"Acesso {verbo} para {email} (id {user.id}): status '{target}'.",
    )


def parse_emails(raw: list[str]) -> list[str]:
    """Split the operator's free text into addresses, in the order they typed them.

    `admin-banco.yml` offers a single text field, so a cohort arrives as one
    string. Accept every separator a tired person might reach for — comma,
    space, newline — and refuse an empty field outright: "zero addresses" would
    otherwise succeed silently, having granted nothing.
    """
    seen: dict[str, None] = {}
    for chunk in raw:
        for email in chunk.replace(",", " ").split():
            seen.setdefault(email, None)
    if not seen:
        raise ValueError("Nenhum e-mail informado.")
    return list(seen)


def apply_grants(db: Session, *, emails: list[str], revoke: bool = False) -> list[Outcome]:
    """Apply one grant per address, independently. Does not commit.

    A cohort of eight must not lose seven grants to one typo, so a refusal on
    one address never aborts the rest — `apply_grant` leaves the session
    untouched when it refuses, so the successful ones stay committable.
    """
    return [apply_grant(db, email=email, revoke=revoke) for email in emails]


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m app.admin.grant_subscription",
        description=(
            "Concede (ou revoga) acesso a uma conta que já entrou pelo Google, "
            "sem passar pelo Stripe."
        ),
    )
    parser.add_argument(
        "--email",
        required=True,
        nargs="+",
        help="E-mail(s) da conta Google. Vários podem vir separados por vírgula ou espaço.",
    )
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="Revoga em vez de conceder: marca a assinatura como cancelada.",
    )
    args = parser.parse_args()

    try:
        emails = parse_emails(args.email)
    except ValueError as exc:
        print(f"[assinatura] {exc}", file=sys.stderr)
        sys.exit(1)

    with SessionLocal() as db:
        outcomes = apply_grants(db, emails=emails, revoke=args.revoke)
        if any(o.ok for o in outcomes):
            db.commit()

    for outcome in outcomes:
        stream = sys.stdout if outcome.ok else sys.stderr
        print(f"[assinatura] {outcome.message}", file=stream)

    if any(o.status == "active" for o in outcomes):
        print(
            "[assinatura] Concessão manual, fora do Stripe — não gera cobrança "
            "nem aparece no painel dele."
        )

    # One failure among many still fails the job: an operator reading a green
    # tick must never conclude that everyone on the list got in.
    falhas = [o for o in outcomes if not o.ok]
    if falhas:
        print(
            f"[assinatura] {len(falhas)} de {len(outcomes)} endereços não foram aplicados.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
