import type { Metadata } from "next";
import { it } from "@/i18n/it";

export const metadata: Metadata = { title: it.myTasks.title };

export default function MyTasksPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{it.myTasks.title}</h1>
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        {it.myTasks.placeholder}
      </div>
    </section>
  );
}
