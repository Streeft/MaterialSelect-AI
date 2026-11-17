/**
 * The address rules the laudo dialog checks while the person types (D-242).
 *
 * A courtesy and nothing more: the server applies the same rule
 * (`app/domain/email_address.py`) and is the one that decides. Keeping the two in
 * step means a chip the screen accepts is not refused a second later.
 */

/** "Para" and "Cópia" each carry at most this many addresses. */
export const MAX_ADDRESSES = 5;

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^[A-Za-z]{2,24}$/;

/** `local@dominio.tld`, ASCII, one `@`, a dotted domain ending in letters. */
export function isValidEmail(value: string): boolean {
  if (!value || value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local = "", domain = ""] = parts;
  if (!local || local.length > 64 || !LOCAL.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return false;
  return TLD.test(labels[labels.length - 1] ?? "");
}

/** What a typed or pasted text holds, split at commas, semicolons, spaces and line breaks. */
export function splitAddresses(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The same address, spelled in capitals or not, counts once. */
export function hasAddress(list: readonly string[], address: string): boolean {
  const key = address.toLowerCase();
  return list.some((item) => item.toLowerCase() === key);
}
