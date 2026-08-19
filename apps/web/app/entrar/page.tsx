import { googleLoginUrl } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { ButtonLink, Card, CardBody } from "@/components/ui";

const t = ptBR.auth;

/**
 * The only public route: a full-page redirect into Google, not a fetch — the
 * anchor navigates the whole browser, so the session cookie the callback sets
 * is visible on the very next request.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
          <h1 className="text-xl font-semibold text-ink">{t.loginTitle}</h1>
          <p className="text-sm text-ink-muted">{t.loginSubtitle}</p>
          <ButtonLink href={googleLoginUrl()} variant="primary">
            {t.loginButton}
          </ButtonLink>
          <p className="text-xs text-ink-subtle">{t.loginHint}</p>
        </CardBody>
      </Card>
    </div>
  );
}
