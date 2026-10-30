import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";

/**
 * The M3 Expressive loading indicator (D-183; m3.material.io › Components ›
 * Loading indicator): a shape that keeps changing while it turns, for waits
 * under about five seconds — running a selection, an AI answer. Lists keep
 * their skeletons (D-130), and a wait that can report progress uses a bar.
 *
 * Indeterminate only, like the M3 component. Under reduced motion it stands
 * still as a circle and the label still says what is happening.
 */
export function LoadingIndicator({
  label = ptBR.ui.loading,
  size = 48,
  contained = false,
  className,
}: {
  /** What is loading; read by screen readers. */
  label?: string;
  size?: number;
  /** On a container of its own, for use over busy content. */
  contained?: boolean;
  className?: string;
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-busy="true"
      className={cn("m3-loading", contained && "m3-loading-contained", className)}
      style={{ width: size, height: size }}
    >
      <span aria-hidden className="m3-loading-shape" />
    </span>
  );
}
