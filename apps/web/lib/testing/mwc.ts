import { act } from "@testing-library/react";

/**
 * Picks an option on an `md-outlined-select`/`md-filled-select` in tests.
 *
 * `@testing-library/user-event`'s `selectOptions` assumes a native
 * `<select>` (an `.options`/`.selectedOptions` collection, a `change` event
 * the browser fires for you) — none of which `md-outlined-select` has. Its
 * own public `select(value)` API updates the control but, unlike a real
 * click through the menu, does not fire `input`/`change` itself (only the
 * click/typeahead paths call the private `dispatchInteractionEvents()` —
 * see `select.js`). Firing `change` here is what the app's `onChange`
 * actually listens for, so this reproduces the one part of a real
 * interaction our components depend on without touching that private method.
 *
 * `element` is the node returned by `getByShadowRole("combobox", ...)` — the
 * `role="combobox"` field lives one shadow boundary *inside* the select
 * host, so this climbs back out to the host, which is where `select()` and
 * form-associated `.value` actually live.
 */
export function selectMwcOption(element: Element, value: string) {
  const host = ((element.getRootNode() as ShadowRoot)?.host ?? element) as HTMLElement & {
    select: (value: string) => void;
  };
  act(() => {
    host.select(value);
    host.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
