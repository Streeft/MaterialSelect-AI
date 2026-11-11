"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui";
import { errorsText } from "@/lib/i18n-errors";

/** Root boundary (D-200): outside `/app` there is no shell, so it offers the way home. */
export default function RootError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-prose px-4 py-16">
      <ErrorState
        title={errorsText.boundary.title}
        description={errorsText.boundary.description}
        onRetry={reset}
      />
      <p className="mt-4 text-center">
        <Link href="/" className="text-accent underline">
          {errorsText.boundary.home}
        </Link>
      </p>
    </main>
  );
}
