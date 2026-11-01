"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { it } from "@/i18n/it";
import type { ActionResult } from "@/lib/action";

/**
 * Runs a server action from a settings form: error toast on failure, success
 * toast and a refresh of the server-rendered page otherwise.
 */
export function useRunAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function run<T>(action: Promise<ActionResult<T>>, success?: string): Promise<T | null> {
    const result = await action;
    if (!result.ok) {
      toast.error(it.errors[result.error]);
      return null;
    }
    if (success) toast.success(success);
    startTransition(() => router.refresh());
    return result.data;
  }

  return { run, pending };
}
