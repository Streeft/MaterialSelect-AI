import { ptBR } from "@/lib/i18n";
import { Card, CardBody } from "@/components/ui";

const f = ptBR.family;

/**
 * The two paragraphs a family record carries (P1-4), in both universes.
 *
 * One component for both because the question is identical — what is this
 * family, and where is it used — and because the rule that matters is the same
 * one: **`null` means nobody wrote it**, and that is rendered as a written
 * sentence, never as a blank panel. A blank would read as "this family has no
 * applications", which is a claim the catalogue never made (D-24).
 *
 * The card disappears entirely only when *neither* field was written, because a
 * card containing two "ninguém escreveu" lines tells the reader less than no
 * card at all — the absence is then the whole record, and the page's own
 * emptiness says it.
 */
export function FamilyProseCard({
  applications,
  characteristics,
}: {
  applications: string | null;
  characteristics: string | null;
}) {
  if (applications === null && characteristics === null) return null;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <Field label={f.characteristics} value={characteristics} />
        <Field label={f.applications} value={applications} />
      </CardBody>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</span>
      {value === null ? (
        <p className="max-w-prose text-sm italic text-ink-muted">{f.unwritten}</p>
      ) : (
        <p className="max-w-prose text-sm text-ink">{value}</p>
      )}
    </div>
  );
}
