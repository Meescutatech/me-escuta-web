"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, PencilLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Marca } from "@/components/ui/marca";
import { cn } from "@/lib/utils";
import type { PessoaEnsaio } from "@/lib/ensaio/modo";
import type { EscopoMcp } from "@/lib/ensaio/fixtures/claude";

/**
 * /oauth/autorizar (ensaio) — a TELA DE CONSENTIMENTO da Me Escuta, a que o Claude abre quando
 * alguém adiciona o conector. Um card, três blocos: QUEM pede (o Claude), COMO você vai entrar
 * (nome · cargo) e O QUE ele vai poder (as ferramentas do seu cargo, ler × agir). Autorizar ou
 * cancelar; nada mais. Padrão dos consentimentos OAuth que as pessoas já conhecem (Google,
 * GitHub), no idioma da casa.
 */
export function OauthAutorizar({ eu, escopo, escopoTitulo, volta }: { eu: PessoaEnsaio; escopo: EscopoMcp; escopoTitulo: string; volta: string }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [decidiu, setDecidiu] = useState<"sim" | "nao" | null>(null);

  const autorizar = () => {
    setDecidiu("sim");
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 900));
      router.push(`${volta}${volta.includes("?") ? "&" : "?"}conectado=1`);
    });
  };
  const cancelar = () => {
    setDecidiu("nao");
    router.push(volta);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 flex items-center justify-center gap-4">
          <span className="grid size-11 place-items-center rounded-xl border border-border bg-card text-ui-12 font-bold text-foreground" aria-label="Claude">
            Cl
          </span>
          <span className="h-px w-8 bg-border" aria-hidden />
          <div className="rounded-xl border border-border bg-card p-2">
            <Marca />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-7">
          <h1 className="text-h3 font-semibold leading-snug text-foreground">O Claude quer acessar a Me Escuta</h1>
          <p className="mt-2 text-ui-13 text-muted-foreground">
            como <span className="font-medium text-foreground">{eu.nome}</span> · {escopoTitulo}
          </p>

          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Ele vai poder
            </div>
            {escopo.ferramentas.map((f, i) => (
              <div key={f.chave} className={cn("flex items-start gap-2.5 px-3 py-2.5", i > 0 && "border-t border-border")}>
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", f.tipo === "ler" ? "bg-muted text-muted-foreground" : "bg-navy/10 text-navy")}>
                  {f.tipo === "ler" ? <EyeIcon className="size-3" /> : <PencilLineIcon className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-ui-13 font-medium text-foreground">{f.rotulo}</span>
                  <span className="block text-ui-12 text-muted-foreground">{f.descricao}</span>
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-ui-12 leading-relaxed text-muted-foreground">
            Tudo o que o Claude fizer fica registrado no seu nome, como se fosse você na tela. Você pode desconectar quando quiser em Configurações › Claude.
          </p>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={cancelar} disabled={pendente}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={autorizar} disabled={pendente}>
              {decidiu === "sim" ? "Conectando…" : "Autorizar"}
            </Button>
          </div>
        </div>
        <p className="mt-4 text-center text-ui-11 text-muted-foreground">mcp.meescuta.com · pedido de claude.ai</p>
      </div>
    </main>
  );
}
