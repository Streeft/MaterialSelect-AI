"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui";
import { LaudoScreen } from "@/components/laudo/LaudoScreen";

/** `/app/selecao/laudo?estudo=ID` — the engineering report of one saved study (D-241). */
function LaudoPage() {
  const params = useSearchParams();
  const raw = params?.get("estudo") ?? "";
  const id = /^\d+$/.test(raw) ? Number(raw) : null;
  return (
    <div className="flex flex-col gap-4">
      <LaudoScreen studyId={id} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LaudoPage />
    </Suspense>
  );
}
