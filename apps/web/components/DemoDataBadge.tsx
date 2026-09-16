import { ptBR } from "@/lib/i18n";
import { Badge } from "@/components/ui";

/** Small badge marking synthetic demonstration data. */
export function DemoDataBadge() {
  return (
    <Badge tone="warning" title={ptBR.demoWarning}>
      {ptBR.demoBadge}
    </Badge>
  );
}
