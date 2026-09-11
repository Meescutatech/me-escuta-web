"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { EstadoIntegracao, Integracao } from "@/lib/ensaio/fixtures/integracoes";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/integracoes (ensaio) — um card por serviço, ordenados por importância para a
 * operação (a Meta primeiro: é dela que nascem os números). Cada card responde três coisas na
 * primeira linha — o que é, para que serve, em que estado está — e abre para os detalhes
 * técnicos (ids, webhook, validade de token). O detalhe fica FECHADO por padrão porque quem abre
 * esta tela quase sempre quer só saber "está tudo ligado?".
 *
 * Os estados usam a tríade tint/ink do preset (verde · âmbar · cinza), nunca a cor cheia.
 */

const ESTADO: Record<EstadoIntegracao, { rotulo: string; variante: "success" | "warning" | "muted" | "outline" }> = {
  conectada: { rotulo: "conectada", variante: "success" },
  atencao: { rotulo: "atenção", variante: "warning" },
  desconectada: { rotulo: "em espera", variante: "muted" },
  nao_configurada: { rotulo: "não configurada", variante: "outline" },
};

export function IntegracoesEnsaio({
  integracoes,
  gestao,
  titulo = "Integrações",
  descricao = "Com quem o sistema se conecta e como. Números de WhatsApp ficam em Números — aqui é o encanamento que faz os números existirem.",
}: {
  integracoes: Integracao[];
  gestao: boolean;
  titulo?: string;
  descricao?: string;
}) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set(["meta"]));
  const alternar = (chave: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  const copiar = async (valor: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast(valor);
    }
  };

  const conectadas = integracoes.filter((i) => i.estado === "conectada").length;

  return (
    <CascaConfig
      largo
      titulo={titulo}
      descricao={descricao}
    >
      <p className="text-ui-12 text-muted-foreground">
        {conectadas} de {integracoes.length} conectadas · Constituição §1.3: o que fica se integra, o que sai (Kommo) só exporta.
      </p>

      <div className="flex flex-col gap-3">
        {integracoes.map((i) => {
          const aberta = abertas.has(i.chave);
          const e = ESTADO[i.estado];
          return (
            <article key={i.chave} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => alternar(i.chave)}
                aria-expanded={aberta}
                className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg text-ui-12 font-bold",
                    i.estado === "conectada" ? "bg-success-tint text-success-ink" : i.estado === "atencao" ? "bg-warning-tint text-warning-ink" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {i.nome.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-ui-14 font-semibold text-foreground">{i.nome}</span>
                    <span className="text-ui-12 text-muted-foreground">{i.fornecedor}</span>
                    <Badge variant={e.variante} size="xs">
                      {e.rotulo}
                    </Badge>
                    {i.destino === "substituir" && (
                      <Badge variant="outline" size="xs">
                        sai em 2026
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-ui-13 leading-relaxed text-muted-foreground">{i.papel}</span>
                  <span className="mt-1.5 block text-ui-12 text-foreground">{i.resumo}</span>
                </span>
                <ChevronDownIcon className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} />
              </button>

              {aberta && (
                <div className="border-t border-border bg-muted/20 px-5 py-4">
                  <dl className="grid gap-x-8 gap-y-2.5 sm:grid-cols-[200px_1fr]">
                    {i.campos.map((c) => (
                      <div key={c.rotulo} className="contents">
                        <dt className="text-ui-12 text-muted-foreground sm:pt-0.5">{c.rotulo}</dt>
                        <dd className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              c.estado === "ok" ? "bg-success-ink" : c.estado === "atencao" ? "bg-warning" : c.estado === "erro" ? "bg-destructive" : "bg-transparent",
                            )}
                            aria-hidden
                          />
                          <span className={cn("min-w-0 truncate text-ui-13 text-foreground", c.mono && "font-mono text-ui-12")}>{c.valor}</span>
                          {c.mono && (
                            <button
                              type="button"
                              onClick={() => void copiar(c.valor, c.rotulo)}
                              aria-label={`Copiar ${c.rotulo}`}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <CopyIcon className="size-3.5" />
                            </button>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {gestao && i.acoes.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      {i.acoes.map((a) => (
                        <Button
                          key={a.rotulo}
                          size="sm"
                          variant={a.primaria ? "default" : "outline"}
                          onClick={() => {
                            if (i.chave === "claude" && a.primaria) {
                              void copiar("claude mcp add me-escuta https://mcp.meescuta.com/sse", "Comando");
                              return;
                            }
                            toast(`${a.rotulo}: em breve.`, { description: i.nome });
                          }}
                        >
                          {i.chave === "claude" && a.primaria ? <CopyIcon data-icon="inline-start" /> : a.primaria ? <CheckIcon data-icon="inline-start" /> : null}
                          {a.rotulo}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </CascaConfig>
  );
}
