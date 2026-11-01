/**
 * Server action result envelope. Actions never throw for expected failures:
 * they return an error code the client maps to an Italian message
 * (it.errors[code]).
 */
export const ERROR_CODES = [
  "generic",
  "forbidden",
  "invalid",
  "not_found",
  "duplicate",
  "hierarchy",
  "dates",
  "epic_progress",
  "status_category_required",
  "status_has_issues",
  "confirm_mismatch",
  "owner_protected",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ErrorCode };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

type DbError = { code?: string; message?: string } | null | undefined;

/** Maps a PostgREST / Postgres error to an error code. */
export function dbErrorCode(error: DbError): ErrorCode {
  if (!error) return "generic";
  const message = error.message ?? "";
  if (message.includes("status_category_required")) return "status_category_required";
  if (message.includes("status_has_issues")) return "status_has_issues";
  if (message.includes("invalid hierarchy") || message.includes("issues_epic_no_parent")) return "hierarchy";
  if (message.includes("issues_dates_order")) return "dates";
  switch (error.code) {
    case "42501":
      return "forbidden";
    case "23505":
      return "duplicate";
    case "23514":
    case "22P02":
    case "23502":
      return "invalid";
    case "23503":
      return "invalid";
    case "P0002":
    case "PGRST116":
      return "not_found";
    default:
      return message.includes("row-level security") ? "forbidden" : "generic";
  }
}
