"use client";

import { ButtonLink } from "@/components/ui";
import { laudoText } from "@/lib/i18n-laudo";

/**
 * The way into one saved study's engineering report (D-241, revising D-41).
 *
 * The laudo used to be a single link with the responsible engineer typed next
 * to it. Issuing a frozen, verifiable version needs more than a name — title,
 * registration, ART, city and date, the client, the part mass — so the link now
 * opens the laudo screen (`/app/selecao/laudo`), where the form, the preview
 * and the issued versions live together.
 */
export function EngineeringReportLink({
  studyId,
  onNavigate,
}: {
  studyId: number;
  /** Called before leaving: "Meus estudos" closes its side panel. */
  onNavigate?: () => void;
}) {
  return (
    <ButtonLink
      href={`/app/selecao/laudo?estudo=${studyId}`}
      size="sm"
      variant="tonal"
      title={laudoText.linkHint}
      onClick={onNavigate}
    >
      {laudoText.linkLabel}
    </ButtonLink>
  );
}
