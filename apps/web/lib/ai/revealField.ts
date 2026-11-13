/**
 * D-230b: showing the person which field an applied suggestion changed.
 *
 * A screen marks the controls an AI action may write with `aiField("name")`
 * (a `data-ai-field` attribute, which the form controls pass through to the
 * element), and calls `revealField("name")` right after it writes the value.
 * The field gets a brief ring (`[data-ai-changed]` in globals.css, off under
 * reduced motion) and is brought into view. Focus moves to it only when it
 * would otherwise be lost: the panel folds itself on a narrow window and takes
 * the focus with it, and a keyboard user must not be left on the page's top.
 * On a wide window the focus stays on the suggestion's button, so the next
 * suggestion is one Tab away.
 */
const ATTRIBUTE = "data-ai-field";
const CHANGED = "data-ai-changed";
const RING_MS = 2600;
/** Long enough for the screen's own state to render the new value and open a folded group. */
const SETTLE_MS = 60;

/** Props that mark a control as one an AI action can write. */
export function aiField(name: string): { "data-ai-field": string } {
  return { [ATTRIBUTE]: name } as { "data-ai-field": string };
}

/** The controls an action named `name` may have changed, in document order. */
export function fieldsFor(name: string, root: ParentNode = document): HTMLElement[] {
  // Names are the server's parameter names (`inputs.span`, `part_mass`): no quote to escape.
  if (!/^[\w.-]+$/.test(name)) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(`[${ATTRIBUTE}="${name}"]`));
}

function focusIsLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !document.body.contains(active);
}

/** Rings (and, when the focus would be lost, focuses) the control(s) named `name`. */
export function revealField(name: string): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    const fields = fieldsFor(name);
    const first = fields[0];
    if (!first) return;
    for (const field of fields) {
      field.setAttribute(CHANGED, "true");
      window.setTimeout(() => field.removeAttribute(CHANGED), RING_MS);
    }
    first.scrollIntoView?.({ block: "nearest" });
    if (focusIsLost()) first.focus({ preventScroll: true });
  }, SETTLE_MS);
}
