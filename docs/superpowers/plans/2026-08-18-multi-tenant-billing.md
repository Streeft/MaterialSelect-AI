# Multi-tenant e cobrança (Stripe) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o acesso à ferramenta (tudo exceto login e a própria tela de assinatura) depender de uma assinatura Stripe ativa por usuário, sem introduzir `tenant_id`, RLS ou qualquer conceito de organização.

**Architecture:** Uma tabela nova (`Subscription`, 1:1 com `User`), um `BillingService` que isola toda chamada ao SDK do Stripe atrás de um cliente injetável (mesmo padrão de `AuthService.verify_id_token`), uma dependência nova (`require_active_subscription`) simétrica a `get_current_user` e aplicada em bloco em `main.py` via `include_router(..., dependencies=[Depends(require_active_subscription)])` — nenhum router individual precisa ser tocado —, e um segundo estágio no `AuthGate` do frontend (`/auth/me` → `/billing/status`), reaproveitando o padrão que já existe para `/entrar`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), Next.js + TanStack Query (frontend), SDK `stripe` (Python, extra opcional `billing`).

**Spec:** [docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md](../specs/2026-08-18-multi-tenant-billing-design.md)

## Global Constraints

- Tenant = usuário individual. Nenhuma coluna `tenant_id` em nenhuma tabela; nenhum RLS; nenhuma entidade `Organization`. O catálogo continua global (D-42).
- Tudo fica atrás do gate de assinatura ativa, exceto `/health`, as três rotas de `/auth` já públicas hoje, e as rotas de `/billing` (cada uma com sua própria regra de autenticação — seção 5 do spec).
- Um único `STRIPE_PRICE_ID` no v1 — sem seletor de plano na interface.
- `status` da assinatura espelha o vocabulário do Stripe (`incomplete · trialing · active · past_due · canceled · unpaid`) — sem enum próprio. Só `active` libera acesso.
- Stripe é mockado em todo teste — nunca chamado de verdade em CI (mesmo espírito do provedor `mock` de IA). O SDK real só é importado quando `STRIPE_API_KEY` está de fato configurado, o que a suíte de testes nunca faz — por isso a dependência opcional `billing` não precisa estar instalada em CI, do mesmo jeito que `ai` (o extra do `anthropic`) não precisa para o provedor `mock`.
- PT-BR em toda mensagem de erro, texto de interface e mensagem de commit; inglês em identificador de código. `UserOut`-style sufixo `Out` para schema de saída.
- Alembic autogenerate é a única forma de alterar o schema — nunca editar o banco à mão.
- TypeScript em modo estrito, sem `any`. Todo contrato novo é duplicado em `packages/shared-types/index.ts` **e** `apps/web/lib/types.ts` (duplicação consciente, CLAUDE.md §4).
- `ruff check app`, `black --check app`, `pytest` no backend; `npm run typecheck && npm run lint && npm run test && npm run build` no frontend — os mesmos comandos da CI, rodados localmente antes de qualquer commit ser considerado terminado.

---

### Task 1: Modelo `Subscription`, migration e `SubscriptionRepository`

**Files:**
- Create: `apps/api/app/models/subscription.py`
- Modify: `apps/api/app/models/__init__.py`
- Create: `apps/api/alembic/versions/<hash>_assinatura_stripe.py` (nome e hash gerados pelo Alembic)
- Create: `apps/api/app/repositories/subscription_repository.py`
- Test: `apps/api/app/tests/test_subscription_repository.py`

**Interfaces:**
- Produces: `Subscription` (model, `app.models.subscription`) com campos `id`, `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_end`, `created_at`, `updated_at`. `SubscriptionRepository(db)` com `get_by_user_id(user_id: int) -> Subscription | None`, `get_by_stripe_customer_id(stripe_customer_id: str) -> Subscription | None`, `create(*, user_id, stripe_customer_id, stripe_subscription_id, status) -> Subscription`.

- [ ] **Step 1: Escrever o modelo**

```python
# apps/api/app/models/subscription.py
"""Subscription: o vínculo 1:1 entre um User e sua assinatura Stripe.

Sem RLS e sem tenant_id — o isolamento por usuário já existe (user_id é
FK única) e este modelo só acrescenta o estado de cobrança em cima dele
(ver docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md).
`status` espelha o vocabulário do próprio Stripe de propósito: traduzir
para um enum próprio custaria uma tabela de mapeamento sem necessidade.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Subscription(Base):
    """Um plano Stripe por usuário. `active` é o único status que libera acesso."""

    __tablename__ = "subscription"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    stripe_customer_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
```

Registrar em `apps/api/app/models/__init__.py` (mantém a lista alfabética existente):

```python
from app.models.selection import RankingCriterion, SelectionConstraint, SelectionStudy
from app.models.source import Source
from app.models.subscription import Subscription
from app.models.user import User, UserSession

__all__ = [
    "BetterDirection",
    "DataQuality",
    "ImportJob",
    "ImportMappingTemplate",
    "ImportStatus",
    "Material",
    "MaterialClass",
    "MaterialPropertyValue",
    "PerformanceIndex",
    "Project",
    "PropertyCategory",
    "PropertyDefinition",
    "RankingCriterion",
    "SelectionConstraint",
    "SelectionStudy",
    "Source",
    "Subscription",
    "User",
    "UserSession",
]
```

- [ ] **Step 2: Gerar a migration**

Run: `cd apps\api; .\.venv\Scripts\Activate.ps1; alembic revision --autogenerate -m "assinatura stripe"`

Isso cria `apps/api/alembic/versions/<hash>_assinatura_stripe.py` com `down_revision = "c82422c12c1d"` (o head atual). Abra o arquivo gerado e confirme que o corpo bate com o abaixo — o Alembic pode ordenar colunas/índices de forma um pouco diferente; o que importa é a tabela, os dois `UNIQUE` e o índice em `user_id`:

```python
def upgrade() -> None:
    op.create_table(
        "subscription",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("stripe_customer_id"),
        sa.UniqueConstraint("stripe_subscription_id"),
    )
    with op.batch_alter_table("subscription", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_subscription_user_id"), ["user_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("subscription", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_subscription_user_id"))
    op.drop_table("subscription")
```

Se o Alembic tiver gerado algo equivalente mas com nomes de constraint diferentes, mantenha os nomes que o Alembic escolheu — não renomeie à mão, o autogenerate é a fonte de verdade.

- [ ] **Step 3: Aplicar a migration e conferir**

