"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMaterials } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { SearchBar } from "@/components/SearchBar";
import { MaterialTable } from "@/components/MaterialTable";

/** Debounce a rapidly-changing value (used for the search box). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function CatalogPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["materials", debouncedSearch],
    queryFn: () => listMaterials(debouncedSearch),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{ptBR.catalog.title}</h1>
        {data && <span className="text-sm text-slate-500">{ptBR.catalog.count(data.length)}</span>}
      </div>

      <SearchBar value={search} onChange={setSearch} />

      {isLoading && <p className="py-8 text-center text-sm text-slate-500">{ptBR.catalog.loading}</p>}
      {isError && <p className="py-8 text-center text-sm text-red-600">{ptBR.catalog.error}</p>}
      {data && <MaterialTable materials={data} />}
    </div>
  );
}
