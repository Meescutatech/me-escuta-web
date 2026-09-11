"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MessageSquareIcon,
  ArrowRightLeftIcon,
  CheckSquareIcon,
  PlusSquareIcon,
  MailPlusIcon,
  SmartphoneIcon,
  HandIcon,
  UploadIcon,
  StickyNoteIcon,
  BotIcon,
} from "lucide-react";
import { IconeJarvis } from "@/components/header/icone-jarvis";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { iniciaisMembro, rotuloPapel } from "@/lib/membros";
import type { Departamento } from "@/lib/departamentos/escopo";
import { haQuantoTempo, type MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { formatarE164 } from "@/lib/ensaio/fixtures/canais";
import { agruparPorDia, gerarAtividadeMembro, type Atividade, type ComIa, type TipoAtividade } from "@/lib/ensaio/fixtures/membro-atividade";

/**
 * SHEET DE PERFIL DO MEMBRO (Diogo, 21:50) — clicar numa linha abre a pessoa inteira:
 *  · Perfil: papel, departamentos (com gestora), último acesso, os números de que é dona;
 *  · Atividade: TUDO o que ela fez no sistema, agrupado por dia (mensagens, etapas, tarefas,
 *    convites, canais…), cada linha levando para onde aconteceu;
 *  · Com IA: as execuções com agentes — perguntas ao Jarvis, propostas aceitas/ajustadas/
 *    descartadas, tarefas que o Jarvis criou para ela, sugestões da Clara aprovadas;
 *  · Histórico: papel e lotação ao longo do tempo.
 * Ações no rodapé: editar papel, lotar, revogar.
 *
 * Referências: Twenty `SettingsWorkspaceMember.tsx` (abas Infos / Permissions) e LiderHub
 * `edit-member-sheet.tsx` (header com avatar + badge, footer dividido).
 */

const ICONE_ATIVIDADE: Record<TipoAtividade, React.ReactNode> = {
  mensagem_enviada: <MessageSquareIcon />,
  etapa_alterada: <ArrowRightLeftIcon />,
  tarefa_criada: <PlusSquareIcon />,
  tarefa_concluida: <CheckSquareIcon />,
  convite_criado: <MailPlusIcon />,
  canal_ativado: <SmartphoneIcon />,
  canal_pareado: <SmartphoneIcon />,
  conversa_assumida: <HandIcon />,
  config_publicada: <UploadIcon />,
  anotacao_criada: <StickyNoteIcon />,
};

const ROTULO_COM_IA: Record<ComIa["tipo"], { rotulo: string; tom: "neutro" | "ok" | "ajuste" | "nao" }> = {
  pergunta_jarvis: { rotulo: "perguntou ao Jarvis", tom: "neutro" },
  tarefa_do_jarvis: { rotulo: "tarefa do Jarvis", tom: "neutro" },
  proposta_aceita: { rotulo: "aceitou proposta", tom: "ok" },
  proposta_ajustada: { rotulo: "ajustou proposta", tom: "ajuste" },
  proposta_descartada: { rotulo: "descartou proposta", tom: "nao" },
  sugestao_clara_aprovada: { rotulo: "aprovou a Clara", tom: "ok" },
};

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function SheetMembro({
  membro,
  eu,
  gestao,
  departamentos,
  canais,
  agora,
  onFechar,
  onDesativar,
}: {
  membro: MembroEnsaio | null;
  eu: string;
  gestao: boolean;
  departamentos: Departamento[];
  canais: CanalEnsaio[];
  agora: Date;
  onFechar: () => void;
  onDesativar: (m: MembroEnsaio) => void;
}) {
  const atividade = useMemo(() => (membro ? gerarAtividadeMembro(membro, agora) : null), [membro, agora]);
  const [aba, setAba] = useState("perfil");
  const rotuloDep = (chave: string) => departamentos.find((d) => d.chave === chave)?.rotulo ?? chave;
  const meusCanais = membro ? canais.filter((c) => c.responsavel_id === membro.id) : [];

  return (
    <Sheet
      open={!!membro}
      onOpenChange={(o) => {
        if (!o) {
          onFechar();
          setAba("perfil");
        }
      }}
    >
      <SheetContent className="sm:max-w-[640px]">
        {membro && atividade && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar size="xl" variant={membro.id === eu ? "solid" : "subtle"}>
                  <AvatarFallback>{iniciaisMembro(membro.nome, membro.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="flex items-center gap-2 text-[17px]">
                    {membro.nome}
                    {membro.id === eu && <span className="text-ui-12 font-normal text-muted-foreground">(você)</span>}
                    <Badge variant={membro.ativo ? "success" : "muted"} size="xs">
                      {membro.ativo ? "com acesso" : "sem acesso"}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="text-[13.5px]">
                    {rotuloPapel(membro.papel)}
                    {membro.funcao ? ` · ${membro.funcao}` : ""} · {membro.email}
                  </SheetDescription>
                </div>
              </div>
              <div className="mt-3 flex gap-6 border-t border-border pt-3">
                {atividade.resumo7d.map((r) => (
                  <div key={r.rotulo}>
                    <div className="text-[17px] font-semibold tabular-nums text-foreground">{r.valor}</div>
                    <div className="text-ui-12 text-muted-foreground">{r.rotulo} · 7 dias</div>
                  </div>
                ))}
                <div className="ml-auto text-right">
                  <div className="text-[13.5px] text-foreground">{haQuantoTempo(membro.ultimo_acesso_em, agora)}</div>
                  <div className="text-ui-12 text-muted-foreground">último acesso</div>
                </div>
              </div>
            </SheetHeader>

            <SheetBody className="pt-0">
              <Tabs value={aba} onValueChange={(v) => setAba(String(v))}>
                <TabsList className="mb-4">
                  <TabsTrigger value="perfil">Perfil</TabsTrigger>
                  <TabsTrigger value="atividade">Atividade · {atividade.atividades.length}</TabsTrigger>
                  <TabsTrigger value="ia">Com IA · {atividade.comIa.length}</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="perfil" className="flex flex-col gap-5">
                  <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-3 text-[14px]">
                    <dt className="text-muted-foreground">Papel</dt>
                    <dd className="text-foreground">
                      {rotuloPapel(membro.papel)}
                      <span className="block text-ui-12 text-muted-foreground">
                        {membro.papel === "owner" || membro.papel === "admin" ? "vê tudo, publica configuração, convida" : membro.papel === "marketing" ? "só captação e relatórios" : "vê os departamentos em que está"}
                      </span>
                    </dd>
                    <dt className="text-muted-foreground">Departamentos</dt>
                    <dd>
                      {membro.departamentos.length === 0 ? (
                        <span className="text-muted-foreground">{membro.papel === "owner" || membro.papel === "admin" ? "todos (sem lotação)" : "—"}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {membro.departamentos.map((v) => (
                            <span key={v.departamento} className="inline-flex items-center gap-1">
                              <Badge variant="outline" size="sm" className="bg-card">
                                {rotuloDep(v.departamento)}
                              </Badge>
                              {v.papel_no_departamento === "gestor" && (
                                <Badge variant="info" size="sm">
                                  gestora
                                </Badge>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </dd>
                    <dt className="text-muted-foreground">Números de que é dona</dt>
                    <dd>
                      {meusCanais.length === 0 ? (
                        <span className="text-muted-foreground">nenhum</span>
                      ) : (
                        meusCanais.map((c) => (
                          <Link key={c.canal_id} href="/configuracoes/canais" className="block text-foreground underline-offset-2 hover:underline">
                            {c.apelido} · <span className="font-mono text-ui-12 tabular-nums">{formatarE164(c.numero_e164)}</span> · {c.ativo ? "no ar" : "desligado"}
                          </Link>
                        ))
                      )}
                    </dd>
                    <dt className="text-muted-foreground">Entrou em</dt>
                    <dd className="text-foreground">{new Date(membro.criado_em).toLocaleDateString("pt-BR")}</dd>
                    <dt className="text-muted-foreground">Recebe tarefas do Jarvis</dt>
                    <dd className="text-foreground">
                      {membro.departamentos.some((d) => d.papel_no_departamento === "gestor")
                        ? "sim — as sem dono do departamento e as dos leads dela"
                        : membro.papel === "marketing"
                          ? "não"
                          : "sim — as dos leads de que é dona"}
                    </dd>
                  </dl>
                </TabsContent>

                <TabsContent value="atividade">
                  {atividade.atividades.length === 0 ? (
                    <Vazio texto="Nenhuma ação registrada ainda. Quando ela responder, mover um lead ou concluir uma tarefa, aparece aqui." />
                  ) : (
                    <Linha dias={agruparPorDia(atividade.atividades, agora)} render={(a: Atividade) => (
                      <LinhaAtividade key={a.id} a={a} />
                    )} />
                  )}
                </TabsContent>

                <TabsContent value="ia">
                  {atividade.comIa.length === 0 ? (
                    <Vazio texto="Nada com IA ainda — nenhuma pergunta ao Jarvis, proposta ou tarefa criada por agente para esta pessoa." />
                  ) : (
                    <Linha dias={agruparPorDia(atividade.comIa, agora)} render={(c: ComIa) => (
                      <LinhaComIa key={c.id} c={c} />
                    )} />
                  )}
                </TabsContent>

                <TabsContent value="historico">
                  <ol className="flex flex-col">
                    {atividade.historico.map((h, i) => (
                      <li key={i} className={cn("flex gap-3 py-3", i > 0 && "border-t border-border")}>
                        <span className="w-[92px] shrink-0 text-ui-12 tabular-nums text-muted-foreground">{new Date(h.em).toLocaleDateString("pt-BR")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] text-foreground">{h.texto}</span>
                          <span className="block text-ui-12 text-muted-foreground">por {h.por}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </TabsContent>
              </Tabs>
            </SheetBody>

            {gestao && membro.id !== eu && membro.papel !== "owner" && (
              <SheetFooter className="border-t border-border sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast("Em breve: editar papel.")}>
                    Editar papel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toast("Em breve: lotar em departamento.")}>
                    Lotar
                  </Button>
                </div>
                <Button variant="destructive" size="sm" onClick={() => onDesativar(membro)}>
                  {membro.ativo ? "Revogar acesso" : "Reativar acesso"}
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13.5px] text-muted-foreground">{texto}</p>;
}

function Linha<T extends { em: string; id: string }>({ dias, render }: { dias: Array<{ dia: string; itens: T[] }>; render: (x: T) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      {dias.map((g) => (
        <section key={g.dia}>
          <h4 className="sticky top-0 mb-1 bg-popover py-1 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.dia}</h4>
          <ol className="flex flex-col">{g.itens.map(render)}</ol>
        </section>
      ))}
    </div>
  );
}

function LinhaAtividade({ a }: { a: Atividade }) {
  const conteudo = (
    <>
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3.5">{ICONE_ATIVIDADE[a.tipo]}</span>
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-foreground">{a.texto}</span>
      <span className="shrink-0 text-ui-12 tabular-nums text-muted-foreground">{hhmm(a.em)}</span>
    </>
  );
  return a.href ? (
    <li>
      <Link href={a.href} className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/60">
        {conteudo}
      </Link>
    </li>
  ) : (
    <li className="flex items-center gap-3 px-1 py-2">{conteudo}</li>
  );
}

function LinhaComIa({ c }: { c: ComIa }) {
  const r = ROTULO_COM_IA[c.tipo];
  return (
    <li className="flex items-start gap-3 px-1 py-2.5">
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-3.5", c.agente === "jarvis" ? "bg-[#EAECF5] text-navy" : "bg-laranja-cl text-laranja-esc")}>
        {c.agente === "jarvis" ? <IconeJarvis className="size-3.5" /> : <BotIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "text-ui-12 font-medium",
              r.tom === "ok" ? "text-success-ink" : r.tom === "ajuste" ? "text-warning-ink" : r.tom === "nao" ? "text-muted-foreground line-through" : "text-navy",
            )}
          >
            {r.rotulo}
          </span>
          <span className="text-ui-12 tabular-nums text-muted-foreground">{hhmm(c.em)}</span>
        </span>
        <span className="block text-[14px] leading-snug text-foreground">{c.texto}</span>
        {c.detalhe && <span className="block text-ui-12 text-muted-foreground">{c.detalhe}</span>}
      </span>
    </li>
  );
}