Run: `python -m alembic upgrade head`
Expected: roda sem erro; `python -m alembic current` mostra o novo hash como head.

- [ ] **Step 4: Escrever o repository**

```python
# apps/api/app/repositories/subscription_repository.py
"""Data access for Subscription — sempre parametrizado, nunca SQL concatenado."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.subscription import Subscription


class SubscriptionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_user_id(self, user_id: int) -> Subscription | None:
        stmt = select(Subscription).where(Subscription.user_id == user_id)
        return self.db.execute(stmt).scalars().first()

    def get_by_stripe_customer_id(self, stripe_customer_id: str) -> Subscription | None:
        stmt = select(Subscription).where(
            Subscription.stripe_customer_id == stripe_customer_id
        )
        return self.db.execute(stmt).scalars().first()

    def create(
        self,
        *,
        user_id: int,
        stripe_customer_id: str,
        stripe_subscription_id: str | None,
        status: str,
    ) -> Subscription:
        now = datetime.now(UTC)
        subscription = Subscription(
            user_id=user_id,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            status=status,
            current_period_end=None,
            created_at=now,
            updated_at=now,
        )
        self.db.add(subscription)
        return subscription
```

- [ ] **Step 5: Escrever os testes do repository (falhando primeiro é imediato aqui — o arquivo ainda não existia)**

```python
# apps/api/app/tests/test_subscription_repository.py
"""SubscriptionRepository: acesso a dado puro, sem service por cima."""

from __future__ import annotations

from app.repositories.subscription_repository import SubscriptionRepository


def test_get_by_user_id_returns_none_when_absent(db_session, test_user):
    assert SubscriptionRepository(db_session).get_by_user_id(test_user.id) is None


def test_create_and_get_by_user_id_round_trips(db_session, test_user):
    repo = SubscriptionRepository(db_session)
    repo.create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="incomplete",
    )
    db_session.commit()

    subscription = repo.get_by_user_id(test_user.id)
    assert subscription is not None
    assert subscription.stripe_customer_id == "cus_123"
    assert subscription.status == "incomplete"


def test_get_by_stripe_customer_id_finds_the_matching_row(db_session, test_user):
    repo = SubscriptionRepository(db_session)
    repo.create(
        user_id=test_user.id,
        stripe_customer_id="cus_456",
        stripe_subscription_id=None,
        status="active",
    )
    db_session.commit()

    subscription = repo.get_by_stripe_customer_id("cus_456")
    assert subscription is not None
    assert subscription.user_id == test_user.id


def test_get_by_stripe_customer_id_returns_none_for_unknown_customer(db_session):
    assert SubscriptionRepository(db_session).get_by_stripe_customer_id("cus_nao_existe") is None
```

- [ ] **Step 6: Rodar os testes**

Run: `pytest app/tests/test_subscription_repository.py -v`
Expected: 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/models/subscription.py apps/api/app/models/__init__.py apps/api/alembic/versions apps/api/app/repositories/subscription_repository.py apps/api/app/tests/test_subscription_repository.py
git commit -m "feat(cobranca): modelo Subscription, migration e repository"
```

---

### Task 2: `SubscriptionRequiredError`, configuração do Stripe e `require_active_subscription`

**Files:**
- Modify: `apps/api/app/domain/errors.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/app/dependencies.py`
- Test: `apps/api/app/tests/test_dependencies.py` (novo arquivo — não existe hoje um arquivo de teste dedicado a `app/dependencies.py`)

**Interfaces:**
- Consumes: `SubscriptionRepository` (Task 1).
- Produces: `SubscriptionRequiredError` (`app.domain.errors`, → 403), `settings.stripe_enabled: bool`, `require_active_subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None` (`app.dependencies`) — levanta `SubscriptionRequiredError` quando não há assinatura `active`.

- [ ] **Step 1: Erro de domínio**

Em `apps/api/app/domain/errors.py`, ao lado de `AuthenticationError`:

```python
class SubscriptionRequiredError(DomainError):
    """Raised when a route needs an active subscription and the user has none."""
```

- [ ] **Step 2: Registrar o handler em `main.py`**

Ao lado de `_handle_authentication` (mesma seção "Domain-error to HTTP mapping"):

```python
@app.exception_handler(SubscriptionRequiredError)
async def _handle_subscription_required(_: Request, exc: SubscriptionRequiredError) -> JSONResponse:
    return _error_response(403, str(exc))
```

E adicionar `SubscriptionRequiredError` ao import existente de `app.domain.errors` no topo de `main.py`.

- [ ] **Step 3: Configuração**

Em `apps/api/app/config.py`, nova seção depois de `# --- Auth (A5) ... ---` e antes de `google_oauth_enabled`:

```python
    # --- Billing (Stripe) --------------------------------------------------
    # Vazio desliga a cobrança: toda rota de /billing responde 503, mesmo
    # padrão do Google OAuth quando faltam as credenciais. Sem default por
    # propósito, mesma razão de AI_BASE_URL — não existe chave que sirva
    # para o Stripe de outra pessoa.
    stripe_api_key: str = ""
    # Verifica a assinatura HMAC do cabeçalho Stripe-Signature no webhook;
    # sem ele, o endpoint recusa todo evento em vez de confiar num payload
    # não verificado.
    stripe_webhook_secret: str = ""
    # O preço/plano que o checkout usa — um único plano no v1, sem seletor
    # na interface.
    stripe_price_id: str = ""
```

E a propriedade computada, ao lado de `google_oauth_enabled`:

```python
    @property
    def stripe_enabled(self) -> bool:
        """True when Stripe is fully configured (key, webhook secret, and price)."""
        return bool(
            self.stripe_api_key.strip()
            and self.stripe_webhook_secret.strip()
            and self.stripe_price_id.strip()
        )
```

- [ ] **Step 4: Documentar em `.env.example`**

Seguir o bloco de comentários já usado para `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (leia o arquivo antes de editar para casar o estilo exato de comentário). Adicionar, na mesma seção de Auth ou em uma nova `# --- Billing (Stripe) ---`:

```
# STRIPE_API_KEY=
# STRIPE_WEBHOOK_SECRET=
# STRIPE_PRICE_ID=
# Sem as três, /billing/* responde 503 — mesmo padrão do Google OAuth.
# Nunca commite uma chave real; use uma chave de teste do Stripe (sk_test_...)
# em desenvolvimento.
```

- [ ] **Step 5: Dependência opcional do SDK**

