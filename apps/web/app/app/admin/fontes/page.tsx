"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSources } from "@/lib/api";
import { useCanEditCatalog } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { matchesQuery } from "@/lib/search";
import type { SourceRecord } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
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
import { CatalogReadOnlyNotice } from "@/components/auth/CatalogReadOnlyNotice";
import { EditSourceDialog } from "@/components/material/EditSourceDialog";
import { IconPencil } from "@/components/ui/icons";

const t = curadoriaText.sourcesAdmin;

/**
 * Admin › Fontes (D-244): every registered source, also the ones no material sheet cites (those
 * had nowhere to be edited, since the edit of D-236 lives on the sheet). Only a curator edits;
 * the dialog is the sheet's, with the registration fields (label, licence) switched on. The ABNT
 * text shown is the server's, assembled from the recorded fields: a missing part stays missing.
 */
export default function SourcesAdminPage() {
  const canEdit = useCanEditCatalog();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sources"],
    queryFn: listSources,
  });
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SourceRecord | null>(null);

  const shown = useMemo(
    () =>
      (data ?? []).filter((s) =>
        matchesQuery(query, s.label, s.title, s.authors, s.license_label, s.publisher),
      ),
    [data, query],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={ptBR.admin.sourcesTitle} />
      <CatalogReadOnlyNotice />
      <p className="max-w-prose text-support text-ink-muted">{t.intro}</p>

      {isLoading ? <LoadingState label={t.loading} /> : null}
      {isError ? <ErrorState title={t.error} onRetry={() => void refetch()} /> : null}

      {data && data.length === 0 ? <EmptyState title={t.none} /> : null}

      {data && data.length > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              type="search"
              label={t.search}
              hint={t.searchHint}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full max-w-sm"
            />
            <span role="status" className="pb-6 text-caption text-ink-muted">
              {t.shown(shown.length, data.length)}
            </span>
          </div>
          <TableScroll label={ptBR.admin.sourcesTitle}>
            <Table>
              <TableCaption>{ptBR.admin.sourcesTitle}</TableCaption>
              <THead>
                <Tr>
                  <Th>{t.colLabel}</Th>
                  <Th>{t.colLicense}</Th>
                  <Th>{t.colReviewed}</Th>
                  <Th>{t.colCitation}</Th>
                  <Th>
                    <span className="sr-only">{ptBR.actions.columnActions}</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {shown.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} className="text-ink-muted">
                      {t.noMatch(query.trim())}
                    </Td>
                  </Tr>
                ) : null}
                {shown.map((s) => (
                  <Tr key={s.id}>
                    <RowHeader>
                      <span className="break-words">{s.label}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {s.is_demo ? <Badge tone="neutral">{t.demo}</Badge> : null}
                        {s.contains_third_party_data ? (
                          <Badge tone="warning">{t.thirdParty}</Badge>
                        ) : null}
                      </span>
                    </RowHeader>
                    <Td className="text-ink-muted">
                      {s.license_label ? (
                        s.license_url ? (
                          <a
                            href={s.license_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline"
                          >
                            {s.license_label}
                          </a>
                        ) : (
                          s.license_label
                        )
                      ) : (
                        t.noLicense
                      )}
                    </Td>
                    <Td className="text-ink-muted">
                      {s.reviewed_by_email
                        ? t.reviewedBy(
                            s.reviewed_by_email,
                            s.reviewed_at ? formatDate(s.reviewed_at) : null,
                          )
                        : t.noReviewer}
                    </Td>
                    <Td className="max-w-md break-words text-ink-muted">{s.abnt}</Td>
                    <Td className="text-right">
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<IconPencil className="h-4 w-4" />}
                          aria-label={curadoriaText.editSource.actionFor(s.label)}
                          onClick={() => setEditing(s)}
                        >
                          {curadoriaText.editSource.action}
                        </Button>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </>
      ) : null}

      {canEdit ? (
        <EditSourceDialog source={editing} registration onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
