import type { UrlCodec, UrlSpec } from "@/lib/urlState";

export type NotebookPanel = "sources" | "chat" | "studio";

const PARAM: Record<NotebookPanel, string> = {
  sources: "fontes",
  chat: "conversa",
  studio: "estudio",
};
const BY_PARAM = Object.fromEntries(
  (Object.entries(PARAM) as [NotebookPanel, string][]).map(([panel, param]) => [param, panel]),
) as Record<string, NotebookPanel>;

const panelCodec: UrlCodec<NotebookPanel> = {
  parse: (raw) => BY_PARAM[raw],
  serialize: (value) => PARAM[value],
};

/** A positive whole number, or nothing (`null`): an id in an address. */
export const idCodec: UrlCodec<number | null> = {
  parse: (raw) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : undefined),
  serialize: (value) => (value === null ? "" : String(value)),
};

/**
 * A notebook's address (D-220): `?aba=` the panel on a narrow screen,
 * `?fonte=` the source being read, `?artefato=` the Studio item that is open.
 * The notebook itself is the path, `/app/cadernos/4`.
 */
export const notebookUrlSpec: UrlSpec<{
  panel: NotebookPanel;
  source: number | null;
  artifact: number | null;
}> = {
  panel: { param: "aba", codec: panelCodec, defaultValue: "chat" },
  source: { param: "fonte", codec: idCodec, defaultValue: null },
  artifact: { param: "artefato", codec: idCodec, defaultValue: null },
};

/** The list's own view: the archived ones (`?arquivados=1`). */
export const notebooksListUrlSpec = {
  archived: {
    param: "arquivados",
    codec: {
      parse: (raw: string) => (raw === "1" ? true : undefined),
      serialize: (value: boolean) => (value ? "1" : "0"),
    } satisfies UrlCodec<boolean>,
    defaultValue: false,
  },
};

