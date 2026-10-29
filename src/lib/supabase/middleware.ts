import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, loginRedirectPath } from "@/features/auth/redirect";
import { publicEnv } from "@/lib/env";

/** Refreshes the Supabase session cookie and gates non-public routes. */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { supabaseUrl, supabaseAnonKey } = publicEnv();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = loginRedirectPath(pathname + search);
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  return response;
}
