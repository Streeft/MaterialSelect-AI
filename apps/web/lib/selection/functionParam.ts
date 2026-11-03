/**
 * D-195: the home's composer hands the wizard what the part must do, as text,
 * in `?funcao=`. Text only — nothing in it ever becomes a number.
 */
export const FUNCTION_PARAM = "funcao";

/** The longest function text the composer may hand over. */
export const FUNCTION_PARAM_MAX = 500;

/** The wizard's address with the function already written; blank text opens it empty. */
export function selectionHrefWithFunction(text: string): string {
  const trimmed = text.trim().slice(0, FUNCTION_PARAM_MAX);
  if (!trimmed) return "/app/selecao";
  const query = new URLSearchParams({ etapa: "funcao", [FUNCTION_PARAM]: trimmed });
  return `/app/selecao?${query.toString()}`;
}

/** What the wizard starts with, read from its own address. */
export function functionFromParams(params: { get(name: string): string | null }): string {
  return (params.get(FUNCTION_PARAM) ?? "").slice(0, FUNCTION_PARAM_MAX);
}
