"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClass, deleteClass, listClasses } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  ErrorState,
  Input,
  LoadingState,
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
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteClass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const classes: MaterialClass[] = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-ink">{ptBR.admin.classesTitle}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-4">
            <Input label={ptBR.form.name} value={name} onChange={(e) => setName(e.target.value)} required />
            <Select label={ptBR.admin.parent} value={parentId} onChange={(e) => setParentId(e.target.value)}>
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
      {isError && <ErrorState title={ptBR.catalog.error} onRetry={() => void refetch()} />}

      {data && (
        <TableScroll label={ptBR.admin.classesTitle}>
          <Table>
            <TableCaption>{ptBR.admin.classesTitle}</TableCaption>
            <THead>
              <Tr>
                <Th>{ptBR.form.name}</Th>
                <Th>{ptBR.admin.slug}</Th>
                <Th numeric>{ptBR.admin.materialCount}</Th>
                <Th>
                  <span className="sr-only">{ptBR.actions.columnActions}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {classes.map((c) => (
                <Tr key={c.id}>
                  <RowHeader>{c.name}</RowHeader>
                  <Td className="font-mono text-2xs text-ink-muted">{c.slug}</Td>
                  <Td numeric className="text-ink-muted">
                    {c.material_count}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(c.id)}
                      // A class with materials in it cannot be removed without
                      // orphaning them. The button stays visible and says why.
                      disabled={c.material_count > 0}
                      title={c.material_count > 0 ? ptBR.admin.inUse : undefined}
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
      )}
    </div>
  );
}
