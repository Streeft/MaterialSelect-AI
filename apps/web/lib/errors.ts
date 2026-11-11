import { errorsText } from "./i18n-errors";

export type ApiErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "invalid"
  | "rateLimited"
  | "server"
  | "unknown";

/** Words that mark a message as written for developers, never for the screen. */
const TECHNICAL =
  /sqlalchemy|psycopg|asyncpg|traceback|internal server error|failed to fetch|networkerror|load failed|falha na requisi|\.py\b|\bundefined\b|\bnull\b|<!doctype|<html|exception|^error\b|typeerror|syntaxerror/i;

/** The shape of `ApiError` (an Error with a numeric `status`); read by shape so a partial mock of `lib/api` in a test cannot break it. */
type ApiErrorLike = Error & { status: number };

function isApiError(error: unknown): error is ApiErrorLike {
  return error instanceof Error && typeof (error as { status?: unknown }).status === "number";
}

/** Which failure this is, from the HTTP status; a thrown non-API error is a network failure. */
export function apiErrorKind(error: unknown): ApiErrorKind {
  if (isApiError(error)) {
    const s = error.status;
    if (s === 0) return "network";
    if (s === 401) return "unauthorized";
    if (s === 403) return "forbidden";
    if (s === 404) return "notFound";
    if (s === 409) return "conflict";
    if (s === 400 || s === 422) return "invalid";
    if (s === 429) return "rateLimited";
    if (s >= 500) return "server";
    return "unknown";
  }
  // `fetch` rejects with a TypeError ("Failed to fetch") when nothing answered.
  if (error instanceof TypeError) return "network";
  return "unknown";
}

/** A server message is shown only when it reads as a sentence for a person. */
function humanDetail(error: ApiErrorLike): string | null {
  const text = error.message.trim();
  if (!text || text.length > 300 || TECHNICAL.test(text)) return null;
  return text;
}

/**
 * The one place that turns a failure into text for the screen (D-200). Never
 * returns a technical message: network, 401, 403, 404, 409, 422, 429 and 5xx
 * each have a sentence in Portuguese. For other 4xx the server's own detail
 * wins when it is readable — it says what to fix ("Nome já em uso") — and a
 * 5xx never does, since its text can carry SQL or a path.
 */
export function describeApiError(error: unknown, fallback?: string): string {
  const kind = apiErrorKind(error);
  // A 4xx says what to fix or why it was refused ("Variáveis desconhecidas",
  // "limite diário"): its sentence wins when readable. 401 and 5xx never do.
  if (
    isApiError(error) &&
    kind !== "unauthorized" &&
    kind !== "server" &&
    kind !== "network"
  ) {
    const detail = humanDetail(error);
    if (detail) return detail;
  }
  if (kind === "unknown") return fallback ?? errorsText.unknown;
  return errorsText[kind];
}

/** A short heading to go with the description, when the kind has one. */
export function describeApiErrorTitle(error: unknown): string | undefined {
  const kind = apiErrorKind(error);
  if (kind === "network" || kind === "unauthorized" || kind === "forbidden" || kind === "notFound" || kind === "server") {
    return errorsText.titles[kind];
  }
  return undefined;
}

/** True for a 404: "this record does not exist", as opposed to "the request failed". */
export function isNotFound(error: unknown): boolean {
  return apiErrorKind(error) === "notFound";
}
