import { cn } from "@/lib/cn";

/**
 * A proportion, drawn.
 *
 * The fill grows from origin instead of appearing ready, and that's not decoration:
 * the bar *means* a fraction, and seeing it grow tells where it came from. It's
 * pure CSS (`.grow-x` in globals.css), so the reduced-motion block delivers it
 * already complete for those who asked for less motion.
 *
 * `value` is 0–1, and `null` when there's no value to show — §1.3: absence
 * never becomes a number. In that case the bar stays empty and the text beside
 * it explains; a 0% bar would read as a verdict on data that doesn't exist.
 *
 * `color` takes a background class for cases where the bar is a material
 * class (the Okabe–Ito palette, which doesn't follow the section hue).
 * The default is `bg-brand`, which does.
 */
export function Bar({
  value,
  color = "bg-brand",
  delay = 0,
  className,
  label,
}: {
  value: number | null;
  color?: string;
  /** Stagger in ms, for a stack of bars. See the six ceiling in globals.css. */
  delay?: number;
  className?: string;
  /** When the bar is the only representation of the number, it needs a name. */
  label?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("block h-4 overflow-hidden rounded-seat bg-surface-sunken", className)}
    >
      {value === null ? null : (
        <span
          className={cn("grow-x block h-full rounded-seat", color)}
          style={{ width: `${pct}%`, animationDelay: delay ? `${delay}ms` : undefined }}
        />
      )}
    </span>
  );
}
