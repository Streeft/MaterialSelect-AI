import { ptBR } from "@/lib/i18n";

/** Small badge marking synthetic demonstration data. */
export function DemoDataBadge() {
  return (
    <span
      title={ptBR.demoWarning}
      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
    >
      {ptBR.demoBadge}
    </span>
  );
}