Em `apps/api/pyproject.toml`, novo grupo em `[project.optional-dependencies]`, ao lado de `ai`:

```toml
# A cobrança é opcional como a camada de IA: sem STRIPE_API_KEY configurada
# nada importa o SDK de verdade (ver app/services/billing_service.py), e os
# testes usam sempre um cliente falso — CI nunca precisa deste extra.
billing = [
    "stripe>=10",
]
```

- [ ] **Step 6: A dependência**

Em `apps/api/app/dependencies.py`, ao lado de `get_current_project`:

```python
def require_active_subscription(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    subscription = SubscriptionRepository(db).get_by_user_id(user.id)
    if subscription is None or subscription.status != "active":
        raise SubscriptionRequiredError(
            "É necessária uma assinatura ativa para usar esta funcionalidade."
        )
```

Adicionar os imports necessários (`SubscriptionRepository` de `app.repositories.subscription_repository`, `SubscriptionRequiredError` de `app.domain.errors`) no topo do arquivo.

- [ ] **Step 7: Escrever o teste (falha primeiro — `test_dependencies.py` ainda não existe)**

```python
# apps/api/app/tests/test_dependencies.py
"""require_active_subscription: a extensão de get_current_user que checa cobrança."""

from __future__ import annotations

import pytest

from app.dependencies import require_active_subscription
from app.domain.errors import SubscriptionRequiredError
from app.repositories.subscription_repository import SubscriptionRepository


def test_raises_without_any_subscription_row(db_session, test_user):
    with pytest.raises(SubscriptionRequiredError):
        require_active_subscription(user=test_user, db=db_session)


def test_raises_when_subscription_is_not_active(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="past_due",
    )
    db_session.commit()
    with pytest.raises(SubscriptionRequiredError):
        require_active_subscription(user=test_user, db=db_session)


def test_passes_silently_when_subscription_is_active(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()
    assert require_active_subscription(user=test_user, db=db_session) is None
```

- [ ] **Step 8: Rodar os testes**

Run: `pytest app/tests/test_dependencies.py -v`
Expected: 3 PASS.

- [ ] **Step 9: Rodar lint/format**

Run: `ruff check app; black --check app`
Expected: sem erros. Se `black --check` reclamar, rode `black app` e reveja o diff antes de continuar.

- [ ] **Step 10: Commit**

```bash
git add apps/api/app/domain/errors.py apps/api/app/main.py apps/api/app/config.py apps/api/.env.example apps/api/pyproject.toml apps/api/app/dependencies.py apps/api/app/tests/test_dependencies.py
git commit -m "feat(cobranca): SubscriptionRequiredError, configuracao do Stripe e require_active_subscription"
```

---

### Task 3: `BillingService`

**Files:**
- Create: `apps/api/app/schemas/billing.py`
- Create: `apps/api/app/services/billing_service.py`
- Test: `apps/api/app/tests/test_billing_service.py`

**Interfaces:**
- Consumes: `SubscriptionRepository` (Task 1), `settings.stripe_enabled` (Task 2).
- Produces: `BillingStatusOut`, `CheckoutSessionOut`, `PortalSessionOut` (`app.schemas.billing`); `BillingService(db, *, stripe_module=None, settings=default_settings)` com `create_checkout_session(user) -> str`, `create_portal_session(user) -> str`, `status(user) -> BillingStatusOut`, `handle_webhook(payload: bytes, signature: str) -> None`.

- [ ] **Step 1: Schemas**

```python
# apps/api/app/schemas/billing.py
"""Contracts for the billing endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BillingStatusOut(BaseModel):
    """What the frontend gate reads to decide whether to show the paywall."""

    active: bool
    status: str | None
    current_period_end: datetime | None


class CheckoutSessionOut(BaseModel):
    url: str


class PortalSessionOut(BaseModel):
    url: str
```

- [ ] **Step 2: Escrever os testes primeiro (o service ainda não existe)**

