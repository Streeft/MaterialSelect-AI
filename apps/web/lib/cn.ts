import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only resolves a conflict between two classes it recognises as
// belonging to the same group. The project's custom scales are invisible to it
// by default, so `rounded-card` would survive alongside `rounded-full` and the
// later one in the string — not the caller's override — would win at random.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [
        {
          rounded: [
            "card", "control", "panel", "seat",
            "m3-none", "m3-xs", "m3-sm", "m3-md", "m3-lg", "m3-lg-plus", "m3-xl", "m3-xl-plus", "m3-xxl", "m3-full",
          ],
        },
      ],
      shadow: [
        {
          shadow: [
            "card", "control", "raised", "overlay", "lift", "glow",
            "elev-0", "elev-1", "elev-2", "elev-3", "elev-4", "elev-5",
          ],
        },
      ],
      duration: [{ duration: ["m3-short1", "m3-short2", "m3-short3", "m3-short4", "m3-medium1", "m3-medium2", "m3-medium3", "m3-medium4"] }],
      ease: [{ ease: ["m3-standard", "m3-standard-decelerate", "m3-standard-accelerate", "m3-emphasized-decelerate", "m3-emphasized-accelerate"] }],
      // The D-91 type roles. Without them `text-support` reads as a colour to
      // tailwind-merge, and `cn("text-support", "text-ink-muted")` would drop
      // the size.
      "font-size": [
        {
          text: [
            "2xs", "display", "title", "heading", "body", "support", "caption",
            "m3-display-large",
            "m3-display-medium",
            "m3-display-small",
            "m3-headline-large",
            "m3-headline-medium",
            "m3-headline-small",
            "m3-title-large",
            "m3-title-medium",
            "m3-title-small",
            "m3-body-large",
            "m3-body-medium",
            "m3-body-small",
            "m3-label-large",
            "m3-label-medium",
            "m3-label-small",
          ],
        },
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
