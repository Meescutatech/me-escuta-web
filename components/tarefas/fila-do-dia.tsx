"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, CheckIcon, PlayIcon } from "lucide-react";
import type { ResultadoEvento } from "@/app/(app)/funil/actions";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { textoPrazo } from "@/lib/dados/tarefa-calculos";
import { resumoDoDia, rotuloDoDia } from "@/lib/tarefas/dia";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import type { PropostaTarefaPendente } from "@/lib/tarefas/propostas";
import { cn } from "@/lib/utils";
import { AcoesTarefa, BotaoAcoes, type PessoaAtiva } from "./acoes-tarefa";
import { BadgeOrigem, ChipPrioridade, PorQueJarvis, RailPrioridade } from "./cartao-meta";
import { BotaoConcluir, PainelConcluir } from "./concluir-tarefa";
import type { AcoesDaTarefa } from "./executor";
import { BlocoPropostas, type ValidarProposta } from "./proposta-tarefa";

/*
 * A FILA DO DIA (`/tarefas?ver=hoje`, W-D5 · 10/09) — a tela de entrada da SDR.
 *
 * Close: "Inbox · Today" junta hoje e atrasadas porque a pergunta das 8h é "o que eu faço agora".
 * HubSpot: "Start 7 tasks" percorre uma a uma. Kommo (o Robô): "Nº 17 de 65 hoje". As três
 * ideias viram UMA lista numerada com um FOCO que anda:
 *
 *   · a fila é vencidas ∪ hoje, minhas, ordenada por (vencida, prioridade, prazo) —
 *     lib/tarefas/dia.ts;
 *   · "Começar as tarefas" põe o foco na 1ª; a linha em foco abre com POR QUE / trecho e a barra
 *     de ações: Abrir conversa (J) · Concluir (⏎) · Adiar (A) · Pular (P);
 *   · concluir passa pelo "e agora?" (e-agora.tsx) e só então o foco anda; adiar anda na hora;
 *   · o número da linha É a posição na fila — "3 de 7" no topo, "3" na linha. É sequência de
 *     verdade, por isso é numerada.
 *
 * O foco vive na URL (`foco=<id>`): abrir a conversa e voltar cai na mesma tarefa.
 */

type Nomes = { membros: Map<string, string>; tipos: Map<string, string> };

export interface ProgressoDia {
  concluidas: number;
  adiadas: number;
  puladas: number;
}

