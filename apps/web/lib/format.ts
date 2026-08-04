// Number/unit formatting helpers for the material sheet.

/**
 * Format a number for display using pt-BR conventions, switching to compact
 * scientific notation for very large or very small magnitudes (common with SI
 * canonical units such as Pa).
 */
export function formatNumber(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-3) {
    // Scientific notation, e.g. 2,10 × 10^11
    const exponent = Math.floor(Math.log10(abs));
    const mantissa = value / Math.pow(10, exponent);
    return `${mantissa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} × 10^${exponent}`;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
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
  if (!unit || unit === "dimensionless") return unit === "dimensionless" ? "—" : "";
  return unit
    .replace(/\s*\*\*\s*3(?![\d.])/g, "³")
    .replace(/\s*\*\*\s*2(?![\d.])/g, "²")
    .replace(/\s*\*\*\s*/g, "^")
    .replace(/\*/g, "·");
}