```python
# apps/api/app/tests/test_billing_service.py
"""BillingService: cobrança orquestrada, Stripe sempre mockado.

Nenhum teste aqui importa o SDK real do Stripe — o `_FakeStripeClient`
implementa só os três caminhos (checkout.Session.create,
billing_portal.Session.create, Webhook.construct_event) que o service usa,
espelhando exatamente os mesmos nomes de atributo do módulo `stripe` de
verdade, para que trocar o fake pelo real não exija mudar nenhuma linha do
service.
"""

from __future__ import annotations

import pytest

from app.domain.errors import AuthenticationError, ServiceUnavailableError, ValidationError
from app.repositories.subscription_repository import SubscriptionRepository
from app.services import billing_service as billing_service_module
from app.services.billing_service import BillingService


class _FakeSession:
    def __init__(self, url: str) -> None:
        self.url = url


class _FakeStripeClient:
    def __init__(self) -> None:
        self.api_key: str | None = None
        self.created_checkout_kwargs: dict | None = None
        self.created_portal_kwargs: dict | None = None
        self.webhook_event: dict | None = None
        self.webhook_error: Exception | None = None
        client = self

        class _CheckoutSession:
            @staticmethod
            def create(**kwargs):
                client.created_checkout_kwargs = kwargs
                return _FakeSession("https://checkout.stripe.com/fake")

        class _Checkout:
            Session = _CheckoutSession

        class _PortalSession:
            @staticmethod
            def create(**kwargs):
                client.created_portal_kwargs = kwargs
                return _FakeSession("https://billing.stripe.com/fake")

        class _Portal:
            Session = _PortalSession

        class _Webhook:
            @staticmethod
            def construct_event(payload, signature, secret):
                if client.webhook_error is not None:
                    raise client.webhook_error
                return client.webhook_event

        self.checkout = _Checkout()
        self.billing_portal = _Portal()
        self.Webhook = _Webhook()


@pytest.fixture(autouse=True)
def _stripe_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing_service_module.settings, "stripe_api_key", "sk_test_123")
    monkeypatch.setattr(billing_service_module.settings, "stripe_webhook_secret", "whsec_123")
    monkeypatch.setattr(billing_service_module.settings, "stripe_price_id", "price_123")


def _service(db_session, stripe_client: _FakeStripeClient | None = None) -> BillingService:
    return BillingService(db_session, stripe_module=stripe_client or _FakeStripeClient())


# --- configuration ------------------------------------------------------


def test_raises_when_stripe_is_not_configured(db_session, monkeypatch, test_user):
    monkeypatch.setattr(billing_service_module.settings, "stripe_api_key", "")
    with pytest.raises(ServiceUnavailableError):
        _service(db_session).create_checkout_session(test_user)


# --- checkout -------------------------------------------------------------


def test_create_checkout_session_returns_the_stripe_url(db_session, test_user):
    fake = _FakeStripeClient()
    url = _service(db_session, fake).create_checkout_session(test_user)

    assert url == "https://checkout.stripe.com/fake"
    assert fake.created_checkout_kwargs["client_reference_id"] == str(test_user.id)
    assert fake.created_checkout_kwargs["customer_email"] == test_user.email
    assert fake.created_checkout_kwargs["line_items"] == [{"price": "price_123", "quantity": 1}]


def test_create_checkout_session_reuses_the_existing_stripe_customer(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_existing",
        stripe_subscription_id=None,
        status="incomplete",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    _service(db_session, fake).create_checkout_session(test_user)

    assert fake.created_checkout_kwargs["customer"] == "cus_existing"
    assert fake.created_checkout_kwargs["customer_email"] is None


# --- portal -----------------------------------------------------------


def test_create_portal_session_raises_without_an_existing_subscription(db_session, test_user):
    with pytest.raises(ValidationError):
        _service(db_session).create_portal_session(test_user)


def test_create_portal_session_returns_the_stripe_url(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id=None,
        status="incomplete",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    url = _service(db_session, fake).create_portal_session(test_user)

    assert url == "https://billing.stripe.com/fake"
    assert fake.created_portal_kwargs["customer"] == "cus_123"


# --- status -------------------------------------------------------------


def test_status_reports_inactive_without_any_subscription_row(db_session, test_user):
    result = _service(db_session).status(test_user)
    assert result.active is False
    assert result.status is None


def test_status_reports_active_for_an_active_subscription(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    result = _service(db_session).status(test_user)
    assert result.active is True
    assert result.status == "active"


# --- webhook: cada transição de status tem teste próprio (spec, secao 8) --


def test_webhook_rejects_an_invalid_signature(db_session):
    fake = _FakeStripeClient()
    fake.webhook_error = ValueError("assinatura invalida")
    with pytest.raises(AuthenticationError):
        _service(db_session, fake).handle_webhook(b"{}", "sig")


def test_webhook_checkout_completed_creates_an_active_subscription(db_session, test_user):
    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": str(test_user.id),
                "customer": "cus_123",
                "subscription": "sub_123",
            }
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription is not None
    assert subscription.status == "active"
    assert subscription.stripe_customer_id == "cus_123"
    assert subscription.stripe_subscription_id == "sub_123"


def test_webhook_subscription_updated_changes_status_and_period_end(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {"customer": "cus_123", "status": "past_due", "current_period_end": 1_750_000_000}
        },
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "past_due"
    assert subscription.current_period_end is not None


def test_webhook_subscription_deleted_sets_canceled(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_123", "status": "canceled", "current_period_end": None}},
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "canceled"


def test_webhook_payment_failed_marks_past_due(db_session, test_user):
    SubscriptionRepository(db_session).create(
        user_id=test_user.id,
        stripe_customer_id="cus_123",
        stripe_subscription_id="sub_123",
        status="active",
    )
    db_session.commit()

    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "invoice.payment_failed",
        "data": {"object": {"customer": "cus_123", "subscription": "sub_123"}},
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")

    subscription = SubscriptionRepository(db_session).get_by_user_id(test_user.id)
    assert subscription.status == "past_due"


def test_webhook_for_an_unknown_customer_is_a_no_op(db_session):
    fake = _FakeStripeClient()
    fake.webhook_event = {
        "type": "customer.subscription.updated",
        "data": {"object": {"customer": "cus_desconhecido", "status": "active", "current_period_end": None}},
    }
    _service(db_session, fake).handle_webhook(b"{}", "sig")  # does not raise
```

Run: `pytest app/tests/test_billing_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.billing_service'`.

- [ ] **Step 3: Implementar o service**

