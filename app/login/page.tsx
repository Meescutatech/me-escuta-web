"use client";

import { useFormState, useFormStatus } from "react-dom";
import { entrar } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { proxima?: string };
}) {
  const [erro, formAction] = useFormState(entrar, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <h1 className="text-lg font-semibold">Me Escuta — Sistema</h1>
          <p className="text-sm text-muted-foreground">Acesso restrito. Entre para continuar.</p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="proxima" value={searchParams.proxima ?? "/timeline"} />
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="senha" className="text-sm font-medium">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
            {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
            <BotaoEntrar />
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
