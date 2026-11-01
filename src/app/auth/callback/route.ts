import { NextResponse, type NextRequest } from "next/server";
import { isAllowListRejection, safeNextPath } from "@/features/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback (ADR-001). Exchanges the code for a session, then asks the DB
 * (`claim_signin`, SECURITY DEFINER) whether the email is in allowed_signins.
 * Authorised: provisions users + workspace_members on first sign-in.
 * Not authorised: the session is terminated and no TASKME user is created.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    const description = searchParams.get("error_description") ?? searchParams.get("error");
    const target = isAllowListRejection(description) ? "/unauthorized" : "/login?error=oauth";
    return NextResponse.redirect(new URL(target, origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  const { data: allowed, error: claimError } = await supabase.rpc("claim_signin");
  if (claimError || allowed !== true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
