/** React Query keys of the Cadernos, in one place so invalidation cannot miss. */
export const NOTEBOOKS_KEY = ["notebooks"] as const;
export const notebookKey = (id: number) => ["notebook", id] as const;
export const messagesKey = (id: number) => ["notebook", id, "messages"] as const;
