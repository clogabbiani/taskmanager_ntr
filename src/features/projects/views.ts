import type { Messages } from "@/i18n/it";

export type ProjectViewKey = keyof Messages["project"]["views"];

/** Project view tabs in display order; only the table ships before M2. */
export const PROJECT_VIEWS: { key: ProjectViewKey; enabled: boolean }[] = [
  { key: "table", enabled: true },
  { key: "board", enabled: false },
  { key: "timeline", enabled: false },
  { key: "calendar", enabled: false },
];
