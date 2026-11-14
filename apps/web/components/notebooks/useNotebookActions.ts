"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { duplicateNotebook, updateNotebook } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { NOTEBOOKS_KEY, notebookKey } from "./keys";

const t = ptBR.notebooks;

/**
 * Rename, duplicate (with or without the conversation, D-233) and archive one notebook (D-218) — the verbs the list's
 * card and the notebook's own header share, so they cannot drift apart. Delete
 * stays with its callers: it navigates differently (D-130).
 *
 * Every verb ends by invalidating the lists (`NOTEBOOKS_KEY` is a prefix of
 * both the active and the archived one) and, where the server returns the
 * notebook, by seeding its own cache.
 */
export function useNotebookActions(
  notebook: { id: number; title: string; archived: boolean },
  { openCopy = false }: { openCopy?: boolean } = {},
) {
  const client = useQueryClient();
  const router = useRouter();
  const snackbar = useOptionalSnackbar();

  const rename = useMutation({
    mutationFn: (title: string) => updateNotebook(notebook.id, { title }),
    onSuccess: (updated) => {
      client.setQueryData(notebookKey(notebook.id), updated);
      void client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
    },
  });

  // D-233: `true` also carries the chat and the finished Studio items ("Duplicar com conversa").
  const duplicate = useMutation({
    mutationFn: (withConversation: boolean) => duplicateNotebook(notebook.id, withConversation),
    onSuccess: async (copy) => {
      client.setQueryData(notebookKey(copy.id), copy);
      await client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      if (openCopy) {
        router.push(`/app/cadernos/${copy.id}`);
        return;
      }
      snackbar?.notify({
        message: t.duplicated(copy.title),
        action: { label: t.open, onAction: () => router.push(`/app/cadernos/${copy.id}`) },
      });
    },
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => updateNotebook(notebook.id, { archived }),
    onSuccess: (updated, archived) => {
      client.setQueryData(notebookKey(notebook.id), updated);
      void client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      snackbar?.notify({
        message: archived ? t.archived(notebook.title) : t.unarchived(notebook.title),
        // "Desfazer" is the same verb the other way round.
        action: { label: ptBR.snackbar.undo, onAction: () => archive.mutate(!archived) },
      });
    },
  });

  return { rename, duplicate, archive };
}