```python
# apps/api/app/services/billing_service.py
"""Orchestration of Stripe billing.

The Stripe SDK is isolated behind `stripe_module` the same way AuthService
isolates Google's verifier behind `verify_id_token` — production leaves it
unset and gets the real `stripe` package (imported lazily, only once
`stripe_enabled` is true); tests always inject a fake with the same
attribute paths, so the SDK's own network calls never run in CI.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import AuthenticationError, ServiceUnavailableError, ValidationError
from app.models.user import User
from app.repositories.subscription_repository import SubscriptionRepository
from app.schemas.billing import BillingStatusOut

# Transitions covered, one per Stripe event this service listens for:
#   checkout.session.completed    -> creates/activates the subscription
#   customer.subscription.updated -> mirrors whatever status Stripe reports
#   customer.subscription.deleted -> same handler; the payload's own status
#                                     ("canceled") already carries the meaning
#   invoice.payment_failed        -> forced to past_due, defensively, even if
#                                     the paired subscription.updated event
#                                     for the same failure has not landed yet


class BillingService:
    def __init__(
        self,
        db: Session,
        *,
        stripe_module: Any | None = None,
        settings: Settings = default_settings,
    ) -> None:
        self.db = db
        self.settings = settings
        self.subscriptions = SubscriptionRepository(db)
        self._stripe_module = stripe_module

    def _client(self) -> Any:
        if not self.settings.stripe_enabled:
            raise ServiceUnavailableError(
                "Cobranca via Stripe nao esta configurada neste servidor "
                "(STRIPE_API_KEY/STRIPE_WEBHOOK_SECRET/STRIPE_PRICE_ID ausentes)."
            )
        stripe_module = self._stripe_module
        if stripe_module is None:
            import stripe as stripe_module  # imported lazily: only when enabled
        stripe_module.api_key = self.settings.stripe_api_key
        return stripe_module

    # --- checkout / portal -------------------------------------------------

    def create_checkout_session(self, user: User) -> str:
        stripe_module = self._client()
        subscription = self.subscriptions.get_by_user_id(user.id)
        customer_id = subscription.stripe_customer_id if subscription else None
        session = stripe_module.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            customer_email=None if customer_id else user.email,
            line_items=[{"price": self.settings.stripe_price_id, "quantity": 1}],
            success_url=f"{self.settings.frontend_url}/assinatura?status=sucesso",
            cancel_url=f"{self.settings.frontend_url}/assinatura?status=cancelado",
            client_reference_id=str(user.id),
        )
        return session.url

    def create_portal_session(self, user: User) -> str:
        stripe_module = self._client()
        subscription = self.subscriptions.get_by_user_id(user.id)
        if subscription is None or not subscription.stripe_customer_id:
            raise ValidationError("Nenhuma assinatura encontrada para gerenciar.")
        session = stripe_module.billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=f"{self.settings.frontend_url}/assinatura",
        )
        return session.url

    # --- status -------------------------------------------------------------

    def status(self, user: User) -> BillingStatusOut:
        subscription = self.subscriptions.get_by_user_id(user.id)
        return BillingStatusOut(
            active=subscription is not None and subscription.status == "active",
            status=subscription.status if subscription else None,
            current_period_end=subscription.current_period_end if subscription else None,
        )

    # --- webhook -------------------------------------------------------------

    def handle_webhook(self, payload: bytes, signature: str) -> None:
        stripe_module = self._client()
        try:
            event = stripe_module.Webhook.construct_event(
                payload, signature, self.settings.stripe_webhook_secret
            )
        except Exception as exc:
            # Broad on purpose: different major versions of the Stripe SDK use
            # different exception hierarchies for a bad signature. What matters
            # here is that verification failed, not which subclass says so.
            raise AuthenticationError("Assinatura do webhook invalida.") from exc

        event_type = event["type"]
        data = event["data"]["object"]

        if event_type == "checkout.session.completed":
            self._on_checkout_completed(data)
        elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
            self._on_subscription_updated(data)
        elif event_type == "invoice.payment_failed":
            self._on_payment_failed(data)
        self.db.commit()

    def _on_checkout_completed(self, data: dict) -> None:
        user_id = int(data["client_reference_id"])
        subscription = self.subscriptions.get_by_user_id(user_id)
        if subscription is None:
            self.subscriptions.create(
                user_id=user_id,
                stripe_customer_id=data["customer"],
                stripe_subscription_id=data.get("subscription"),
                status="active",
            )
            return
        subscription.stripe_customer_id = data["customer"]
        subscription.stripe_subscription_id = data.get("subscription")
        subscription.status = "active"
        subscription.updated_at = datetime.now(UTC)

    def _on_subscription_updated(self, data: dict) -> None:
        subscription = self.subscriptions.get_by_stripe_customer_id(data["customer"])
        if subscription is None:
            return  # unknown customer; nothing in this database to reconcile
        subscription.status = data["status"]
        period_end = data.get("current_period_end")
        subscription.current_period_end = (
            datetime.fromtimestamp(period_end, tz=UTC) if period_end else None
        )
        subscription.updated_at = datetime.now(UTC)

    def _on_payment_failed(self, data: dict) -> None:
        subscription = self.subscriptions.get_by_stripe_customer_id(data["customer"])
        if subscription is None:
            return
        subscription.status = "past_due"
        subscription.updated_at = datetime.now(UTC)
```

- [ ] **Step 4: Rodar os testes**

Run: `pytest app/tests/test_billing_service.py -v`
Expected: 13 PASS.

- [ ] **Step 5: Lint/format**

