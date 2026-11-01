import type { Metadata } from "next";
import { GoogleSignInButton } from "@/features/auth/google-sign-in-button";
import { safeNextPath } from "@/features/auth/redirect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { it } from "@/i18n/it";

export const metadata: Metadata = { title: it.auth.loginTitle };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="bg-muted/40 flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{it.app.name}</p>
          <CardTitle className="text-xl">
            <h1>{it.auth.loginTitle}</h1>
          </CardTitle>
          <CardDescription>{it.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-destructive text-center text-sm">
              {it.auth.loginError}
            </p>
          ) : null}
          <GoogleSignInButton next={safeNextPath(next)} />
        </CardContent>
      </Card>
    </main>
  );
}
