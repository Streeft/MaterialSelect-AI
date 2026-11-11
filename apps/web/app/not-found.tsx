import Link from "next/link";
import { errorsText } from "@/lib/i18n-errors";

/** 404 for any unknown address (D-200): says what happened and where to go. */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-prose px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">{errorsText.notFoundPage.title}</h1>
      <p className="mt-2 text-ink-muted">{errorsText.notFoundPage.description}</p>
      <p className="mt-4">
        <Link href="/app" className="text-accent underline">
          {errorsText.notFoundPage.home}
        </Link>
      </p>
    </main>
  );
}
