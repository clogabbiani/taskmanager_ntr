/**
 * Date helpers. Calendar dates (start_date, due_date) travel as "yyyy-MM-dd"
 * strings and are shown as gg/mm/aaaa; timestamps are shown relative
 * ("2 ore fa") with the Italian locale.
 */
import { format, formatDistance, isValid, parse, parseISO } from "date-fns";
import { it } from "date-fns/locale";

const ISO_DATE = "yyyy-MM-dd";

/** "2026-11-30" → Date at local midnight (null when empty or invalid). */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parse(value, ISO_DATE, new Date());
  return isValid(d) ? d : null;
}

/** Date → "2026-11-30" in local time. */
export function toIsoDate(date: Date): string {
  return format(date, ISO_DATE);
}

/** "2026-11-30" → "30/11/2026". */
export function formatDate(value: string | null | undefined): string {
  const d = parseIsoDate(value);
  return d ? format(d, "dd/MM/yyyy") : "";
}

/** "30/11/2026" → "2026-11-30" (null when invalid). */
export function parseItalianDate(value: string): string | null {
  const d = parse(value.trim(), "dd/MM/yyyy", new Date());
  return isValid(d) && /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim()) ? toIsoDate(d) : null;
}

/** Timestamp → "2 ore fa". */
export function formatRelative(timestamp: string, now: Date = new Date()): string {
  const d = parseISO(timestamp);
  if (!isValid(d)) return "";
  return formatDistance(d, now, { addSuffix: true, locale: it });
}

/** Timestamp → "30/11/2026 14:05". */
export function formatDateTime(timestamp: string): string {
  const d = parseISO(timestamp);
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm") : "";
}

/** True when the due date is before today (local). */
export function isOverdue(due: string | null | undefined, today: Date = new Date()): boolean {
  const d = parseIsoDate(due);
  return d !== null && d < parse(toIsoDate(today), ISO_DATE, today);
}
