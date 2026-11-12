"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Disclosure } from "@/components/ui";

/**
 * A section of the sheet that can be folded (D-214).
 *
 * The sheet used to open everything at once — over 7.000 px and a request per
 * block that most readers never scroll to. Here the heading is the summary of a
 * disclosure, the `<section id>` stays rendered whether the block is open or
 * not (so an outline link or a `#curvas` address always has something to land
 * on), and the body is only *mounted* once it has been opened: a folded
 * "Curvas" asks for no data. After it has been opened it stays mounted, so
 * closing and reopening keeps what the reader had typed in it.
 *
 * Controlled by the page (`open`/`onOpenChange`) because the outline, the
 * summary strip and the address can all open a section from outside.
 */
export function CollapsibleSection({
  id,
  title,
  description,
  open,
  onOpenChange,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const [closedOnce, setClosedOnce] = useState(false);
  const mounted = open || closedOnce;
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-20", className)}>
      <Disclosure
        open={open}
        onOpenChange={(next) => {
          if (!next) setClosedOnce(true);
          onOpenChange(next);
        }}
        summary={<h2 className="text-heading text-ink">{title}</h2>}
      >
        {mounted ? (
          <div className="flex min-w-0 flex-col gap-3">
            {description ? (
              <p className="max-w-prose text-body text-ink-muted">{description}</p>
            ) : null}
            {children}
          </div>
        ) : null}
      </Disclosure>
    </section>
  );
}
