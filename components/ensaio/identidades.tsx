"use client";

import { useMemo, useState } from "react";
import { CheckIcon, LinkIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { iniciaisMembro } from "@/lib/membros";
import type { MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import type { DeParaKommo } from "@/lib/ensaio/fixtures/operacao";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/identidades (ensaio) — o DE-PARA entre as contas do Kommo (o "dono" que veio
 * com os 7.100 leads importados) e as pessoas daqui. Enquanto uma conta do Kommo não tem decisão,
 * os leads dela ficam "aguardando de-para" — não são órfãos, são acervo esperando alguém dizer
 * "isso é a Sara" ou "isso era um robô, descarta".
 *
 * A tela é UMA lista, uma linha por conta do Kommo, com a decisão inline: vincular a uma pessoa
 * (select) ou descartar. A barra de cobertura no topo diz quanto do acervo já tem dono — é o
 * número que libera o backfill (M3).
 */
export function IdentidadesEnsaio({ linhas: iniciais, membros, gestao, agoraIso }: { linhas: DeParaKommo[]; membros: MembroEnsaio[]; gestao: boolean; agoraIso: string }) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [linhas, setLinhas] = useState(iniciais);
  const total = linhas.reduce((s, l) => s + l.leads, 0);
  const decididos = linhas.filter((l) => l.estado !== "sem_decisao").reduce((s, l) => s + l.leads, 0);
  const pendentes = linhas.filter((l) => l.estado === "sem_decisao");
  const pct = total ? Math.round((decididos / total) * 100) : 0;

  const vincular = (l: DeParaKommo, pessoaId: string) => {
    const p = membros.find((m) => m.id === pessoaId);
    if (!p) return;
    setLinhas((xs) => xs.map((x) => (x.idExterno === l.idExterno ? { ...x, estado: "vinculado", pessoaId: p.id, pessoaNome: p.nome, vinculadoEm: agora.toISOString() } : x)));
    toast.success(`${l.nomeNoKommo} → ${p.nome.split(" ")[0]}.`, { description: `${l.leads.toLocaleString("pt-BR")} leads passam a ter dono. Desfaz aqui mesmo.` });
  };
  const descartar = (l: DeParaKommo) => {
    setLinhas((xs) => xs.map((x) => (x.idExterno === l.idExterno ? { ...x, estado: "descartado", pessoaId: null, pessoaNome: null, vinculadoEm: agora.toISOString() } : x)));
    toast(`${l.nomeNoKommo} descartado.`, { description: "Os leads ficam sem dono e entram na redistribuição." });
  };
  const desfazer = (l: DeParaKommo) => {
    setLinhas((xs) => xs.map((x) => (x.idExterno === l.idExterno ? { ...x, estado: "sem_decisao", pessoaId: null, pessoaNome: null, vinculadoEm: null } : x)));
    toast("Decisão desfeita.");
  };

  return (
    <CascaConfig
      largo
      titulo="Identidades"
      descricao="De quem era cada lead no Kommo, traduzido para quem é aqui. Cada conta do Kommo vira uma pessoa da equipe — ou é descartada, se era robô ou alguém que saiu."
    >
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[22px] font-semibold tabular-nums text-foreground">{pct}%</span>
            <span className="ml-2 text-[14px] text-muted-foreground">do acervo com decisão</span>
          </div>
          <span className="text-ui-12 tabular-nums text-muted-foreground">
            {decididos.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} leads · {pendentes.length} conta{pendentes.length === 1 ? "" : "s"} sem decisão
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-success-ink transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-ui-12 text-muted-foreground">{pct === 100 ? "Tudo decidido — o backfill de dono pode rodar." : "O backfill de dono só roda quando a soma fechar em 100 %."}</p>
      </section>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_120px_260px_150px] gap-4 border-b border-border bg-table-header px-4 py-2 text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Conta no Kommo</span>
          <span className="text-right">Leads</span>
          <span>Aqui é</span>
          <span>Decidido</span>
        </div>
        {linhas.map((l, i) => (
          <div key={l.idExterno} className={cn("grid grid-cols-[1fr_120px_260px_150px] items-center gap-4 px-4 py-3.5", i > 0 && "border-t border-border", l.estado === "descartado" && "opacity-60")}>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">{l.nomeNoKommo}</div>
              <div className="font-mono text-[12px] text-muted-foreground">{l.idExterno}</div>
            </div>
            <div className="text-right text-[14px] tabular-nums text-foreground">{l.leads.toLocaleString("pt-BR")}</div>
            <div className="flex items-center gap-2">
              {l.estado === "vinculado" && l.pessoaNome ? (
                <>
                  <Avatar size="sm" variant="subtle">
                    <AvatarFallback>{iniciaisMembro(l.pessoaNome, "x@x")}</AvatarFallback>
                  </Avatar>
                  <span className="text-[14px] text-foreground">{l.pessoaNome}</span>
                  <Badge variant="success" size="xs">
                    <CheckIcon className="size-3" /> vinculado
                  </Badge>
                </>
              ) : l.estado === "descartado" ? (
                <Badge variant="muted" size="sm">
                  <XIcon className="size-3" /> descartado
                </Badge>
              ) : gestao ? (
                <div className="flex w-full items-center gap-1.5">
                  <Select onValueChange={(v) => v && vincular(l, String(v))}>
                    <SelectTrigger className="h-8 w-full" size="sm">
                      <SelectValue placeholder="Escolher a pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {membros.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => descartar(l)} title="Era robô ou saiu da empresa">
                    Descartar
                  </Button>
                </div>
              ) : (
                <span className="text-[13.5px] text-warning-ink">sem decisão</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <span>{l.vinculadoEm ? haQuantoTempo(l.vinculadoEm, agora) : "—"}</span>
              {gestao && l.estado !== "sem_decisao" && (
                <button type="button" onClick={() => desfazer(l)} className="text-ui-12 underline-offset-2 hover:text-foreground hover:underline">
                  desfazer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-2 text-ui-12 leading-relaxed text-muted-foreground">
        <LinkIcon className="mt-0.5 size-3.5 shrink-0" />
        Vincular não move nada: grava o de-para e, quando o acervo fechar em 100 %, o backfill atribui o dono aos leads de uma vez — com readback, nunca em silêncio.
      </p>
    </CascaConfig>
  );
}
