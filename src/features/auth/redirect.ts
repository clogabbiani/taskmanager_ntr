/** Routes reachable without a session. */
const PUBLIC_PREFIXES = ["/login", "/unauthorized", "/auth/"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * Sanitises a post-login redirect target: only same-origin absolute paths are
 * accepted, protocol-relative ("//evil.com") and backslash tricks are rejected.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  if (isPublicPath(next.split("?")[0]!)) {
    return fallback;
  }
  return next;
}

/** The `next` parameter to attach when bouncing an anonymous user to /login. */
export function loginRedirectPath(pathWithSearch: string): string | null {
  const safe = safeNextPath(pathWithSearch, "");
  return safe === "" || safe === "/" ? null : safe;
}

/**
 * Supabase redirects back with `error` / `error_description` when the OAuth flow
 * fails. A rejection by the before-user-created hook carries our marker message.
 */
export function isAllowListRejection(errorDescription: string | null | undefined): boolean {
  return !!errorDescription && /signin_not_allowed/i.test(errorDescription);
}
