"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";
import { IconUpload } from "./icons";

/**
 * A drop zone that is also a button: dragging files onto it and choosing them
 * from the computer reach the same `onFiles`. The real `<input type="file">`
 * stays in the DOM (visually hidden) so the choosing half works from the
 * keyboard and with assistive technology — a drop zone alone is a mouse-only
 * control.
 */
export function FileDrop({
  title,
  hint,
  buttonLabel,
  accept,
  multiple = true,
  disabled,
  onFiles,
}: {
  title: string;
  hint?: string;
  buttonLabel: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-8 text-center transition",
        over ? "border-brand bg-brand-50" : "border-edge-control bg-surface-sunken",
        disabled && "opacity-60",
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-800">
        <IconUpload className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? (
        <p id={hintId} className="max-w-sm text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      <label
        htmlFor={inputId}
        className={cn(
          "pressable inline-flex cursor-pointer items-center rounded-control border border-edge-control bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-50",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
          disabled && "pointer-events-none",
        )}
      >
        {buttonLabel}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) onFiles(files);
            // Choosing the same file again after a failure must fire again.
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

export interface UploadItem {
  key: string;
  name: string;
  /** 0..1 while sending; ``null`` once the server is reading the file. */
  progress: number | null;
  status: "sending" | "done" | "failed";
  error?: string;
}

/**
 * The files in flight, each with a real progress bar (`role="progressbar"`
 * with its value) and, when one fails, the server's own reason.
 */
export function UploadList({
  label,
  items,
  statusLabels,
}: {
  label: string;
  items: UploadItem[];
  statusLabels: { sending: string; reading: string; done: string; failed: string };
}) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {items.map((item) => {
        const percent = item.progress === null ? null : Math.round(item.progress * 100);
        const statusText =
          item.status === "done"
            ? statusLabels.done
            : item.status === "failed"
              ? statusLabels.failed
              : percent === null || percent >= 100
                ? statusLabels.reading
                : `${statusLabels.sending} ${percent}%`;
        return (
          <li key={item.key} className="flex flex-col gap-1 rounded-control border border-edge px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium text-ink">{item.name}</span>
              <span
                className={cn(
                  "shrink-0",
                  item.status === "failed"
                    ? "text-danger-fg"
                    : item.status === "done"
                      ? "text-success-fg"
                      : "text-ink-muted",
                )}
              >
                {statusText}
              </span>
            </div>
            {item.status === "sending" ? (
              <div
                role="progressbar"
                aria-label={item.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-brand transition-[width]",
                    percent === null && "w-full animate-pulse",
                  )}
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>
            ) : null}
            {item.error ? <p className="text-2xs text-danger-fg">{item.error}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
