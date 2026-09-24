import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconClose } from "./icons";

/**
 * Something the reader already chose, with its own way out (D-86).
 *
 * Not a {@link ToggleChip}: a toggle is one of a list of options, pressed or
 * not; this is a choice made elsewhere (a search, a picker) shown back so it
 * can be undone. The remove button carries the item's name, so a list of five
 * reads as five different buttons and not five "Remover".
 */
export function RemovableChip({
  children,
  onRemove,
  removeLabel = ptBR.actions.remove,
  className,
}: {
  children: string;
  onRemove: () => void;
  removeLabel?: string;
  className?: string;
}): ReactNode {
  return (
    <span className={cn("msds-chip msds-chip-input", className)}>
      <span className="msds-chip-text">{children}</span>
      <button
        type="button"
        className="msds-chip-remove"
        aria-label={`${removeLabel}: ${children}`}
        onClick={onRemove}
      >
        <IconClose />
      </button>
    </span>
  );
}
