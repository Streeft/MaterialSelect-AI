"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A conversation: `role="log"` so a screen reader announces what arrives
 * (`aria-live="polite"`, additions only), and it follows the newest message
 * the way a chat is expected to — unless the reader scrolled up to read an
 * older one, which a jump to the bottom would take away from them.
 */
export function ChatLog({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (node && pinned.current && typeof node.scrollTo === "function") {
      node.scrollTo({ top: node.scrollHeight });
    }
  });

  return (
    <div
      ref={ref}
      role="log"
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions"
      tabIndex={0}
      onScroll={(event) => {
        const node = event.currentTarget;
        pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      }}
      className={cn("flex flex-col gap-4 overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}

/**
 * One turn. The student's question is a bubble on the right; an answer is
 * full-width prose, because it is the thing being read.
 */
export function ChatMessage({
  from,
  author,
  actions,
  children,
}: {
  from: "user" | "assistant";
  /** Who spoke, for assistive technology — the layout alone says it visually. */
  author: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  if (from === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card rounded-br-control bg-brand-100 px-4 py-2.5 text-sm text-brand-900">
          <span className="sr-only">{author}: </span>
          {children}
        </div>
      </div>
    );
  }
  return (
    <article className="flex flex-col gap-2 text-sm leading-relaxed text-ink">
      <span className="sr-only">{author}:</span>
      {children}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </article>
  );
}
