"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Notebook, NotebookChatGoal, NotebookResponseLength } from "@/lib/types";
import { updateNotebook } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Dialog,
  Fieldset,
  RadioCard,
  Textarea,
} from "@/components/ui";
import { notebookKey } from "./keys";

const t = ptBR.notebooks;
const GOALS: NotebookChatGoal[] = ["padrao", "guia", "personalizado"];
const LENGTHS: NotebookResponseLength[] = ["curta", "padrao", "longa"];

/** "Configurar conversa": how the chat answers. The citation and number rules
 * are the backend's and are not a setting. */
export function NotebookSettingsDialog({
  notebook,
  open,
  onClose,
}: {
  notebook: Notebook;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={t.settings} description={t.settingsDescription}>
      {open ? <SettingsForm notebook={notebook} onClose={onClose} /> : null}
    </Dialog>
  );
}

function SettingsForm({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const client = useQueryClient();
  const [goal, setGoal] = useState<NotebookChatGoal>(notebook.chat_goal);
  const [instructions, setInstructions] = useState(notebook.chat_instructions ?? "");
  const [length, setLength] = useState<NotebookResponseLength>(notebook.response_length);
  const save = useMutation({
    mutationFn: () =>
      updateNotebook(notebook.id, { chat_goal: goal, chat_instructions: instructions, response_length: length }),
    onSuccess: (updated) => {
      client.setQueryData(notebookKey(notebook.id), updated);
      onClose();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Fieldset legend={t.goal}>
        <div className="grid gap-2 sm:grid-cols-3">
          {GOALS.map((id) => (
            <RadioCard
              key={id}
              name="objetivo"
              value={id}
              checked={goal === id}
              onChange={(value) => setGoal(value as NotebookChatGoal)}
              title={t.goals[id].title}
            >
              {t.goals[id].description}
            </RadioCard>
          ))}
        </div>
      </Fieldset>
      {goal === "personalizado" ? (
        <Textarea
          label={t.instructions}
          hint={t.instructionsHint}
          required
          rows={4}
          maxLength={4000}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t.length}</span>
        <ButtonGroup label={t.length}>
          {LENGTHS.map((id) => (
            <ButtonGroupItem
              key={id}
              selected={length === id}
              label={t.lengths[id]}
              onClick={() => setLength(id)}
            />
          ))}
        </ButtonGroup>
      </div>
      {save.error ? (
        <Alert tone="danger" role="alert">
          {save.error.message}
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
