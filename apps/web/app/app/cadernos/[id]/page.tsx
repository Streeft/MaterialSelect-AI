"use client";

import { useParams } from "next/navigation";
import { NotebookWorkspace } from "@/components/notebooks/NotebookWorkspace";
import { ErrorState } from "@/components/ui";

/** One notebook (D-90). The id comes from the URL; a notebook that is not the
 * reader's own answers 404, which the workspace shows as an error. */
export default function NotebookPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) return <ErrorState />;
  return <NotebookWorkspace id={id} />;
}
