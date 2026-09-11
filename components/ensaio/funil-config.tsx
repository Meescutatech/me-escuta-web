"use client";

import { useState } from "react";
import { GripVerticalIcon, PlusIcon, EyeOffIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { EtapaConfig, MotivoPerdaConfig } from "@/lib/ensaio/fixtures/operacao";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/funil (ensaio) — as ETAPAS do funil, na ordem em que o board desenha, com o
 * prazo de cada uma (o SLA que pinta o card de âmbar) e os MOTIVOS DE PERDA.
 *
 * Reordenar é ARRASTAR (HTML5 drag & drop, sem lib): a alça à esquerda, a linha levanta, solta
 * onde quiser. Ganho e Perdido não se movem — são o fim do funil por definição. "Fora do board"
 * é o `no_board` da config: a etapa existe (o Arquivado com 582 leads), mas não é coluna de
 * trabalho.
 *
 * Nada aqui grava sozinho: a barra de baixo diz "alterações não salvas" e só o Publicar vira
 * versão nova da config `funil_vendas` — e o Auditoria guarda o diff.
 */

function horasLegiveis(h: number | null): string {
  if (h === null) return "sem prazo";
  if (h < 24) return `${h} h`;
  const d = h / 24;
  return d === 1 ? "1 dia" : `${d} dias`;
}

export function FunilConfigEnsaio({ etapas: iniciais, motivos: motivosIniciais, gestao }: { etapas: EtapaConfig[]; motivos: MotivoPerdaConfig[]; gestao: boolean }) {
  const [etapas, setEtapas] = useState(iniciais);
  const [motivos, setMotivos] = useState(motivosIniciais);
  const [sujo, setSujo] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const abertas = etapas.filter((e) => e.tipo === "aberto");
  const fechadas = etapas.filter((e) => e.tipo !== "aberto");
  const mudar = (fn: (xs: EtapaConfig[]) => EtapaConfig[]) => {
    setEtapas(fn);
    setSujo(true);
  };

  const soltar = (alvo: string) => {
    if (!arrastando || arrastando === alvo) return;
    mudar((xs) => {
      const lista = [...xs];
      const de = lista.findIndex((e) => e.chave === arrastando);
      const para = lista.findIndex((e) => e.chave === alvo);
      const [item] = lista.splice(de, 1);
      lista.splice(para, 0, item);
      return lista;
    });
    setArrastando(null);
    setSobre(null);
  };

  const publicar = () => {
    setSujo(false);
    toast.success("Funil publicado.", { description: "Versão 5 de funil_vendas — o board já desenha a nova ordem." });
  };

  const totalAbertos = abertas.reduce((s, e) => s + e.leads, 0);

  return (
    <CascaConfig
      largo
      titulo="Funil e etapas"
      descricao="A ordem das colunas do board, o prazo de cada etapa e os motivos de perda. Arraste para reordenar; Ganho e Perdido ficam sempre no fim."
      acao={
        gestao ? (
          <Button variant="outline" onClick={() => toast("Em breve: nova etapa.", { description: "Nasce vazia, no fim das abertas." })}>
            <PlusIcon data-icon="inline-start" />
            Etapa
          </Button>
        ) : null
      }
    >
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-ui-13 font-semibold text-foreground">Etapas abertas</h2>
          <span className="text-ui-12 text-muted-foreground">{totalAbertos} leads em {abertas.length} colunas</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {abertas.map((e, i) => (
            <li
              key={e.chave}
              draggable={gestao}
              onDragStart={() => setArrastando(e.chave)}
              onDragOver={(ev) => {
                ev.preventDefault();
                setSobre(e.chave);
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={() => soltar(e.chave)}
              onDragEnd={() => {
                setArrastando(null);
                setSobre(null);
              }}
              className={cn(
                "grid grid-cols-[28px_1fr_170px_150px_120px] items-center gap-4 px-3 py-3 transition-colors",
                i > 0 && "border-t border-border",
                arrastando === e.chave && "opacity-40",
                sobre === e.chave && arrastando !== e.chave && "bg-primary/[0.05] shadow-[inset_0_2px_0_var(--primary)]",
                e.no_board && "opacity-60",
              )}
            >
              <span className={cn("grid place-items-center text-muted-foreground", gestao ? "cursor-grab active:cursor-grabbing" : "opacity-30")} aria-label="Arrastar para reordenar">
                <GripVerticalIcon className="size-4" />
              </span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} aria-hidden />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{e.nome}</span>
                    {e.no_board && (
                      <Badge variant="muted" size="xs">
                        <EyeOffIcon className="size-3" /> fora do board
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-[12px] text-muted-foreground">{e.chave}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[13.5px]">
                <span className="text-muted-foreground">prazo</span>
                {gestao ? (
                  <Input
                    type="number"
                    min={1}
                    value={e.sla_h ?? ""}
                    onChange={(ev) => mudar((xs) => xs.map((x) => (x.chave === e.chave ? { ...x, sla_h: Number(ev.target.value) || null } : x)))}
                    className="h-8 w-[76px] text-right tabular-nums"
                    aria-label={`Prazo de ${e.nome} em horas`}
                  />
                ) : (
                  <span className="text-foreground">{horasLegiveis(e.sla_h)}</span>
                )}
                <span className="text-muted-foreground">h</span>
                <span className="text-ui-11 text-muted-foreground">= {horasLegiveis(e.sla_h)}</span>
              </div>
              <div className="text-[13.5px] tabular-nums text-muted-foreground">{e.leads} leads agora</div>
              <div className="flex items-center justify-end gap-2 text-ui-12 text-muted-foreground">
                no board
                <Switch size="sm" checked={!e.no_board} disabled={!gestao} onCheckedChange={(v) => mudar((xs) => xs.map((x) => (x.chave === e.chave ? { ...x, no_board: !v } : x)))} aria-label={`${e.nome} no board`} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 text-ui-13 font-semibold text-foreground">Fim do funil</h2>
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {fechadas.map((e, i) => (
            <li key={e.chave} className={cn("grid grid-cols-[28px_1fr_170px_150px_120px] items-center gap-4 px-3 py-3", i > 0 && "border-t border-border", e.no_board && "opacity-60")}>
              <span aria-hidden />
              <div className="flex min-w-0 items-center gap-3">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} aria-hidden />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{e.nome}</span>
                    <Badge variant={e.tipo === "ganho" ? "success" : "destructive"} size="xs">
                      {e.tipo}
                    </Badge>
                    {e.no_board && (
                      <Badge variant="muted" size="xs">
                        <EyeOffIcon className="size-3" /> fora do board
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-[12px] text-muted-foreground">{e.chave}</div>
                </div>
              </div>
              <div className="text-[13.5px] text-muted-foreground">sem prazo</div>
              <div className="text-[13.5px] tabular-nums text-muted-foreground">{e.leads.toLocaleString("pt-BR")} leads</div>
              <div className="flex items-center justify-end gap-2 text-ui-12 text-muted-foreground">
                no board
                <Switch size="sm" checked={!e.no_board} disabled={!gestao} onCheckedChange={(v) => mudar((xs) => xs.map((x) => (x.chave === e.chave ? { ...x, no_board: !v } : x)))} aria-label={`${e.nome} no board`} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-ui-13 font-semibold text-foreground">Motivos de perda</h2>
          <span className="text-ui-12 text-muted-foreground">o que a pessoa escolhe ao marcar Perdido · usos em 90 dias</span>
        </div>
        {motivos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-8 text-center">
            <p className="text-[14px] font-medium text-foreground">Nenhum motivo de perda</p>
            <p className="mt-1 text-ui-13 text-muted-foreground">Sem motivos, "Perdido" vira um balde. Crie pelo menos três: preço, sem retorno e outro.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {motivos.map((m, i) => (
              <li key={m.chave} className={cn("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border")}>
                <div className="min-w-0 flex-1">
                  <span className="text-[14.5px] text-foreground">{m.rotulo}</span>
                  {m.pedeDetalhe && <span className="ml-2 text-ui-12 text-muted-foreground">pede uma frase junto</span>}
                </div>
                <span className="w-[120px] text-right text-[13.5px] tabular-nums text-muted-foreground">{m.usos_90d} usos</span>
                {gestao && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMotivos((xs) => xs.filter((x) => x.chave !== m.chave));
                      setSujo(true);
                      toast("Motivo removido.", { description: "Perdas antigas continuam com ele; só novas não o oferecem." });
                    }}
                  >
                    Remover
                  </Button>
                )}
              </li>
            ))}
            {gestao && (
              <li className="border-t border-border px-4 py-2.5">
                <Button variant="ghost" size="sm" onClick={() => toast("Em breve: novo motivo.")}>
                  <PlusIcon data-icon="inline-start" />
                  Motivo
                </Button>
              </li>
            )}
          </ul>
        )}
      </section>

      {gestao && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-border bg-card/95 px-4 py-3 shadow-forte backdrop-blur">
          <span className="text-ui-12 text-muted-foreground">{sujo ? "Alterações não salvas — o board ainda está na versão 4" : "Nada alterado ainda · versão 4 publicada há 18 dias"}</span>
          <div className="flex gap-2">
            {sujo && (
              <Button variant="outline" onClick={() => { setEtapas(iniciais); setMotivos(motivosIniciais); setSujo(false); }}>
                Descartar
              </Button>
            )}
            <Button disabled={!sujo} onClick={publicar}>
              Publicar
            </Button>
          </div>
        </div>
      )}
    </CascaConfig>
  );
}
