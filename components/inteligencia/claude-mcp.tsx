"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Eye, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConexaoMcp, EscopoMcp } from "@/lib/ensaio/fixtures/claude";
import type { PessoaEnsaio } from "@/lib/ensaio/modo";

/**
 * CLAUDE (MCP) — usar o sistema pelo Claude, com o que o cargo já vê.
 *
 * A tela toda cabe numa coluna porque a decisão é uma só: conectar ou não. O que ela precisa
 * deixar claro antes do clique é o ESCOPO — e escopo se lê melhor em duas colunas, "lê" e "faz",
 * do que numa lista corrida: a pergunta de quem autoriza é sempre "o que isso consegue MUDAR?".
 *
 * O consentimento é um passo dentro da própria tela, não um desvio. Quem cancela volta para onde
 * estava; quem autoriza vê o endereço e os dois passos que faltam do lado do Claude.
 */

type Passo = "convite" | "consentimento" | "conectado";

export function ClaudeMcp({
  eu,
  escopo,
  conexoes,
  gestao,
  jaConectado = false,
}: {
  eu: PessoaEnsaio;
  escopo: EscopoMcp;
  conexoes: ConexaoMcp[];
  gestao: boolean;
  jaConectado?: boolean;
}) {
  const reduzido = useReducedMotion();
  const [passo, setPasso] = React.useState<Passo>(jaConectado ? "conectado" : "convite");
  const [copiado, setCopiado] = React.useState(false);
  const [lista, setLista] = React.useState(conexoes);

  const le = escopo.ferramentas.filter((f) => f.tipo === "ler");
  const faz = escopo.ferramentas.filter((f) => f.tipo === "agir");
  const endereco = "https://mcp.meescuta.com/sse";

  const animar = reduzido ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } };

  return (
    <div className="w-full px-6 py-7 2xl:px-8">
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">Claude</h1>
        <p className="mt-1 max-w-[72ch] text-[13.5px] text-muted-foreground">
          Pergunte e trabalhe pelo Claude usando os dados da Me Escuta. O acesso é o do seu login:
          o Claude não enxerga nada que você não veria na tela.
        </p>
      </header>

      <div className="max-w-[840px] overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-5 py-3">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-[13.5px] font-medium text-foreground">{escopo.titulo}</span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 text-[12px]",
              passo === "conectado" ? "text-success-ink" : "text-muted-foreground",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", passo === "conectado" ? "bg-success-ink" : "bg-muted-foreground/45")}
              aria-hidden
            />
            {passo === "conectado" ? "conectado" : "não conectado"}
          </span>
        </div>

        <div className="px-5 py-4">
          <p className="max-w-[68ch] text-[13px] leading-normal text-muted-foreground">{escopo.frase}</p>

          <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Coluna titulo="Consegue ver" icone={<Eye className="size-3.5" />} itens={le.map((f) => f.rotulo)} />
            <Coluna
              titulo="Consegue fazer"
              icone={<Pencil className="size-3.5" />}
              itens={faz.map((f) => f.rotulo)}
              acento
              vazio="Nada — só leitura."
            />
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {passo === "convite" && (
            <motion.div key="convite" {...animar} className="flex flex-wrap items-center gap-3 border-t border-border/60 px-5 py-3.5">
              <Button size="sm" onClick={() => setPasso("consentimento")}>
                Adicionar ao Claude
              </Button>
              <span className="text-[12.5px] text-muted-foreground">
                Leva um minuto e pede a sua confirmação antes de valer.
              </span>
            </motion.div>
          )}

          {passo === "consentimento" && (
            <motion.div key="consentimento" {...animar} className="border-t border-border/60 bg-muted/30 px-5 py-4">
              <p className="text-[13.5px] font-medium text-foreground">
                O Claude vai agir como {eu.nome.split(" ")[0]}
              </p>
              <ul className="mt-2 max-w-[68ch] space-y-1 text-[12.5px] text-muted-foreground">
                <li>· Tudo o que ele fizer fica registrado com o seu nome, como se você tivesse feito na tela.</li>
                <li>· Se o seu acesso mudar, o do Claude muda junto, na hora.</li>
                <li>· Você desconecta quando quiser, e o acesso morre no mesmo instante.</li>
              </ul>
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                <Button size="sm" onClick={() => setPasso("conectado")}>
                  Autorizar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPasso("convite")}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          )}

          {passo === "conectado" && (
            <motion.div key="conectado" {...animar} className="border-t border-border/60 px-5 py-4">
              <p className="text-[13.5px] font-medium text-foreground">Pronto. Falta o lado do Claude.</p>
              <ol className="mt-2 space-y-1.5 text-[12.5px] text-muted-foreground">
                <li>
                  <span className="text-foreground">1.</span> No Claude, abra Configurações › Conectores ›
                  Adicionar conector.
                </li>
                <li>
                  <span className="text-foreground">2.</span> Cole o endereço abaixo e entre com o seu login da
                  Me Escuta.
                </li>
              </ol>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[12px] text-foreground">
                  {endereco}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(endereco);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 1600);
                  }}
                >
                  {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPasso("convite")}>
                  Desconectar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {gestao && (
        <section className="mt-8 max-w-[840px]">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Quem está conectado</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Cada pessoa conecta com o próprio login. Revogar aqui derruba o acesso na hora.
          </p>
          {lista.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border px-4 py-5 text-center text-[12.5px] text-muted-foreground">
              Ninguém conectado ainda.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60 rounded-md border border-border/60">
              {lista.map((c) => (
                <li key={c.usuario_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <span className="text-[13.5px] font-medium text-foreground">{c.nome}</span>
                  <span className="text-[12px] text-muted-foreground">{c.cliente}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {c.chamadas_7d.toLocaleString("pt-BR")} chamadas · 7 d
                  </span>
                  <button
                    type="button"
                    onClick={() => setLista((l) => l.filter((x) => x.usuario_id !== c.usuario_id))}
                    className="ml-auto text-[12.5px] text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                  >
                    Revogar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Coluna({
  titulo,
  icone,
  itens,
  acento,
  vazio,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: string[];
  acento?: boolean;
  vazio?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className={cn(acento ? "text-primary" : "text-muted-foreground")}>{icone}</span>
        {titulo}
      </p>
      {itens.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {itens.map((i) => (
            <li key={i} className="text-[13px] text-foreground">
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
