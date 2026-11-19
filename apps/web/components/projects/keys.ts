/** Query keys of the projects with parts (D-257). */
export const ASSEMBLIES_KEY = ["assemblies"] as const;
export const assemblyKey = (id: number) => [...ASSEMBLIES_KEY, id] as const;
