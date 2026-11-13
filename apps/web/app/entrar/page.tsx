import Link from "next/link";
import { Suspense } from "react";
import { googleLoginUrl } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui";
import { EntryFrame } from "@/components/marketing/EntryFrame";
import { LoginErrorNotice } from "./LoginErrorNotice";

const t = ptBR.auth;

/**
 * The only public route: a full-page redirect into Google, not a fetch — the
 * anchor navigates the whole browser, so the session cookie the callback sets
 * is visible on the very next request. A failed attempt comes back here with
 * `?erro=<code>` (D-198): the notice says why, and the same button retries.
 *
 * D-236: split screen (`EntryFrame`); the privacy note is support text under
 * the button, and the way back to the landing sits above the title.
 */
export default function LoginPage() {
  return (
    <EntryFrame>
      <Link href="/" className="w-fit text-caption text-ink-muted underline">
        {t.loginBack}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-display text-ink">{t.loginTitle}</h1>
        <p className="text-body text-ink-muted">{t.loginSubtitle}</p>
      </div>
      <Suspense fallback={null}>
        <LoginErrorNotice />
      </Suspense>
      <ButtonLink href={googleLoginUrl()} variant="primary" className="w-full justify-center">
        {t.loginButton}
      </ButtonLink>
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-muted">{t.loginAccess}</p>
        <p className="text-caption text-ink-subtle">{t.loginHint}</p>
      </div>
    </EntryFrame>
  );
}
