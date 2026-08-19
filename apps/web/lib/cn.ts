import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only resolves a conflict between two classes it recognises as
// belonging to the same group. The project's custom scales are invisible to it
// by default, so `rounded-card` would survive alongside `rounded-full` and the
// later one in the string — not the caller's override — would win at random.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["card", "control"] }],
      shadow: [{ shadow: ["card", "raised", "overlay"] }],
      "font-size": [{ text: ["2xs"] }],
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
