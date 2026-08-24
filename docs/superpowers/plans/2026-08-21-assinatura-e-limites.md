# Assinatura e limites de uso (Free/Pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user Free/Pro subscription with usage limits (import rows,
AI calls, saved studies, report export) enforced server-side and reflected in
the frontend, backed by Stripe for checkout/billing.

**Architecture:** A new `Subscription`/`UsageCounter` pair of tables, a
centralized `EntitlementService` (mirrors `AuditService`'s "one place, called
by every mutating service" shape) that every gated service calls before
acting, a `BillingService` that isolates the Stripe SDK, and a
`LimitExceededError` domain error mapped to HTTP 402 exactly like the
project's other domain errors map to their status codes.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 (backend);
Next.js/TypeScript, TanStack Query (frontend); `stripe` Python SDK.

**Spec:** [docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md](../specs/2026-08-18-multi-tenant-billing-design.md)

## Global Constraints

- Tenant = individual user (no organization/team). Catalogue stays global
  (D-42) — nothing here touches Material/MaterialClass/PropertyDefinition
  scoping.
- Two plans only: `free`, `pro`. Bloqueio rígido no limite — HTTP 402, sem
  tolerância.
- Four limited resources, three different mechanics — never conflate them:
  - `import_rows`, `ai_calls`: monthly counters (`UsageCounter`, reset by
    `period_start`).
  - `studies`: live capacity, `COUNT(*)` against `SelectionStudy` — no
    counter row.
  - `report_exports`: binary gate off `PLAN_LIMITS`, no counter row, no
    per-event record.
- Stripe Checkout + Customer Portal only — no card form in this app's own UI
  (D-23 stays intact because that screen is never ours).
- `STRIPE_API_KEY` empty → billing endpoints answer 503, same convention as
  `GOOGLE_CLIENT_ID` empty today. No default for any Stripe secret (same
  reasoning as `AI_BASE_URL` having none, D-36).
- Existing users (present before the migration) get `plan=pro,
  status=trialing, trial_reason="cortesia_usuario_existente"`,
  `trial_ends_at = migration time + BILLING_TRIAL_DAYS (90)`. Users created
  after the migration get `plan=free, status=active` at signup — no trial.
- Stripe is mocked/stubbed in every test. Nothing in CI reaches the network.
- `ruff check app`, `black --check app`, `pytest`, `alembic upgrade head` +
  `python -m app.db.seed` on a clean DB (backend); `npm run typecheck && npm
  run lint && npm run test && npm run build` (frontend) all stay green —
  same portão as every other PR in this repo (CLAUDE.md §7).

---

## File Structure

Backend (`apps/api/app/`):
- `models/enums.py` — add `PlanTier`, `SubscriptionStatus`, `UsageResource`
- `models/billing.py` — **new**: `Subscription`, `UsageCounter`
- `models/__init__.py` — register the two new models + three new enums
- `alembic/versions/<hash>_assinatura_e_limites_de_uso.py` — **new**: creates
  both tables, backfills existing users into the Pro trial
- `repositories/billing_repository.py` — **new**: `BillingRepository`
- `domain/errors.py` — add `LimitExceededError`
- `services/entitlement_service.py` — **new**: `EntitlementService`,
  `PLAN_LIMITS`
- `services/billing_service.py` — **new**: `BillingService` (Stripe SDK
  isolated here)
- `services/auth_service.py` — modify: create a default `Subscription`
  alongside the default `Project` on first login
- `services/ai_service.py` — modify: `AIService.__init__` gains `user`,
  `interpret`/`explain` call `check_and_record`
- `services/selection_service.py` — modify: `create_study` calls
  `check_capacity`
- `services/export_service.py` — modify: `ExportService.__init__` gains
  `user`, `study_report`/`study_laudo` call `require_export_access`
- `importers/service.py` — modify: `validate`/`commit` call
  `check_and_record` (dry-run / real)
- `schemas/billing.py` — **new**: `SubscriptionOut`, `ResourceUsageOut`,
  `CheckoutSessionOut`, `PortalSessionOut`
- `routers/billing.py` — **new**: `router` (`/billing/*`), `me_router`
  (`/me/subscription`)
- `routers/ai.py` — modify: `explain` gains `user` dependency
- `routers/exports.py` — modify: `export_study`/`export_study_laudo` gain
  `user` dependency
- `main.py` — modify: register `LimitExceededError` handler, include the two
  new routers
- `config.py` — modify: add `stripe_api_key`, `stripe_webhook_secret`,
  `stripe_price_id_pro`, `billing_trial_days`, `billing_enabled` property
- `pyproject.toml` — modify: add `stripe` to base dependencies
- `.env.example` — modify: document the four new variables
- `tests/conftest.py` — modify: `_create_user` also creates a Pro/active
  `Subscription`, so every existing test keeps running unmetered
- `tests/test_entitlement_service.py` — **new**
- `tests/test_billing_service.py` — **new**
- `tests/test_billing_webhook.py` — **new**
- `tests/test_case_study.py`, other existing tests — verify they still pass
  under the `conftest.py` change (no code change expected, just confirmation)

Frontend (`apps/web/`):
- `lib/types.ts`, `packages/shared-types/index.ts` — add `PlanTier`,
  `SubscriptionStatus`, `UsageResource`, `ResourceUsage`, `SubscriptionOut`
- `lib/api.ts` — modify: `ApiError` gains `resource`; add `getSubscription`,
  `createCheckoutSession`, `createPortalSession`
- `lib/hooks/useSubscription.ts` — **new**
- `lib/i18n.ts` — add `billing` section
- `app/assinatura/page.tsx` — **new**
- `components/layout/AppSidebar.tsx` — modify: usage indicator above the
  user footer
- `components/ExportButtons.tsx` — modify: optional `locked`/`lockedMessage`
  props
- `components/EngineeringReportLink.tsx` — modify: same locked treatment
- `app/selecao/page.tsx` — modify: pass `locked` to `ExportButtons` and
  `EngineeringReportLink`, show "Ver planos" link on a 402 from `save`
- `components/ai/StudyExplanation.tsx` — modify: show "Ver planos" link on a
  402 from `explain`
- `app/importar/page.tsx` — modify: show "Ver planos" link on a 402 from
  `validate`/`commit`
- `lib/hooks/useSubscription.test.ts` — **new**

---

### Task 1: Enums, models, migration

**Files:**
- Modify: `apps/api/app/models/enums.py`
- Create: `apps/api/app/models/billing.py`
- Modify: `apps/api/app/models/__init__.py`
- Create: `apps/api/alembic/versions/<hash>_assinatura_e_limites_de_uso.py`
- Test: `apps/api/app/tests/test_isolation.py` (existing canary — must stay
  green; no new test file for this task, verified by the full suite +
  migration commands in Step 6)

**Interfaces:**
- Produces: `PlanTier.FREE`/`PlanTier.PRO`; `SubscriptionStatus.ACTIVE`/
  `.TRIALING`/`.PAST_DUE`/`.CANCELED`; `UsageResource.IMPORT_ROWS`/
  `.AI_CALLS`/`.STUDIES`/`.REPORT_EXPORTS`; `Subscription(user_id, plan,
  status, stripe_customer_id, stripe_subscription_id, current_period_end,
  trial_reason, trial_ends_at, created_at, updated_at)`; `UsageCounter(id,
  user_id, resource, period_start, count)`.

- [ ] **Step 1: Add the three enums**

Add to `apps/api/app/models/enums.py`, after `ImportStatus`:

```python
class PlanTier(str, enum.Enum):
    """A user's subscription tier. See
    docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md."""

    FREE = "free"
    PRO = "pro"


class SubscriptionStatus(str, enum.Enum):
    """Mirrors Stripe's own subscription status vocabulary on purpose — a
    translation layer would be a mapping table for no benefit. Only ACTIVE
    and TRIALING grant the plan's limits; every other value is treated as
    FREE by EntitlementService."""

    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELED = "canceled"


class UsageResource(str, enum.Enum):
    """The four things a plan can limit. Three different mechanics share this
    one vocabulary — see EntitlementService for which is which."""

    IMPORT_ROWS = "import_rows"
    AI_CALLS = "ai_calls"
    STUDIES = "studies"
    REPORT_EXPORTS = "report_exports"
```

- [ ] **Step 2: Create the models**

Create `apps/api/app/models/billing.py`:

```python
"""Subscription and UsageCounter: per-user plan, and monthly usage toward it.

See docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md for why
the boundary is the individual user (D-42 keeps the catalogue shared; there
is no organization/tenant concept), and why STUDIES/REPORT_EXPORTS have no
row here: a live capacity or a binary gate has nothing to reset monthly, so a
counter for either would just be a number nobody reads before comparing it
to something else anyway (a COUNT(*), or the plan itself).
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PlanTier, SubscriptionStatus, UsageResource


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Subscription(Base):
    """One user's plan and its Stripe linkage."""

    __tablename__ = "subscription"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    plan: Mapped[PlanTier] = mapped_column(
        Enum(PlanTier, native_enum=False, length=10), nullable=False, default=PlanTier.FREE
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, native_enum=False, length=12),
        nullable=False,
        default=SubscriptionStatus.ACTIVE,
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Set only for the migration-time courtesy trial; None for every
    # subscription created after (both free signups and real Stripe trials,
    # if the operator ever configures one on the Stripe side).
    trial_reason: Mapped[str | None] = mapped_column(String(60), nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class UsageCounter(Base):
    """Monthly count of one resource consumed by one user."""

    __tablename__ = "usage_counter"
    __table_args__ = (
        UniqueConstraint("user_id", "resource", "period_start", name="uq_usage_counter_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    resource: Mapped[UsageResource] = mapped_column(
        Enum(UsageResource, native_enum=False, length=20), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

- [ ] **Step 3: Register the models**

In `apps/api/app/models/__init__.py`, add imports and `__all__` entries:

```python
from app.models.billing import Subscription, UsageCounter
```

Add to the `enums` import block: `PlanTier`, `SubscriptionStatus`,
`UsageResource`. Add `"PlanTier"`, `"SubscriptionStatus"`, `"Subscription"`,
`"UsageCounter"`, `"UsageResource"` to `__all__`, keeping the existing
alphabetical ordering.

- [ ] **Step 4: Generate and verify the migration**

Run (from `apps/api/`):

```bash
alembic revision --autogenerate -m "assinatura e limites de uso"
```

Open the generated file under `alembic/versions/`. Confirm the autogenerated
`upgrade()` creates `subscription` and `usage_counter` with the columns from
Step 2 (types/constraints may render slightly differently — normalize to
match this exactly) and that `down_revision` points at the current head
(the migration from M1, `fc5a731dd162`). Replace the file's body with:

```python
"""assinatura e limites de uso

Revision ID: <keep the autogenerated value>
Revises: <keep the autogenerated value>
Create Date: <keep the autogenerated value>
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "<keep the autogenerated value>"
down_revision = "<keep the autogenerated value>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subscription",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_reason", sa.String(length=60), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("stripe_customer_id"),
        sa.UniqueConstraint("stripe_subscription_id"),
    )
    op.create_table(
        "usage_counter",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("resource", sa.String(length=20), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "resource", "period_start", name="uq_usage_counter_period"
        ),
    )

    # Backfill: everyone who already had an account before this migration
    # gets a 90-day Pro courtesy trial (see the spec, §1) — nobody who was
    # already using the tool for free should be blocked by a limit that did
    # not exist yesterday. A user created after this migration never hits
    # this INSERT; AuthService gives them a plain FREE/ACTIVE row at signup.
    connection = op.get_bind()
    now = datetime.now(UTC)
    trial_ends_at = now + timedelta(days=90)
    user_ids = [row[0] for row in connection.execute(sa.text("SELECT id FROM user")).fetchall()]
    subscription_table = sa.table(
        "subscription",
        sa.column("user_id", sa.Integer()),
        sa.column("plan", sa.String()),
        sa.column("status", sa.String()),
        sa.column("trial_reason", sa.String()),
        sa.column("trial_ends_at", sa.DateTime()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    if user_ids:
        connection.execute(
            subscription_table.insert(),
            [
                {
                    "user_id": user_id,
                    "plan": "pro",
                    "status": "trialing",
                    "trial_reason": "cortesia_usuario_existente",
                    "trial_ends_at": trial_ends_at,
                    "created_at": now,
                    "updated_at": now,
                }
                for user_id in user_ids
            ],
        )


def downgrade() -> None:
    op.drop_table("usage_counter")
    op.drop_table("subscription")
```

- [ ] **Step 5: Verify on a clean database**

```bash
rm -f materialselect.db
python -m alembic upgrade head
python -m app.db.seed
```

Expected: both commands exit 0. Inspect the seeded DB (`sqlite3
materialselect.db "select plan, status, trial_reason from subscription;"`) —
expected: one row per seeded user (from `app/db/seed.py`'s
`seed_e2e_session`, if `ENVIRONMENT=development`, or none if the seed
creates no users — confirm either way is consistent, not an error).

- [ ] **Step 6: Run the full backend gate and commit**

```bash
ruff check app && black --check app && pytest
```

Expected: all green (no test yet exercises the new tables directly, but
`test_isolation.py` and every existing test must still pass — the schema
change alone should not break anything).

```bash
git add app/models/enums.py app/models/billing.py app/models/__init__.py \
  alembic/versions/*_assinatura_e_limites_de_uso.py
git commit -m "feat(assinatura): modelo Subscription/UsageCounter e migração"
```

---

### Task 2: `BillingRepository` and `LimitExceededError`

**Files:**
- Create: `apps/api/app/repositories/billing_repository.py`
- Modify: `apps/api/app/domain/errors.py`
- Test: `apps/api/app/tests/test_entitlement_service.py` (created in full in
  Task 3 — this task's repository methods are exercised there, since a
  repository has no useful behavior to test in isolation from the rows it
  reads/writes)

**Interfaces:**
- Consumes: `Subscription`, `UsageCounter` (Task 1).
- Produces: `BillingRepository(db).get_subscription(user_id) -> Subscription
  | None`; `.get_subscription_by_stripe_customer_id(customer_id) ->
  Subscription | None`; `.add_subscription(subscription) -> None`;
  `.get_usage(user_id, resource, period_start) -> int`;
  `.increment_usage(user_id, resource, period_start, amount) -> None`;
  `.flush() -> None`; `.commit() -> None`. `LimitExceededError(message, *,
  resource: str, plan: str, limit: int)` — a `DomainError` subclass with
  `.resource`/`.plan`/`.limit` attributes, mapped to HTTP 402.

- [ ] **Step 1: Add the domain error**

In `apps/api/app/domain/errors.py`, after `ServiceUnavailableError`:

```python
class LimitExceededError(DomainError):
    """The user's plan does not allow one more unit of a resource. -> HTTP 402.

    Carries the fields the frontend needs to render a specific upgrade
    prompt instead of a generic error — see EntitlementService.
    """

    def __init__(self, message: str, *, resource: str, plan: str, limit: int) -> None:
        super().__init__(message)
        self.resource = resource
        self.plan = plan
        self.limit = limit
```

- [ ] **Step 2: Write the repository**

Create `apps/api/app/repositories/billing_repository.py`:

```python
"""Data access for Subscription and UsageCounter rows."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import Subscription, UsageCounter
from app.models.enums import UsageResource


class BillingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_subscription(self, user_id: int) -> Subscription | None:
        stmt = select(Subscription).where(Subscription.user_id == user_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_subscription_by_stripe_customer_id(
        self, stripe_customer_id: str
    ) -> Subscription | None:
        stmt = select(Subscription).where(
            Subscription.stripe_customer_id == stripe_customer_id
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def add_subscription(self, subscription: Subscription) -> None:
        self.db.add(subscription)

    def get_usage(self, user_id: int, resource: UsageResource, period_start: date) -> int:
        stmt = select(UsageCounter.count).where(
            UsageCounter.user_id == user_id,
            UsageCounter.resource == resource,
            UsageCounter.period_start == period_start,
        )
        result = self.db.execute(stmt).scalar_one_or_none()
        return result or 0

    def increment_usage(
        self, user_id: int, resource: UsageResource, period_start: date, amount: int
    ) -> None:
        stmt = select(UsageCounter).where(
            UsageCounter.user_id == user_id,
            UsageCounter.resource == resource,
            UsageCounter.period_start == period_start,
        )
        counter = self.db.execute(stmt).scalar_one_or_none()
        if counter is None:
            counter = UsageCounter(
                user_id=user_id, resource=resource, period_start=period_start, count=0
            )
            self.db.add(counter)
        counter.count += amount

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
```

- [ ] **Step 3: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/domain/errors.py app/repositories/billing_repository.py
git commit -m "feat(assinatura): BillingRepository e LimitExceededError"
```

---

### Task 3: `EntitlementService`

**Files:**
- Create: `apps/api/app/services/entitlement_service.py`
- Test: `apps/api/app/tests/test_entitlement_service.py`

**Interfaces:**
- Consumes: `BillingRepository` (Task 2), `LimitExceededError` (Task 2),
  `User` (existing).
- Produces: `PLAN_LIMITS: dict[PlanTier, dict[UsageResource, int | None]]`;
  `EntitlementService(db, user).plan() -> PlanTier`; `.limit(resource) -> int
  | None`; `.check_and_record(resource, amount=1, *, dry_run=False) ->
  None`; `.check_capacity(resource, current_count) -> None`;
  `.can_export_reports() -> bool`; `.require_export_access() -> None`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/app/tests/test_entitlement_service.py`:

```python
"""Tests for EntitlementService: the three limit mechanics (monthly counter,
live capacity, binary gate) and how plan/status decide which limit applies.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.domain.errors import LimitExceededError
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus, UsageResource
from app.services.entitlement_service import PLAN_LIMITS, EntitlementService


def _give_plan(db_session, user, plan: PlanTier, status: SubscriptionStatus) -> None:
    db_session.add(Subscription(user_id=user.id, plan=plan, status=status))
    db_session.commit()


def test_no_subscription_row_is_treated_as_free(db_session, test_user):
    service = EntitlementService(db_session, test_user)
    assert service.plan() == PlanTier.FREE


def test_free_monthly_counter_blocks_at_limit(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.FREE, SubscriptionStatus.ACTIVE)
    service = EntitlementService(db_session, test_user)
    limit = PLAN_LIMITS[PlanTier.FREE][UsageResource.AI_CALLS]

    for _ in range(limit):
        service.check_and_record(UsageResource.AI_CALLS)

    with pytest.raises(LimitExceededError) as exc_info:
        service.check_and_record(UsageResource.AI_CALLS)
    assert exc_info.value.resource == "ai_calls"
    assert exc_info.value.plan == "free"
    assert exc_info.value.limit == limit


def test_pro_monthly_counter_is_unlimited(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.PRO, SubscriptionStatus.ACTIVE)
    service = EntitlementService(db_session, test_user)
    for _ in range(PLAN_LIMITS[PlanTier.FREE][UsageResource.AI_CALLS] + 5):
        service.check_and_record(UsageResource.AI_CALLS)  # never raises


def test_dry_run_checks_without_recording(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.FREE, SubscriptionStatus.ACTIVE)
    service = EntitlementService(db_session, test_user)
    limit = PLAN_LIMITS[PlanTier.FREE][UsageResource.IMPORT_ROWS]

    service.check_and_record(UsageResource.IMPORT_ROWS, limit, dry_run=True)
    # A second dry run for the same amount must still pass: nothing was
    # recorded by the first one.
    service.check_and_record(UsageResource.IMPORT_ROWS, limit, dry_run=True)
    # A real (non-dry-run) call for the same amount also passes...
    service.check_and_record(UsageResource.IMPORT_ROWS, limit)
    # ...and now it really is at the limit.
    with pytest.raises(LimitExceededError):
        service.check_and_record(UsageResource.IMPORT_ROWS, 1)


def test_monthly_counter_resets_on_a_new_period(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.FREE, SubscriptionStatus.ACTIVE)
    service = EntitlementService(db_session, test_user)
    limit = PLAN_LIMITS[PlanTier.FREE][UsageResource.AI_CALLS]
    for _ in range(limit):
        service.check_and_record(UsageResource.AI_CALLS)

    # Simulate a new month by writing the counter under an earlier
    # period_start directly, then checking against "now" — the row for the
    # current period does not exist yet, so usage reads back as 0.
    from app.repositories.billing_repository import BillingRepository
    from app.models.enums import UsageResource as UR

    repo = BillingRepository(db_session)
    past_period = (datetime.now(UTC) - timedelta(days=32)).date().replace(day=1)
    assert repo.get_usage(test_user.id, UR.AI_CALLS, past_period) == 0
    service.check_and_record(UsageResource.AI_CALLS)  # does not raise


def test_capacity_blocks_at_limit_without_persisting_anything(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.FREE, SubscriptionStatus.ACTIVE)
    service = EntitlementService(db_session, test_user)
    limit = PLAN_LIMITS[PlanTier.FREE][UsageResource.STUDIES]

    service.check_capacity(UsageResource.STUDIES, limit - 1)  # ok, one below
    with pytest.raises(LimitExceededError):
        service.check_capacity(UsageResource.STUDIES, limit)


def test_report_export_binary_gate(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.FREE, SubscriptionStatus.ACTIVE)
    free_service = EntitlementService(db_session, test_user)
    assert free_service.can_export_reports() is False
    with pytest.raises(LimitExceededError):
        free_service.require_export_access()


def test_trialing_status_grants_pro_limits(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.PRO, SubscriptionStatus.TRIALING)
    service = EntitlementService(db_session, test_user)
    assert service.can_export_reports() is True


def test_canceled_status_falls_back_to_free(db_session, test_user):
    _give_plan(db_session, test_user, PlanTier.PRO, SubscriptionStatus.CANCELED)
    service = EntitlementService(db_session, test_user)
    assert service.plan() == PlanTier.FREE
    assert service.can_export_reports() is False
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest app/tests/test_entitlement_service.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.entitlement_service'`.

- [ ] **Step 3: Implement `EntitlementService`**

Create `apps/api/app/services/entitlement_service.py`:

```python
"""Decides whether a user's plan allows one more unit of a resource.

Three different mechanics share one interface, and mixing them up is the
bug to avoid here:
  - IMPORT_ROWS, AI_CALLS: a monthly UsageCounter — check_and_record.
  - STUDIES: a live capacity the caller already counts — check_capacity.
  - REPORT_EXPORTS: a binary gate, no counter at all — can_export_reports /
    require_export_access.

See docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.domain.errors import LimitExceededError
from app.models.enums import PlanTier, SubscriptionStatus, UsageResource
from app.models.user import User
from app.repositories.billing_repository import BillingRepository

PLAN_LIMITS: dict[PlanTier, dict[UsageResource, int | None]] = {
    PlanTier.FREE: {
        UsageResource.IMPORT_ROWS: 500,
        UsageResource.AI_CALLS: 20,
        UsageResource.STUDIES: 3,
        UsageResource.REPORT_EXPORTS: 0,
    },
    PlanTier.PRO: {
        UsageResource.IMPORT_ROWS: None,
        UsageResource.AI_CALLS: None,
        UsageResource.STUDIES: None,
        UsageResource.REPORT_EXPORTS: None,
    },
}

_ACTIVE_STATUSES = {SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING}

_RESOURCE_LABELS: dict[UsageResource, str] = {
    UsageResource.IMPORT_ROWS: "linhas importadas por mês",
    UsageResource.AI_CALLS: "chamadas de IA por mês",
    UsageResource.STUDIES: "estudos salvos",
    UsageResource.REPORT_EXPORTS: "exportações de relatório",
}


def current_period_start() -> date:
    return datetime.now(UTC).date().replace(day=1)


class EntitlementService:
    """Per-user, per-request plan gate. Build a fresh one with the caller's
    own ``User`` — never share an instance across users."""

    def __init__(self, db, user: User) -> None:
        self.db = db
        self.user = user
        self.repo = BillingRepository(db)

    def plan(self) -> PlanTier:
        subscription = self.repo.get_subscription(self.user.id)
        if subscription is None or subscription.status not in _ACTIVE_STATUSES:
            return PlanTier.FREE
        return subscription.plan

    def limit(self, resource: UsageResource) -> int | None:
        return PLAN_LIMITS[self.plan()][resource]

    def _limit_error(self, resource: UsageResource, limit: int) -> LimitExceededError:
        plan = self.plan()
        return LimitExceededError(
            f"Limite do plano {plan.value} atingido: {limit} {_RESOURCE_LABELS[resource]}.",
            resource=resource.value,
            plan=plan.value,
            limit=limit,
        )

    def check_and_record(
        self, resource: UsageResource, amount: int = 1, *, dry_run: bool = False
    ) -> None:
        """IMPORT_ROWS / AI_CALLS. Raises before recording anything if
        ``amount`` more would exceed this month's limit. ``dry_run=True``
        only checks — ImportService.validate() previews a count that must
        not count toward the real total until commit()."""
        limit = self.limit(resource)
        period_start = current_period_start()
        current = self.repo.get_usage(self.user.id, resource, period_start)
        if limit is not None and current + amount > limit:
            raise self._limit_error(resource, limit)
        if not dry_run:
            self.repo.increment_usage(self.user.id, resource, period_start, amount)

    def check_capacity(self, resource: UsageResource, current_count: int) -> None:
        """STUDIES. Nothing is persisted here — the caller's own table
        (SelectionStudy) is already the count."""
        limit = self.limit(resource)
        if limit is not None and current_count >= limit:
            raise self._limit_error(resource, limit)

    def can_export_reports(self) -> bool:
        """REPORT_EXPORTS."""
        return self.limit(UsageResource.REPORT_EXPORTS) is None

    def require_export_access(self) -> None:
        if not self.can_export_reports():
            raise self._limit_error(UsageResource.REPORT_EXPORTS, 0)
```

- [ ] **Step 4: Run to verify it passes**

```bash
pytest app/tests/test_entitlement_service.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/services/entitlement_service.py app/tests/test_entitlement_service.py
git commit -m "feat(assinatura): EntitlementService com os três mecanismos de limite"
```

---

### Task 4: Give every user a `Subscription` (signup + tests)

**Files:**
- Modify: `apps/api/app/services/auth_service.py`
- Modify: `apps/api/app/tests/conftest.py`
- Test: existing suite (this task's correctness is that nothing regresses —
  see Step 3)

**Interfaces:**
- Consumes: `Subscription`, `PlanTier`, `SubscriptionStatus` (Task 1).
- Produces: every `User` created through `AuthService` or through the
  `conftest.py` test fixtures now has exactly one `Subscription` row.

- [ ] **Step 1: Give new signups a Subscription**

In `apps/api/app/services/auth_service.py`, add to the imports:

```python
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus
```

Modify `_upsert_user` and add a new method, right after `_create_default_project`:

```python
    def _upsert_user(self, claims: dict[str, Any]) -> User:
        google_sub = str(claims["sub"])
        user = self.users.get_by_google_sub(google_sub)
        if user is not None:
            return user
        user = self.users.create(
            google_sub=google_sub,
            email=str(claims.get("email", "")),
            name=str(claims.get("name") or claims.get("email", "")),
            avatar_url=claims.get("picture"),
        )
        # Flush (not commit) to assign user.id before the default Project can
        # reference it as owner_id — the caller commits both atomically.
        self.db.flush()
        self._create_default_project(user)
        self._create_default_subscription(user)
        return user

    def _create_default_project(self, user: User) -> Project:
        return self.projects.create(name="Meu projeto", owner_id=user.id)

    def _create_default_subscription(self, user: User) -> Subscription:
        subscription = Subscription(
            user_id=user.id, plan=PlanTier.FREE, status=SubscriptionStatus.ACTIVE
        )
        self.db.add(subscription)
        return subscription
```

- [ ] **Step 2: Give every test user a Pro Subscription**

In `apps/api/app/tests/conftest.py`, add to the imports:

```python
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus
```

Modify `_create_user`:

```python
def _create_user(connection: Connection, *, google_sub: str, email: str, name: str) -> User:
    """Write a User + its default Project + an active Pro Subscription
    directly, bypassing AuthService/Google and the billing courtesy trial.

    Pro, not Free: hundreds of existing tests create studies, run imports and
    call the AI layer far past the free plan's limits, and none of them are
    testing billing — they would all start failing at the exact free/pro
    boundary for reasons unrelated to what they assert. Tests of the limits
    themselves (test_entitlement_service.py) attach their own Subscription
    row to override this default.
    """
    session = _session_for(connection)
    try:
        user = User(google_sub=google_sub, email=email, name=name, avatar_url=None)
        session.add(user)
        session.flush()
        session.add(Project(name="Meu projeto", owner_id=user.id))
        session.add(
            Subscription(user_id=user.id, plan=PlanTier.PRO, status=SubscriptionStatus.ACTIVE)
        )
        session.commit()
    finally:
        session.close()
    return user
```

- [ ] **Step 3: Run the full backend suite**

```bash
ruff check app && black --check app && pytest
```

Expected: all green — this confirms every existing test's `test_user`/
`other_user` now carries a Pro subscription and none of them regress. If any
test fails here, it means that test creates its own `User` row directly
(bypassing `_create_user`) — find it (`grep -rn "User(" app/tests/`) and give
it the same `Subscription(plan=PlanTier.PRO, status=SubscriptionStatus.ACTIVE)`
treatment before moving on.

- [ ] **Step 4: Commit**

```bash
git add app/services/auth_service.py app/tests/conftest.py
git commit -m "feat(assinatura): toda conta ganha uma Subscription (signup real e testes)"
```

---

### Task 5: `BillingService` (Stripe SDK isolated here)

**Files:**
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/.env.example`
- Create: `apps/api/app/schemas/billing.py`
- Create: `apps/api/app/services/billing_service.py`
- Test: `apps/api/app/tests/test_billing_service.py`,
  `apps/api/app/tests/test_billing_webhook.py`

**Interfaces:**
- Consumes: `BillingRepository`, `PLAN_LIMITS` (Tasks 2–3),
  `ProjectRepository.get_default_for_user` (existing),
  `SelectionRepository.list_studies` (existing).
- Produces: `BillingService(db, user=None, settings=default_settings,
  client=None)`; `.create_checkout_session() -> str`;
  `.create_portal_session() -> str`; `.handle_webhook(payload: bytes,
  signature: str) -> None`; `.describe() -> SubscriptionOut`. Schemas:
  `ResourceUsageOut(resource, used, limit)`; `SubscriptionOut(plan, status,
  current_period_end, trial_ends_at, can_export_reports, usage)`;
  `CheckoutSessionOut(url)`; `PortalSessionOut(url)`.

- [ ] **Step 1: Add the dependency and settings**

In `apps/api/pyproject.toml`, add to the base `dependencies` list, after
`"google-auth>=2.29",`:

```toml
    # Billing (assinatura): unlike the AI layer, this is not optional — the
    # checkout/portal endpoints need the SDK even to answer 503 when
    # STRIPE_API_KEY is unset, so it lives in the base dependencies rather
    # than behind an extra.
    "stripe>=10",
```

In `apps/api/app/config.py`, add to `Settings`, after the auth block:

```python
    # --- Billing (Stripe) ---------------------------------------------------
    # Empty means billing is off: /api/billing/* and /api/me/subscription's
    # checkout/portal actions answer 503, same convention as
    # google_client_id being empty. No default for any of the three, same
    # reasoning as ai_base_url having none (D-36) — a default would pick an
    # account on the operator's behalf.
    stripe_api_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_pro: str = ""
    # Length of the migration-time courtesy trial for users who already had
    # an account before billing existed. Not read at request time — only by
    # the migration itself.
    billing_trial_days: int = 90

    @property
    def billing_enabled(self) -> bool:
        """True when Stripe is configured for checkout/portal."""
        return bool(self.stripe_api_key.strip())
```

In `apps/api/.env.example`, append a new section at the end:

```
# --- Billing (Stripe) -------------------------------------------------------
# Empty means billing is off: checkout/portal answer 503 with a clear reason,
# same convention as GOOGLE_CLIENT_ID being empty. No default for any of
# these, same reasoning as AI_BASE_URL having none: a default would pick an
# account on your behalf.
#
# Secret key from https://dashboard.stripe.com/apikeys (use a test key while
# developing).
# STRIPE_API_KEY=

# Signing secret for the webhook endpoint. In test mode, run
# `stripe listen --forward-to localhost:8000/api/billing/webhook` and use the
# secret it prints.
# STRIPE_WEBHOOK_SECRET=

# The recurring Price id for the Pro plan, from the Stripe dashboard's
# Products page.
# STRIPE_PRICE_ID_PRO=

# How long an account that existed before billing was turned on keeps its
# free Pro courtesy trial, in days. Read only by the migration that created
# it, not at request time.
# BILLING_TRIAL_DAYS=90
```

- [ ] **Step 2: Write the schemas**

Create `apps/api/app/schemas/billing.py`:

```python
"""Schemas for the subscription/billing endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.enums import PlanTier, SubscriptionStatus, UsageResource


class ResourceUsageOut(BaseModel):
    """One resource's usage this period against the user's plan limit.
    ``limit=None`` means unlimited (the Pro plan, for every resource)."""

    resource: UsageResource
    used: int
    limit: int | None


class SubscriptionOut(BaseModel):
    """``GET /api/me/subscription`` — plan, status and usage for the
    dashboards this powers (the /assinatura page and the sidebar
    indicator). ``report_exports`` is not in ``usage``: it is a binary gate,
    not a used/limit ratio — see ``can_export_reports``."""

    plan: PlanTier
    status: SubscriptionStatus
    current_period_end: datetime | None
    trial_ends_at: datetime | None
    can_export_reports: bool
    usage: list[ResourceUsageOut]


class CheckoutSessionOut(BaseModel):
    url: str


class PortalSessionOut(BaseModel):
    url: str
```

- [ ] **Step 3: Write the failing tests**

Create `apps/api/app/tests/test_billing_service.py`:

```python
"""BillingService tests. A fake Stripe client stands in for the SDK — see
`_FakeStripe` — so nothing here reaches the network, mirroring how the AI
layer's `mock` provider keeps the AI tests deterministic and offline.
"""

from __future__ import annotations

import pytest

from app.domain.errors import NotFoundError, ServiceUnavailableError, ValidationError
from app.config import Settings
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus
from app.services.billing_service import BillingService


class _FakeSession(dict):
    pass


class _FakeCustomer:
    def create(self, **kwargs):
        return {"id": "cus_fake123"}


class _FakeCheckoutSession:
    def create(self, **kwargs):
        assert kwargs["mode"] == "subscription"
        return _FakeSession(id="cs_fake", url="https://checkout.stripe.com/fake")


class _FakeCheckout:
    def __init__(self):
        self.Session = _FakeCheckoutSession()


class _FakePortalSession:
    def create(self, **kwargs):
        return _FakeSession(id="bps_fake", url="https://billing.stripe.com/fake")


class _FakeBillingPortal:
    def __init__(self):
        self.Session = _FakePortalSession()


class _FakeStripe:
    def __init__(self):
        self.Customer = _FakeCustomer()
        self.checkout = _FakeCheckout()
        self.billing_portal = _FakeBillingPortal()


def _settings(**overrides) -> Settings:
    base = {
        "stripe_api_key": "sk_test_fake",
        "stripe_webhook_secret": "whsec_fake",
        "stripe_price_id_pro": "price_fake",
        "frontend_url": "http://localhost:3000",
    }
    base.update(overrides)
    return Settings(**base)


def test_create_checkout_session_creates_customer_and_returns_url(db_session, test_user):
    service = BillingService(db_session, test_user, settings=_settings(), client=_FakeStripe())
    url = service.create_checkout_session()
    assert url == "https://checkout.stripe.com/fake"


def test_create_checkout_session_reuses_existing_customer(db_session, test_user):
    db_session.add(
        Subscription(
            user_id=test_user.id,
            plan=PlanTier.FREE,
            status=SubscriptionStatus.ACTIVE,
            stripe_customer_id="cus_existing",
        )
    )
    db_session.commit()
    client = _FakeStripe()
    calls = []
    client.Customer.create = lambda **kw: calls.append(kw) or {"id": "cus_should_not_be_used"}
    service = BillingService(db_session, test_user, settings=_settings(), client=client)
    service.create_checkout_session()
    assert calls == []  # Customer.create was never called


def test_checkout_without_stripe_api_key_is_503(db_session, test_user):
    service = BillingService(
        db_session, test_user, settings=_settings(stripe_api_key=""), client=_FakeStripe()
    )
    with pytest.raises(ServiceUnavailableError):
        service.create_checkout_session()


def test_portal_session_requires_existing_customer(db_session, test_user):
    service = BillingService(db_session, test_user, settings=_settings(), client=_FakeStripe())
    with pytest.raises(ValidationError):
        service.create_portal_session()


def test_portal_session_returns_url_for_existing_customer(db_session, test_user):
    db_session.add(
        Subscription(
            user_id=test_user.id,
            plan=PlanTier.PRO,
            status=SubscriptionStatus.ACTIVE,
            stripe_customer_id="cus_existing",
        )
    )
    db_session.commit()
    service = BillingService(db_session, test_user, settings=_settings(), client=_FakeStripe())
    url = service.create_portal_session()
    assert url == "https://billing.stripe.com/fake"


def test_describe_with_no_subscription_row_reports_free(db_session, test_user):
    service = BillingService(db_session, test_user, settings=_settings(), client=_FakeStripe())
    out = service.describe()
    assert out.plan == PlanTier.FREE
    assert out.can_export_reports is False
    resources = {u.resource.value: u for u in out.usage}
    assert set(resources) == {"import_rows", "ai_calls", "studies"}
    assert resources["import_rows"].limit == 500


def test_describe_with_active_pro_reports_unlimited(db_session, test_user):
    db_session.add(
        Subscription(user_id=test_user.id, plan=PlanTier.PRO, status=SubscriptionStatus.ACTIVE)
    )
    db_session.commit()
    service = BillingService(db_session, test_user, settings=_settings(), client=_FakeStripe())
    out = service.describe()
    assert out.can_export_reports is True
    assert all(u.limit is None for u in out.usage)


def test_not_found_error_raised_for_unknown_customer(db_session, test_user):
    service = BillingService(db_session, test_user, settings=_settings(), client=_FakeStripe())
    with pytest.raises(NotFoundError):
        service._subscription_for_customer("cus_unknown")
```

Create `apps/api/app/tests/test_billing_webhook.py`:

```python
"""BillingService.handle_webhook: how each Stripe event type maps onto
Subscription. `_FakeStripe.Webhook.construct_event` stands in for real
signature verification — see test_billing_service.py's fake client for why.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.domain.errors import ValidationError
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus
from app.repositories.billing_repository import BillingRepository
from app.services.billing_service import BillingService


class _FakeWebhookError(Exception):
    pass


class _FakeWebhook:
    def __init__(self, event: dict | None, raises: bool = False):
        self._event = event
        self._raises = raises

    def construct_event(self, payload, signature, secret):
        if self._raises:
            raise ValueError("assinatura inválida")
        return self._event


class _FakeStripeForWebhook:
    def __init__(self, event: dict | None, raises: bool = False):
        self.Webhook = _FakeWebhook(event, raises)


def _settings() -> Settings:
    return Settings(
        stripe_api_key="sk_test_fake",
        stripe_webhook_secret="whsec_fake",
        stripe_price_id_pro="price_fake",
    )


def _existing_subscription(db_session, user, **overrides) -> Subscription:
    defaults = dict(
        user_id=user.id,
        plan=PlanTier.FREE,
        status=SubscriptionStatus.ACTIVE,
        stripe_customer_id="cus_webhook",
    )
    defaults.update(overrides)
    sub = Subscription(**defaults)
    db_session.add(sub)
    db_session.commit()
    return sub


def test_invalid_signature_raises_without_touching_the_database(db_session, test_user):
    _existing_subscription(db_session, test_user)
    client = _FakeStripeForWebhook(event=None, raises=True)
    service = BillingService(db_session, settings=_settings(), client=client)
    with pytest.raises(ValidationError):
        service.handle_webhook(b"{}", "bad-signature")
    assert BillingRepository(db_session).get_subscription(test_user.id).status == (
        SubscriptionStatus.ACTIVE
    )


def test_checkout_completed_activates_pro(db_session, test_user):
    _existing_subscription(db_session, test_user)
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"customer": "cus_webhook", "subscription": "sub_123"}},
    }
    service = BillingService(db_session, settings=_settings(), client=_FakeStripeForWebhook(event))
    service.handle_webhook(b"{}", "sig")
    sub = BillingRepository(db_session).get_subscription(test_user.id)
    assert sub.plan == PlanTier.PRO
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.stripe_subscription_id == "sub_123"


def test_subscription_deleted_falls_back_to_free(db_session, test_user):
    _existing_subscription(db_session, test_user, plan=PlanTier.PRO)
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_webhook"}},
    }
    service = BillingService(db_session, settings=_settings(), client=_FakeStripeForWebhook(event))
    service.handle_webhook(b"{}", "sig")
    sub = BillingRepository(db_session).get_subscription(test_user.id)
    assert sub.plan == PlanTier.FREE
    assert sub.status == SubscriptionStatus.CANCELED


def test_payment_failed_marks_past_due_without_downgrading_plan(db_session, test_user):
    _existing_subscription(db_session, test_user, plan=PlanTier.PRO)
    event = {
        "type": "invoice.payment_failed",
        "data": {"object": {"customer": "cus_webhook"}},
    }
    service = BillingService(db_session, settings=_settings(), client=_FakeStripeForWebhook(event))
    service.handle_webhook(b"{}", "sig")
    sub = BillingRepository(db_session).get_subscription(test_user.id)
    assert sub.plan == PlanTier.PRO  # not downgraded on a single failure
    assert sub.status == SubscriptionStatus.PAST_DUE


def test_unhandled_event_type_is_a_no_op(db_session, test_user):
    _existing_subscription(db_session, test_user)
    event = {"type": "customer.updated", "data": {"object": {"customer": "cus_webhook"}}}
    service = BillingService(db_session, settings=_settings(), client=_FakeStripeForWebhook(event))
    service.handle_webhook(b"{}", "sig")  # does not raise
    sub = BillingRepository(db_session).get_subscription(test_user.id)
    assert sub.status == SubscriptionStatus.ACTIVE  # unchanged
```

- [ ] **Step 4: Run to verify both files fail**

```bash
pytest app/tests/test_billing_service.py app/tests/test_billing_webhook.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.billing_service'`.

- [ ] **Step 5: Implement `BillingService`**

Create `apps/api/app/services/billing_service.py`:

```python
"""Stripe orchestration: checkout, billing portal, webhook sync, and the
plan/usage summary for GET /api/me/subscription.

The Stripe SDK is imported only here — no router or other service touches
it, mirroring how app/calculations/units.py is the only importer of Pint.
Tests inject a fake client (see test_billing_service.py,
test_billing_webhook.py) so nothing here ever reaches the network in CI.
"""

from __future__ import annotations

from datetime import UTC, datetime

import stripe

from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import NotFoundError, ServiceUnavailableError, ValidationError
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus, UsageResource
from app.models.user import User
from app.repositories.billing_repository import BillingRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.billing import ResourceUsageOut, SubscriptionOut
from app.services.entitlement_service import PLAN_LIMITS, current_period_start

_STATUS_MAP: dict[str, SubscriptionStatus] = {
    "active": SubscriptionStatus.ACTIVE,
    "trialing": SubscriptionStatus.TRIALING,
    "past_due": SubscriptionStatus.PAST_DUE,
    "canceled": SubscriptionStatus.CANCELED,
    "unpaid": SubscriptionStatus.PAST_DUE,
    "incomplete": SubscriptionStatus.PAST_DUE,
    "incomplete_expired": SubscriptionStatus.CANCELED,
}


class BillingService:
    def __init__(
        self,
        db,
        user: User | None = None,
        settings: Settings = default_settings,
        client=None,
    ) -> None:
        self.db = db
        self.user = user
        self.settings = settings
        self.repo = BillingRepository(db)
        self._client = client or stripe

    def _require_configured(self) -> None:
        if not self.settings.stripe_api_key.strip():
            raise ServiceUnavailableError(
                "Cobrança não está configurada neste servidor (STRIPE_API_KEY ausente)."
            )

    # --- checkout / portal --------------------------------------------------

    def _get_or_create_customer_id(self) -> str:
        assert self.user is not None
        subscription = self.repo.get_subscription(self.user.id)
        if subscription is not None and subscription.stripe_customer_id:
            return subscription.stripe_customer_id
        customer = self._client.Customer.create(
            api_key=self.settings.stripe_api_key, email=self.user.email
        )
        if subscription is None:
            subscription = Subscription(
                user_id=self.user.id,
                plan=PlanTier.FREE,
                status=SubscriptionStatus.ACTIVE,
                stripe_customer_id=customer["id"],
            )
            self.repo.add_subscription(subscription)
        else:
            subscription.stripe_customer_id = customer["id"]
        self.repo.flush()
        return customer["id"]

    def create_checkout_session(self) -> str:
        self._require_configured()
        if not self.settings.stripe_price_id_pro.strip():
            raise ServiceUnavailableError(
                "Cobrança não está configurada neste servidor (STRIPE_PRICE_ID_PRO ausente)."
            )
        customer_id = self._get_or_create_customer_id()
        session = self._client.checkout.Session.create(
            api_key=self.settings.stripe_api_key,
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": self.settings.stripe_price_id_pro, "quantity": 1}],
            success_url=f"{self.settings.frontend_url}/assinatura?checkout=sucesso",
            cancel_url=f"{self.settings.frontend_url}/assinatura?checkout=cancelado",
        )
        self.repo.commit()
        return session["url"]

    def create_portal_session(self) -> str:
        self._require_configured()
        assert self.user is not None
        subscription = self.repo.get_subscription(self.user.id)
        if subscription is None or not subscription.stripe_customer_id:
            raise ValidationError("Nenhuma assinatura encontrada para gerenciar.")
        session = self._client.billing_portal.Session.create(
            api_key=self.settings.stripe_api_key,
            customer=subscription.stripe_customer_id,
            return_url=f"{self.settings.frontend_url}/assinatura",
        )
        return session["url"]

    # --- webhook -------------------------------------------------------------

    def handle_webhook(self, payload: bytes, signature: str) -> None:
        self._require_configured()
        if not self.settings.stripe_webhook_secret.strip():
            raise ServiceUnavailableError(
                "Webhook não está configurado neste servidor (STRIPE_WEBHOOK_SECRET ausente)."
            )
        try:
            event = self._client.Webhook.construct_event(
                payload, signature, self.settings.stripe_webhook_secret
            )
        except Exception as exc:  # SDK-specific errors + our fakes' ValueError
            raise ValidationError("Assinatura de webhook inválida.") from exc

        event_type = event["type"]
        data = event["data"]["object"]

        if event_type == "checkout.session.completed":
            self._on_checkout_completed(data)
        elif event_type == "customer.subscription.updated":
            self._on_subscription_updated(data)
        elif event_type == "customer.subscription.deleted":
            self._on_subscription_deleted(data)
        elif event_type == "invoice.payment_failed":
            self._on_payment_failed(data)
        # Unhandled types: 200 without action — Stripe's own guidance, see
        # the spec §6.
        self.repo.commit()

    def _subscription_for_customer(self, customer_id: str) -> Subscription:
        subscription = self.repo.get_subscription_by_stripe_customer_id(customer_id)
        if subscription is None:
            raise NotFoundError(f"Nenhuma assinatura para o cliente Stripe {customer_id}.")
        return subscription

    def _on_checkout_completed(self, data: dict) -> None:
        subscription = self._subscription_for_customer(data["customer"])
        subscription.plan = PlanTier.PRO
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.stripe_subscription_id = data.get("subscription")
        subscription.trial_reason = None
        subscription.trial_ends_at = None

    def _on_subscription_updated(self, data: dict) -> None:
        subscription = self._subscription_for_customer(data["customer"])
        subscription.status = _STATUS_MAP.get(data["status"], SubscriptionStatus.PAST_DUE)
        period_end = data.get("current_period_end")
        if period_end is not None:
            subscription.current_period_end = datetime.fromtimestamp(period_end, tz=UTC)

    def _on_subscription_deleted(self, data: dict) -> None:
        subscription = self._subscription_for_customer(data["customer"])
        subscription.plan = PlanTier.FREE
        subscription.status = SubscriptionStatus.CANCELED

    def _on_payment_failed(self, data: dict) -> None:
        subscription = self._subscription_for_customer(data["customer"])
        subscription.status = SubscriptionStatus.PAST_DUE

    # --- summary ---------------------------------------------------------

    def describe(self) -> SubscriptionOut:
        assert self.user is not None
        subscription = self.repo.get_subscription(self.user.id)
        plan = subscription.plan if subscription else PlanTier.FREE
        status = subscription.status if subscription else SubscriptionStatus.ACTIVE
        active = status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING)
        effective_plan = plan if active else PlanTier.FREE

        period_start = current_period_start()
        usage = [
            ResourceUsageOut(
                resource=resource,
                used=self.repo.get_usage(self.user.id, resource, period_start),
                limit=PLAN_LIMITS[effective_plan][resource],
            )
            for resource in (UsageResource.IMPORT_ROWS, UsageResource.AI_CALLS)
        ]
        project = ProjectRepository(self.db).get_default_for_user(self.user.id)
        study_count = (
            len(SelectionRepository(self.db).list_studies(project.id)) if project else 0
        )
        usage.append(
            ResourceUsageOut(
                resource=UsageResource.STUDIES,
                used=study_count,
                limit=PLAN_LIMITS[effective_plan][UsageResource.STUDIES],
            )
        )
        return SubscriptionOut(
            plan=plan,
            status=status,
            current_period_end=subscription.current_period_end if subscription else None,
            trial_ends_at=subscription.trial_ends_at if subscription else None,
            can_export_reports=(effective_plan == PlanTier.PRO),
            usage=usage,
        )
```

- [ ] **Step 6: Run to verify both files pass**

```bash
pytest app/tests/test_billing_service.py app/tests/test_billing_webhook.py -v
```

Expected: all PASS.

- [ ] **Step 7: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add pyproject.toml app/config.py .env.example app/schemas/billing.py \
  app/services/billing_service.py app/tests/test_billing_service.py \
  app/tests/test_billing_webhook.py
git commit -m "feat(assinatura): BillingService (checkout, portal, webhook, describe)"
```

---

### Task 6: Billing router + `main.py` wiring

**Files:**
- Create: `apps/api/app/routers/billing.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/app/tests/test_billing_api.py`

**Interfaces:**
- Consumes: `BillingService` (Task 5), `get_current_user`,
  `get_db` (existing).
- Produces: `POST /api/billing/checkout-session`, `POST
  /api/billing/portal-session`, `POST /api/billing/webhook`, `GET
  /api/me/subscription`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/app/tests/test_billing_api.py`:

```python
"""HTTP-level tests for the billing endpoints. Stripe itself is never
called: STRIPE_API_KEY is unset in the test settings (see conftest's
`client` fixture, which does not set it), so every real-Stripe call answers
503 before touching the SDK — this file only proves the routes exist, are
wired to the right service methods, and enforce auth and the 402 mapping.
"""

from __future__ import annotations


def test_checkout_session_requires_login(anon_client):
    res = anon_client.post("/api/billing/checkout-session")
    assert res.status_code == 401


def test_checkout_session_without_stripe_configured_is_503(client):
    res = client.post("/api/billing/checkout-session")
    assert res.status_code == 503


def test_portal_session_requires_login(anon_client):
    res = anon_client.post("/api/billing/portal-session")
    assert res.status_code == 401


def test_get_my_subscription_requires_login(anon_client):
    res = anon_client.get("/api/me/subscription")
    assert res.status_code == 401


def test_get_my_subscription_reports_free_by_default(client):
    res = client.get("/api/me/subscription")
    assert res.status_code == 200
    body = res.json()
    assert body["plan"] in ("free", "pro")  # test_user is Pro per conftest
    assert "usage" in body
    assert "can_export_reports" in body


def test_webhook_without_signature_header_is_400_or_503(client):
    res = client.post("/api/billing/webhook", content=b"{}")
    assert res.status_code in (400, 503)  # 503 if STRIPE_WEBHOOK_SECRET unset
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest app/tests/test_billing_api.py -v
```

Expected: 404s (no `/api/billing/*` or `/api/me/subscription` route exists
yet).

- [ ] **Step 3: Write the router**

Create `apps/api/app/routers/billing.py`:

```python
"""Billing endpoints (Stripe): checkout, portal, webhook, and the
plan/usage status GET /api/me/subscription reads.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.billing import CheckoutSessionOut, PortalSessionOut, SubscriptionOut
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])
me_router = APIRouter(prefix="/me", tags=["billing"])


@router.post("/checkout-session", response_model=CheckoutSessionOut)
def create_checkout_session(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CheckoutSessionOut:
    return CheckoutSessionOut(url=BillingService(db, user).create_checkout_session())


@router.post("/portal-session", response_model=PortalSessionOut)
def create_portal_session(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PortalSessionOut:
    return PortalSessionOut(url=BillingService(db, user).create_portal_session())


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str = Header(default=""),
) -> dict[str, bool]:
    # No get_current_user: Stripe calls this anonymously. The
    # Stripe-Signature header, verified inside BillingService, is the only
    # authentication this endpoint has or needs.
    payload = await request.body()
    BillingService(db).handle_webhook(payload, stripe_signature)
    return {"received": True}


@me_router.get("/subscription", response_model=SubscriptionOut)
def get_my_subscription(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SubscriptionOut:
    return BillingService(db, user).describe()
```

- [ ] **Step 4: Wire it into `main.py`**

In `apps/api/app/main.py`, add `billing` to the `app.routers` import
(alphabetically, after `auth`):

```python
from app.routers import (
    ai,
    audit,
    auth,
    billing,
    charts,
    classes,
    dashboard,
    exports,
    health,
    imports,
    materials,
    properties,
    selection,
    sources,
)
```

Add `LimitExceededError` to the `app.domain.errors` import (alphabetically):

```python
from app.domain.errors import (
    AuthenticationError,
    ConflictError,
    LimitExceededError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
)
```

Add a new exception handler, after `_handle_service_unavailable`:

```python
@app.exception_handler(LimitExceededError)
async def _handle_limit_exceeded(_: Request, exc: LimitExceededError) -> JSONResponse:
    return JSONResponse(
        status_code=402,
        content={
            "detail": str(exc),
            "resource": exc.resource,
            "plan": exc.plan,
            "limit": exc.limit,
        },
    )
```

Add both routers to the `include_router` block, after `sources.router`:

```python
app.include_router(billing.router, prefix="/api")
app.include_router(billing.me_router, prefix="/api")
```

- [ ] **Step 5: Run to verify it passes**

```bash
pytest app/tests/test_billing_api.py -v
```

Expected: all PASS.

- [ ] **Step 6: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/routers/billing.py app/main.py app/tests/test_billing_api.py
git commit -m "feat(assinatura): rotas de billing e GET /api/me/subscription"
```

---

### Task 7: Wire the gate into imports (`import_rows`)

**Files:**
- Modify: `apps/api/app/importers/service.py`
- Test: `apps/api/app/tests/test_imports_api.py` (add cases; file already
  exists per M1)

**Interfaces:**
- Consumes: `EntitlementService`, `UsageResource` (Task 3).
- Produces: `ImportService.validate()` raises `LimitExceededError` (402) via
  a dry-run check before writing the job's `VALIDADO` status;
  `ImportService.commit()` raises the same error (re-checked, since the
  catalogue and the user's usage may have changed since validate) and, if it
  does not raise, records the real usage in the same transaction as the
  import.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/app/tests/test_imports_api.py` (append at the end of the
file — reuses the file's existing upload/validate/commit helper pattern; if
the file defines a helper like `_upload_and_map(client, csv_bytes,
mapping)`, use it here too instead of duplicating the multipart POST):

```python
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus


def _downgrade_to_free(db_session, test_user) -> None:
    """Overrides the Pro subscription conftest.py gives every test user, so
    this file's own tests of the free limit are not shadowed by it."""
    sub = (
        db_session.query(Subscription).filter(Subscription.user_id == test_user.id).one()
    )
    sub.plan = PlanTier.FREE
    sub.status = SubscriptionStatus.ACTIVE
    db_session.commit()


def test_validate_rejects_import_over_the_free_row_limit(client, db_session, test_user):
    _downgrade_to_free(db_session, test_user)
    csv_bytes = (
        b"nome,classe,densidade_kg_m3\n"
        + b"\n".join(f"Material {i},Metais,{7000 + i}".encode() for i in range(501))
    )
    upload = client.post(
        "/api/imports/upload", files={"file": ("materiais.csv", csv_bytes, "text/csv")}
    )
    assert upload.status_code == 200
    job_id = upload.json()["job_id"]
    mapping = {
        "name_column": "nome",
        "class_column": "classe",
        "columns": [
            {"column": "densidade_kg_m3", "property_slug": "densidade", "unit": "kg/m^3"}
        ],
        "source_label": "Teste de limite",
        "source_license_label": "Dado de teste — sem restrição",
    }
    res = client.post(f"/api/imports/{job_id}/validate", json={"mapping": mapping})
    assert res.status_code == 402
    body = res.json()
    assert body["resource"] == "import_rows"
    assert body["plan"] == "free"
```

Adjust the payload shape (`mapping` field names, the `densidade` property
slug/unit) to match whatever `test_imports_api.py`'s existing tests already
use in this file — copy the exact mapping dict from an existing passing test
in that file rather than guessing the schema, since `ImportMapping`'s field
names must match `apps/api/app/schemas/imports.py` exactly.

- [ ] **Step 2: Run to verify it fails**

```bash
pytest app/tests/test_imports_api.py -k over_the_free_row_limit -v
```

Expected: FAILS with 200 (or whatever the endpoint currently returns), not
402 — the gate does not exist yet.

- [ ] **Step 3: Implement the gate**

In `apps/api/app/importers/service.py`, add to the imports:

```python
from app.models.enums import DataQuality, ImportStatus, UsageResource
from app.services.entitlement_service import EntitlementService
```

(`UsageResource` joins the existing `DataQuality, ImportStatus` import line.)

Modify `__init__`:

```python
    def __init__(self, db: Session, user: User | None = None) -> None:
        self.db = db
        self.user = user
        self.repo = ImportRepository(db)
        self.materials = MaterialRepository(db)
        self.material_service = MaterialService(db)
        self.entitlements = EntitlementService(db, user) if user else None
```

Modify `validate()` — insert the check right after `rows, counts =
self._validate_rows(mapping, table)`:

```python
        rows, counts = self._validate_rows(mapping, table)
        if self.entitlements is not None:
            self.entitlements.check_and_record(
                UsageResource.IMPORT_ROWS, counts["ok"], dry_run=True
            )

        job.mapping = mapping.model_dump()
```

Modify `commit()` — insert the check right after `rows, counts =
self._validate_rows(mapping, table)`:

```python
        rows, counts = self._validate_rows(mapping, table)
        if self.entitlements is not None:
            self.entitlements.check_and_record(UsageResource.IMPORT_ROWS, counts["ok"])

        imported = 0
```

- [ ] **Step 4: Run to verify it passes**

```bash
pytest app/tests/test_imports_api.py -v
```

Expected: all PASS, including the new test and every pre-existing one in
the file (M1's licensing-gate tests included).

- [ ] **Step 5: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/importers/service.py app/tests/test_imports_api.py
git commit -m "feat(assinatura): limite de linhas importadas por mês"
```

---

### Task 8: Wire the gate into the AI layer (`ai_calls`)

**Files:**
- Modify: `apps/api/app/services/ai_service.py`
- Modify: `apps/api/app/routers/ai.py`
- Test: `apps/api/app/tests/test_ai.py` or `test_ai_api.py` (add cases —
  find the existing AI test file with `grep -rl "AIService\|/api/ai" app/tests/`
  and append there, following its existing fixture/mocking pattern for the
  `mock` provider rather than introducing a new one)

**Interfaces:**
- Consumes: `EntitlementService`, `UsageResource` (Task 3).
- Produces: `AIService.__init__(db, settings=default_settings, user=None)`;
  `interpret()`/`explain()` raise `LimitExceededError` (402) and, when they
  do not, commit the recorded usage themselves (this service had no writes
  before this task — see Step 3).

- [ ] **Step 1: Find the existing AI test file and its fixture pattern**

```bash
grep -rl "AIService\|/api/ai/interpret\|/api/ai/explain" app/tests/
```

Read the matched file(s) to find how existing tests exercise `interpret`/
`explain` against the `mock` provider (default `AI_PROVIDER=mock`, no
network) — the new tests in Step 2 must follow the same setup rather than
inventing a second way to call these endpoints.

- [ ] **Step 2: Write the failing tests**

Append to the file found in Step 1 (adjust request bodies to match its
existing calls to `/api/ai/interpret` and `/api/ai/explain`):

```python
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus
from app.services.entitlement_service import PLAN_LIMITS


def _downgrade_to_free(db_session, test_user) -> None:
    sub = (
        db_session.query(Subscription).filter(Subscription.user_id == test_user.id).one()
    )
    sub.plan = PlanTier.FREE
    sub.status = SubscriptionStatus.ACTIVE
    db_session.commit()


def test_interpret_blocks_after_the_free_monthly_limit(client, db_session, test_user):
    _downgrade_to_free(db_session, test_user)
    limit = PLAN_LIMITS[PlanTier.FREE][__import__("app.models.enums", fromlist=["UsageResource"]).UsageResource.AI_CALLS]
    for _ in range(limit):
        res = client.post("/api/ai/interpret", json={"statement": "preciso de um material leve"})
        assert res.status_code == 200
    res = client.post("/api/ai/interpret", json={"statement": "preciso de um material leve"})
    assert res.status_code == 402
    assert res.json()["resource"] == "ai_calls"
```

Replace the `__import__(...)` line with a normal top-of-file import (`from
app.models.enums import PlanTier, SubscriptionStatus, UsageResource`) —
written inline above only to keep this plan's diff self-contained; the
actual edit must add it to the file's real import block, not call
`__import__` at runtime.

- [ ] **Step 3: Run to verify it fails**

```bash
pytest app/tests/ -k interpret_blocks_after_the_free_monthly_limit -v
```

Expected: FAILS — every call returns 200, no 402 ever happens.

- [ ] **Step 4: Implement the gate**

In `apps/api/app/services/ai_service.py`, add to the imports:

```python
from app.models.enums import UsageResource
from app.models.user import User
from app.services.entitlement_service import EntitlementService
```

Modify `__init__` and `interpret`/`explain`:

```python
    def __init__(
        self, db, settings: Settings = default_settings, user: User | None = None
    ) -> None:
        self.db = db
        self.settings = settings
        self.repo = ChartRepository(db)
        self.selection_repo = SelectionRepository(db)
        self.entitlements = EntitlementService(db, user) if user else None
```

```python
    def interpret(self, request: InterpretRequest) -> InterpretationOut:
        if self.entitlements is not None:
            self.entitlements.check_and_record(UsageResource.AI_CALLS)
            self.db.commit()
        # ...existing body, unchanged...
```

```python
    def explain(self, study_id: int, project_id: int) -> ExplanationOut:
        if self.entitlements is not None:
            self.entitlements.check_and_record(UsageResource.AI_CALLS)
            self.db.commit()
        # ...existing body, unchanged...
```

The `self.db.commit()` calls are new to this file: `AIService` never wrote
to the database before this task (it only reads and calls an external
provider), so nothing committed its session. Without this line the
`UsageCounter` increment from `check_and_record` would be silently lost —
added to the session, never persisted, and the free limit would never
actually bind. Insert each `commit()` immediately after its
`check_and_record()` call, still before the rest of the method's existing
body runs.

- [ ] **Step 5: Wire `user` through the router**

In `apps/api/app/routers/ai.py`, modify `explain` to depend on
`get_current_user` too, and pass `user` into both constructors:

```python
@router.post("/interpret", response_model=InterpretationOut)
def interpret(
    payload: InterpretRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InterpretationOut:
    """Structure a problem statement into editable, reviewable suggestions."""
    return AIService(db, user=user).interpret(payload)


@router.post("/explain", response_model=ExplanationOut)
def explain(
    payload: ExplainRequest,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> ExplanationOut:
    """Describe a saved study's already-computed result in prose."""
    return AIService(db, user=user).explain(payload.study_id, project.id)
```

(`ai_status` stays unchanged — it is informational only, never gated.)

- [ ] **Step 6: Run to verify it passes**

```bash
pytest app/tests/ -v
```

Expected: all PASS.

- [ ] **Step 7: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/services/ai_service.py app/routers/ai.py app/tests/
git commit -m "feat(assinatura): limite de chamadas de IA por mês"
```

---

### Task 9: Wire the gate into saved studies (`studies`)

**Files:**
- Modify: `apps/api/app/services/selection_service.py`
- Test: `apps/api/app/tests/test_selection_api.py` or wherever
  `create_study`/`POST /api/selection/studies` is already tested (`grep -rl
  "selection/studies" app/tests/`)

**Interfaces:**
- Consumes: `EntitlementService`, `UsageResource` (Task 3).
- Produces: `SelectionService.create_study()` raises `LimitExceededError`
  (402) when the project already has `PLAN_LIMITS[plan][STUDIES]` studies.

- [ ] **Step 1: Find the existing test file**

```bash
grep -rl "selection/studies\|create_study" app/tests/
```

- [ ] **Step 2: Write the failing test**

Append to the file found in Step 1 (match its existing `StudyIn`-shaped
payload for `POST /api/selection/studies` rather than inventing a new one):

```python
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus, UsageResource
from app.services.entitlement_service import PLAN_LIMITS


def test_create_study_blocks_after_the_free_capacity_limit(client, db_session, test_user):
    sub = (
        db_session.query(Subscription).filter(Subscription.user_id == test_user.id).one()
    )
    sub.plan = PlanTier.FREE
    sub.status = SubscriptionStatus.ACTIVE
    db_session.commit()

    limit = PLAN_LIMITS[PlanTier.FREE][UsageResource.STUDIES]
    for i in range(limit):
        res = client.post(
            "/api/selection/studies",
            json={
                "name": f"Estudo {i}",
                "description": None,
                "function_text": None,
                "objective_text": None,
                "free_variables": [],
                "combinator": "AND",
                "constraints": [],
                "index": None,
                "normalization": "minmax",
                "criteria": [],
            },
        )
        assert res.status_code == 201, res.text

    res = client.post(
        "/api/selection/studies",
        json={
            "name": "Um a mais",
            "description": None,
            "function_text": None,
            "objective_text": None,
            "free_variables": [],
            "combinator": "AND",
            "constraints": [],
            "index": None,
            "normalization": "minmax",
            "criteria": [],
        },
    )
    assert res.status_code == 402
    assert res.json()["resource"] == "studies"
```

If the file found in Step 1 already has a helper that builds a minimal
valid `StudyIn` payload, use it instead of the inline dict above — the
important part of this test is the loop and the final 402 assertion, not
the exact payload shape.

- [ ] **Step 3: Run to verify it fails**

```bash
pytest app/tests/ -k create_study_blocks_after_the_free_capacity_limit -v
```

Expected: FAILS — the `limit`-th `+1` request also returns 201.

- [ ] **Step 4: Implement the gate**

In `apps/api/app/services/selection_service.py`, add to the imports:

```python
from app.models.enums import AuditAction, AuditEntityType, BetterDirection, UsageResource
from app.services.entitlement_service import EntitlementService
```

(`UsageResource` joins the existing enum import line.)

Modify `__init__`:

```python
    def __init__(self, db, project_id: int, user: User | None = None) -> None:
        self.repo = SelectionRepository(db)
        self.audit_repo = AuditRepository(db)
        self.user = user
        self.project_id = project_id
        self.entitlements = EntitlementService(db, user) if user else None
        self._snapshots: list[MaterialSnapshot] | None = None
        self._props: dict = {}
```

Modify `create_study` — insert the check right after the existing
duplicate-name check:

```python
    def create_study(self, payload: StudyIn) -> StudyOut:
        if self.repo.study_name_exists(payload.name, self.project_id):
            raise ConflictError(f"Já existe um estudo com o nome: {payload.name}")
        if self.entitlements is not None:
            current_count = len(self.repo.list_studies(self.project_id))
            self.entitlements.check_capacity(UsageResource.STUDIES, current_count)
        study = SelectionStudy(
```

- [ ] **Step 5: Run to verify it passes**

```bash
pytest app/tests/ -v
```

Expected: all PASS.

- [ ] **Step 6: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/services/selection_service.py app/tests/
git commit -m "feat(assinatura): limite de estudos salvos"
```

---

### Task 10: Wire the gate into report export (`report_exports`)

**Files:**
- Modify: `apps/api/app/services/export_service.py`
- Modify: `apps/api/app/routers/exports.py`
- Test: `apps/api/app/tests/test_exports.py` or equivalent (`grep -rl
  "exports/estudos\|ExportService" app/tests/`)

**Interfaces:**
- Consumes: `EntitlementService` (Task 3).
- Produces: `ExportService.__init__(db, user=None)`; `study_report()` and
  `study_laudo()` raise `LimitExceededError` (402) on the free plan;
  `catalogue_report()` is unaffected (never gated — it is not a study
  export, see the spec's scoping note in §7).

- [ ] **Step 1: Find the existing test file**

```bash
grep -rl "exports/estudos\|ExportService" app/tests/
```

- [ ] **Step 2: Write the failing test**

Append to the file found in Step 1 (reuse whatever fixture that file already
uses to get a saved study id — likely creating one via `SelectionService` or
via the API directly, as its existing tests do):

```python
from app.models.billing import Subscription
from app.models.enums import PlanTier, SubscriptionStatus


def _downgrade_to_free(db_session, test_user) -> None:
    sub = (
        db_session.query(Subscription).filter(Subscription.user_id == test_user.id).one()
    )
    sub.plan = PlanTier.FREE
    sub.status = SubscriptionStatus.ACTIVE
    db_session.commit()


def test_study_export_blocked_on_free_plan(client, db_session, test_user, some_study_id):
    """`some_study_id` stands for whatever fixture/helper this test file
    already uses to get a valid saved study id — copy that pattern in
    instead of this placeholder name."""
    _downgrade_to_free(db_session, test_user)
    res = client.get(f"/api/exports/estudos/{some_study_id}.csv")
    assert res.status_code == 402
    assert res.json()["resource"] == "report_exports"


def test_study_laudo_blocked_on_free_plan(client, db_session, test_user, some_study_id):
    _downgrade_to_free(db_session, test_user)
    res = client.get(f"/api/exports/estudos/{some_study_id}/laudo.html")
    assert res.status_code == 402


def test_catalogue_export_is_never_blocked(client, db_session, test_user):
    _downgrade_to_free(db_session, test_user)
    res = client.get("/api/exports/catalogo.csv")
    assert res.status_code == 200
```

Replace `some_study_id` with a real fixture or an inline study creation
using this file's existing pattern before running — it is a placeholder
name in this plan only because the exact fixture name in that file is not
yet known; it must not remain a placeholder in the committed test.

- [ ] **Step 3: Run to verify it fails**

```bash
pytest app/tests/ -k "study_export_blocked_on_free_plan or study_laudo_blocked_on_free_plan" -v
```

Expected: FAILS — both return 200.

- [ ] **Step 4: Implement the gate**

In `apps/api/app/services/export_service.py`, add to the imports:

```python
from app.models.user import User
from app.services.entitlement_service import EntitlementService
```

Modify `__init__`:

```python
    def __init__(self, db, user: User | None = None) -> None:
        self.db = db
        self.selection_repo = SelectionRepository(db)
        self.chart_repo = ChartRepository(db)
        self.entitlements = EntitlementService(db, user) if user else None
```

Modify `study_report` and `study_laudo` — insert the check as their first
line:

```python
    def study_report(self, study_id: int, project_id: int) -> Report:
        if self.entitlements is not None:
            self.entitlements.require_export_access()
        # ...existing body, unchanged...
```

```python
    def study_laudo(
        self, study_id: int, project_id: int, *, responsible: str | None = None
    ) -> Report:  # keep the real existing signature — copy it, do not guess it
        if self.entitlements is not None:
            self.entitlements.require_export_access()
        # ...existing body, unchanged...
```

Read `apps/api/app/services/export_service.py`'s actual `study_laudo`
signature before editing — copy it exactly rather than retyping it from
memory, since the responsible-name parameter's exact name/default matters
for the router call site.

- [ ] **Step 5: Wire `user` through the router**

In `apps/api/app/routers/exports.py`, add to the imports:

```python
from app.dependencies import get_current_project, get_current_user
from app.models.user import User
```

Modify `export_study` and `export_study_laudo` (leave `export_catalogue`
untouched — it stays ungated):

```python
@router.get("/estudos/{study_id}.{fmt}")
def export_study(
    study_id: int,
    fmt: str,
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    """Export a saved study as a full selection report.

    The study is re-run server-side, so the file always reflects the current
    catalogue rather than a remembered result.
    """
    _require_supported(fmt)
    return _file_response(ExportService(db, user).study_report(study_id, project.id), fmt)


@router.get("/estudos/{study_id}/laudo.html")
def export_study_laudo(
    study_id: int,
    responsavel: str | None = Query(default=None, max_length=160),
    db: Session = Depends(get_db),
    project: Project = Depends(get_current_project),
    user: User = Depends(get_current_user),
) -> Response:
    """The engineering report: a document distinct from the selection
    report, combining a ranking figure, the same audit tables, and — when
    the AI layer is on — an interpretive narrative. HTML-only, like the
    printable report it is built alongside: there is no spreadsheet shape
    for a figure or a paragraph.
    """
    report = ExportService(db, user).study_laudo(study_id, project.id, responsible=responsavel)
    return _file_response(report, "html")
```

- [ ] **Step 6: Run to verify it passes**

```bash
pytest app/tests/ -v
```

Expected: all PASS.

- [ ] **Step 7: Gate + commit**

```bash
ruff check app && black --check app && pytest
git add app/services/export_service.py app/routers/exports.py app/tests/
git commit -m "feat(assinatura): exportação de relatório restrita ao plano Pro"
```

---

### Task 11: Backend gate, full suite, docs

**Files:**
- Modify: `docs/CLAUDE.md` (env var table, §6)
- Modify: `docs/DECISIONS.md` (new entry)
- Modify: `docs/PROJECT_CONTEXT.md` (state)
- No new test file — this task is verification + documentation only.

**Interfaces:** none new.

- [ ] **Step 1: Full backend gate on a clean database**

```bash
cd apps/api
rm -f materialselect.db
ruff check app
black --check app
pytest
alembic upgrade head
python -m app.db.seed
```

Expected: every command exits 0.

- [ ] **Step 2: Add the env vars to `docs/CLAUDE.md`**

In the environment variable table (§6), add four rows after
`OAUTH_STATE_TTL_SECONDS`:

```markdown
| `STRIPE_API_KEY` | vazio | Cobrança desligada sem ela — `/api/billing/*` responde 503. Sem padrão de propósito (D-36). |
| `STRIPE_WEBHOOK_SECRET` | vazio | Verifica a assinatura HMAC do webhook; sem ele, o endpoint recusa todo evento. |
| `STRIPE_PRICE_ID_PRO` | vazio | O preço recorrente do plano Pro no Stripe. |
| `BILLING_TRIAL_DAYS` | `90` | Duração da cortesia de migração para contas que já existiam antes da cobrança. |
```

- [ ] **Step 3: Add a `DECISIONS.md` entry**

Append a new decision (use the next available D-number — check the last
entry in `docs/DECISIONS.md` first, since M1 added D-44):

```markdown
## D-45: Assinatura por usuário (Free/Pro), não por organização

Ao planejar a virada do projeto em SaaS, a primeira pergunta era se o
catálogo devia virar por-tenant. A resposta, fechada em conversa antes do
spec: não — o catálogo continua compartilhado (D-42), e "tenant" é o
usuário individual, sem conceito de organização. O trabalho real de virar
SaaS é cobrança e limite de uso, não isolamento de dado — a fronteira de
`Project`/`SelectionStudy` por `user_id` que D-42 já estabeleceu **é** a
fronteira de tenant.

Um spec anterior (18/08/2026) havia desenhado um gate binário — sem
assinatura ativa, toda rota bloqueada, sem plano free — e nunca foi
implementado. O desenho que efetivamente saiu do papel é outro: existe um
plano free funcional, com limites por recurso (linhas importadas e chamadas
de IA por mês, estudos salvos por capacidade, exportação de relatório como
portão binário), e só o Pro remove os tetos. Contas que já existiam antes
da cobrança ganham 90 dias de Pro por cortesia (`trial_reason =
"cortesia_usuario_existente"`) em vez de serem bloqueadas de uma hora para
outra por um limite que não existia no dia anterior.

Ver [docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md](superpowers/specs/2026-08-18-multi-tenant-billing-design.md).
```

- [ ] **Step 4: Update `docs/PROJECT_CONTEXT.md`**

Add a short paragraph to the "Estado atual" section (or wherever the most
recent completed work is summarized) noting: `Subscription`/`UsageCounter`
tables, `EntitlementService`, `BillingService`/Stripe integration, the four
gated resources, and that this is backend-complete pending the frontend
tasks below.

- [ ] **Step 5: Commit**

```bash
git add docs/CLAUDE.md docs/DECISIONS.md docs/PROJECT_CONTEXT.md
git commit -m "docs(assinatura): variáveis de ambiente, D-45, estado do projeto"
```

---

### Task 12: Frontend types + API client

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/packages/shared-types/index.ts` (repo-relative:
  `packages/shared-types/index.ts`)
- Modify: `apps/web/lib/api.ts`
- Test: none new (types are exercised by Task 13's hook test and the
  existing `npm run typecheck` gate)

**Interfaces:**
- Produces (in both `types.ts` and `shared-types/index.ts`, per the
  project's documented duplication convention — CLAUDE.md §4): `PlanTier`,
  `SubscriptionStatus`, `UsageResource`, `ResourceUsage`,
  `SubscriptionOut`. In `api.ts`: `ApiError` gains a `resource?: string`
  field; `getSubscription()`, `createCheckoutSession()`,
  `createPortalSession()`.

- [ ] **Step 1: Add the types**

Append to `apps/web/lib/types.ts`, after `CurrentUser`:

```typescript
// --- Billing (assinatura) ----------------------------------------------------

export type PlanTier = "free" | "pro";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";
export type UsageResource = "import_rows" | "ai_calls" | "studies" | "report_exports";

export interface ResourceUsage {
  resource: UsageResource;
  used: number;
  limit: number | null;
}

export interface SubscriptionOut {
  plan: PlanTier;
  status: SubscriptionStatus;
  current_period_end: string | null;
  trial_ends_at: string | null;
  can_export_reports: boolean;
  usage: ResourceUsage[];
}
```

Append the identical block (same types, same field names — this is the
project's deliberate duplication, not an import) to
`packages/shared-types/index.ts`, at the end of the file.

- [ ] **Step 2: Extend `ApiError` and add the API functions**

In `apps/web/lib/api.ts`, modify `ApiError`:

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly resource?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

Replace `errorMessage` with a version that also extracts `resource`, and
update its two call sites:

```typescript
/** Extract the human-readable message and (on a 402) the limited resource
 * name from a failed response body. */
async function errorDetail(
  res: Response,
  fallback: string,
): Promise<{ message: string; resource?: string }> {
  try {
    const body = (await res.json()) as { detail?: unknown; resource?: unknown };
    const message = typeof body.detail === "string" ? body.detail : fallback;
    const resource = typeof body.resource === "string" ? body.resource : undefined;
    return { message, resource };
  } catch {
    return { message: fallback };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const { message, resource } = await errorDetail(res, `Falha na requisição ${path}`);
    throw new ApiError(message, res.status, resource);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

Update `uploadImportFile`'s error branch the same way:

```typescript
  if (!res.ok) {
    const { message, resource } = await errorDetail(res, "Falha no envio do arquivo");
    throw new ApiError(message, res.status, resource);
  }
```

Add the three new functions at the end of the file, under a new section:

```typescript
// --- Billing (assinatura) ----------------------------------------------------

export function getSubscription(): Promise<SubscriptionOut> {
  return request<SubscriptionOut>(`/api/me/subscription`);
}

export function createCheckoutSession(): Promise<{ url: string }> {
  return request<{ url: string }>(`/api/billing/checkout-session`, { method: "POST" });
}

export function createPortalSession(): Promise<{ url: string }> {
  return request<{ url: string }>(`/api/billing/portal-session`, { method: "POST" });
}
```

Add `SubscriptionOut` to the `import type { ... } from "./types"` block at
the top of the file (alphabetically).

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: passes (nothing consumes the new exports yet, so nothing can be
mistyped against them either — this step mainly confirms the edit itself is
syntactically/typewise valid).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts ../../packages/shared-types/index.ts lib/api.ts
git commit -m "feat(assinatura): tipos e cliente de API para assinatura/billing"
```

---

### Task 13: `useSubscription` hook

**Files:**
- Create: `apps/web/lib/hooks/useSubscription.ts`
- Create: `apps/web/lib/hooks/useSubscription.test.ts`

**Interfaces:**
- Consumes: `getSubscription` (Task 12).
- Produces: `useSubscription()` — a TanStack Query hook returning
  `{ data: SubscriptionOut | undefined, isLoading, isError, ... }`, cached
  under `queryKey: ["subscription"]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/hooks/useSubscription.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSubscription } from "./useSubscription";
import * as api from "@/lib/api";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSubscription", () => {
  it("fetches and returns the current subscription", async () => {
    vi.spyOn(api, "getSubscription").mockResolvedValue({
      plan: "free",
      status: "active",
      current_period_end: null,
      trial_ends_at: null,
      can_export_reports: false,
      usage: [
        { resource: "import_rows", used: 10, limit: 500 },
        { resource: "ai_calls", used: 3, limit: 20 },
        { resource: "studies", used: 1, limit: 3 },
      ],
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.plan).toBe("free");
    expect(result.current.data?.usage).toHaveLength(3);
  });
});
```

Check `apps/web/lib/testing/` (referenced in the earlier `ls lib/` output)
for an existing test-utilities module before writing this — if the project
already has a shared `renderWithQueryClient` helper there, use it instead
of the inline `wrapper` above to match the codebase's existing convention.

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test -- useSubscription
```

Expected: fails — `useSubscription.ts` does not exist yet.

- [ ] **Step 3: Implement the hook**

Create `apps/web/lib/hooks/useSubscription.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { getSubscription } from "@/lib/api";

/**
 * The current user's plan and usage. A checkout/portal round-trip always
 * returns through a full-page redirect (Stripe's hosted pages), so a stale
 * cache is never visible after an upgrade — the next mount just refetches.
 */
export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run test -- useSubscription
```

Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
npm run typecheck && npm run lint && npm run test
git add lib/hooks/useSubscription.ts lib/hooks/useSubscription.test.ts
git commit -m "feat(assinatura): hook useSubscription"
```

---

### Task 14: `/assinatura` page

**Files:**
- Create: `apps/web/app/assinatura/page.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Test: covered by `apps/web/app/routes.a11y.test.tsx` (Step 3 — this file
  already exercises every route for accessibility; add `/assinatura` to its
  list rather than writing a parallel a11y test)

**Interfaces:**
- Consumes: `useSubscription` (Task 13), `createCheckoutSession`,
  `createPortalSession` (Task 12), `LoadingState`/`ErrorState`/`Card`/
  `CardHeader`/`CardBody`/`Button`/`Alert` (existing `components/ui`).
- Produces: a page at `/assinatura` showing plan, usage, and an
  assinar/gerenciar action.

- [ ] **Step 1: Add i18n strings**

In `apps/web/lib/i18n.ts`, add a new top-level section (after `exports:`,
matching the file's existing flat-section style):

```typescript
  billing: {
    title: "Assinatura",
    planFree: "Gratuito",
    planPro: "Pro",
    statusActive: "Ativa",
    statusTrialing: "Cortesia",
    statusPastDue: "Pagamento pendente",
    statusCanceled: "Cancelada",
    usageTitle: "Uso deste mês",
    resourceImportRows: "Linhas importadas",
    resourceAiCalls: "Chamadas de IA",
    resourceStudies: "Estudos salvos",
    unlimited: "Ilimitado",
    subscribeButton: "Assinar o Pro",
    manageButton: "Gerenciar assinatura",
    exportLocked: "Exportação de relatório é um recurso do plano Pro.",
    seePlans: "Ver planos",
    trialNotice: (date: string) => `Cortesia do plano Pro até ${date}.`,
    checkoutError: "Não foi possível iniciar a assinatura. Tente novamente.",
    portalError: "Não foi possível abrir o gerenciamento da assinatura.",
  },
```

- [ ] **Step 2: Write the page**

Create `apps/web/app/assinatura/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, createCheckoutSession, createPortalSession } from "@/lib/api";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { Alert, Button, Card, CardBody, CardHeader, ErrorState, LoadingState } from "@/components/ui";
import type { ResourceUsage } from "@/lib/types";

const t = ptBR.billing;

const RESOURCE_LABEL: Record<string, string> = {
  import_rows: t.resourceImportRows,
  ai_calls: t.resourceAiCalls,
  studies: t.resourceStudies,
};

function UsageRow({ usage }: { usage: ResourceUsage }) {
  const label = RESOURCE_LABEL[usage.resource] ?? usage.resource;
  const pct = usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-ink-muted">
          {usage.limit === null
            ? t.unlimited
            : `${formatNumber(usage.used)} / ${formatNumber(usage.limit)}`}
        </span>
      </div>
      {usage.limit !== null && (
        <div className="h-1.5 w-full rounded-full bg-surface-sunken">
          <div
            className="h-1.5 rounded-full bg-brand transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function AssinaturaPage() {
  const { data: subscription, isLoading, isError, refetch } = useSubscription();
  const [actionError, setActionError] = useState<string | null>(null);

  const checkout = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : t.checkoutError),
  });

  const portal = useMutation({
    mutationFn: createPortalSession,
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : t.portalError),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !subscription) return <ErrorState onRetry={() => refetch()} />;

  const isPro = subscription.plan === "pro";
  const statusLabel = {
    active: t.statusActive,
    trialing: t.statusTrialing,
    past_due: t.statusPastDue,
    canceled: t.statusCanceled,
  }[subscription.status];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Card>
        <CardHeader
          title={t.title}
          description={`${isPro ? t.planPro : t.planFree} · ${statusLabel}`}
        />
        <CardBody className="flex flex-col gap-4">
          {subscription.status === "trialing" && subscription.trial_ends_at && (
            <Alert tone="info">
              {t.trialNotice(new Date(subscription.trial_ends_at).toLocaleDateString("pt-BR"))}
            </Alert>
          )}
          <div>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t.usageTitle}
            </h3>
            <div className="flex flex-col gap-3">
              {subscription.usage.map((usage) => (
                <UsageRow key={usage.resource} usage={usage} />
              ))}
            </div>
          </div>
          {!subscription.can_export_reports && <Alert tone="warning">{t.exportLocked}</Alert>}
          {actionError && (
            <Alert tone="danger" role="alert">
              {actionError}
            </Alert>
          )}
          <div>
            {isPro ? (
              <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
                {t.manageButton}
              </Button>
            ) : (
              <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
                {t.subscribeButton}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
```

Check `apps/web/lib/format.ts` for the exact name of the pt-BR number
formatter (D-30) before using `formatNumber` — the file listing earlier
showed `lib/format.ts` exists; confirm its exported function name matches
(`grep -n "^export function" lib/format.ts`) and adjust the import/call if
it differs.

- [ ] **Step 3: Add the route to the a11y sweep**

In `apps/web/app/routes.a11y.test.tsx`, find where routes are listed (it
already mocks `explainStudy` per the earlier grep, so it likely has a
central array of paths this file iterates) and add `/assinatura` to it,
following the exact same pattern as the neighboring entries. If the
subscription fetch needs mocking for this test file the same way
`explainStudy` is mocked, add `getSubscription: () => Promise.resolve({...
a minimal valid SubscriptionOut ...})` next to the existing mocks in that
file.

- [ ] **Step 4: Run the frontend gate**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/assinatura/page.tsx lib/i18n.ts app/routes.a11y.test.tsx
git commit -m "feat(assinatura): página /assinatura"
```

---

### Task 15: Sidebar usage indicator

**Files:**
- Modify: `apps/web/components/layout/AppSidebar.tsx`

**Interfaces:**
- Consumes: `useSubscription` (Task 13).

- [ ] **Step 1: Add the indicator**

In `apps/web/components/layout/AppSidebar.tsx`, add to the imports:

```typescript
import Link from "next/link";
import { useSubscription } from "@/lib/hooks/useSubscription";
```

(`Link` may already be imported — the file already uses `<Link href="/">` in
`NavLink`/`BrandLink`; do not duplicate the import if so.)

Add a new component, near `UserFooter`:

```tsx
/**
 * The closest-to-its-limit free-plan metric, or nothing at all.
 *
 * Renders nothing for a Pro account (active or trialing) — there is no
 * ceiling to show — and nothing while the subscription is still loading,
 * the same "cover it elsewhere or don't render" rule UserFooter already
 * follows for the signed-in user.
 */
function UsageIndicator({ collapsed = false }: { collapsed?: boolean }) {
  const { data: subscription } = useSubscription();
  if (!subscription || subscription.plan !== "free") return null;

  const closest = subscription.usage
    .filter((u): u is typeof u & { limit: number } => u.limit !== null && u.limit > 0)
    .sort((a, b) => b.used / b.limit - a.used / a.limit)[0];
  if (!closest) return null;

  const label = { import_rows: "Importação", ai_calls: "IA", studies: "Estudos" }[
    closest.resource
  ] ?? closest.resource;
  const pct = Math.min(100, (closest.used / closest.limit) * 100);

  return (
    <Link
      href="/assinatura"
      title={collapsed ? `${label}: ${closest.used}/${closest.limit}` : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-control px-1 py-1 text-xs hover:bg-surface-sunken",
        collapsed && "items-center",
      )}
    >
      <div className="h-1 w-full rounded-full bg-surface-sunken">
        <div className="h-1 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      {!collapsed && (
        <span className="text-ink-muted">
          {label}: {closest.used}/{closest.limit}
        </span>
      )}
    </Link>
  );
}
```

Render it inside the rail's footer block, between the `<nav>` and the
`mt-auto` footer div — actually simplest and matching the file's own
structure, add it as the first child of the existing `mt-auto` footer
`<div>` (right before `<UserFooter collapsed={collapsed} />`):

```tsx
        <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
          <UsageIndicator collapsed={collapsed} />
          <UserFooter collapsed={collapsed} />
          <div
```

Also add it to the drawer's footer block (the second, non-collapsible
occurrence near the end of the file), right before `<UserFooter />`:

```tsx
            <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-3">
              <UsageIndicator />
              <UserFooter />
              <ThemeToggle compact />
            </div>
```

- [ ] **Step 2: Verify live in the browser**

```bash
npm run dev
```

Log in, confirm: a Pro/trialing account shows no indicator; temporarily
downgrading a test account to free (via the backend, e.g. a direct DB edit
in a local dev database) shows the bar and the `Importação`/`IA`/`Estudos`
label with the resource closest to its cap, both in the expanded rail and
the collapsed 76px rail (label becomes `sr-only`, per D-37 — confirm the
bar itself, not the label, stays visible when collapsed).

- [ ] **Step 3: Run the frontend gate and commit**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
git add components/layout/AppSidebar.tsx
git commit -m "feat(assinatura): indicador de uso na barra lateral"
```

---

### Task 16: Preemptive export gating + 402 handling in the three fetch flows

**Files:**
- Modify: `apps/web/components/ExportButtons.tsx`
- Modify: `apps/web/components/EngineeringReportLink.tsx`
- Modify: `apps/web/app/selecao/page.tsx`
- Modify: `apps/web/components/ai/StudyExplanation.tsx`
- Modify: `apps/web/app/importar/page.tsx`

**Interfaces:**
- Consumes: `useSubscription` (Task 13), `ApiError.resource` (Task 12).

**Why export gating cannot reuse the 402-catch pattern:** `ExportButtons`
and `EngineeringReportLink` render plain `<a href>` links (see the
comments already in those files) — the browser navigates or downloads
directly, and a `fetch`-based `onError` handler never runs for a plain
navigation. A 402 there would just show raw JSON in a new tab. So export
gating must be preemptive: hide/disable the link client-side using the
already-cached `useSubscription()` result, before the browser ever
requests the URL. The backend 402 (Task 10) still stands as defense in
depth for someone hitting the URL directly.

- [ ] **Step 1: Add a `locked` prop to `ExportButtons`**

In `apps/web/components/ExportButtons.tsx`:

```tsx
import { ptBR } from "@/lib/i18n";
import { opensInBrowser, type ExportFormat } from "@/lib/api";
import { ButtonLink } from "@/components/ui";

const t = ptBR.exports;
const billing = ptBR.billing;

const LABELS: Record<ExportFormat, string> = {
  csv: t.csv,
  xlsx: t.xlsx,
  html: t.html,
};

interface ExportButtonsProps {
  /** Builds the download URL for a given format. */
  urlFor: (format: ExportFormat) => string;
  label?: string;
  hint?: string;
  /** True when the caller's plan does not allow this export (Task 10's
   * server-side gate — this prop keeps the UI honest before the browser
   * ever requests the URL, since these are plain <a> links a 402 JSON
   * body cannot be caught for). */
  locked?: boolean;
}

/**
 * CSV / XLSX / HTML export links.
 *
 * Plain anchors rather than fetch calls: the browser then honours the
 * `Content-Disposition` filename the API sends and shows its own save
 * dialog, which is both simpler and better behaved than reconstructing a
 * blob.
 *
 * HTML is the odd one out and deliberately so — it is served inline, so it
 * opens in a new tab instead of downloading. That tab is what the user
 * prints to PDF, which is how the report reaches a monograph without the
 * project taking on a PDF-generation dependency.
 */
export function ExportButtons({ urlFor, label = t.title, hint, locked = false }: ExportButtonsProps) {
  const formats: ExportFormat[] = ["csv", "xlsx", "html"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </span>
      {locked ? (
        <span className="text-xs text-ink-muted">
          {billing.exportLocked}{" "}
          <a href="/assinatura" className="underline">
            {billing.seePlans}
          </a>
        </span>
      ) : (
        formats.map((format) => {
          const inBrowser = opensInBrowser(format);
          return (
            <ButtonLink
              key={format}
              href={urlFor(format)}
              size="sm"
              {...(inBrowser
                ? { target: "_blank", rel: "noopener noreferrer", title: t.htmlTitle }
                : { download: true })}
            >
              {LABELS[format]}
            </ButtonLink>
          );
        })
      )}
      {hint && !locked && <span className="text-xs text-ink-subtle">{hint}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Add the same treatment to `EngineeringReportLink`**

In `apps/web/components/EngineeringReportLink.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ptBR } from "@/lib/i18n";
import { studyLaudoUrl } from "@/lib/api";
import { ButtonLink, Input } from "@/components/ui";

const t = ptBR.exports;
const billing = ptBR.billing;

/**
 * Link to the engineering report (laudo) for one saved study.
 *
 * The responsible-engineer name is declared, free text — never validated,
 * never computed — so it travels as a query parameter the link rebuilds on
 * every keystroke rather than as form state the API has to accept a POST
 * for. Like the printable selection report, this always opens inline: the
 * tab it opens is what the user prints to PDF.
 */
export function EngineeringReportLink({
  studyId,
  locked = false,
}: {
  studyId: number;
  locked?: boolean;
}) {
  const [responsible, setResponsible] = useState("");

  if (locked) {
    return (
      <span className="text-xs text-ink-muted">
        {billing.exportLocked}{" "}
        <a href="/assinatura" className="underline">
          {billing.seePlans}
        </a>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        label={t.laudoResponsibleLabel}
        className="w-56"
        value={responsible}
        onChange={(e) => setResponsible(e.target.value)}
        placeholder={t.laudoResponsiblePlaceholder}
        maxLength={160}
      />
      <ButtonLink
        href={studyLaudoUrl(studyId, responsible)}
        size="sm"
        target="_blank"
        rel="noopener noreferrer"
        title={t.htmlTitle}
      >
        {t.laudoButton}
      </ButtonLink>
    </div>
  );
}
```

- [ ] **Step 3: Wire `locked` in `app/selecao/page.tsx`, and show "Ver planos" on a 402 from `save`**

Add the import:

```typescript
import { useSubscription } from "@/lib/hooks/useSubscription";
```

Near the top of the component function, alongside its other hooks:

```typescript
  const { data: subscription } = useSubscription();
  const exportsLocked = subscription ? !subscription.can_export_reports : false;
```

Find the two call sites located earlier (`urlFor={(format) =>
studyExportUrl(s.id, format)}` around line 787, and wherever
`<EngineeringReportLink studyId=... />` is rendered — it must exist nearby
since the component is imported into this file per the grep in Task
exploration) and add `locked={exportsLocked}` to both:

```tsx
<ExportButtons urlFor={(format) => studyExportUrl(s.id, format)} locked={exportsLocked} />
```

```tsx
<EngineeringReportLink studyId={s.id} locked={exportsLocked} />
```

Find the `fail` helper (around line 196: `const fail = (err: unknown) =>
setError(err instanceof ApiError ? err.message : t.genericError);`) and the
`error` state next to it. Add a second state and extend `fail`:

```typescript
  const [error, setError] = useState<string | null>(null);
  const [errorResource, setErrorResource] = useState<string | null>(null);
  const fail = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : t.genericError);
    setErrorResource(err instanceof ApiError ? (err.resource ?? null) : null);
  };
```

Find where `error` is rendered (the `<Alert tone="danger" role="alert">`
block already returning `{error}`) and extend it:

```tsx
{error && (
  <Alert tone="danger" role="alert">
    {error}
    {errorResource && (
      <>
        {" "}
        <a href="/assinatura" className="underline">
          {ptBR.billing.seePlans}
        </a>
      </>
    )}
  </Alert>
)}
```

Clear `errorResource` alongside every existing `setError(null)` call in
this file (the `onSuccess` handlers of `run`, `save`, etc. that already do
`setError(null)`) — add `setErrorResource(null)` next to each.

- [ ] **Step 4: Show "Ver planos" on a 402 from `explain`, in `StudyExplanation.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, explainStudy } from "@/lib/api";
import type { Explanation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";

const t = ptBR.ai;

export function StudyExplanation({ studyId }: { studyId: number }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorResource, setErrorResource] = useState<string | null>(null);

  const explain = useMutation({
    mutationFn: () => explainStudy(studyId),
    onSuccess: (data) => {
      setExplanation(data);
      setError(null);
      setErrorResource(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : t.explainError);
      setErrorResource(err instanceof ApiError ? (err.resource ?? null) : null);
    },
  });

  // ...unchanged rendering of `explanation`...

  // Wherever this component currently renders its error Alert (below the
  // button, in the collapsed/no-explanation-yet branch), extend it exactly
  // as in Task 16 Step 3 — append the conditional "Ver planos" link when
  // errorResource is set. Read the file's actual current error-rendering
  // JSX first (it was only partially shown during planning) and edit it in
  // place rather than rewriting the whole component from this excerpt.
}
```

Read the full current `apps/web/components/ai/StudyExplanation.tsx` before
editing (only its first 50 lines were seen during planning) — apply the
`error`/`errorResource` state split and the `onError` change shown above,
and extend whatever its existing error `<Alert>` JSX is with the same
"Ver planos" conditional link used in Step 3, changing only what this task
requires.

- [ ] **Step 5: Show "Ver planos" on a 402 from import validate/commit, in `app/importar/page.tsx`**

This file's `fail` helper (`const fail = (err) => setError(err instanceof
ApiError ? err.message : t.genericError)`, per the earlier grep) is shared
by every mutation in the file, including `validate`/`commit`. Apply the
same `errorResource` split as Step 3: add the state, extend `fail` to set
it, clear it alongside every existing `setError(null)`, and extend the
file's existing `<Alert tone="danger" role="alert">{error}</Alert>` block
(around line 298 per the earlier grep) with the same conditional "Ver
planos" link.

- [ ] **Step 6: Verify live in the browser**

```bash
npm run dev
```

With a free-plan test account (downgrade one via the backend as in Task
15's Step 2): confirm the study export buttons and the engineering-report
link show the locked message with a working `/assinatura` link instead of
a live download link; confirm hitting the free import-row limit, the free
AI-call limit, and the free study-capacity limit each show the specific
backend message plus a "Ver planos" link, not a generic error.

- [ ] **Step 7: Run the frontend gate and commit**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
git add components/ExportButtons.tsx components/EngineeringReportLink.tsx \
  app/selecao/page.tsx components/ai/StudyExplanation.tsx app/importar/page.tsx
git commit -m "feat(assinatura): bloqueio de exportação e aviso de limite nos três fluxos"
```

---

### Task 17: Update existing frontend tests broken by the new gating

**Files:**
- Modify: `apps/web/app/selecao/selecao.test.tsx`
- Modify: `apps/web/app/catalogo/catalogo.test.tsx`
- Modify: `apps/web/app/routes.a11y.test.tsx` (if not already covered by
  Task 14 Step 3)
- Any other test file `npm run test` reports failing after Task 16

**Interfaces:** none new — this task only keeps the existing suite green
against Task 16's component signature changes (`ExportButtons`/
`EngineeringReportLink` gained a `locked` prop, `useSubscription` is now
called from `app/selecao/page.tsx` and `AppSidebar.tsx`).

- [ ] **Step 1: Run the full frontend suite and list failures**

```bash
npm run test
```

- [ ] **Step 2: Fix each failure**

For every failing test that renders `app/selecao/page.tsx`, `AppSidebar`,
or `ExportButtons`/`EngineeringReportLink` directly: add a mock for
`getSubscription` (mirroring the existing `explainStudy: () =>
Promise.resolve(null)` mock pattern already present in
`selecao.test.tsx`/`routes.a11y.test.tsx`) that resolves a Pro
`SubscriptionOut` (`plan: "pro", can_export_reports: true, ...`) so the
existing assertions about visible export buttons keep holding without
having to touch each test's expectations.

- [ ] **Step 3: Run to verify all pass**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add app/selecao/selecao.test.tsx app/catalogo/catalogo.test.tsx app/routes.a11y.test.tsx
git commit -m "test(assinatura): mocka useSubscription nos testes existentes de export"
```

---

### Task 18: Final full-repo gate, PR

**Files:** none — verification and PR only.

- [ ] **Step 1: Full backend gate**

```bash
cd apps/api
rm -f materialselect.db
ruff check app && black --check app && pytest
alembic upgrade head && python -m app.db.seed
```

- [ ] **Step 2: Full frontend gate**

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test && npm run build
```

- [ ] **Step 3: E2E**

```bash
cd apps/web
npm run test:e2e
```

Expected: green. If any spec fails because a gated action now needs a Pro
account, check whether `app/db/seed.py`'s `seed_e2e_session` needs its
fixed session's user given a Pro `Subscription` too (mirroring Task 4's
`conftest.py` change) — the E2E suite exercises the same import → select →
export flow the free plan would now block.

- [ ] **Step 4: Push and open the PR**

Follow the repository's standard PR flow (branch, push, draft PR with a
body that argues the change per CLAUDE.md §9 — Backend / Frontend /
Qualidade / Docs sections, referencing the spec and D-45).
