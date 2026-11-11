/**
 * Who may open `/app/estilo` (D-202).
 *
 * The style guide is documentation for whoever maintains the product — the
 * figures of the monograph are screenshots of it — not something a student has
 * any use for, and a page that lists every token and unfinished primitive is
 * not one to leave open on the public deploy. So in production it shows to the
 * curator only (the account that can edit the shared catalogue, the same reader
 * who sees the "Administrar" group in the menu); in development, tests and CI
 * it shows to everyone, because that is where it is worked on.
 *
 * `canEdit` is `null` while the permission is unknown (loading, or the request
 * failed). Unknown is not a yes here — unlike the menu, which can afford to
 * show a link that merely opens to "somente leitura", this page would show the
 * whole thing — so it reads as restricted.
 *
 * Hiding the page is not a security boundary (the page holds no data); it is
 * the product deciding what to show.
 */
export function styleGuideVisible({
  production,
  canEdit,
}: {
  production: boolean;
  canEdit: boolean | null;
}): boolean {
  return !production || canEdit === true;
}
