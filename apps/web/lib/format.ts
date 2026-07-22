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

/** Render a unit string in a slightly more readable form (m**3 -> m³ etc.). */
export function prettyUnit(unit: string | null): string {
  if (!unit || unit === "dimensionless") return unit === "dimensionless" ? "—" : "";
  return unit
    .replace(/\*\*3/g, "³")
    .replace(/\*\*2/g, "²")
    .replace(/\*/g, "·");
}
