/**
 * Role checks of CLAUDE.md §4, used by server actions on top of RLS and by the
 * UI to hide or disable controls.
 */
import type { Role } from "@/features/issues/model";

/** Create, edit and comment issues. */
export const canWrite = (role: Role) => role === "owner" || role === "admin" || role === "member";

/** Projects, statuses, labels, members, allow-list, hard delete. */
export const canAdmin = (role: Role) => role === "owner" || role === "admin";

/** Members archive only issues they created; admins any. */
export const canArchive = (role: Role, userId: string, createdBy: string | null) =>
  canAdmin(role) || (canWrite(role) && createdBy === userId);

/**
 * Role changes: admins manage every role except the owner's, and only the owner
 * grants or revokes 'owner'.
 */
export function canChangeRole(actor: Role, targetCurrent: Role, targetNext: Role): boolean {
  if (!canAdmin(actor)) return false;
  if (actor === "owner") return true;
  return targetCurrent !== "owner" && targetNext !== "owner";
}

/** Shared saved views are edited by their author and by admins. */
export const canEditView = (role: Role, userId: string, view: { owner_id: string; is_shared: boolean }) =>
  view.owner_id === userId || (view.is_shared && canAdmin(role));
