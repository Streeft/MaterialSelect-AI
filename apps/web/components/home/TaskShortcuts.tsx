import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { Section } from "@/components/ui";

const t = ptBR.home;

/** What someone comes to do, each a link to the tool that does it (D-221). */
export function TaskShortcuts() {
  return (
    <Section title={t.tasksTitle}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {t.tasks.map((task) => (
          <li key={task.href}>
            <Link
              href={task.href}
              data-interactive="true"
              className="msds-card flex h-full min-w-0 flex-col gap-1 p-4"
            >
              <span className="text-body font-medium text-ink">{task.label}</span>
              <span className="break-words text-caption text-ink-muted">{task.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
