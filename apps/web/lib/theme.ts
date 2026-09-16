/**
 * Theme preference: what the reader asked for, and what that resolves to.
 *
 * "system" is a real preference, not the absence of one — a reader who follows
 * their OS wants the page to follow it too, including when the OS flips at
 * sunset while the tab is open.
 */

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "materialselect:theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs before first paint, inlined in the document head.
 *
 * It has to be blocking and it has to be duplicated logic: React has not
 * hydrated yet, and a theme applied after paint is a white flash for every dark
 * reader. Kept to one statement so it stays auditable.
 */
export const THEME_BOOTSTRAP_SCRIPT = `!function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches;document.documentElement.dataset.theme=(p==="light"||p==="dark")?p:(d?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}}()`;

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Private mode, or storage disabled. Following the OS is the safe default.
    return "system";
  }
}

export function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * Quem está ouvindo a preferência mudar.
 *
 * `localStorage` dispara `storage` para as **outras** abas e nunca para a que
 * escreveu, então uma aba que só escutasse o evento não veria o próprio clique.
 * Este conjunto cobre essa metade; o `storage` cobre a outra.
 */
const preferenceListeners = new Set<() => void>();

/**
 * Assinatura da preferência, no formato que `useSyncExternalStore` espera.
 *
 * A preferência mora em `localStorage`, que é uma fonte **externa** ao React —
 * e ler uma fonte externa dentro de um `useEffect` com `setState` é exatamente
 * o que a regra `react-hooks/set-state-in-effect` acusa, com razão: são dois
 * renders onde bastava um, e a leitura fica fora de sincronia com qualquer
 * outra coisa que escreva na chave. `useSyncExternalStore` é a ferramenta feita
 * para isto, e traz de brinde o par de snapshots que resolve a hidratação: o do
 * servidor devolve `null` (o servidor não sabe o que o leitor guardou), o do
 * cliente devolve a preferência de verdade, e o React troca um pelo outro
 * depois de hidratar sem reclamar de divergência.
 */
export function subscribePreference(onChange: () => void): () => void {
  preferenceListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * O snapshot do servidor. Sempre `null`, e é o que mantém o contrato antigo:
 * nada é pintado até montar, porque qualquer marcação emitida no servidor
 * estaria errada para alguém.
 */
export function serverPreference(): null {
  return null;
}

/** Write the resolved theme to the document and remember the preference. */
export function applyPreference(preference: ThemePreference): Theme {
  const theme = resolveTheme(preference);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Preference is not persisted; the session still honours it.
  }
  for (const listener of preferenceListeners) listener();
  return theme;
}

/** Subscribe to OS changes. Only meaningful while the preference is "system". */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light");
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}
