"use client";

import { createElement, type ComponentType, type SVGProps } from "react";
import { useAmbience } from "@/lib/ambience";
import {
  IconCalculator,
  IconClipboard,
  IconDrawer,
  IconSetSquare,
  IconToolbox,
  IconWorkbench,
} from "@/components/ui/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * D-256: what six destinations are called on a real bench. Only the drawing changes, and only in
 * the "Oficina" ambience; the label beside it is the accessible name in both.
 */
export const WORKSHOP_ICONS: Readonly<Record<string, IconComponent>> = {
  "/app/selecao": IconWorkbench,
  "/app/mapas": IconClipboard,
  "/app/dimensionar": IconSetSquare,
  "/app/custo": IconCalculator,
  "/app/catalogo": IconDrawer,
  "/app/processos": IconToolbox,
};

/**
 * The icon of a navigation entry, in the drawing the current ambience gives it. A component and
 * not a hook that returns one: which drawing to use is this element's own render.
 */
export function NavIcon({
  href,
  icon,
  ...props
}: { href: string; icon: IconComponent } & SVGProps<SVGSVGElement>) {
  const ambience = useAmbience();
  return createElement((ambience === "oficina" && WORKSHOP_ICONS[href]) || icon, props);
}
