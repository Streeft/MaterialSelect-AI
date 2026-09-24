"use client";

import { useCanEditCatalog } from "@/lib/billing";
import { ptBR } from "@/lib/i18n";
import { Alert } from "@/components/ui";

/** Says up front why a curation screen's writes will be refused (D-82). */
export function CatalogReadOnlyNotice() {
  const canEdit = useCanEditCatalog();
  if (canEdit) return null;
  return (
    <Alert tone="info" title={ptBR.billing.catalogReadOnlyTitle}>
      {ptBR.billing.catalogReadOnly}
    </Alert>
  );
}