Run: `ruff check app; black --check app`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/schemas/billing.py apps/api/app/services/billing_service.py apps/api/app/tests/test_billing_service.py
git commit -m "feat(cobranca): BillingService com cliente Stripe injetavel"
```

---

### Task 4: Router `/billing`, wiring em `main.py` e gate nos routers existentes

**Files:**
- Create: `apps/api/app/routers/billing.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/tests/conftest.py`
- Test: `apps/api/app/tests/test_billing_api.py`

**Interfaces:**
- Consumes: `BillingService` (Task 3), `require_active_subscription` (Task 2).
- Produces: rotas `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/status`, `POST /api/billing/webhook`; fixture nova `client_without_subscription` em `conftest.py`.

- [ ] **Step 1: Router**

```python
# apps/api/app/routers/billing.py
"""Stripe billing: checkout, customer portal, webhook, status.

Every route but the webhook requires login (`get_current_user`); none of them
depends on `require_active_subscription` on purpose — a user with no
subscription still needs `checkout` to be able to buy one, and `status` is
exactly what the frontend gate polls to decide whether to redirect to the
paywall in the first place (see app.main for where every OTHER router gets
the subscription gate, applied in bulk at include_router).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.billing import BillingStatusOut, CheckoutSessionOut, PortalSessionOut
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/checkout", response_model=CheckoutSessionOut)
def create_checkout(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CheckoutSessionOut:
    url = BillingService(db).create_checkout_session(user)
    return CheckoutSessionOut(url=url)


@router.post("/portal", response_model=PortalSessionOut)
def create_portal(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PortalSessionOut:
    url = BillingService(db).create_portal_session(user)
    return PortalSessionOut(url=url)


@router.get("/status", response_model=BillingStatusOut)
def billing_status(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> BillingStatusOut:
    return BillingService(db).status(user)


@router.post("/webhook", status_code=204)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> None:
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    BillingService(db).handle_webhook(payload, signature)
```

- [ ] **Step 2: Registrar em `main.py`**

Adicionar o import de `billing` ao bloco de imports de routers, e `Depends`/`require_active_subscription` se ainda não importados. Substituir o bloco final de `include_router` (hoje sem `dependencies=`) por:

```python
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(
    materials.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    classes.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    properties.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    imports.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    imports.templates_router,
    prefix="/api",
    dependencies=[Depends(require_active_subscription)],
)
app.include_router(
    selection.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    selection.indices_router,
    prefix="/api",
    dependencies=[Depends(require_active_subscription)],
)
app.include_router(
    charts.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(
    dashboard.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
app.include_router(ai.router, prefix="/api", dependencies=[Depends(require_active_subscription)])
app.include_router(
    exports.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
```

`health` e `auth` continuam sem a dependência — são as únicas rotas públicas hoje, e continuam sendo. `billing` fica sem a dependência de bloco porque cada rota dele decide sua própria regra (seção 5 do spec), como implementado no Step 1.

- [ ] **Step 3: Atualizar `conftest.py`**

A fixture `client` hoje só sobrescreve `get_db` e `get_current_user`; com o gate aplicado a quase todo router, `test_user` (que não tem nenhuma linha em `subscription`) faria **toda** a suíte de testes existentes falhar com 403. Sobrescrever `require_active_subscription` também, e acrescentar uma segunda fixture que não sobrescreve — para testar o próprio gate:

```python
from app.dependencies import get_current_user, require_active_subscription
```

No corpo de `client` (única mudança: uma linha a mais no `dependency_overrides`):

```python
@pytest.fixture()
def client(_connection: Connection, test_user: User) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        session = _session_for(_connection)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[require_active_subscription] = lambda: None
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

Nova fixture, logo abaixo de `client`:

```python
@pytest.fixture()
def client_without_subscription(
    _connection: Connection, test_user: User
) -> Generator[TestClient, None, None]:
    """Like `client`, but leaves `require_active_subscription` un-stubbed — for
    testing the 403 (or the 200 once a subscription exists) that a logged-in
    user without an active plan actually gets."""

    def _override_get_db() -> Generator[Session, None, None]:
        session = _session_for(_connection)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: test_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

`anon_client` não muda: uma requisição sem cookie já recebe 401 de `get_current_user` antes de `require_active_subscription` rodar (a mesma função é chamada nos dois lugares, e a primeira a levantar decide a resposta).

- [ ] **Step 4: Escrever os testes (falha primeiro para os que tocam código novo)**

```python
# apps/api/app/tests/test_billing_api.py
"""API tests for /billing/* and for the subscription gate applied to the
rest of the API (a representative route, /materials, stands in for "every
router registered with require_active_subscription" — the gate itself is
tested once in test_dependencies.py; this file proves the wiring in main.py
actually applies it).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.subscription import Subscription


def test_billing_status_reports_inactive_with_no_subscription(client):
    response = client.get("/api/billing/status")
    assert response.status_code == 200
    assert response.json() == {"active": False, "status": None, "current_period_end": None}


def test_billing_status_does_not_require_an_active_subscription(client_without_subscription):
    # This is the route the frontend polls to learn there is no subscription
    # yet — it must stay reachable precisely when the user has none.
    response = client_without_subscription.get("/api/billing/status")
    assert response.status_code == 200


def test_checkout_requires_login(anon_client):
    response = anon_client.post("/api/billing/checkout")
    assert response.status_code == 401


def test_checkout_without_stripe_configured_returns_503(client):
    # Default test settings never set STRIPE_API_KEY/WEBHOOK_SECRET/PRICE_ID.
    response = client.post("/api/billing/checkout")
    assert response.status_code == 503


def test_portal_without_stripe_configured_returns_503(client):
    response = client.post("/api/billing/portal")
    assert response.status_code == 503


def test_protected_route_without_active_subscription_is_forbidden(client_without_subscription):
    response = client_without_subscription.get("/api/materials")
    assert response.status_code == 403


def test_protected_route_with_active_subscription_succeeds(
    client_without_subscription, db_session, test_user
):
    db_session.add(
        Subscription(
            user_id=test_user.id,
            stripe_customer_id="cus_x",
            stripe_subscription_id="sub_x",
            status="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    response = client_without_subscription.get("/api/materials")
    assert response.status_code == 200


def test_health_route_stays_public(anon_client):
    response = anon_client.get("/api/health")
    assert response.status_code == 200
```

- [ ] **Step 5: Rodar os testes novos**

Run: `pytest app/tests/test_billing_api.py -v`
Expected: 8 PASS.

- [ ] **Step 6: Rodar a suíte inteira — a rede de segurança contra "todo mundo agora leva 403"**

Run: `pytest`
Expected: os 617 testes existentes continuam PASS (a sobrescrita de `require_active_subscription` em `client`, Step 3, é exatamente o que impede a regressão). Se algum teste fora de `test_billing_api.py`/`test_dependencies.py` começar a falhar com 403, ele está usando `client` sem passar pela fixture — corrija o teste para usar `client`, não `client_without_subscription`.

- [ ] **Step 7: Lint/format**

Run: `ruff check app; black --check app`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/routers/billing.py apps/api/app/main.py apps/api/app/tests/conftest.py apps/api/app/tests/test_billing_api.py
git commit -m "feat(cobranca): rotas de /billing e gate de assinatura ativa nos demais routers"
```

---

### Task 5: Contratos e cliente HTTP no frontend

**Files:**
- Modify: `packages/shared-types/index.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/lib/billing.ts`

**Interfaces:**
- Consumes: rotas `/api/billing/*` (Task 4).
- Produces: tipos `BillingStatus`, `CheckoutSession`, `PortalSession`; funções `getBillingStatus()`, `createCheckoutSession()`, `createPortalSession()` (`@/lib/api`); hook `useBillingStatus(options?: { enabled?: boolean })` (`@/lib/billing`).

- [ ] **Step 1: Tipos, nos dois arquivos (CLAUDE.md §4 — contrato duplicado conscientemente)**

Em `packages/shared-types/index.ts`, ao final do arquivo, depois de `CurrentUser`:

```typescript
// --- Billing (assinatura Stripe) --------------------------------------------

export interface BillingStatus {
  active: boolean;
  status: string | null;
  current_period_end: string | null;
}

export interface CheckoutSession {
  url: string;
}

export interface PortalSession {
  url: string;
}
```

A mesma adição, literal, em `apps/web/lib/types.ts` (mesmo bloco, mesma posição — ao final do arquivo, depois de `CurrentUser`).

- [ ] **Step 2: Funções do cliente HTTP**

Em `apps/web/lib/api.ts`, acrescentar `BillingStatus`, `CheckoutSession`, `PortalSession` ao bloco de `import type { ... } from "./types"` (ordem alfabética, como o resto da lista), e uma seção nova antes de `// --- Exports ---`:

```typescript
// --- Billing (assinatura Stripe) ---------------------------------------------

export function getBillingStatus(): Promise<BillingStatus> {
  return request<BillingStatus>(`/api/billing/status`);
}

export function createCheckoutSession(): Promise<CheckoutSession> {
  return request<CheckoutSession>(`/api/billing/checkout`, { method: "POST" });
}

export function createPortalSession(): Promise<PortalSession> {
  return request<PortalSession>(`/api/billing/portal`, { method: "POST" });
}
```

- [ ] **Step 3: O hook**

```typescript
// apps/web/lib/billing.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { getBillingStatus } from "./api";

/**
 * Queried once per session like `useCurrentUser` — the gate that redirects to
 * /assinatura reads this, and polling it on every navigation would cost a
 * request per page for state that only changes through a Stripe webhook.
 *
 * `enabled` exists so the gate can hold this query off until the session
 * check (`useCurrentUser`) has actually confirmed a login — a logged-out
 * visitor should only ever see one 401, not two side-by-side.
 */
