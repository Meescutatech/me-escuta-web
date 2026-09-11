"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LockIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { AgenteEnsaio, Autonomia } from "@/lib/ensaio/fixtures/agentes";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import { CascaConfig } from "./casca-config";
import { FluxoAgente } from "./fluxo-agente";

/**
 * /configuracoes/agentes (ensaio) — o hub dos quatro agentes.
 *
 * Um card por agente responde, sem abrir nada: está LIGADO? em que ÁREA atua? qual versão do
 * prompt? o que faz SOZINHO e o que PROPÕE? e o que fez por último. Clicar abre a sheet com o
 * fluxograma (gatilho → contexto → decide → age/propõe → evento), a autonomia por capacidade —
 * um segmented control por linha, com cadeado no que a Constituição §1.2 tranca — e o prompt
 * em leitura. Editar o prompt continua nas telas que já existem (`/configuracoes/clara`,
 * `/configuracoes/agentes/jarvis`), linkadas do rodapé da sheet.
 *
 * Referência: Twenty `pages/settings/ai/SettingsAI.tsx` (card) + LiderHub `edit-member-sheet.tsx`
 * (anatomia da sheet: header com avatar+badge, body em seções, footer dividido).
 */

const AUTONOMIA: Record<Autonomia, { rotulo: string; descricao: string }> = {
  auto: { rotulo: "sozinho", descricao: "executa e registra o evento" },
  propor: { rotulo: "propõe", descricao: "cria sugestão; alguém valida" },
  desligado: { rotulo: "desligado", descricao: "nem propõe" },
};

const AREA_COR: Record<AgenteEnsaio["chave"], string> = {
  clara: "bg-laranja-cl text-laranja-esc",
  jarvis: "bg-[#EAECF5] text-navy",
  levindo: "bg-roxo-bg text-roxo",
  priscila: "bg-amarelo-bg text-amarelo",
};

const ROTA_EDICAO: Partial<Record<AgenteEnsaio["chave"], string>> = {
  clara: "/configuracoes/clara",
  jarvis: "/configuracoes/agentes/jarvis",
};

