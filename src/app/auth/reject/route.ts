import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Used when a signed-in session has no workspace membership (e.g. removed from
 * the allow-list): Server Components cannot clear cookies, so they redirect here.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/unauthorized", request.nextUrl.origin));
}