export function useBillingStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    retry: false,
    enabled: options?.enabled ?? true,
  });
}
```

- [ ] **Step 4: Checar tipos**

Run: `cd apps\web; npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/index.ts apps/web/lib/types.ts apps/web/lib/api.ts apps/web/lib/billing.ts
git commit -m "feat(cobranca): contratos e cliente HTTP de /billing no frontend"
```

---

### Task 6: Gate de assinatura no `AuthGate` e rota `/assinatura`

**Files:**
- Modify: `apps/web/components/auth/AuthGate.tsx`
- Modify: `apps/web/components/auth/AuthGate.test.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Create: `apps/web/app/assinatura/page.tsx`

**Interfaces:**
- Consumes: `useBillingStatus` (Task 5), `createCheckoutSession`/`createPortalSession` (Task 5).
- Produces: `AuthGate` passa a redirecionar para `/assinatura` quando autenticado sem assinatura ativa; rota `/assinatura` com CTA de assinar/gerenciar.

- [ ] **Step 1: Textos em `apps/web/lib/i18n.ts`**

No bloco `auth`, acrescentar uma chave (mantendo as demais):

```typescript
  auth: {
    loginTitle: "Entrar",
    loginSubtitle: "Entre com sua conta Google para usar o MaterialSelect AI.",
    loginButton: "Entrar com Google",
    loginHint: "Usamos apenas seu nome, e-mail e foto do Google para identificar sua sessão.",
    checkingSession: "Verificando sessão…",
    checkingSubscription: "Verificando assinatura…",
    logout: "Sair",
    loggingOut: "Saindo…",
  },
```

Bloco novo, ao lado de `auth`:

```typescript
  billing: {
    title: "Assinatura",
    inactiveSubtitle: "Assine para continuar usando o MaterialSelect AI.",
    activeSubtitle: "Sua assinatura está ativa.",
    subscribeButton: "Assinar",
    manageButton: "Gerenciar assinatura",
    redirecting: "Redirecionando…",
  },
```

- [ ] **Step 2: Escrever os testes primeiro (o comportamento novo ainda não existe)**

Reescrever `apps/web/components/auth/AuthGate.test.tsx` por completo:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { ptBR } from "@/lib/i18n";
import type { BillingStatus, CurrentUser } from "@/lib/types";

const route = { pathname: "/" };
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: routerReplace }),
}));

const getCurrentUser = vi.fn();
const getBillingStatus = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  getCurrentUser: () => getCurrentUser(),
  getBillingStatus: () => getBillingStatus(),
}));

const { ApiError } = await import("@/lib/api");

const user: CurrentUser = {
  id: 1,
  email: "pesquisador@example.com",
  name: "Usuária de teste",
  avatar_url: null,
  project_id: 1,
};

const activeBilling: BillingStatus = { active: true, status: "active", current_period_end: null };
const inactiveBilling: BillingStatus = { active: false, status: null, current_period_end: null };

function renderGate(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthGate>{children}</AuthGate>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  route.pathname = "/";
  routerReplace.mockClear();
  getCurrentUser.mockReset();
  getBillingStatus.mockReset();
});

