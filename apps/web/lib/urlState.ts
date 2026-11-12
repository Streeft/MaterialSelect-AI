import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

/**
 * A screen's inputs in the query string (D-212), generalizing what
 * `app/app/mapas/url-state.ts` already did for the map: a link carries the
 * question, a reload keeps it, and a value read back from the URL is untrusted
 * input that is kept only if it has the right shape — never repaired, never
 * thrown on (a bad parameter falls back to the screen's default).
 *
 * The window's own `location.search` is the single source of truth, read
 * through `useSyncExternalStore`, and writes go through `history.replaceState`
 * (which Next.js 14.1+ keeps in sync with its router). That makes a write
 * synchronous: a controlled `<input>` whose value lives in the URL keeps every
 * keystroke and its caret, which a `router.replace` (a transition) does not
 * guarantee. `replaceState`, not `pushState`: each keystroke is not a step the
 * Back button should walk through.
 *
 * A value equal to its default leaves the URL, so an untouched screen keeps a
 * clean address and an old link still opens with today's defaults.
 */

/** How one value travels as one query parameter. */
export interface UrlCodec<T> {
  /** `undefined` for a malformed value: the default applies. */
  parse(raw: string): T | undefined;
  serialize(value: T): string;
}

/** One field of a screen's state: the parameter, how it is coded, its default. */
export interface UrlParam<T> {
  param: string;
  codec: UrlCodec<T>;
  defaultValue: T;
}

export type UrlSpec<S> = { [K in keyof S]: UrlParam<S[K]> };
export type UrlPatch<S> = Partial<S> | ((current: S) => Partial<S>);

// ---------------------------------------------------------------------------
// Codecs

/** Free text, kept as typed (a number field keeps "0,5" or "1." mid-typing). */
export const textCodec: UrlCodec<string> = {
  parse: (raw) => raw,
  serialize: (value) => value,
};

/** One of a closed list: anything else in the URL is ignored. */
export function enumCodec<T extends string>(allowed: readonly T[]): UrlCodec<T> {
  return {
    parse: (raw) => ((allowed as readonly string[]).includes(raw) ? (raw as T) : undefined),
    serialize: (value) => value,
  };
}

/** "1"/"0". */
export const boolCodec: UrlCodec<boolean> = {
  parse: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
  serialize: (value) => (value ? "1" : "0"),
};

/**
 * Base64url-encoded JSON, for a value with structure (the map's whole state,
 * a set of named inputs). btoa operates on UTF-16 code units, so the JSON is
 * passed through encodeURIComponent/unescape first (a "±" survives), and the
 * base64url alphabet (- and _) keeps it safe unescaped in a query string.
 */
export function encodeUrlJson(value: unknown): string {
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of `encodeUrlJson`; `undefined` on any malformed input. */
export function decodeUrlJson(param: string): unknown {
  try {
    const base64 = param.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch {
    return undefined;
  }
}

/** JSON with a shape check: what fails `guard` is dropped, never repaired. */
export function jsonCodec<T>(guard: (value: unknown) => value is T): UrlCodec<T> {
  return {
    parse: (raw) => {
      const decoded = decodeUrlJson(raw);
      return guard(decoded) ? decoded : undefined;
    },
    serialize: (value) => encodeUrlJson(value),
  };
}

/** A flat `{ name: text }` record, as a form of named inputs is. */
export function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

// ---------------------------------------------------------------------------
// Pure reading and writing (exported for tests and for links built elsewhere)

/** The state a query string describes, field by field, defaults filling the gaps. */
export function readUrlState<S>(spec: UrlSpec<S>, search: string): S {
  const params = new URLSearchParams(search);
  const out = {} as S;
  for (const key of Object.keys(spec) as (keyof S)[]) {
    const field = spec[key];
    const raw = params.get(field.param);
    const parsed = raw === null ? undefined : field.codec.parse(raw);
    out[key] = parsed === undefined ? field.defaultValue : parsed;
  }
  return out;
}

/**
 * The query string after writing `values`: every other parameter is kept, and
 * a field equal to its default is removed rather than spelled out.
 */
export function writeUrlState<S>(spec: UrlSpec<S>, search: string, values: Partial<S>): string {
  const params = new URLSearchParams(search);
  for (const key of Object.keys(values) as (keyof S)[]) {
    const field = spec[key];
    if (!field) continue;
    const value = values[key] as S[keyof S];
    const text = field.codec.serialize(value);
    if (text === field.codec.serialize(field.defaultValue)) params.delete(field.param);
    else params.set(field.param, text);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ---------------------------------------------------------------------------
// The store: `location.search`, with a notification when this module writes it.

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

const getSnapshot = () => window.location.search;

function replaceSearch(search: string) {
  if (search === window.location.search) return;
  const { pathname, hash } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}${hash}`);
  emit();
}

/**
 * A screen's state, read from and written to the URL.
 *
 * `spec` must be stable (a module-level constant): it names the parameters.
 * The setter takes a patch — several fields change in one write, so an
 * archetype that fills five inputs is one history entry and one render.
 */
export function useUrlState<S>(spec: UrlSpec<S>): [S, (patch: UrlPatch<S>) => void] {
  // Next's own navigations (a <Link> to this same route with other params)
  // write the URL without telling this store; its `useSearchParams` does
  // re-render, and the effect below re-reads `location` once it has settled.
  const nextParams = useSearchParams();
  const serverSearch = nextParams ? `?${nextParams.toString()}` : "";
  const search = useSyncExternalStore(subscribe, getSnapshot, () => serverSearch);
  useEffect(() => {
    emit();
  }, [serverSearch]);

  const state = useMemo(() => readUrlState(spec, search), [spec, search]);

  const setState = useCallback(
    (patch: UrlPatch<S>) => {
      // Read the URL at write time, not the render's copy: two writes in one
      // handler must both land.
      const current = readUrlState(spec, window.location.search);
      const values = typeof patch === "function" ? patch(current) : patch;
      replaceSearch(writeUrlState(spec, window.location.search, values));
    },
    [spec],
  );

  return [state, setState];
}
