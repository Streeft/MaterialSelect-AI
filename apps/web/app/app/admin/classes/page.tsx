"use client";

import { describeApiError } from "@/lib/errors";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClass, deleteClass, listClasses } from "@/lib/api";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  ConfirmDialog,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  RowHeader,
  Select,
  SelectOption,
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

/** Same name, whatever the case or the spacing: the server compares like this too. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}

/** The classes in tree order (parents before their children), each with its depth. */
function flattenClasses(classes: MaterialClass[]): { cls: MaterialClass; depth: number }[] {
  const byParent = new Map<number | null, MaterialClass[]>();
  const ids = new Set(classes.map((c) => c.id));
  for (const c of classes) {
    // A parent that is not in the list (filtered away) must not hide its child.
    const key = c.parent_id !== null && ids.has(c.parent_id) ? c.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const out: { cls: MaterialClass; depth: number }[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null, depth: number) => {
    for (const cls of byParent.get(parent) ?? []) {
      if (seen.has(cls.id)) continue;
      seen.add(cls.id);
      out.push({ cls, depth });
      walk(cls.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function ClassesAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["classes"],
    queryFn: listClasses,
  });

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Inline validation shows after the first try to send, then follows the typing.
  const [submitted, setSubmitted] = useState(false);
  const undoable = useUndoableDelete();

  const create = useMutation({
    mutationFn: () =>
      createClass({
        name,
        parent_id: parentId ? Number(parentId) : null,
        description: description || null,
      }),
    onSuccess: () => {
      setName("");
      setParentId("");
      setDescription("");
      setError(null);
      setSubmitted(false);
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (err) => setError(describeApiError(err, ptBR.form.genericError)),
  });

  // D-201 asks first (the deletion is final on the server); D-130's "Desfazer"
  // then holds the call back for a few seconds, so a wrong click is still free.
  function removeClass(target: { id: number; name: string }) {
    undoable({
      what: ptBR.admin.deletedClass,
      hide: [{ queryKey: ["classes"], remove: withoutId(target.id) }],
      commit: () => deleteClass(target.id),
    });
  }

  // D-201: the row awaiting delete confirmation (MSDS dialog; deletion is permanent).
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const classes: MaterialClass[] = data ?? [];
  const tree = flattenClasses(classes);
  const nameById = new Map(classes.map((c) => [c.id, c.name]));

  const nameError = !name.trim()
    ? ptBR.admin.errorNameRequired
    : classes.some((c) => sameName(c.name, name))
      ? ptBR.admin.errorClassDuplicate
      : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={ptBR.admin.classesTitle} />
      <CatalogReadOnlyNotice />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (nameError) return;
          create.mutate();
        }}
      >
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-4">
            <Input
              label={ptBR.form.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              error={submitted ? nameError : undefined}
            />
            <Select
              label={ptBR.admin.parent}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <SelectOption value="">{ptBR.admin.noParent}</SelectOption>
              {classes.map((c) => (
                <SelectOption key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectOption>
              ))}
            </Select>
            <Input
              label={ptBR.form.description}
              className="sm:col-span-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </CardBody>
          <CardFooter>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {ptBR.admin.newClass}
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
          pendingDelete ? ptBR.admin.confirmDeleteClass(pendingDelete.name) : ""
        }
        message={ptBR.admin.confirmDeleteBody}
        confirmLabel={ptBR.actions.delete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeClass(pendingDelete);
          setPendingDelete(null);
        }}
      />

      {data && (
        <>
        <p className="text-caption text-ink-muted">{ptBR.admin.treeHint}</p>
        <TableScroll label={ptBR.admin.classesTitle}>
          <Table>
            <TableCaption>{ptBR.admin.classesTitle}</TableCaption>
            <THead>
              <Tr>
                <Th>{ptBR.form.name}</Th>
                <Th>{ptBR.admin.parentColumn}</Th>
                <Th>{ptBR.admin.slug}</Th>
                <Th numeric>{ptBR.admin.materialCount}</Th>
                <Th>
                  <span className="sr-only">{ptBR.actions.columnActions}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {tree.map(({ cls: c, depth }) => (
                <Tr key={c.id}>
                  <RowHeader>
                    <span style={{ paddingInlineStart: `${depth * 1.25}rem` }} className="block min-w-0 break-words">
                      {depth > 0 && <span aria-hidden="true" className="text-ink-subtle">↳ </span>}
                      {c.name}
                    </span>
                  </RowHeader>
                  <Td className="text-ink-muted">
                    {c.parent_id !== null && nameById.has(c.parent_id) ? (
                      nameById.get(c.parent_id)
                    ) : (
                      <span className="italic text-ink-subtle">{ptBR.admin.rootClass}</span>
                    )}
                  </Td>
                  <Td className="font-mono text-2xs text-ink-muted">
                    {c.slug}
                  </Td>
                  <Td numeric className="text-ink-muted">
                    {c.material_count}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPendingDelete({ id: c.id, name: c.name })
                      }
                      // A class with materials in it cannot be removed without
                      // orphaning them. The button stays visible and says why.
                      disabled={c.material_count > 0}
                      title={
                        c.material_count > 0 ? ptBR.admin.inUse : undefined
                      }
                      aria-label={`${ptBR.actions.delete}: ${c.name}`}
                    >
                      {ptBR.actions.delete}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
        </>
      )}
    </div>
  );
}
