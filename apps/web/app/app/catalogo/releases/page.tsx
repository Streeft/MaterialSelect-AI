"use client";

import { Suspense } from "react";
import { ptBR } from "@/lib/i18n";
import { ReleaseChanges } from "@/components/catalog/ReleaseChanges";
import { ButtonLink, LoadingState, PageHeader } from "@/components/ui";

const t = ptBR.releases;

/**
 * Changes between two releases of the official catalogue (D-108, TM7).
 *
 * Reached from the catalogue page by a quiet link, not from the rail: it is a
 * maintenance reading, not a daily screen. `useSearchParams` needs the boundary.
 */
export default function ReleaseChangesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        group="dados"
        actions={
          <ButtonLink href="/app/catalogo" variant="ghost" size="sm">
            {t.backToCatalog}
          </ButtonLink>
        }
      />
      <Suspense fallback={<LoadingState label={t.loading} />}>
        <ReleaseChanges />
      </Suspense>
    </div>
  );
}
