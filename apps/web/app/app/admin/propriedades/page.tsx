"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, createProperty, deleteProperty, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { PropertyCategory, PropertyDefinition } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  Checkbox,
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
  const [isInterval, setIsInterval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createProperty({
        name,
        category,
        canonical_unit: canonicalUnit,
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
      setIsInterval(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteProperty(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const properties: PropertyDefinition[] = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={ptBR.admin.propertiesTitle} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <Input label={ptBR.form.name} value={name} onChange={(e) => setName(e.target.value)} required />
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
      {isError && <ErrorState title={ptBR.catalog.error} onRetry={() => void refetch()} />}

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
                    {p.symbol && <span className="ml-1 text-ink-subtle">({p.symbol})</span>}
                  </RowHeader>
                  <Td className="text-ink-muted">{ptBR.categories[p.category]}</Td>
                  <Td className="text-ink-muted">{p.canonical_unit}</Td>
                  <Td numeric className="text-ink-muted">
                    {p.value_count}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(p.id)}
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