describe("AuthGate — sessão", () => {
  it("always renders /entrar, session check or not", () => {
    route.pathname = "/entrar";
    getCurrentUser.mockReturnValue(new Promise(() => {})); // never settles
    renderGate(<p>Formulário de login</p>);

    expect(screen.getByText("Formulário de login")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("holds the real page back while the session check is in flight", () => {
    getCurrentUser.mockReturnValue(new Promise(() => {}));
    renderGate(<p>Conteúdo protegido</p>);

    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.getByText(ptBR.auth.checkingSession)).toBeInTheDocument();
  });

  it("sends a logged-out visitor to /entrar", async () => {
    getCurrentUser.mockRejectedValue(new ApiError("Não autenticado.", 401));
    renderGate(<p>Conteúdo protegido</p>);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/entrar"));
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });
});

describe("AuthGate — assinatura", () => {
  it("always renders /assinatura once logged in, billing check or not", async () => {
    route.pathname = "/assinatura";
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockReturnValue(new Promise(() => {})); // never settles

    renderGate(<p>Tela de assinatura</p>);

    expect(await screen.findByText("Tela de assinatura")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("holds the real page back while the billing check is in flight", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockReturnValue(new Promise(() => {}));

    renderGate(<p>Conteúdo protegido</p>);

    await screen.findByText(ptBR.auth.checkingSubscription);
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });

  it("sends an unsubscribed user to /assinatura", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockResolvedValue(inactiveBilling);

    renderGate(<p>Conteúdo protegido</p>);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/assinatura"));
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });

  it("renders the real page for an active subscription", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockResolvedValue(activeBilling);

    renderGate(<p>Conteúdo protegido</p>);

    expect(await screen.findByText("Conteúdo protegido")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar os testes**

Run: `cd apps\web; npm run test -- AuthGate`
Expected: FAIL — `getBillingStatus` inexistente no mock real, `checkingSubscription` ainda não existe (a i18n do Step 1 já resolve essa parte), e `AuthGate` ainda não redireciona para `/assinatura`.

- [ ] **Step 4: Reescrever `AuthGate.tsx`**

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { useBillingStatus } from "@/lib/billing";
import { ptBR } from "@/lib/i18n";
import { ErrorState, LoadingState } from "@/components/ui";

/** The only route a logged-out visitor may reach. */
const LOGIN_ROUTE = "/entrar";
/** Reachable by a logged-in user with no active subscription. */
const BILLING_ROUTE = "/assinatura";

/**
 * Two-stage gate: `/auth/me` first (unauthenticated → /entrar), then
 * `/billing/status` (authenticated but not subscribed → /assinatura). Each
 * check is cached for the session by TanStack Query, so this costs two
 * requests on first load, not two per navigation — same shape the original
 * single-stage gate already had for login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === LOGIN_ROUTE;
  const isBillingRoute = pathname === BILLING_ROUTE;

  const {
    data: user,
    isLoading: userLoading,
    isError: userIsError,
    error: userError,
    refetch: refetchUser,
  } = useCurrentUser();
  const isUnauthenticated = userIsError && userError instanceof ApiError && userError.status === 401;

  // The billing query only means anything once a session is confirmed; while
  // `enabled` is false TanStack Query never fires it at all, so a logged-out
  // visitor never triggers a second 401 alongside /auth/me's.
  const billingEnabled = !!user && !isUnauthenticated;
  const {
    data: billing,
    isLoading: billingLoading,
    isError: billingIsError,
    refetch: refetchBilling,
  } = useBillingStatus({ enabled: billingEnabled });
  const isNotSubscribed = billingEnabled && !billingLoading && !billingIsError && billing?.active === false;

  useEffect(() => {
    if (!isLoginRoute && isUnauthenticated) {
      router.replace(LOGIN_ROUTE);
    }
  }, [isLoginRoute, isUnauthenticated, router]);

  useEffect(() => {
    if (!isLoginRoute && !isBillingRoute && isNotSubscribed) {
      router.replace(BILLING_ROUTE);
    }
  }, [isLoginRoute, isBillingRoute, isNotSubscribed, router]);

  if (isLoginRoute) return <>{children}</>;

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSession} />
      </div>
    );
  }

  if (isUnauthenticated) return null; // redirect above is in flight

  if (userIsError || !user) {
    return (
      <div className="p-4">
        <ErrorState onRetry={() => refetchUser()} />
      </div>
    );
  }

  if (isBillingRoute) return <>{children}</>;

  if (billingLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSubscription} />
      </div>
    );
  }

  if (isNotSubscribed) return null; // redirect above is in flight

  if (billingIsError) {
    return (
      <div className="p-4">
        <ErrorState onRetry={() => refetchBilling()} />
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Rodar os testes de novo**

Run: `cd apps\web; npm run test -- AuthGate`
Expected: PASS (7 testes).

- [ ] **Step 6: A rota `/assinatura`**

```tsx
// apps/web/app/assinatura/page.tsx
"use client";

import { useState } from "react";
import { createCheckoutSession, createPortalSession } from "@/lib/api";
import { useBillingStatus } from "@/lib/billing";
import { ptBR } from "@/lib/i18n";
import { Button, Card, CardBody, ErrorState, LoadingState } from "@/components/ui";

const t = ptBR.billing;

/**
 * The one route a logged-in-but-unsubscribed user may reach — same shape as
 * /entrar for a logged-out one (see AuthGate). Whether the CTA reads
 * "assinar" or "gerenciar" comes from /billing/status, never from a
 * client-side guess about what the user must already have.
 */
export default function BillingPage() {
  const { data, isLoading, isError, refetch } = useBillingStatus();
  const [redirecting, setRedirecting] = useState(false);

  async function handleCheckout() {
    setRedirecting(true);
    try {
      const session = await createCheckoutSession();
      window.location.href = session.url;
    } catch {
      setRedirecting(false);
    }
  }

  async function handlePortal() {
    setRedirecting(true);
    try {
      const session = await createPortalSession();
      window.location.href = session.url;
    } catch {
      setRedirecting(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
          <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
          {isLoading ? (
            <LoadingState label={ptBR.auth.checkingSubscription} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : data?.active ? (
            <>
              <p className="text-sm text-ink-muted">{t.activeSubtitle}</p>
              <Button variant="primary" onClick={handlePortal} disabled={redirecting}>
                {redirecting ? t.redirecting : t.manageButton}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t.inactiveSubtitle}</p>
              <Button variant="primary" onClick={handleCheckout} disabled={redirecting}>
                {redirecting ? t.redirecting : t.subscribeButton}
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Checar tudo**

Run: `cd apps\web; npm run typecheck; npm run lint; npm run test; npm run build`
Expected: os quatro passam sem erro.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/auth/AuthGate.tsx apps/web/components/auth/AuthGate.test.tsx apps/web/lib/i18n.ts apps/web/app/assinatura/page.tsx
git commit -m "feat(cobranca): gate de assinatura ativa no AuthGate e rota /assinatura"
```

---

## Self-Review

**1. Cobertura do spec:**
- Tabela de decisões de escopo (spec §1) — respeitada: nenhum `tenant_id`, nenhuma tabela `Organization`, catálogo intocado. ✓ (nenhuma task toca `Material`/`MaterialClass`/`PropertyDefinition`.)
- Modelo de dados (spec §3) — Task 1. ✓
- Middleware de acesso (spec §4) — Task 2 (a dependência) + Task 4 (wiring em bloco no `main.py`, mais barato que tocar 9 arquivos de router). ✓
- Rotas (spec §5, tabela) — Task 4: `checkout`/`status` só `get_current_user`, `portal` exige assinatura existente (`ValidationError` se não houver, testado), `webhook` público e verificado por assinatura HMAC. ✓
- Serviços e frontend (spec §6) — `BillingService`+`SubscriptionRepository` (Tasks 1/3), rota `/assinatura` com CTA de assinar/gerenciar (Task 6), gate no frontend mesmo padrão de `/entrar` (Task 6). ✓
- Variáveis de ambiente (spec §7) — Task 2, Step 4. ✓
- Testes (spec §8) — Stripe sempre mockado (`_FakeStripeClient`, Task 3); as quatro transições de webhook (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`) têm teste próprio. ✓
- Fora de escopo (spec §9) — nenhuma task introduz RLS, `Organization` ou seletor de plano. ✓

**2. Varredura de placeholder:** nenhum "TBD"/"implementar depois" nas tasks. O único valor não fixado de antemão é o hash da revision do Alembic — inevitável (o Alembic o gera), e a Task 1 mostra o conteúdo completo esperado do arquivo para o hash preencher.

**3. Consistência de tipos:** `BillingStatusOut`/`BillingStatus` usam os mesmos três campos (`active`, `status`, `current_period_end`) em schema Pydantic (Task 3), tipo TypeScript duplicado (Task 5) e teste de API (Task 4). `require_active_subscription` tem a mesma assinatura em `dependencies.py` (Task 2), no teste direto (Task 2) e no uso via `Depends` em `main.py` (Task 4). `client_without_subscription` é definida uma vez (Task 4) e usada consistentemente nos testes que a seguem.

**4. Risco já endereçado:** a Task 4 inclui, como step explícito (Step 6), rodar a suíte inteira depois de aplicar o gate em bloco — é o ponto em que, sem a sobrescrita em `conftest.py`, todos os 617 testes de backend existentes quebrariam com 403.

## Execução

Plano salvo em `docs/superpowers/plans/2026-08-18-multi-tenant-billing.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — um subagente novo por task, revisão entre tasks, iteração rápida.

**2. Inline Execution** — execução das tasks nesta sessão via `executing-plans`, em lote com checkpoints de revisão.

**Qual abordagem?**
