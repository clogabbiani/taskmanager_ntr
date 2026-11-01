import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client bound to the signed-in user's session (anon key + JWT), so
 * every query is subject to RLS. Use in Server Components, Server Actions and
 * Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = publicEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there and the
          // middleware takes care of refreshing the session.
        }
      },
    },
  });
}
