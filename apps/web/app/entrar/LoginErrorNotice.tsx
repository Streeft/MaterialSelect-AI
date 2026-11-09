"use client";

import { useSearchParams } from "next/navigation";
import { ptBR } from "@/lib/i18n";
import { Alert } from "@/components/ui";

const t = ptBR.auth;

type LoginErrorCode = keyof typeof t.loginErrors;

function isLoginErrorCode(value: string): value is LoginErrorCode {
  return Object.prototype.hasOwnProperty.call(t.loginErrors, value);
}

/**
 * Why the last login did not finish (D-198). The API's Google callback never
 * answers with an error page: it sends the browser back here with
 * `?erro=<code>`. An unknown code still says something went wrong, never
 * nothing — the student only knows the login did not work.
 */
export function LoginErrorNotice() {
  const code = useSearchParams()?.get("erro");
  if (!code) return null;
  const message = t.loginErrors[isLoginErrorCode(code) ? code : "falha"];
  return (
    <Alert tone="warning" role="alert" title={t.loginErrorTitle} className="w-full text-left">
      <p>{message}</p>
      <p>{t.loginRetry}</p>
    </Alert>
  );
}
