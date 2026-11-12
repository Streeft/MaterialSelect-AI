import Link from "next/link";
import { Suspense } from "react";
import { googleLoginUrl } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { ButtonLink, Card, CardBody } from "@/components/ui";
import { LoginErrorNotice } from "./LoginErrorNotice";

const t = ptBR.auth;

/**
 * The only public route: a full-page redirect into Google, not a fetch — the
 * anchor navigates the whole browser, so the session cookie the callback sets
 * is visible on the very next request. A failed attempt comes back here with
 * `?erro=<code>` (D-198): the notice says why, and the same button retries.
 */
export default function LoginPage() {
  return (
    // D-202: outside the app shell, so the page brings its own `<main>` landmark.
    <main id="conteudo" className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
          <h1 className="text-xl font-semibold text-ink">{t.loginTitle}</h1>
          <p className="text-body text-ink-muted">{t.loginSubtitle}</p>
          <Suspense fallback={null}>
            <LoginErrorNotice />
          </Suspense>
          <ButtonLink href={googleLoginUrl()} variant="primary">
            {t.loginButton}
          </ButtonLink>
          <p className="text-caption text-ink-muted">{t.loginAccess}</p>
          <p className="text-caption text-ink-subtle">{t.loginHint}</p>
          <Link href="/" className="text-caption text-accent underline">
            {t.loginBack}
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
