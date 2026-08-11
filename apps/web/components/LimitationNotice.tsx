import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Alert } from "@/components/ui";

const t = ptBR.limitation;

/**
 * The limitation-of-use notice.
 *
 * Item 5 of the proposal commits to it, and `app/exporters/report.py` already
 * puts it on every exported file. It was missing from the screen — so the claim
 * only held for a reader who exported something. `lib/i18n.test.ts` pins this
 * text to the exporter's, byte for byte, so the two surfaces cannot drift.
 *
 * It is never dismissible: a notice the reader can close is a notice the reader
 * closes once and never sees again, which is the same as not having one.
 */
export function LimitationNotice({
  variant = "block",
  className,
}: {
  /** `block` states it in full; `footer` is the persistent one-liner. */
  variant?: "block" | "footer";
  className?: string;
}) {
  if (variant === "footer") {
    return (
      <p className={cn("text-2xs text-ink-subtle", className)}>
        <span className="font-medium text-ink-muted">{t.title}:</span> {t.full}
      </p>
    );
  }

  return (
    <Alert tone="info" title={t.title} className={className}>
      {t.full}
    </Alert>
  );
}
