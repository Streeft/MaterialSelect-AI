"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createNotebook } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { FabMenu } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { NOTEBOOKS_KEY, notebookKey } from "@/components/notebooks/keys";

const t = ptBR.home.newMenu;

/**
 * "Novo" (D-195): the home's FAB menu (m3.material.io › Components › FAB menu),
 * the things a reader creates, one gesture away. It sits in the corner above the
 * phone's bottom bar. Tonal at rest, so the composer stays the page's one
 * primary action (D-91). A notebook is created here and opened, as the button
 * on Cadernos does; the other two open the screen where they are made.
 */
export function NewMenu() {
  const router = useRouter();
  const client = useQueryClient();
  const { notify } = useSnackbar();
  const notebook = useMutation({
    mutationFn: () => createNotebook(),
    onSuccess: async (created) => {
      client.setQueryData(notebookKey(created.id), created);
      await client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
      router.push(`/app/cadernos/${created.id}`);
    },
    // The snackbar is a polite live region already: no second announcement.
    onError: () => notify({ message: t.notebookError }),
  });

  return (
    <div className="m3-home-fab">
      <FabMenu
        label={t.label}
        actions={[
          { label: t.study, onSelect: () => router.push("/app/selecao") },
          { label: t.material, onSelect: () => router.push("/app/materiais/novo") },
          { label: t.notebook, onSelect: () => notebook.mutate() },
        ]}
      />
    </div>
  );
}
