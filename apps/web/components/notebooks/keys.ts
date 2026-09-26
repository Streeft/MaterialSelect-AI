/** React Query keys of the Cadernos, in one place so invalidation cannot miss. */
export const NOTEBOOKS_KEY = ["notebooks"] as const;
export const notebookKey = (id: number) => ["notebook", id] as const;
export const messagesKey = (id: number) => ["notebook", id, "messages"] as const;
export const STUDIO_CATALOG_KEY = ["notebooks", "studio-catalog"] as const;
export const studioKey = (id: number) => ["notebook", id, "studio"] as const;
export const artifactKey = (id: number, artifactId: number) =>
  ["notebook", id, "studio", artifactId] as const;
/** What outside sources are switched on — static per deployment (D-97). */
export const SOURCE_CAPABILITIES_KEY = ["notebooks", "source-capabilities"] as const;