export function FilaDoDia({
  fila,
  propostas,
  pessoas,
  nomes,
  agora,
  foco,
  onFoco,
  progresso,
  acoesDe,
  aoConcluida,
  aoAdiada,
  validarProposta,
  aoRefrescar,
}: {
  /** já filtrada (minhas, do dia) e ordenada — lib/tarefas/dia.ts */
  fila: TarefaVisao[];
  propostas: PropostaTarefaPendente[];
  pessoas: PessoaAtiva[];
  nomes: Nomes;
  agora: number;
  foco: string | null;
  onFoco: (id: string | null) => void;
  progresso: ProgressoDia;
  acoesDe: (t: TarefaVisao) => AcoesDaTarefa;
  /** o pai abre o "e agora?" e depois anda o foco */
  aoConcluida: (t: TarefaVisao, resultado: string) => void;
  aoAdiada: (t: TarefaVisao) => void;
  validarProposta: ValidarProposta;
  aoRefrescar: () => void;
}) {
  const router = useRouter();
  const resumo = useMemo(() => resumoDoDia(fila), [fila]);
  const [painel, setPainel] = useState<"concluir" | "acoes" | null>(null);
  const [propostasAbertas, setPropostasAbertas] = useState(true);
  const posicao = foco ? fila.findIndex((t) => t.id === foco) : -1;
  const emFoco = posicao >= 0 ? fila[posicao] : null;
  const feitas = progresso.concluidas + progresso.adiadas + progresso.puladas;
  const percursoAtivo = foco != null;
  const filaZerada = fila.length === 0 && feitas > 0;

  // foco anda → painel fecha e a linha entra na tela
  useEffect(() => {
    setPainel(null);
    if (!foco) return;
    const el = document.getElementById(`tarefa-${foco}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [foco]);

  function pular() {
    if (!emFoco) return;
    const prox = fila[posicao + 1] ?? null;
    onFoco(prox ? prox.id : null);
  }

  function abrirConversa(t: TarefaVisao) {
    const destino = destinoDaTarefa(t);
    if (destino) router.push(destino);
  }

  // ATALHOS — só com uma tarefa em foco e o teclado fora de campo de texto. Enter conclui, A adia,
  // J abre a conversa, P pula, ↑/↓ andam, Esc sai do percurso (ou fecha o painel aberto).
  useEffect(() => {
    if (!emFoco) return;
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const emCampo = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if (e.key === "Escape") {
        if (painel) setPainel(null);
        else if (!emCampo) onFoco(null);
        return;
      }
      if (emCampo || e.metaKey || e.ctrlKey || e.altKey) return;
      // o diálogo "e agora?" tem os próprios campos e não passa por aqui
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          setPainel((p) => (p === "concluir" ? null : "concluir"));
          break;
        case "a":
        case "A":
          e.preventDefault();
          setPainel((p) => (p === "acoes" ? null : "acoes"));
          break;
        case "j":
        case "J":
          e.preventDefault();
          abrirConversa(emFoco!);
          break;
        case "p":
        case "P":
        case "ArrowRight":
          e.preventDefault();
          pular();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (fila[posicao + 1]) onFoco(fila[posicao + 1].id);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (fila[posicao - 1]) onFoco(fila[posicao - 1].id);
          break;
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emFoco, posicao, fila, painel]);

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10">
      <div className="mx-auto max-w-3xl">
        {/* ── o dia — fica colado no topo enquanto a fila rola: no percurso, "Tarefa 3 de 7" e o
            Esc têm de estar sempre à vista ── */}
        <header className="sticky top-0 z-10 -mx-1 flex flex-wrap items-end gap-x-4 gap-y-2 bg-board px-1 pb-3 pt-1">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-tight text-tinta">{rotuloDoDia(agora)}</h2>
            <p className="mt-0.5 text-[12.5px] text-suave">
              {filaZerada ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-verde">
                  <CheckIcon className="size-3.5" aria-hidden />
                  Fila do dia zerada
                </span>
              ) : percursoAtivo && emFoco ? (
                <>
                  <span className="font-mono font-semibold tabular-nums text-navy">
                    Tarefa {posicao + 1} de {fila.length}
                  </span>
                  {resumo.vencidas > 0 && (
                    <>
                      {" · "}
                      <span className="text-vermelho">{resumo.vencidas} {resumo.vencidas === 1 ? "vencida" : "vencidas"}</span>
                    </>
                  )}
                </>
              ) : fila.length === 0 ? (
                "Nada vencido e nada para hoje."
              ) : (
                <>
                  <span className="font-mono font-semibold tabular-nums text-tinta">{fila.length}</span>{" "}
                  {fila.length === 1 ? "tarefa" : "tarefas"} para hoje
                  {resumo.vencidas > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-vermelho">
                        {resumo.vencidas} {resumo.vencidas === 1 ? "vencida" : "vencidas"}
                      </span>
                    </>
                  )}
                </>
              )}
              {feitas > 0 && (
                <span className="text-mute">
                  {" · "}
                  {[
                    progresso.concluidas > 0 && `${progresso.concluidas} ${progresso.concluidas === 1 ? "concluída" : "concluídas"}`,
                    progresso.adiadas > 0 && `${progresso.adiadas} ${progresso.adiadas === 1 ? "adiada" : "adiadas"}`,
                    progresso.puladas > 0 && `${progresso.puladas} ${progresso.puladas === 1 ? "pulada" : "puladas"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {percursoAtivo ? (
              <button
                type="button"
                onClick={() => onFoco(null)}
                className="rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
              >
                Sair do percurso
                <kbd className="ml-1.5 rounded border border-linha bg-branco px-1 py-px font-mono text-[10.5px] text-mute">Esc</kbd>
              </button>
            ) : (
              fila.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFoco(fila[0].id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
                >
                  <PlayIcon className="size-3.5 fill-current" aria-hidden />
                  Começar as tarefas
                  <span className="font-mono text-[11.5px] font-medium tabular-nums opacity-80">{fila.length}</span>
                </button>
              )
            )}
          </div>
        </header>

        {/* ── o que o Jarvis propõe entra antes da fila: é o que se decide antes de começar ── */}
        <BlocoPropostas
          propostas={propostas}
          pessoas={pessoas}
          agora={agora}
          validar={validarProposta}
          aberto={propostasAbertas}
          onToggle={() => setPropostasAbertas((v) => !v)}
        />

        {/* ── a fila ── */}
        {fila.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-linha px-4 py-8 text-center text-[13px] text-suave">
            {filaZerada ? (
              <>Você zerou o dia. O que vem depois está em <b className="font-semibold text-tinta">Semana</b>.</>
            ) : (
              <>
                Nada vencido e nada para hoje.{" "}
                {propostas.length > 0 ? "As propostas do Jarvis acima são o que há para decidir." : "Veja a semana, ou crie a próxima na conversa."}
              </>
            )}
          </div>
        ) : (
          <ol className="rounded-[10px] border border-linha bg-branco" aria-label="Fila do dia">
            {fila.map((t, i) => (
              <LinhaDoDia
                key={t.id}
                t={t}
                numero={i + 1}
                agora={agora}
                nomes={nomes}
                pessoas={pessoas}
                emFoco={t.id === foco}
                painel={t.id === foco ? painel : null}
                onFocar={() => onFoco(t.id)}
                onPainel={(p) => {
                  if (t.id !== foco) onFoco(t.id);
                  setPainel(p);
                }}
                acoes={acoesDe(t)}
                aoConcluida={(resultado) => aoConcluida(t, resultado)}
                aoAdiada={() => aoAdiada(t)}
                onPular={pular}
                onAbrirConversa={() => abrirConversa(t)}
                aoRefrescar={aoRefrescar}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function LinhaDoDia({
  t,
  numero,
  agora,
  nomes,
  pessoas,
  emFoco,
  painel,
  onFocar,
  onPainel,
  acoes,
  aoConcluida,
  aoAdiada,
  onPular,
  onAbrirConversa,
  aoRefrescar,
}: {
  t: TarefaVisao;
  numero: number;
  agora: number;
  nomes: Nomes;
  pessoas: PessoaAtiva[];
  emFoco: boolean;
  painel: "concluir" | "acoes" | null;
  onFocar: () => void;
  onPainel: (p: "concluir" | "acoes" | null) => void;
  acoes: AcoesDaTarefa;
  aoConcluida: (resultado: string) => void;
  aoAdiada: () => void;
  onPular: () => void;
  onAbrirConversa: () => void;
  aoRefrescar: () => void;
}) {
  const temConversa = destinoDaTarefa(t) != null;
  const quem = t.responsavel_id ? nomes.membros.get(t.responsavel_id) : null;

  return (
    <li
      id={`tarefa-${t.id}`}
      className={cn(
        "relative border-b border-[#F1F0EC] last:border-b-0",
        emFoco ? "bg-[#FBFBFA] ring-1 ring-inset ring-navy" : "hover:bg-hover/50",
        emFoco && "rounded-[9px]",
      )}
    >
      <RailPrioridade prioridade={t.prioridade} />
      <div
        role="button"
        tabIndex={0}
        onClick={onFocar}
        onKeyDown={(e) => {
          if (e.key === " " && e.target === e.currentTarget) {
            e.preventDefault();
            onFocar();
          }
        }}
        aria-current={emFoco ? "true" : undefined}
        className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy/40"
      >
        <span className={cn("w-5 shrink-0 pt-px text-right font-mono text-[11px] tabular-nums", emFoco ? "font-semibold text-navy" : "text-mute")}>
          {numero}
        </span>
        <span className="self-start pt-px">
          <BotaoConcluir
            titulo={t.titulo}
            aberto={painel === "concluir"}
            onToggle={() => onPainel(painel === "concluir" ? null : "concluir")}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-tinta">{t.titulo}</span>
            <ChipPrioridade prioridade={t.prioridade} />
            <span className={cn("shrink-0 font-mono text-[11.5px] tabular-nums", t.vencida ? "font-semibold text-vermelho" : "text-suave")}>
              {textoPrazo(t, agora)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-suave">
            {t.lead_nome && <span className="truncate">{t.lead_nome}</span>}
            {t.lead_nome && quem && <span className="text-linha">·</span>}
            {quem && <span>{quem.split(" ")[0]}</span>}
            {t.tipo && (
              <span className="rounded-full border border-linha bg-board px-2 py-px text-[10.5px]">{nomes.tipos.get(t.tipo) ?? t.tipo}</span>
            )}
            {!emFoco && <BadgeOrigem t={t} />}
          </div>

          {emFoco && (
            <div className="mt-1.5">
              {t.descricao && <div className="whitespace-pre-line text-[12px] leading-snug text-suave">{t.descricao}</div>}
              <PorQueJarvis t={t} />
            </div>
          )}
        </div>
        <span className="self-start">
          <BotaoAcoes aberto={painel === "acoes"} onToggle={() => onPainel(painel === "acoes" ? null : "acoes")} />
        </span>
      </div>

      {emFoco && (
        <div className="px-3 pb-3 pl-[46px]" onClick={(e) => e.stopPropagation()}>
          {/* a barra de ações da tarefa em foco — cada botão com a tecla que o dispara */}
          <div className="flex flex-wrap items-center gap-1.5">
            {temConversa && (
              <button
                type="button"
                onClick={onAbrirConversa}
                className="inline-flex items-center gap-1 rounded-md bg-navy px-2.5 py-1 text-[12.5px] font-semibold text-branco transition-colors hover:bg-navy-esc"
              >
                Abrir conversa
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
                <Tecla clara>J</Tecla>
              </button>
            )}
            <button
              type="button"
              onClick={() => onPainel(painel === "concluir" ? null : "concluir")}
              aria-pressed={painel === "concluir"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                painel === "concluir" ? "border-navy bg-[#EAECF5] text-navy" : "border-linha-forte bg-branco text-tinta hover:bg-hover",
              )}
            >
              Concluir
              <Tecla>⏎</Tecla>
            </button>
            <button
              type="button"
              onClick={() => onPainel(painel === "acoes" ? null : "acoes")}
              aria-pressed={painel === "acoes"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                painel === "acoes" ? "border-navy bg-[#EAECF5] text-navy" : "border-linha-forte bg-branco text-tinta hover:bg-hover",
              )}
            >
              Adiar
              <Tecla>A</Tecla>
            </button>
            <button
              type="button"
              onClick={onPular}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
            >
              Pular
              <Tecla>P</Tecla>
            </button>
          </div>

          {painel === "concluir" && (
            <PainelConcluir
              leadId={t.lead_id}
              tarefaId={t.id}
              executor={{
                concluir: async (resultado) => {
                  const r = acoes.concluir ? await acoes.concluir(resultado) : { ok: false, motivo: "sem executor" };
                  // o "e agora?" abre a partir daqui, com o resultado em mãos — `aoSucesso` do
                  // painel dispara no mesmo tick e não veria um estado recém-setado
                  if (r.ok) aoConcluida(resultado);
                  return r;
                },
              }}
              aoSucesso={() => undefined}
              onFechar={() => onPainel(null)}
            />
          )}
          {painel === "acoes" && (
            <AcoesTarefa
              leadId={t.lead_id}
              tarefaId={t.id}
              prazoAtual={t.prazo}
              responsavelAtualId={t.responsavel_id}
              pessoas={pessoas}
              agora={agora}
              executor={{
                adiar: async (prazoIso, motivo) => {
                  const r = acoes.adiar ? await acoes.adiar(prazoIso, motivo) : { ok: false, motivo: "sem executor" };
                  if (r.ok) aoAdiada();
                  return r;
                },
                reatribuir: acoes.reatribuir,
                arquivar: acoes.arquivar,
              }}
              aoSucesso={aoRefrescar}
              onFechar={() => onPainel(null)}
            />
          )}
        </div>
      )}
    </li>
  );
}

function Tecla({ children, clara }: { children: React.ReactNode; clara?: boolean }) {
  return (
    <kbd
      className={cn(
        "ml-0.5 rounded border px-1 py-px font-mono text-[10px] font-medium leading-none",
        clara ? "border-branco/40 text-branco/85" : "border-linha-forte text-mute",
      )}
    >
      {children}
    </kbd>
  );
}
