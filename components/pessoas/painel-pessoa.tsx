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
  MonitorIcon,
  LogOutIcon,
} from "lucide-react";
import { MarcaJarvis } from "@/components/jarvis/marca";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { CARGOS_ATIVOS, permissoesEfetivas } from "@/lib/ensaio/fixtures/cargos";
import type { MembroEnsaio } from "@/lib/ensaio/fixtures/membros";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { formatarE164 } from "@/lib/ensaio/fixtures/canais";
import {
  agruparPorDia,
  gerarAtividadeMembro,
  gerarSessoesMembro,
  resumoComIa,
  type Atividade,
  type ComIa,
  type TipoAtividade,
} from "@/lib/ensaio/fixtures/membro-atividade";
import { CartaoPessoa, MetricasPessoa, desdeQuando, type NumeroDaPessoa, type Pessoa } from "./cartao-pessoa";

/**
 * PAINEL DE PERFIL — a pessoa inteira, e não a linha da tabela outra vez.
 *
 * A versão anterior era pobre (Diogo, 11/09: "preciso de mais informações"): mostrava papel,
 * departamentos, último acesso e três listas. O que faltava era a pergunta que leva alguém a abrir
 * este painel — **o que essa pessoa consegue fazer amanhã de manhã**. Agora ela é a primeira coisa,
 * escrita em português (`permissoesEfetivas`), e não uma matriz de checkbox como no Intercom nem
 * uma grade campo × ação como no Twenty.
 *
 * Quatro abas, seis blocos:
 *  · **Perfil** — permissões efetivas (o que vê · o que faz · o que o Jarvis manda · o que não
 *    alcança) e os NÚMEROS de que é dona;
 *  · **Atividade** — tudo o que ela fez, por dia, cada linha levando para onde aconteceu;
 *  · **Com IA** — quatro números (perguntas · aceitas · ajustadas · descartadas) e a lista;
 *  · **Acessos** — HISTÓRICO DE CARGO e as SESSÕES abertas.
 *
 * Ações no rodapé: **mudar o cargo** (um `Select`, porque o cargo é uma escolha só), lotar, revogar
 * e — para quem foi convidada e nunca entrou — reenviar o convite.
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

export function PainelPessoa({
  membro,
  eu,
  gestao,
  rotuloDepartamento,
  canais,
  fotos,
  agora,
  ensaio = false,
  onFechar,
  onRevogar,
  onMudarCargo,
}: {
  membro: MembroEnsaio | null;
  eu: string;
  gestao: boolean;
  rotuloDepartamento: (chave: string) => string;
  canais: CanalEnsaio[];
  fotos: Record<string, string>;
  agora: Date;
  /**
   * `true` = modo ensaio, e só aí este painel PODE gerar fixture. O default é `false` porque o
   * default tem de ser o caminho real: quem esquecer de passar a prop vê de menos, nunca de mais.
   * Sem isto, o painel afirmava fato sobre pessoa de verdade — atividade, aparelho e IP que
   * ninguém mediu (Diogo, 11/09: "de onde saíram esses dados? se não tiver dados não mostra").
   */
  ensaio?: boolean;
  onFechar: () => void;
  onRevogar: (m: MembroEnsaio) => void;
  onMudarCargo?: (m: MembroEnsaio, chaveCargo: string) => void;
}) {
  const [aba, setAba] = useState("perfil");
  const atividade = useMemo(() => (membro && ensaio ? gerarAtividadeMembro(membro, agora) : null), [membro, agora, ensaio]);
  const sessoes = useMemo(
    () => (membro && ensaio ? gerarSessoesMembro(membro, agora, membro.id === eu) : []),
    [membro, agora, eu, ensaio],
  );

  if (!membro) {
    return (
      <Sheet open={false} onOpenChange={() => onFechar()}>
        <SheetContent className="sm:max-w-[680px]" />
      </Sheet>
    );
  }

  const meus = canais.filter((c) => c.responsavel_id === membro.id);
  const numeros: NumeroDaPessoa[] = meus.map((c) => ({ canal_id: c.canal_id, apelido: c.apelido, numero: formatarE164(c.numero_e164), ativo: c.ativo }));
  const pessoa: Pessoa = {
    id: membro.id,
    nome: membro.nome,
    email: membro.email,
    papel: membro.papel,
    funcao: membro.funcao,
    ativo: membro.ativo,
    departamentos: membro.departamentos,
    ultimoAcessoEm: membro.ultimo_acesso_em,
    entrouEm: membro.criado_em,
    foto: fotos[membro.id] ?? null,
  };
  const efetivas = permissoesEfetivas(membro, { rotuloDepartamento, numeros: meus.length });
  const cargoAtual = CARGOS_ATIVOS.find((c) => c.papeis.includes(membro.papel) && (c.departamento === null || membro.departamentos.some((v) => v.departamento === c.departamento)));
  // a fita de números do topo some quando não há de onde tirá-la — `CartaoPessoa` já trata
  // `undefined`. Zero aqui não seria honesto: zero afirma "não fez nada", e o que temos é
  // "não medimos". O último acesso continua, porque esse é real e vem de `core.v_membro`.
  const metricas = atividade
    ? [
        { rotulo: "mensagens", valor: atividade.resumo7d[0].valor },
        { rotulo: "tarefas", valor: atividade.resumo7d[1].valor },
        { rotulo: "com IA", valor: atividade.resumo7d[2].valor },
      ]
    : undefined;
  const nuncaEntrou = !membro.ultimo_acesso_em;

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) {
          onFechar();
          setAba("perfil");
        }
      }}
    >
      <SheetContent className="sm:max-w-[680px]">
        <SheetHeader>
          <SheetTitle className="sr-only">{membro.nome}</SheetTitle>
          <CartaoPessoa
            pessoa={pessoa}
            variante="sheet"
            agora={agora}
            rotuloDepartamento={rotuloDepartamento}
            metricas={metricas}
            souEu={membro.id === eu}
          />
        </SheetHeader>

        <SheetBody className="pt-0">
          <Tabs value={aba} onValueChange={(v) => setAba(String(v))}>
            {/* sem fonte para Atividade, Com IA e Acessos não há aba: uma lista vazia sem
                explicação mente tanto quanto uma lista inventada. Fica o Perfil, que é o que o
                banco entrega de verdade — cargo, permissões, números, lotação e entrada. */}
            {atividade && (
              <TabsList className="mb-4">
                <TabsTrigger value="perfil">Perfil</TabsTrigger>
                <TabsTrigger value="atividade">Atividade · {atividade.atividades.length}</TabsTrigger>
                <TabsTrigger value="ia">Com IA · {atividade.comIa.length}</TabsTrigger>
                <TabsTrigger value="acessos">Acessos</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="perfil" className="flex flex-col gap-6">
              <Bloco rotulo="O que ela vê" itens={efetivas.ve} />
              <Bloco rotulo="O que ela faz" itens={efetivas.faz} />
              <Bloco rotulo="O que o Jarvis manda para ela" itens={[efetivas.jarvis]} marca />
              {efetivas.naoAlcanca.length > 0 && <Bloco rotulo="O que não alcança" itens={efetivas.naoAlcanca} apagado />}

              <section>
                <Rotulo>Números de que é dona</Rotulo>
                {numeros.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground">
                    Nenhum. {membro.papel === "membro" ? "Ela pode parear o próprio celular em Conectar meu número." : "Este cargo responde pelos números da empresa."}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {numeros.map((n) => (
                      <li key={n.canal_id}>
                        <Link href="/configuracoes/canais" className="flex items-center gap-2 text-[14px] text-foreground underline-offset-2 hover:underline">
                          <span className={cn("size-1.5 rounded-full", n.ativo ? "bg-success-ink" : "bg-muted-foreground/50")} aria-hidden />
                          {n.apelido}
                          <span className="font-mono text-ui-12 tabular-nums text-muted-foreground">{n.numero}</span>
                          <span className="text-ui-12 text-muted-foreground">{n.ativo ? "no ar" : "desligado"}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <Rotulo>Entrou em</Rotulo>
                <p className="text-[14px] text-foreground">
                  {new Date(membro.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                  <span className="text-muted-foreground"> · {membro.email}</span>
                </p>
              </section>
            </TabsContent>

            {atividade && (
              <>
            <TabsContent value="atividade">
              {atividade.atividades.length === 0 ? (
                <Vazio texto="Nada registrado ainda. Quando ela responder uma conversa, mover um lead ou concluir uma tarefa, aparece aqui." />
              ) : (
                <PorDia dias={agruparPorDia(atividade.atividades, agora)} render={(a: Atividade) => <LinhaAtividade key={a.id} a={a} />} />
              )}
            </TabsContent>

            <TabsContent value="ia" className="flex flex-col gap-4">
              <MetricasPessoa metricas={resumoComIa(atividade.comIa)} className="gap-7 border-b border-border pb-4" />
              {atividade.comIa.length === 0 ? (
                <Vazio texto="Nada com IA ainda — nenhuma pergunta ao Jarvis e nenhuma proposta decidida por esta pessoa." />
              ) : (
                <PorDia dias={agruparPorDia(atividade.comIa, agora)} render={(c: ComIa) => <LinhaComIa key={c.id} c={c} />} />
              )}
            </TabsContent>

            <TabsContent value="acessos" className="flex flex-col gap-6">
              <section>
                <Rotulo>Histórico de cargo</Rotulo>
                <ol className="flex flex-col">
                  {atividade.historico.map((h, i) => (
                    <li key={i} className={cn("flex gap-3 py-2.5", i > 0 && "border-t border-border")}>
                      <span className="w-[92px] shrink-0 text-ui-12 tabular-nums text-muted-foreground">{new Date(h.em).toLocaleDateString("pt-BR")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-foreground">{h.texto}</span>
                        <span className="block text-ui-12 text-muted-foreground">por {h.por}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <Rotulo>Sessões abertas</Rotulo>
                {sessoes.length === 0 ? (
                  <Vazio texto="Nenhuma sessão aberta. Esta pessoa não entrou no sistema até agora." />
                ) : (
                  <ul className="flex flex-col">
                    {sessoes.map((s, i) => (
                      <li key={s.id} className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-border")}>
                        <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[14px] text-foreground">
                            {s.aparelho}
                            {s.atual && (
                              <Badge variant="success" size="xs">
                                esta sessão
                              </Badge>
                            )}
                          </span>
                          <span className="block text-ui-12 text-muted-foreground">
                            {s.navegador} · {s.onde} · {s.ip}
                          </span>
                        </span>
                        <span className="shrink-0 text-ui-12 text-muted-foreground">{desdeQuando(s.ultimaEm, agora)}</span>
                        {gestao && !s.atual && (
                          <Button variant="ghost" size="sm" onClick={() => toast("Sessão encerrada.", { description: `${s.aparelho} · ${membro.nome}` })}>
                            <LogOutIcon data-icon="inline-start" />
                            Encerrar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>
              </>
            )}
          </Tabs>
        </SheetBody>

        {gestao && membro.id !== eu && membro.papel !== "owner" && (
          <SheetFooter className="flex-row items-center justify-between border-t border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Select
                value={cargoAtual?.chave ?? ""}
                onValueChange={(v) => onMudarCargo?.(membro, String(v))}
                items={CARGOS_ATIVOS.map((c) => ({ value: c.chave, label: c.nome }))}
              >
                <SelectTrigger size="sm" aria-label="Cargo" className="w-[200px]">
                  <SelectValue placeholder="Sem cargo" />
                </SelectTrigger>
                <SelectContent>
                  {CARGOS_ATIVOS.map((c) => (
                    <SelectItem key={c.chave} value={c.chave}>
                      <span className="flex flex-col">
                        <span className="text-ui-13 font-medium text-foreground">{c.nome}</span>
                        <span className="text-ui-11 text-muted-foreground">{c.resumo}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nuncaEntrou && (
                <Button variant="outline" size="sm" onClick={() => toast.success("Convite reenviado.", { description: "Link novo, 7 dias. O anterior não abre mais." })}>
                  Reenviar convite
                </Button>
              )}
            </div>
            <Button variant={membro.ativo ? "destructive" : "outline"} size="sm" onClick={() => onRevogar(membro)}>
              {membro.ativo ? "Revogar acesso" : "Devolver acesso"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>;
}

/** Uma frase por linha, separadas por hairline — sem bolinha, sem ícone decorativo. */
function Bloco({ rotulo, itens, apagado, marca }: { rotulo: string; itens: string[]; apagado?: boolean; marca?: boolean }) {
  return (
    <section>
      <Rotulo>
        {marca ? (
          <span className="inline-flex items-center gap-1.5">
            <MarcaJarvis tamanho={16} />
            {rotulo}
          </span>
        ) : (
          rotulo
        )}
      </Rotulo>
      <ul className="flex flex-col">
        {itens.map((t, i) => (
          <li key={t} className={cn("py-1.5 text-[14px] leading-snug", i > 0 && "border-t border-border/60", apagado ? "text-muted-foreground" : "text-foreground")}>
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13.5px] text-muted-foreground">{texto}</p>;
}

function PorDia<T extends { em: string; id: string }>({ dias, render }: { dias: Array<{ dia: string; itens: T[] }>; render: (x: T) => React.ReactNode }) {
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
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-3.5", c.agente === "jarvis" ? "bg-muted text-foreground" : "bg-laranja-cl text-laranja-esc")}>
        {c.agente === "jarvis" ? <MarcaJarvis tamanho={16} /> : <BotIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "text-ui-12 font-medium",
              r.tom === "ok" ? "text-success-ink" : r.tom === "ajuste" ? "text-warning-ink" : r.tom === "nao" ? "text-muted-foreground line-through" : "text-foreground",
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
