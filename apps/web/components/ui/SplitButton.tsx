"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { IconChevronDown } from "./icons";
import { MenuButton } from "./Menu";

/**
 * The M3 Expressive split button (D-183; m3.material.io › Components › Split
 * button): the action, and beside it a seat that opens the related actions.
 * The two never trigger each other — the label runs the action, the chevron
 * only opens the menu (which is `MenuButton`'s, keyboard and all). The chevron
 * seat turns round and the chevron flips on the expressive spring.
 *
 * `primary` counts as the screen's one primary action (D-91); `tonal` does not.
 */
export function SplitButton({
  children,
  onClick,
  menuLabel,
  menu,
  variant = "tonal",
  disabled = false,
  loading = false,
  className,
}: {
  /** The action's visible label. */
  children: ReactNode;
  onClick: () => void;
  /** Accessible name of the chevron seat and of the menu it opens. */
  menuLabel: string;
  /** The related actions, as `MenuItem`s. */
  menu: ReactNode;
  variant?: "primary" | "tonal";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("m3-split", `m3-split-${variant}`, className)}>
      <Button variant={variant} onClick={onClick} disabled={disabled} loading={loading}>
        {children}
      </Button>
      <MenuButton
        label={menuLabel}
        iconOnly
        disabled={disabled}
        icon={<IconChevronDown className="h-4 w-4" />}
        className="m3-split-trigger"
      >
        {menu}
      </MenuButton>
    </div>
  );
}
