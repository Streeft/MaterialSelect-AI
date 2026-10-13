"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMaterialEquivalences } from "@/lib/api";
import type { EquivalenceGroup } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.equivalences;

/**
 * The "Equivalências" section of the material sheet (D-115, TM1).
 *
 * What a source declares, and nothing else: each group says its **kind** and its
 * **source** in words, and the empty state says that nothing was declared — it
 * does not say that nothing is equivalent, and it never suggests a material for
 * sharing a code (that is Find Similar, a different question, D-63).
 */
export function EquivalenceSection({
  materialId,
  materialIsDemo,
}: {
  materialId: number;
  materialIsDemo: boolean;
}) {
  const query = useQuery({
    queryKey: ["material-equivalences", materialId],
    queryFn: () => listMaterialEquivalences(materialId),
    enabled: Number.isFinite(materialId),
  });

  if (query.isLoading) return <LoadingState label={t.loading} />;
  if (query.isError)
    return <ErrorState title={t.error} onRetry={() => void query.refetch()} />;
  const groups = query.data?.groups ?? [];
  if (groups.length === 0) {
    return <EmptyState title={t.none} description={t.noneHint} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <EquivalenceGroupView
          key={group.id}
          group={group}
          materialIsDemo={materialIsDemo}
        />
      ))}
    </div>
  );
}

function EquivalenceGroupView({
  group,
  materialIsDemo,
}: {
  group: EquivalenceGroup;
  materialIsDemo: boolean;
}) {
  return (
    <div
      className="well flex flex-col gap-3 p-4"
      data-equivalence-group={group.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-support text-ink-subtle">{t.kindLabel}</span>
        <Badge tone="brand">{group.kind_label}</Badge>
        {group.is_demo && !materialIsDemo && (
          <Badge tone="warning">{t.demoRow}</Badge>
        )}
        <span className="text-support">{group.kind_meaning}</span>
      </div>
      <TableScroll label={t.groupCaption(group.kind_label)}>
        <Table>
          <TableCaption>{t.groupCaption(group.kind_label)}</TableCaption>
          <THead>
            <Tr>
              <Th>{t.columnSystem}</Th>
              <Th>{t.columnCode}</Th>
              <Th>{t.columnMaterial}</Th>
            </Tr>
          </THead>
          <TBody>
            {group.members.map((m) => (
              <Tr key={m.designation_id}>
                <RowHeader>{m.system_label}</RowHeader>
                <Td>
                  <span className="font-mono">{m.code}</span>
                </Td>
                <Td>
                  {m.is_self ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {m.material_name}
                      <Badge tone="neutral">{t.thisMaterial}</Badge>
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/app/materiais/${m.material_id}`}
                        className="text-action underline"
                      >
                        {m.material_name}
                      </Link>
                      {!m.material_is_active && (
                        <Badge tone="neutral">{t.withdrawn}</Badge>
                      )}
                    </span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
      <dl className="grid gap-x-6 gap-y-1 text-support sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-subtle">{t.sourceLabel}</dt>
        <dd>{group.source_label}</dd>
        <dt className="text-ink-subtle">{t.licenseLabel}</dt>
        <dd>{group.license_label ?? t.noLicense}</dd>
        <dt className="text-ink-subtle">{t.citationLabel}</dt>
        <dd>{group.citation ?? t.noCitation}</dd>
        <dt className="text-ink-subtle">{t.noteLabel}</dt>
        <dd>{group.note ?? t.noNote}</dd>
      </dl>
    </div>
  );
}
