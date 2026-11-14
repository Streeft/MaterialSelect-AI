"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moveClass } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { MaterialClass } from "@/lib/types";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { Alert, Button, Dialog, Select, SelectOption } from "@/components/ui";

const t = curadoriaText.move;

/**
 * The classes that cannot be the new parent of `cls`: itself and everything under it.
 * It only hides them from the list — a move into one of them would close a cycle — and
 * the server refuses it anyway (`PATCH /api/classes/{id}`), so this is a courtesy and
 * not the rule.
 */
export function descendantIds(cls: MaterialClass, classes: MaterialClass[]): Set<number> {
  const blocked = new Set<number>([cls.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const other of classes) {
      if (other.parent_id !== null && blocked.has(other.parent_id) && !blocked.has(other.id)) {
        blocked.add(other.id);
        grew = true;
      }
    }
  }
  return blocked;
}

/**
 * "Mover para…" (D-233): pick the new parent in a list. A form with one select, so it works
 * from the keyboard and with a screen reader without any drag gesture; the move changes only
 * the parent and takes the subclasses along.
 */
export function MoveClassDialog({
  cls,
  classes,
  onClose,
}: {
  cls: MaterialClass | null;
  classes: MaterialClass[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={cls !== null}
      onClose={onClose}
      title={cls ? t.title(cls.name) : t.action}
      description={t.hint}
    >
      {cls ? <MoveForm key={cls.id} cls={cls} classes={classes} onClose={onClose} /> : null}
    </Dialog>
  );
}

function MoveForm({
  cls,
  classes,
  onClose,
}: {
  cls: MaterialClass;
  classes: MaterialClass[];
  onClose: () => void;
}) {
  const client = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [parent, setParent] = useState(cls.parent_id === null ? "" : String(cls.parent_id));
  const blocked = descendantIds(cls, classes);
  const targets = classes.filter((other) => !blocked.has(other.id));
  const next = parent === "" ? null : Number(parent);
  const unchanged = next === cls.parent_id;

  const move = useMutation({
    mutationFn: () => moveClass(cls.id, next),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["classes"] });
      const parentName = targets.find((other) => other.id === next)?.name ?? null;
      snackbar?.notify({ message: t.moved(cls.name, parentName) });
      onClose();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged) move.mutate();
      }}
    >
      <Select label={t.parentLabel} value={parent} onChange={(event) => setParent(event.target.value)}>
        <SelectOption value="">{t.toRoot}</SelectOption>
        {targets.map((other) => (
          <SelectOption key={other.id} value={String(other.id)}>
            {other.name}
          </SelectOption>
        ))}
      </Select>
      {unchanged ? <p className="text-caption text-ink-muted">{t.unchanged}</p> : null}
      {move.error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(move.error, t.failed)}
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {ptBR.actions.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={move.isPending} disabled={unchanged}>
          {t.confirm}
        </Button>
      </div>
    </form>
  );
}
