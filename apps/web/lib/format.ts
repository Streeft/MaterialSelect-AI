// Number/unit formatting helpers for the material sheet.

/**
 * Format a number for display using pt-BR conventions, switching to compact
 * scientific notation for very large or very small magnitudes (common with SI
 * canonical units such as Pa).
 */
const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

export function formatNumber(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-3) {
    // Scientific notation, e.g. 2,1 × 10¹¹. The exponent is a real superscript
    // (D-80): "10^11" is how a keyboard writes it, not how a reader reads it.
    const exponent = Math.floor(Math.log10(abs));
    const mantissa = value / Math.pow(10, exponent);
    const power = String(exponent)
      .split("")
      .map((char) => SUPERSCRIPT[char] ?? char)
      .join("");
    return `${mantissa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} × 10${power}`;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

/**
 * A dimensionless score with a fixed number of decimals, in pt-BR.
 *
 * `toFixed` is the obvious call and the wrong one: it always writes a period,
 * so a comparison table ended up showing "3.900" for the density beside "0.00"
 * for its normalised score — the same glyph meaning thousands in one column and
 * decimals in the next. The count of decimals is fixed on purpose: these are
 * ranked numbers, and a column where 1 and 0,75 have different widths is read
 * as different precisions.
 */
export function formatScore(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A percentage already computed by the backend (0–100), in pt-BR.
 *
 * Takes the number as-is rather than dividing by 100 itself: `share()` in
 * `app/calculations/statistics.py` already rounds to one decimal, and a second
 * rounding here could show a figure and its data table disagreeing by 0,1 pp.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/**
 * A counted noun. Portuguese agrees with the number, and "1 restrições" reads
 * as a bug in the calculation even when the calculation is right. Both forms
 * come from the dictionary; this only picks one.
 */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A timestamp from the API as a pt-BR date.
 *
 * Returns `null` — never a placeholder — when the string is not a date the
 * browser understands: a caller has to decide what an unknown date looks like,
 * and it is never a dash in a column of real ones.
 */
export function formatDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Render a Pint unit or dimensionality string more readably.
 *
 * Handles both compact units (`kg/m**3`) and the spaced dimensionality strings
 * derived for performance indices (`[length] ** 2.5 / [mass] ** 0.5`). Squares
 * and cubes become superscripts; any other exponent becomes `^n`. Crucially,
 * `** 2.5` must NOT be read as a square — hence the lookahead — and no `**`
 * may survive to be mangled into `··` by the multiplication rule.
 */
export function prettyUnit(unit: string | null): string {
  if (!unit || unit === "dimensionless")
    return unit === "dimensionless" ? "—" : "";
  return (
    unit
      // As duas escalas que o Pint escreve por extenso. Desde o D-70 elas chegam
      // à tela de verdade — °C é a convenção de leitura da temperatura de serviço
      // —, e ninguém nunca viu "degC" numa tabela de materiais. Espelha
      // `pretty_unit` em `app/calculations/units.py`; só o rótulo muda, o método
      // de conversão continua guardando `degC`, que é o que o Pint sabe reler.
      .replace(/\bdegC\b/g, "°C")
      .replace(/\bdegF\b/g, "°F")
      .replace(/\s*\*\*\s*3(?![\d.])/g, "³")
      .replace(/\s*\*\*\s*2(?![\d.])/g, "²")
      .replace(/\s*\*\*\s*/g, "^")
      .replace(/\*/g, "·")
  );
}
