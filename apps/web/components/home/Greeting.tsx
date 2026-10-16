"use client";

import { useCurrentUser } from "@/lib/auth";
import { ptBR } from "@/lib/i18n";

/**
 * "Olá, Maria." — only when the account actually has a name (D-132).
 *
 * Google may hand over an empty display name, and a made-up one ("Olá,
 * usuário") would be a small invention of the kind the app refuses elsewhere.
 * With no name, nothing is drawn: no placeholder, no empty line.
 */
export function Greeting() {
  const { data } = useCurrentUser();
  const first = data?.name?.trim().split(/\s+/)[0];
  if (!first) return null;
  return <p className="text-support text-ink-muted">{ptBR.home.greeting(first)}</p>;
}
