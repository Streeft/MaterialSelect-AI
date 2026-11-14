"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchProperty } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { prettyUnit } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { PropertyDefinition } from "@/lib/types";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { Alert, Button, Dialog, Input, Select, SelectOption, Textarea } from "@/components/ui";

const t = curadoriaText.editProperty;
const NAME_MAX = 160;
const DESCRIPTION_MAX = 500;

/**
 * Edit a property's name, description and reading unit (D-233) — the three things that change
 * no stored number. The slug, the dimension and the canonical unit are shown as fixed in the
 * dialog's note, and the request carries only the fields that changed.
 */
export function EditPropertyDialog({
  property,
  onClose,
}: {
  property: PropertyDefinition | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={property !== null}
      onClose={onClose}
      title={property ? t.title(property.name) : t.action}
      description={t.fixedNote}
    >
      {property ? <EditForm key={property.id} property={property} onClose={onClose} /> : null}
    </Dialog>
  );
}

function EditForm({ property, onClose }: { property: PropertyDefinition; onClose: () => void }) {
  const client = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [name, setName] = useState(property.name);
  const [description, setDescription] = useState(property.description ?? "");
  const [displayUnit, setDisplayUnit] = useState(property.display_unit ?? "");
  const [submitted, setSubmitted] = useState(false);

  const nameError = !name.trim() ? ptBR.admin.errorNameRequired : undefined;
  const dirty =
    name.trim() !== property.name ||
    description.trim() !== (property.description ?? "") ||
    displayUnit !== (property.display_unit ?? "");

  const save = useMutation({
    mutationFn: () =>
      patchProperty(property.id, {
        // Only what changed: a field left out is left alone by the server.
        ...(name.trim() !== property.name ? { name: name.trim() } : {}),
        ...(description.trim() !== (property.description ?? "")
          ? { description: description.trim() || null }
          : {}),
        ...(displayUnit !== (property.display_unit ?? "")
          ? { display_unit: displayUnit || null }
          : {}),
      }),
    onSuccess: (updated) => {
      void client.invalidateQueries({ queryKey: ["properties"] });
      snackbar?.notify({ message: t.saved(updated.name) });
      onClose();
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (nameError || !dirty) return;
        save.mutate();
      }}
    >
      <Input
        label={ptBR.form.name}
        value={name}
        maxLength={NAME_MAX}
        required
        error={submitted ? nameError : undefined}
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        label={ptBR.form.description}
        rows={3}
        maxLength={DESCRIPTION_MAX}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Select
        label={t.displayUnit}
        hint={t.displayUnitHint}
        value={displayUnit}
        onChange={(event) => setDisplayUnit(event.target.value)}
      >
        <SelectOption value="">{t.displayUnitNone}</SelectOption>
        {property.accepted_units.map((unit) => (
          <SelectOption key={unit} value={unit}>
            {prettyUnit(unit)}
          </SelectOption>
        ))}
      </Select>
      {save.error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(save.error, t.failed)}
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {ptBR.actions.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
