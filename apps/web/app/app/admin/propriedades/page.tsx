"use client";

import { describeApiError } from "@/lib/errors";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import {
  createProperty,
  deleteProperty,
  listProperties,
} from "@/lib/api";
import { dimensionName } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import type { PropertyCategory, PropertyDefinition, SuggestAction } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  ConfirmDialog,
  Checkbox,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  RowHeader,
  Select,
  SelectOption,
  Textarea,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { CatalogReadOnlyNotice } from "@/components/auth/CatalogReadOnlyNotice";
import { AISuggestPanel } from "@/components/ai/AISuggestPanel";
import { aiField, revealField } from "@/lib/ai/revealField";
import { suggestText } from "@/lib/i18n-suggest";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { EditPropertyDialog } from "@/components/admin/EditPropertyDialog";

/** The server's limits for what it is told (D-228): a longer text would be refused, not cut. */
const NAME_MAX = 120;
const UNIT_MAX = 60;
const DESCRIPTION_MAX = 2000;

const CATEGORIES: PropertyCategory[] = [
  "FISICA",
  "MECANICA",
  "TERMICA",
  "ELETRICA",
  "AMBIENTAL",
  "ECONOMICA",
];

export default function PropertiesAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PropertyCategory>("MECANICA");
  const [canonicalUnit, setCanonicalUnit] = useState("");
  const [physicalDimension, setPhysicalDimension] = useState("");
  const [acceptedUnits, setAcceptedUnits] = useState("");
  const [description, setDescription] = useState("");
  const [isInterval, setIsInterval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const undoable = useUndoableDelete();

  const create = useMutation({
    mutationFn: () =>
      createProperty({
        name,
        category,
        canonical_unit: canonicalUnit,
        description: description.trim() || null,
        physical_dimension: physicalDimension,
        accepted_units: acceptedUnits
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean),
        is_interval: isInterval,
        better_direction: "NEUTRAL",
        allows_log_scale: true,
      }),
    onSuccess: () => {
      setName("");
      setCanonicalUnit("");
      setPhysicalDimension("");
      setAcceptedUnits("");
      setDescription("");
      setIsInterval(false);
      setError(null);
      setSubmitted(false);
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (err) => setError(describeApiError(err, ptBR.form.genericError)),
  });

  // D-201 asks first; D-130's "Desfazer" holds the final call back for a few seconds.
  function removeProperty(target: { id: number; name: string }) {
    undoable({
      what: ptBR.admin.deletedProperty,
      hide: [{ queryKey: ["properties"], remove: withoutId(target.id) }],
      commit: () => deleteProperty(target.id),
    });
  }

  // D-201: the row awaiting delete confirmation (MSDS dialog; deletion is permanent).
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // D-233: the property being edited (name, description, reading unit).
  const [editing, setEditing] = useState<PropertyDefinition | null>(null);

  const properties: PropertyDefinition[] = data ?? [];

  const sameName = (a: string, b: string) =>
    a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
  // D-230b: the proposed description goes into the form's field and nothing more —
  // it is not saved; the person reads it, edits it and presses the button.
  const acceptsAiAction = (action: SuggestAction) =>
    action.type !== "fill_text" || action.field === "description";
  function applyAiAction(action: SuggestAction) {
    if (action.type !== "fill_text" || action.field !== "description") return;
    setDescription(action.text.slice(0, DESCRIPTION_MAX));
    revealField("description");
  }

  const nameError = !name.trim()
    ? ptBR.admin.errorNameRequired
    : properties.some((p) => sameName(p.name, name))
      ? ptBR.admin.errorPropertyDuplicate
      : undefined;
  const unitError = !canonicalUnit.trim() ? ptBR.admin.errorUnitRequired : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={ptBR.admin.propertiesTitle} />
      <CatalogReadOnlyNotice />

      <AISuggestPanel
        tool="admin_propriedades"
        // What the form holds now: the server reads the catalogue's properties itself.
        context={{
          name: name.trim().slice(0, NAME_MAX),
          ...(canonicalUnit.trim() ? { canonical_unit: canonicalUnit.trim().slice(0, UNIT_MAX) } : {}),
          description: description.slice(0, DESCRIPTION_MAX),
        }}
        actions={["fill_text", "open_route"]}
        accepts={acceptsAiAction}
        onAction={applyAiAction}
        disabledReason={name.trim() ? undefined : suggestText.needsName}
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (nameError || unitError) return;
          create.mutate();
        }}
      >
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <Input
              label={ptBR.form.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              error={submitted ? nameError : undefined}
            />
            <Select
              label={ptBR.admin.category}
              value={category}
              onChange={(e) => setCategory(e.target.value as PropertyCategory)}
            >
              {CATEGORIES.map((c) => (
                <SelectOption key={c} value={c}>
                  {ptBR.categories[c]}
                </SelectOption>
              ))}
            </Select>
            <Input
              label={ptBR.admin.canonicalUnit}
              value={canonicalUnit}
              onChange={(e) => setCanonicalUnit(e.target.value)}
              required
              error={submitted ? unitError : undefined}
              placeholder="ex.: Pa"
            />
            <Input
              label={ptBR.admin.physicalDimension}
              value={physicalDimension}
              onChange={(e) => setPhysicalDimension(e.target.value)}
              placeholder="ex.: [mass] / [length] / [time] ** 2"
            />
            <Input
              label={ptBR.admin.acceptedUnits}
              value={acceptedUnits}
              onChange={(e) => setAcceptedUnits(e.target.value)}
              placeholder="Pa, MPa, GPa"
            />
            <Checkbox
              label={ptBR.admin.isInterval}
              checked={isInterval}
              onChange={(e) => setIsInterval(e.target.checked)}
              className="self-end pb-2"
            />
            <Textarea
              label={ptBR.form.description}
              className="sm:col-span-3"
              rows={2}
              maxLength={DESCRIPTION_MAX}
              value={description}
              {...aiField("description")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </CardBody>
          <CardFooter>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {ptBR.admin.newProperty}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {isLoading && <LoadingState label={ptBR.catalog.loading} />}
      {isError && (
        <ErrorState title={ptBR.catalog.error} onRetry={() => void refetch()} />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete
            ? ptBR.admin.confirmDeleteProperty(pendingDelete.name)
            : ""
        }
        message={ptBR.admin.confirmDeleteBody}
        confirmLabel={ptBR.actions.delete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeProperty(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <EditPropertyDialog property={editing} onClose={() => setEditing(null)} />

      {data && (
        <TableScroll label={ptBR.admin.propertiesTitle}>
          <Table>
            <TableCaption>{ptBR.admin.propertiesTitle}</TableCaption>
            <THead>
              <Tr>
                <Th>{ptBR.form.name}</Th>
                <Th>{ptBR.admin.category}</Th>
                <Th>{ptBR.admin.canonicalUnit}</Th>
                <Th numeric>{ptBR.admin.valueCount}</Th>
                <Th>
                  <span className="sr-only">{ptBR.actions.columnActions}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {properties.map((p) => (
                <Tr key={p.id}>
                  <RowHeader>
                    {p.name}
                    {p.symbol && (
                      <span className="ml-1 text-ink-subtle">({p.symbol})</span>
                    )}
                  </RowHeader>
                  <Td className="text-ink-muted">
                    {ptBR.categories[p.category]}
                  </Td>
                  {/* D-205: "MPa·m^0.5" and "dimensionless" are how the Pint spells them. */}
                  <Td className="text-ink-muted">{dimensionName(p.canonical_unit)}</Td>
                  <Td numeric className="text-ink-muted">
                    {p.value_count}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(p)}
                      aria-label={curadoriaText.editProperty.actionFor(p.name)}
                    >
                      {curadoriaText.editProperty.action}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPendingDelete({ id: p.id, name: p.name })
                      }
                      // A property that is in use cannot be deleted without
                      // taking measured values with it. The button says why on
                      // hover and stays visible, so the rule is discoverable.
                      disabled={p.value_count > 0}
                      title={p.value_count > 0 ? ptBR.admin.inUse : undefined}
                      aria-label={`${ptBR.actions.delete}: ${p.name}`}
                    >
                      {ptBR.actions.delete}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      )}
    </div>
  );
}
