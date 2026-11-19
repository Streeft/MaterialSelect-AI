"use client";

import { useParams } from "next/navigation";
import { ProjectWorkspace } from "@/components/projects/ProjectWorkspace";
import { ErrorState } from "@/components/ui";
import { ptBR } from "@/lib/i18n";

/** One project (D-257). The id comes from the URL; a project that is not the reader's own
 * answers 404, which the workspace says in words. */
export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return <ErrorState title={ptBR.projects.notFound} description={ptBR.projects.notFoundHint} />;
  }
  return <ProjectWorkspace id={id} />;
}
