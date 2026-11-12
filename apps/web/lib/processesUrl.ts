import {
  enumCodec,
  textCodec,
  type UrlCodec,
  type UrlSpec,
} from "@/lib/urlState";

/** At most this many processes side by side (D-219). */
export const MAX_COMPARE_PROCESSES = 4;

export const PROCESS_MODES = ["lista", "matriz"] as const;
export type ProcessMode = (typeof PROCESS_MODES)[number];

export const MASS_UNITS = ["kg", "g", "t"] as const;
export const THICKNESS_UNITS = ["mm", "cm", "m"] as const;

/** Comma-separated process slugs: letters, digits and hyphens only, at most 4, no repeats. */
export const slugListCodec: UrlCodec<string[]> = {
  parse: (raw) => {
    const slugs = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9-]+$/.test(s));
    return [...new Set(slugs)].slice(0, MAX_COMPARE_PROCESSES);
  },
  serialize: (value) => value.join(","),
};

export interface ProcessesUrl {
  busca: string;
  familia: string;
  subfamilia: string;
  uso: string;
  visao: "table" | "gallery" | "list";
  modo: ProcessMode;
  massa: string;
  massaUn: (typeof MASS_UNITS)[number];
  espessura: string;
  espessuraUn: (typeof THICKNESS_UNITS)[number];
  lote: string;
  comparar: string[];
}

/** D-219: the whole question of the process screen, in the address. */
export const PROCESSES_URL: UrlSpec<ProcessesUrl> = {
  busca: { param: "busca", codec: textCodec, defaultValue: "" },
  familia: { param: "familia", codec: textCodec, defaultValue: "" },
  subfamilia: { param: "subfamilia", codec: textCodec, defaultValue: "" },
  uso: {
    param: "uso",
    codec: enumCodec(["", "com", "sem"] as const),
    defaultValue: "",
  },
  visao: {
    param: "visao",
    codec: enumCodec(["table", "gallery", "list"] as const),
    defaultValue: "gallery",
  },
  modo: {
    param: "modo",
    codec: enumCodec(PROCESS_MODES),
    defaultValue: "lista",
  },
  massa: { param: "massa", codec: textCodec, defaultValue: "" },
  massaUn: {
    param: "massa_un",
    codec: enumCodec(MASS_UNITS),
    defaultValue: "kg",
  },
  espessura: { param: "espessura", codec: textCodec, defaultValue: "" },
  espessuraUn: {
    param: "espessura_un",
    codec: enumCodec(THICKNESS_UNITS),
    defaultValue: "mm",
  },
  lote: { param: "lote", codec: textCodec, defaultValue: "" },
  comparar: { param: "comparar", codec: slugListCodec, defaultValue: [] },
};
