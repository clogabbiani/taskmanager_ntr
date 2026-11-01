"use client";

import { createContext, useContext } from "react";
import type { CurrentMember } from "@/features/auth/session";
import type { ProjectSummary } from "@/features/projects/queries";

type AppContextValue = { member: CurrentMember; projects: ProjectSummary[] };

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: React.ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Signed-in member and readable projects, provided by the (app) layout. */
export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}