export function AgentesEnsaio({ agentes: iniciais, gestao, agoraIso }: { agentes: AgenteEnsaio[]; gestao: boolean; agoraIso: string }) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [agentes, setAgentes] = useState(iniciais);
  const [abertoChave, setAbertoChave] = useState<AgenteEnsaio["chave"] | null>(null);
  const aberto = agentes.find((a) => a.chave === abertoChave) ?? null;

  const ligar = (chave: AgenteEnsaio["chave"], ativo: boolean) => {
    const a = agentes.find((x) => x.chave === chave)!;
    if (ativo && a.pendencias.length > 0) {
      toast.error(`${a.nome} ainda não pode ser ligado.`, { description: a.pendencias[0] });
      return;
    }
    setAgentes((xs) => xs.map((x) => (x.chave === chave ? { ...x, ativo } : x)));
    toast(ativo ? `${a.nome} ligado.` : `${a.nome} desligado.`, {
      description: ativo ? "Vale a partir do próximo gatilho." : "O que está em andamento termina; nada novo começa.",
    });
  };

  const mudarAutonomia = (chave: AgenteEnsaio["chave"], cap: string, autonomia: Autonomia) => {
    setAgentes((xs) =>
      xs.map((x) => (x.chave === chave ? { ...x, capacidades: x.capacidades.map((c) => (c.chave === cap ? { ...c, autonomia } : c)) } : x)),
    );
    toast.success("Autonomia publicada.", { description: "É config, não deploy — vale na próxima decisão." });
  };

  return (
    <CascaConfig
      largo
      titulo="Agentes"
      descricao="Quatro agentes, uma regra: cada um propõe, e o que ele pode fazer sozinho é configuração — não deploy. Crédito, conduta clínica e preço nunca ficam sozinhos."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {agentes.map((a) => (
          <article
            key={a.chave}
            className={cn(
              "group flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-input",
              !a.ativo && "bg-card/70",
            )}
            onClick={() => setAbertoChave(a.chave)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAbertoChave(a.chave)}
            aria-label={`Abrir ${a.nome}`}
          >
            <div className="flex items-start gap-3">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-ui-13 font-bold", AREA_COR[a.chave])} aria-hidden>
                {a.nome[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-h3 font-semibold text-foreground">{a.nome}</h2>
                  <span className={cn("inline-flex items-center gap-1.5 text-ui-12", a.ativo ? "text-success-ink" : "text-muted-foreground")}>
                    <span className={cn("size-1.5 rounded-full", a.ativo ? "bg-success-ink" : "bg-muted-foreground/50")} aria-hidden />
                    {a.ativo ? "ligado" : "desligado"}
                  </span>
                </div>
                <p className="text-ui-13 text-muted-foreground">
                  {a.papel} · {a.area}
                </p>
              </div>
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Switch checked={a.ativo} disabled={!gestao} onCheckedChange={(v) => ligar(a.chave, !!v)} aria-label={`${a.ativo ? "Desligar" : "Ligar"} ${a.nome}`} />
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ui-13">
              <dt className="text-muted-foreground">Prompt</dt>
              <dd className="text-foreground">
                v{a.versao_prompt} · publicado {haQuantoTempo(a.prompt_publicado_em, agora)}
              </dd>
              <dt className="text-muted-foreground">Sozinho</dt>
              <dd className="text-foreground">{listar(a.capacidades.filter((c) => c.autonomia === "auto").map((c) => c.rotulo))}</dd>
              <dt className="text-muted-foreground">Propõe</dt>
              <dd className="text-foreground">{listar(a.capacidades.filter((c) => c.autonomia === "propor").map((c) => c.rotulo))}</dd>
              <dt className="text-muted-foreground">Última ação</dt>
              <dd className={cn(a.ultima_acao ? "text-foreground" : "text-muted-foreground")}>
                {a.ultima_acao ? `${a.ultima_acao.texto} · ${haQuantoTempo(a.ultima_acao.em, agora)}` : "nunca rodou"}
              </dd>
            </dl>

            {a.ultimos_7d.length > 0 ? (
              <div className="flex gap-5 border-t border-border pt-3">
                {a.ultimos_7d.map((m) => (
                  <div key={m.rotulo}>
                    <div className="text-ui-14 font-semibold tabular-nums text-foreground">{m.valor}</div>
                    <div className="text-ui-11 text-muted-foreground">{m.rotulo}</div>
                  </div>
                ))}
                <span className="ml-auto self-end text-ui-11 text-muted-foreground">últimos 7 dias</span>
              </div>
            ) : (
              <div className="border-t border-border pt-3 text-ui-12 text-warning-ink">
                Para ligar: {a.pendencias.join(" · ")}
              </div>
            )}
          </article>
        ))}
      </div>

      <Sheet open={!!aberto} onOpenChange={(o) => !o && setAbertoChave(null)}>
        <SheetContent className="sm:max-w-[760px]">
          {aberto && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-ui-13 font-bold", AREA_COR[aberto.chave])} aria-hidden>
                    {aberto.nome[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="flex items-center gap-2">
                      {aberto.nome}
                      <Badge variant={aberto.ativo ? "success" : "muted"} size="xs">
                        {aberto.ativo ? "ligado" : "desligado"}
                      </Badge>
                    </SheetTitle>
                    <SheetDescription>
                      {aberto.papel} · {aberto.area} · prompt v{aberto.versao_prompt}
                    </SheetDescription>
                  </div>
                  <Switch checked={aberto.ativo} disabled={!gestao} onCheckedChange={(v) => ligar(aberto.chave, !!v)} aria-label={`${aberto.ativo ? "Desligar" : "Ligar"} ${aberto.nome}`} />
                </div>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-7">
                <section>
                  <h3 className="mb-2 text-ui-12 font-semibold uppercase tracking-[0.06em] text-muted-foreground">Como {aberto.nome} trabalha</h3>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <FluxoAgente agente={aberto} />
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-ui-12 font-semibold uppercase tracking-[0.06em] text-muted-foreground">Autonomia por capacidade</h3>
                  <div className="overflow-hidden rounded-xl border border-border">
                    {aberto.capacidades.map((c, i) => (
                      <div key={c.chave} className={cn("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-ui-13 font-medium text-foreground">
                            {c.rotulo}
                            {c.travada && (
                              <span title="Constituição §1.2 — nunca sozinho" className="text-muted-foreground">
                                <LockIcon className="size-3.5" />
                              </span>
                            )}
                          </div>
                          <div className="text-ui-12 text-muted-foreground">{c.descricao}</div>
                        </div>
                        <div role="radiogroup" aria-label={`Autonomia de ${c.rotulo}`} className="inline-flex shrink-0 rounded-md border border-border p-0.5 text-ui-12">
                          {(Object.keys(AUTONOMIA) as Autonomia[]).map((op) => {
                            const bloqueada = c.travada && op === "auto";
                            return (
                              <button
                                key={op}
                                type="button"
                                role="radio"
                                aria-checked={c.autonomia === op}
                                disabled={!gestao || bloqueada}
                                title={bloqueada ? "Travado pela Constituição" : AUTONOMIA[op].descricao}
                                onClick={() => mudarAutonomia(aberto.chave, c.chave, op)}
                                className={cn(
                                  "rounded-[5px] px-2.5 py-1 transition-colors",
                                  c.autonomia === op
                                    ? op === "auto"
                                      ? "bg-success-ink text-success-foreground"
                                      : op === "propor"
                                        ? "bg-navy text-branco"
                                        : "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground",
                                  bloqueada && "cursor-not-allowed opacity-40 line-through",
                                )}
                              >
                                {AUTONOMIA[op].rotulo}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-ui-12 font-semibold uppercase tracking-[0.06em] text-muted-foreground">Prompt · v{aberto.versao_prompt}</h3>
                    <span className="text-ui-11 text-muted-foreground">publicado {haQuantoTempo(aberto.prompt_publicado_em, agora)} · só leitura aqui</span>
                  </div>
                  <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 font-sans text-ui-13 leading-relaxed text-foreground">
                    {aberto.prompt}
                  </pre>
                </section>

                {aberto.pendencias.length > 0 && (
                  <section className="rounded-xl border border-warning-line bg-warning-tint p-4">
                    <h3 className="text-ui-13 font-semibold text-warning-ink">Para ligar {aberto.nome}</h3>
                    <ul className="mt-1.5 list-disc pl-5 text-ui-13 text-warning-ink">
                      {aberto.pendencias.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </SheetBody>
              <SheetFooter className="border-t border-border">
                {ROTA_EDICAO[aberto.chave] ? (
                  <Button variant="outline" render={<Link href={ROTA_EDICAO[aberto.chave]!} />}>
                    <ExternalLinkIcon data-icon="inline-start" />
                    Editar prompt e regras
                  </Button>
                ) : (
                  <span className="text-ui-12 text-muted-foreground">Edição do prompt chega com a próxima rodada.</span>
                )}
                <Button onClick={() => setAbertoChave(null)}>Fechar</Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </CascaConfig>
  );
}

function listar(itens: string[]): string {
  if (itens.length === 0) return "—";
  if (itens.length <= 3) return itens.join(", ");
  return `${itens.slice(0, 2).join(", ")} e mais ${itens.length - 2}`;
}
