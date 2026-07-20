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

export default function LoginPage({ searchParams }: { searchParams: { proxima?: string } }) {
  const [erro, formAction] = useFormState(entrar, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full shadow-forte">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-laranja text-lg text-branco shadow-laranja">
              👂
            </span>
            <span className="font-serif text-lg font-semibold text-navy">
              me <b className="font-bold text-laranja">escuta</b>
            </span>
          </div>
          <p className="text-sm text-suave">Acesso restrito ao sistema. Entre para continuar.</p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="proxima" value={searchParams.proxima ?? "/funil"} />
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-navy">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-md border border-borda-forte bg-creme px-3 py-2 text-sm outline-none focus:border-laranja focus:bg-branco"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="senha" className="text-sm font-medium text-navy">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-borda-forte bg-creme px-3 py-2 text-sm outline-none focus:border-laranja focus:bg-branco"
              />
            </div>
            {erro ? <p className="text-sm text-vermelho">{erro}</p> : null}
            <BotaoEntrar />
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
