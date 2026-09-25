import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only resolves a conflict between two classes it recognises as
// belonging to the same group. The project's custom scales are invisible to it
// by default, so `rounded-card` would survive alongside `rounded-full` and the
// later one in the string — not the caller's override — would win at random.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["card", "control", "panel", "seat"] }],
      shadow: [{ shadow: ["card", "control", "raised", "overlay", "lift", "glow"] }],
      // The D-91 type roles. Without them `text-support` reads as a colour to
      // tailwind-merge, and `cn("text-support", "text-ink-muted")` would drop
      // the size.
      "font-size": [
        { text: ["2xs", "display", "title", "heading", "body", "support", "caption"] },
      ],
    },
  },
});

/**
 * Join class names, letting a later utility override an earlier one from the
 * same group. This is what makes `<Button className="w-full rounded-full">`
 * behave the way a caller expects instead of depending on CSS source order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
