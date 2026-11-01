/**
 * Ordering keys for manual ordering (issues.rank), see ADR-002.
 *
 * Ranks are base-36 strings ([0-9a-z]) compared lexicographically. A key never
 * ends with "0", so there is always room for a key between two others: the key
 * between "a" and "b" is "ah", between "a" and "a1" is "a0i", and so on.
 * Keys only grow when repeatedly inserting at the same spot; a rebalance can
 * reissue short keys later if that ever matters (it does not at our scale).
 */
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

const VALID = /^[0-9a-z]*[1-9a-z]$/;

function assertValid(key: string) {
  if (!VALID.test(key)) throw new Error(`Invalid rank "${key}"`);
}

function digit(ch: string | undefined): number {
  return ch === undefined ? 0 : DIGITS.indexOf(ch);
}

/** Key strictly between a and b; "" means -infinity for a, null means +infinity for b. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = digit(a[0]);
  const db = b !== null ? digit(b[0]) : BASE;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

/** Rank strictly between a and b. Either bound may be null (open end). */
export function between(a: string | null, b: string | null): string {
  if (a !== null) assertValid(a);
  if (b !== null) assertValid(b);
  if (a !== null && b !== null && a >= b) throw new Error(`Rank bounds out of order: "${a}" >= "${b}"`);
  return midpoint(a ?? "", b);
}

/** Rank before the first item (whose rank is `first`). */
export function before(first: string | null): string {
  return between(null, first);
}

/** Rank after the last item (whose rank is `last`). */
export function after(last: string | null): string {
  return between(last, null);
}

/** Initial ranks for n items in order (used by imports and backfills). */
export function sequence(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = after(prev);
    out.push(prev);
  }
  return out;
}

/** Comparator for sorting by rank with nulls last (byte order, not locale). */
export function compareRanks(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}
