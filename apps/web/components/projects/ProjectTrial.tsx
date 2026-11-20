"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssemblyTrial } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { AssemblyTrial, PartTrialStatus, TrialVerdict } from "@/lib/types";
import { useAnnounce } from "@/components/ui/Announcer";
import { Badge, Button, ErrorState, LoadingState, type BadgeTone } from "@/components/ui";
import { assemblyKey } from "./keys";

const t = ptBR.projects.trial;

/** Colour follows the verdict; the words beside it are what says it (never colour alone). */
const TONE: Record<PartTrialStatus, BadgeTone> = {
  passa: "success",
  falha: "danger",
  sem_dado: "warning",
  sem_material: "neutral",
  material_indisponivel: "warning",
  sem_estudo: "neutral",
  sem_requisitos: "neutral",
};
const VERDICT_TONE: Record<TrialVerdict, BadgeTone> = { passa: "success", falha: "danger", sem_dado: "warning" };

/**
 * The trial of a project (D-260): each part's material against the requirements of its study.
 *
 * It prints the server's answer and nothing else — every verdict, label, count and sentence
 * comes in `GET /api/assemblies/{id}/trial`. The trial is asked for (a bench test is something
 * one runs), and once asked it follows the project: `stamp` changes with every write, and the
 * answer is asked again. Nothing is stored, here or there.
 */
export function ProjectTrial({ assemblyId, stamp, hasParts }: { assemblyId: number; stamp: string; hasParts: boolean }) {
  const [asked, setAsked] = useState(false);
  const announce = useAnnounce();
  const trial = useQuery({
    queryKey: [...assemblyKey(assemblyId), "trial", stamp],
    queryFn: async () => {
      const answer = await getAssemblyTrial(assemblyId);
      announce(t.announce(answer.verdict_label, answer.summary));
      return answer;
    },
    enabled: asked && hasParts,
    retry: false,
    // A study or the catalogue may have changed since: "Ensaiar de novo" always asks.
    staleTime: 0,
    placeholderData: (previous) => previous,
  });

  if (!hasParts) return <p className="text-support text-ink-muted">{t.empty}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          loading={trial.isFetching}
          onClick={() => {
            if (asked) void trial.refetch();
            else setAsked(true);
          }}
        >
          {asked ? t.again : t.run}
        </Button>
        <p className="min-w-0 flex-1 basis-64 text-support text-ink-muted">{t.hint}</p>
      </div>
      {trial.isLoading ? <LoadingState label={t.running} /> : null}
      {trial.isError ? <ErrorState title={t.error} error={trial.error} onRetry={() => void trial.refetch()} /> : null}
      {trial.data ? <TrialResult trial={trial.data} /> : null}
    </div>
  );
}

function TrialResult({ trial }: { trial: AssemblyTrial }) {
  return (
    <section aria-label={t.result} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="ds-trial-stamp" data-solved={trial.solved}>
          {trial.verdict_label}
        </span>
        <p className="min-w-0 flex-1 basis-48 text-body text-ink">{trial.summary}</p>
      </div>
      <ul aria-label={t.partsLabel} className="flex flex-col gap-3">
        {trial.parts.map((part) => (
          <li key={part.part_id} className="flex flex-col gap-2 rounded-card border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-body font-semibold text-ink">{part.name}</h3>
              <Badge tone={TONE[part.status]}>{part.status_label}</Badge>
            </div>
            {part.material_name || part.study ? (
              <p className="text-support text-ink-muted">
                {part.material_name ? t.with(part.material_name) : null}
                {part.material_name && part.study ? ", " : null}
                {part.study ? (
                  <Link
                    href={`/app/selecao?estudo=${part.study.id}`}
                    aria-label={t.openStudy(part.study.name)}
                    className="font-semibold text-brand-700 underline"
                  >
                    {t.against(part.study.name)}
                  </Link>
                ) : null}
              </p>
            ) : null}
            {part.reason ? <p className="text-support text-ink">{part.reason}</p> : null}
            {part.requirements.length > 0 ? (
              <ul aria-label={t.requirementsOf(part.name)} className="flex flex-col">
                {part.requirements.map((requirement, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line py-2"
                  >
                    <span className="min-w-0 break-words text-body text-ink">{requirement.label}</span>
                    <Badge tone={VERDICT_TONE[requirement.verdict]}>{requirement.verdict_label}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-muted">{trial.method_note}</p>
    </section>
  );
}
