import type { SuggestAction, SuggestActionType, Suggestion } from "@/lib/types";

/**
 * D-229: what a screen may show of an answer of `POST /api/ai/suggest`.
 *
 * The server already checked every action, but the screen applies only what it
 * can: an action whose type it did not list, or whose shape is not the one its
 * type promises (an older server, a malformed answer), is dropped — never shown
 * as a button that would do nothing, never repaired.
 */
export const ALL_ACTION_TYPES: readonly SuggestActionType[] = [
  "set_axes",
  "apply_preset",
  "set_index",
  "add_filter",
  "sort",
  "search",
  "open_route",
  "compare",
  "set_param",
  "map_column",
  "fill_text",
];

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** True when `name` is an own key of `table` — never one inherited ("constructor"). */
export function isOwnKey<T extends object>(table: T, name: string): name is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(table, name);
}

/** An internal path only: `/app/...`, never another site and never `//host`. */
export function isInternalPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

/** True when `action` has the shape its `type` promises. */
export function isWellFormedAction(action: unknown): action is SuggestAction {
  if (typeof action !== "object" || action === null) return false;
  const a = action as Record<string, unknown>;
  if (!isText(a.label)) return false;
  switch (a.type) {
    case "set_axes":
      return isText(a.x) && isText(a.y);
    case "apply_preset":
      return isText(a.id);
    case "set_index":
      return isText(a.slug);
    case "add_filter":
      return isText(a.field) && isText(a.value);
    case "sort":
      return isText(a.prop) && (a.dir === "asc" || a.dir === "desc");
    case "search":
      return isText(a.q);
    case "open_route":
      return isInternalPath(a.path);
    case "compare":
      return (
        Array.isArray(a.ids) &&
        a.ids.length > 0 &&
        a.ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)
      );
    case "set_param":
      return isText(a.name) && (typeof a.value === "number" || typeof a.value === "string");
    case "map_column":
      return isText(a.col) && isText(a.prop);
    case "fill_text":
      return isText(a.field) && typeof a.text === "string";
    default:
      return false;
  }
}

/**
 * The actions of one suggestion this screen can apply, in the server's order.
 *
 * `accepts` is the screen's last word (D-230b): a `set_param` whose name is not
 * a field this screen has, or a value this field would not take, is dropped
 * like any other action it cannot apply — never shown as a button that does nothing.
 */
export function visibleActions(
  suggestion: Pick<Suggestion, "actions">,
  supported: readonly SuggestActionType[],
  accepts?: (action: SuggestAction) => boolean,
): SuggestAction[] {
  return (suggestion.actions ?? []).filter(
    (action) =>
      isWellFormedAction(action) && supported.includes(action.type) && (accepts ? accepts(action) : true),
  );
}
