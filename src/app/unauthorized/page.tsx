import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { it } from "@/i18n/it";

export const metadata: Metadata = { title: it.auth.unauthorizedTitle };

export default function UnauthorizedPage() {
  return (
    <main className="bg-muted/40 flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <ShieldX aria-hidden="true" className="text-destructive mx-auto size-10" />
          <CardTitle className="text-xl">
            <h1>{it.auth.unauthorizedTitle}</h1>
          </CardTitle>
          <CardDescription>{it.auth.unauthorizedBody}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/login">{it.auth.unauthorizedBack}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
