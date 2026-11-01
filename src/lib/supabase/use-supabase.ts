"use client";

import { useState } from "react";
import { createClient } from "./client";

/** Browser Supabase client bound to the user's session (RLS applies). */
export function useSupabase() {
  const [client] = useState(createClient);
  return client;
}
