import Link from "next/link";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { DemoDataBadge } from "./DemoDataBadge";

interface MaterialTableProps {
  materials: MaterialListItem[];
}

/** Accessible table listing materials with a link to each detail sheet. */
export function MaterialTable({ materials }: MaterialTableProps) {
  if (materials.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{ptBR.catalog.empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">{ptBR.catalog.columnName}</th>
            <th scope="col" className="px-4 py-3">{ptBR.catalog.columnClass}</th>
            <th scope="col" className="px-4 py-3">{ptBR.catalog.columnKeywords}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {materials.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/materiais/${m.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {m.name}
                  </Link>
                  {m.is_demo && <DemoDataBadge />}
                </div>
                {m.subclass && <div className="text-xs text-slate-500">{m.subclass}</div>}
              </td>
              <td className="px-4 py-3 text-slate-700">{m.class_name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {m.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
