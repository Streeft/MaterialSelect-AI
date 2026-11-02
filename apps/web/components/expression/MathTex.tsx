"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/cn";

/**
 * LaTeX typeset by KaTeX (D-191), the only place the app turns TeX into marks.
 *
 * The TeX always comes from the backend (`/api/expressions/describe` or the
 * palette), which builds it from the parsed expression and escapes every
 * catalogue name; KaTeX runs with `trust: false`, so `\href`, `\url` and the
 * like are refused even if a name ever carried one. The figure is an image to
 * assistive technology, named by `label` — the same reading in words — so a
 * screen reader hears "Módulo de Young / Densidade" and not a TeX dump.
 */
export function MathTex({
  latex,
  label,
  display = false,
  className,
}: {
  latex: string;
  /** Accessible name: the plain-text reading of the formula. Empty: decorative (hidden). */
  label: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        trust: false,
        output: "html",
      }),
    [latex, display],
  );
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={cn("ms-math inline-block max-w-full overflow-x-auto align-middle", className)}
      // KaTeX output from backend-built, escaped TeX with `trust: false`.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
