"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { EstadoIntegracao, Integracao } from "@/lib/ensaio/fixtures/integracoes";
import { CascaConfig, Contagem } from "./casca-config";

/**
 * /configuracoes/conexoes — o que era `/configuracoes/meta`, dentro de Canais, e que o Diogo
 * chamou de "uma bagunça".
 *
 * Duas coisas mudaram. A primeira é de lugar: **conexão não é canal**. O número é operação — é por
 * onde a Sara responde; a conexão é o encanamento que faz o número existir e que alimenta os
 * agentes. Por isso ela saiu de Canais e entrou em Inteligência. O Intercom separa do mesmo jeito
 * (`Settings > Channels` e `Settings > Integrations` são seções distintas).
 *
 * A segunda é de forma: **saiu o mural de cards**. Um card por integração, cada um abrindo e
 * fechando com dez campos dentro, obriga a ler tudo para achar o que está quebrado. Aqui é uma
 * linha por conexão — estado, UM número e "detalhes" —, e o detalhe inteiro vai para a sheet. É o
 * que o Twenty faz: catálogo de apps em grid de cards, conta CONECTADA em linha de tabela
 * (`SettingsConnectedAccountsTableRow.tsx:30-56`), e a seção de IA inteira em tabela
 * (`SettingsAI.tsx:38-64`). O LiderHub foi para o outro lado (mural com hero animado,
 * `ui/integrations-hero.tsx:124`), e é exatamente o que estamos saindo de ter.
 *
 * A ordem da lista é por estado, não alfabética: o que precisa de alguém vem primeiro.
 */

const ESTADO: Record<EstadoIntegracao, { rotulo: string; ponto: string; texto: string; ordem: number }> = {
  atencao: { rotulo: "atenção", ponto: "bg-warning-ink", texto: "text-warning-ink", ordem: 0 },
  conectada: { rotulo: "conectada", ponto: "bg-success-ink", texto: "text-foreground", ordem: 1 },
  desconectada: { rotulo: "em espera", ponto: "bg-muted-foreground/50", texto: "text-muted-foreground", ordem: 2 },
  nao_configurada: { rotulo: "não conectada", ponto: "bg-muted-foreground/30", texto: "text-muted-foreground", ordem: 3 },
};

export function ConexoesEnsaio({ conexoes, gestao }: { conexoes: Integracao[]; gestao: boolean }) {
  const [abertaChave, setAbertaChave] = useState<string | null>(null);
  const aberta = conexoes.find((c) => c.chave === abertaChave) ?? null;

  const lista = [...conexoes].sort((a, b) => ESTADO[a.estado].ordem - ESTADO[b.estado].ordem);
  const precisam = conexoes.filter((c) => c.estado === "atencao").length;

  return (
    <CascaConfig
      titulo="Conexões"
      descricao="O encanamento que alimenta os agentes: Meta, WhatsApp Lite, Kommo, Resend e o MCP. O que está de pé e o que não está."
    >
      <div className="flex items-center justify-between">
        <Contagem>
          {conexoes.filter((c) => c.estado === "conectada").length} de {conexoes.length} conectadas
          {precisam > 0 ? ` · ${precisam} ${precisam === 1 ? "pede atenção" : "pedem atenção"}` : ""}
        </Contagem>
        <span className="text-ui-12 text-muted-foreground">Os números por onde a empresa fala ficam em Canais.</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-4 border-b border-border bg-table-header px-4 py-2 text-ui-11 font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <span className="min-w-0 flex-1">Conexão</span>
          <span className="hidden w-[150px] shrink-0 md:block">Estado</span>
          <span className="hidden w-[190px] shrink-0 lg:block">Hoje</span>
          <span className="w-[92px] shrink-0" />
        </div>

        {lista.map((c, i) => {
          const e = ESTADO[c.estado];
          return (
            <div key={c.chave} className={cn("flex items-center gap-4 px-4 py-3.5", i > 0 && "border-t border-border")}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold leading-tight text-foreground">{c.nome}</span>
                  <span className="text-ui-12 text-muted-foreground">{c.fornecedor}</span>
                  {c.destino === "substituir" && (
                    <Badge variant="muted" size="xs">
                      sai do ar
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 max-w-[68ch] text-[13px] leading-snug text-muted-foreground">{c.papel}</p>
              </div>

              <div className="hidden w-[150px] shrink-0 items-center gap-2 md:flex">
                <span className={cn("size-1.5 shrink-0 rounded-full", e.ponto)} aria-hidden />
                <span className={cn("text-[13.5px]", e.texto)}>{e.rotulo}</span>
              </div>

              <div className="hidden w-[190px] shrink-0 lg:block">
                <div className={cn("text-[15px] font-semibold leading-none tabular-nums", c.metrica.valor === "—" ? "text-muted-foreground" : "text-foreground")}>
                  {c.metrica.valor}
                </div>
                <div className="mt-1 text-ui-11 text-muted-foreground">{c.metrica.rotulo}</div>
              </div>

              <div className="w-[92px] shrink-0 text-right">
                <Button variant="ghost" size="sm" onClick={() => setAbertaChave(c.chave)}>
                  Detalhes
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <PainelConexao conexao={aberta} gestao={gestao} onFechar={() => setAbertaChave(null)} />
    </CascaConfig>
  );
}

function PainelConexao({ conexao, gestao, onFechar }: { conexao: Integracao | null; gestao: boolean; onFechar: () => void }) {
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(valor);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      toast(valor);
    }
  };

  if (!conexao) return null;
  const e = ESTADO[conexao.estado];

  return (
    <Sheet open onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-[18px]">
            {conexao.nome}
            <span className={cn("inline-flex items-center gap-1.5 text-ui-12 font-normal", e.texto)}>
              <span className={cn("size-1.5 rounded-full", e.ponto)} aria-hidden />
              {e.rotulo}
            </span>
          </SheetTitle>
          <SheetDescription>{conexao.papel}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          <dl className="flex flex-col">
            {conexao.campos.map((campo, i) => (
              <div key={campo.rotulo} className={cn("flex items-start gap-4 py-2.5", i > 0 && "border-t border-border")}>
                <dt className="w-[170px] shrink-0 text-[13px] text-muted-foreground">{campo.rotulo}</dt>
                <dd className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 break-words text-[13.5px]",
                      campo.mono && "font-mono text-[12.5px]",
                      campo.estado === "atencao" ? "text-warning-ink" : campo.estado === "erro" ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {campo.valor}
                  </span>
                  {campo.mono && (
                    <button
                      type="button"
                      onClick={() => copiar(campo.valor)}
                      aria-label={`Copiar ${campo.rotulo}`}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {copiado === campo.valor ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                    </button>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <p className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
            {conexao.destino === "fica"
              ? "Integrar, nunca recriar: esta conexão fica, e o sistema fala com ela em vez de refazer o que ela já faz."
              : "Esta conexão sai do ar quando a migração terminar. Enquanto isso, ela só entrega histórico — nada é escrito de volta."}
          </p>
        </SheetBody>

        {gestao && conexao.acoes.length > 0 && (
          <SheetFooter className="border-t border-border">
            {conexao.acoes.map((a) => (
              <Button
                key={a.rotulo}
                variant={a.primaria ? "default" : "outline"}
                size="sm"
                onClick={() => toast(`${a.rotulo}…`, { description: `${conexao.nome} · em ensaio nada é chamado de verdade.` })}
              >
                {a.rotulo}
                {a.rotulo.startsWith("Abrir") && <ExternalLinkIcon data-icon="inline-end" />}
              </Button>
            ))}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
