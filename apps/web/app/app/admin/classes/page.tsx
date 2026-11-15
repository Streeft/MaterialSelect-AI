"use client";

import { describeApiError } from "@/lib/errors";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClass, deleteClass, listClasses, moveClass, patchClass } from "@/lib/api";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass, SuggestAction } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  ConfirmDialog,
  EditableText,
  ErrorState,
  IconButton,
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
import { MoveClassDialog } from "@/components/admin/MoveClassDialog";
import { useClassDrag, type DropTarget } from "@/components/admin/useClassDrag";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { IconChevronDown, IconChevronRight, IconGrip, IconPlus } from "@/components/ui/icons";
import { classTreeRows, parentIds } from "@/lib/admin/classTree";

/** The server's limits for what it is told (D-228): a longer text would be refused, not cut. */
const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
/** What a class's own `description` holds (`MaterialClassIn`/`MaterialClassPatch`: 500).
 * The form used to allow 2000 and the server refused past 500 (D-238). */
const DESCRIPTION_MAX_PATCH = 500;

/** Same name, whatever the case or the spacing: the server compares like this too. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
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
      setCreating(false);
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
  // D-233: the class being moved ("Mover para…").
  const [moving, setMoving] = useState<MaterialClass | null>(null);

  const classes: MaterialClass[] = useMemo(() => data ?? [], [data]);

  // D-236: dragging a row onto another makes it a subclass of it (onto the root strip, a root).
  // The same `PATCH` as "Mover para…"; a refusal from the server (a cycle, a class that is gone)
  // is shown in words, and the tree is reloaded so it shows what is true now.
  const snackbar = useOptionalSnackbar();
  const [dragError, setDragError] = useState<string | null>(null);
  const drag = useMutation({
    mutationFn: ({ cls, target }: { cls: MaterialClass; target: DropTarget }) =>
      moveClass(cls.id, target === "root" ? null : target),
    onSuccess: (_moved, { cls, target }) => {
      setDragError(null);
      const parentName =
        target === "root" ? null : (classes.find((c) => c.id === target)?.name ?? null);
      snackbar?.notify({ message: curadoriaText.move.moved(cls.name, parentName) });
    },
    onError: (err) => setDragError(describeApiError(err, curadoriaText.move.dragFailed)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["classes"] }),
  });
  const classDrag = useClassDrag({
    classes,
    onMove: (cls, target) => {
      if ((target === "root" ? null : target) === cls.parent_id) {
        snackbar?.notify({ message: curadoriaText.move.sameParent(cls.name) });
        return;
      }
      setDragError(null);
      drag.mutate({ cls, target });
    },
  });
  // D-238: the tree folds, a search narrows it, and a name or a description is
  // edited in its own cell (the same PATCH as the move; the slug never changes).
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const tree = useMemo(() => classTreeRows(classes, { collapsed, query }), [classes, collapsed, query]);
  const foldable = useMemo(() => parentIds(classes), [classes]);
  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const saveClass = async (id: number, patch: { name?: string; description?: string | null }) => {
    await patchClass(id, patch);
    await qc.invalidateQueries({ queryKey: ["classes"] });
  };
  const nameById = new Map(classes.map((c) => [c.id, c.name]));

  // D-230b: the proposed description goes into the form's field and nothing more —
  // it is not saved; the person reads it, edits it and presses the button.
  const acceptsAiAction = (action: SuggestAction) =>
    action.type !== "fill_text" || action.field === "description";
  function applyAiAction(action: SuggestAction) {
    if (action.type !== "fill_text" || action.field !== "description") return;
    setDescription(action.text.slice(0, DESCRIPTION_MAX_PATCH));
    revealField("description");
  }

  const nameError = !name.trim()
    ? ptBR.admin.errorNameRequired
    : classes.some((c) => sameName(c.name, name))
      ? ptBR.admin.errorClassDuplicate
      : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={ptBR.admin.classesTitle}
        // D-238: creating is one click away, not a form always open over the table.
        primaryAction={
          creating ? undefined : (
            <Button variant="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>
              {ptBR.admin.newClassOpen}
            </Button>
          )
        }
      />
      <CatalogReadOnlyNotice />

      {creating ? (
      <>
      <AISuggestPanel
        tool="admin_classes"
        // What the form holds now: the server reads the catalogue's classes itself.
        context={{ name: name.trim().slice(0, NAME_MAX), description: description.slice(0, DESCRIPTION_MAX) }}
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
            <Textarea
              label={ptBR.form.description}
              className="sm:col-span-2"
              rows={2}
              maxLength={DESCRIPTION_MAX_PATCH}
              value={description}
              {...aiField("description")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </CardBody>
          <CardFooter>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {ptBR.admin.newClass}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setSubmitted(false);
                setError(null);
              }}
            >
              {ptBR.admin.cancelCreate}
            </Button>
          </CardFooter>
        </Card>
      </form>
      </>
      ) : null}

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

      <MoveClassDialog cls={moving} classes={classes} onClose={() => setMoving(null)} />

      {data && (
        <>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            type="search"
            label={ptBR.admin.searchClasses}
            hint={ptBR.admin.searchHint}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-sm"
          />
          <div className="flex flex-wrap items-center gap-2 pb-6">
            <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set())} disabled={Boolean(query)}>
              {ptBR.admin.expandAll}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set(foldable))} disabled={Boolean(query)}>
              {ptBR.admin.collapseAll}
            </Button>
            <span role="status" className="text-caption text-ink-muted">
              {ptBR.admin.classesShown(tree.filter((r) => !r.ancestorOnly).length, classes.length)}
            </span>
          </div>
        </div>
        <p className="text-caption text-ink-muted">{ptBR.admin.treeHint}</p>
        <p className="text-caption text-ink-muted">{curadoriaText.move.dragHint}</p>
        {dragError ? (
          <Alert tone="danger" role="alert">
            {dragError}
          </Alert>
        ) : null}
        <div
          {...classDrag.dropProps("root")}
          // Sticky: in a long tree the strip would scroll away from a row being dragged.
          className="ds-drop sticky top-16 z-10 rounded-control border border-dashed border-line bg-page px-3 py-2 text-caption text-ink-muted"
        >
          {curadoriaText.move.dropRoot}
        </div>
        <TableScroll label={ptBR.admin.classesTitle}>
          <Table>
            <TableCaption>{ptBR.admin.classesTitle}</TableCaption>
            <THead>
              <Tr>
                <Th>{ptBR.form.name}</Th>
                <Th>{ptBR.admin.descriptionColumn}</Th>
                <Th>{ptBR.admin.parentColumn}</Th>
                <Th>{ptBR.admin.slug}</Th>
                <Th numeric>{ptBR.admin.materialCount}</Th>
                <Th>
                  <span className="sr-only">{ptBR.actions.columnActions}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {query && tree.length === 0 ? (
                <Tr>
                  <Td colSpan={6} className="text-ink-muted">
                    {ptBR.admin.noClassMatch(query.trim())}
                  </Td>
                </Tr>
              ) : null}
              {tree.map(({ cls: c, depth, hasChildren, ancestorOnly }) => (
                <Tr
                  key={c.id}
                  {...classDrag.dropProps(c.id)}
                  className="ds-drop"
                  data-ancestor-only={ancestorOnly || undefined}
                >
                  <RowHeader>
                    <span className="flex items-start gap-1">
                      {/* The grip is for the pointer only: "Mover para…" is the way by keyboard. */}
                      <span
                        {...classDrag.handleProps(c)}
                        title={curadoriaText.move.dragHandle(c.name)}
                        className="ds-block-grip"
                        data-visible=""
                        aria-hidden="true"
                      >
                        <IconGrip className="h-4 w-4" aria-hidden />
                      </span>
                      <span
                        style={{ paddingInlineStart: `${depth * 1.25}rem` }}
                        className="flex min-w-0 items-start gap-0.5"
                      >
                        {hasChildren ? (
                          <IconButton
                            size="sm"
                            label={collapsed.has(c.id) && !query ? ptBR.admin.expandClass(c.name) : ptBR.admin.collapseClass(c.name)}
                            aria-expanded={!collapsed.has(c.id) || Boolean(query)}
                            disabled={Boolean(query)}
                            icon={collapsed.has(c.id) && !query ? <IconChevronRight /> : <IconChevronDown />}
                            onClick={() => toggle(c.id)}
                          />
                        ) : (
                          <span aria-hidden="true" className="inline-block w-8 shrink-0 text-center text-ink-subtle">
                            {depth > 0 ? "↳" : ""}
                          </span>
                        )}
                        <EditableText
                          value={c.name}
                          label={ptBR.form.name}
                          itemName={c.name}
                          required
                          maxLength={NAME_MAX}
                          validate={(next) =>
                            classes.some((o) => o.id !== c.id && sameName(o.name, next))
                              ? ptBR.admin.errorClassDuplicate
                              : undefined
                          }
                          onSave={(next) => saveClass(c.id, { name: next })}
                          className={ancestorOnly ? "text-ink-muted" : undefined}
                        />
                        {ancestorOnly ? <span className="sr-only">{ptBR.admin.ancestorOfMatch}</span> : null}
                      </span>
                    </span>
                  </RowHeader>
                  <Td className="min-w-[14rem] text-ink-muted">
                    <EditableText
                      value={c.description ?? ""}
                      label={ptBR.admin.descriptionColumn}
                      itemName={c.name}
                      multiline
                      maxLength={DESCRIPTION_MAX_PATCH}
                      empty={ptBR.admin.noDescription}
                      onSave={(next) => saveClass(c.id, { description: next || null })}
                    />
                  </Td>
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
                      onClick={() => setMoving(c)}
                      aria-label={curadoriaText.move.actionFor(c.name)}
                    >
                      {curadoriaText.move.action}
                    </Button>
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
