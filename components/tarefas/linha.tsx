"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRightIcon, CalendarClockIcon, CheckIcon, ChevronDownIcon, EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarcaJarvis } from "@/components/jarvis/marca";
import { useMovimento } from "@/components/jarvis/movimento";
import type { EventoTarefa, TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { dataHoraCurta, iniciaisDe, nomeResponsavel } from "@/lib/dados/tarefa-calculos";
import { presetsAdiar } from "@/lib/tarefas/adiar";
import { textoPrazoHumano } from "@/lib/tarefas/dia";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import { cn } from "@/lib/utils";
import type { PesoTarefa } from "@/lib/tarefas/prioridade";
import { AcoesTarefa, type PessoaAtiva } from "./acoes-tarefa";
import { PainelConcluir } from "./concluir-tarefa";
import { ComResumoNoHover } from "./resumo-hover";
import { PosicaoUrgencia } from "./posicao-urgencia";
import type { AcoesDaTarefa } from "./executor";

/*
 * A LINHA DA LISTA DE TAREFAS — v3 (10/09 23:20, "melhorou bastante" + 4 ajustes).
 *
 * TRÊS ALVOS, e nada mais (ajuste 3):
 *   ☐ checkbox  → abre o campo de resultado e conclui (0037: sem resultado não fecha);
 *   título / 1ª linha → vai DIRETO ao chat com o lead (`/conversas?c=<conversa>&em=<criado_em>`,
 *                        ancorado na mensagem; sem conversa, `?lead=`);
 *   ⌄ chevron à direita (ou clique na 2ª linha) → EXPANDE os detalhes (ajuste 2): descrição
 *     inteira, porquê do Jarvis inteiro + trecho, histórico (criada por · adiada · reatribuída ·
 *     iniciada) e as ações completas.
 *
 * Fechada, a linha é texto em duas linhas (v2): título 15px medium · lead muted à direita;
 * 2ª linha 13px muted com prazo (vermelho só se venceu) · avatar 18px · tipo em texto; o porquê
 * do Jarvis vira uma linha muted truncada, aberta com o ARCO (a marca é a assinatura). No hover
 * aparecem Concluir · Adiar ▾ · Abrir conversa · ⋯ sobre a 2ª linha, sem mexer no layout.
 *
 * W-T (noite): ao expandir, o PRIMEIRO bloco é o RESUMO DO JARVIS (resumo-jarvis.tsx) — situação
 * do lead, o que ele viu (trecho + "ver no fio"), o que fazer e por quê; para tarefa de humano o
 * Jarvis ainda resume o contexto. Depois vêm descrição, histórico e as ações. O expand anima
 * altura 0 → auto com `useMovimento` (regra do Diogo: zero layout shift nos toggles).
 */

type Nomes = { membros: Map<string, string>; tipos: Map<string, string> };
export type PainelLinha = "concluir" | "reatribuir" | "repactuar" | "arquivar" | null;

export function LinhaTarefa({
  t,
  agora,
  nomes,
  pessoas,
  acoes,
  emFoco = false,
  aberta,
  onAbrir,
  painel,
  onPainel,
  aoConcluida,
  aoAdiada,
  aoMudar,
  onFocar,
  posicao,
  totalNaOrdem,
  peso,
}: {
  t: TarefaVisao;
  agora: number;
  nomes: Nomes;
  pessoas: PessoaAtiva[];
  acoes: AcoesDaTarefa;
  /** a tarefa em foco no percurso do dia: ações sempre visíveis, fundo marcado */
  emFoco?: boolean;
  /** detalhes expandidos (chevron) */
  aberta: boolean;
  onAbrir: (aberta: boolean) => void;
  painel: PainelLinha;
  onPainel: (p: PainelLinha) => void;
  /** depois de concluir — o pai abre o "e agora?" com o resultado em mãos */
  aoConcluida: (resultado: string) => void;
  aoAdiada: () => void;
  aoMudar: () => void;
  onFocar?: () => void;
  /** v4 · a posição na ordem "Mais urgente primeiro" — só na lista ranqueada */
  posicao?: number;
  totalNaOrdem?: number;
  /** a conta que pôs a tarefa nessa posição; o hover na posição mostra os fatores */
  peso?: PesoTarefa;
}) {
  const router = useRouter();
  const mov = useMovimento();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pendente = t.status === "pendente";
  const fechada = !pendente;
  const destino = destinoDaTarefa(t);
  const quem = nomeResponsavel(t, nomes.membros);
  const primeiroNome = quem ? quem.split(/\s+/)[0] : null;
  const jarvis = t.origem === "jarvis_conversa";
  const presets = presetsAdiar(agora);
  const detalhes = aberta || emFoco;

  async function adiarPreset(prazoIso: string, motivo: string) {
    if (ocupado || !acoes.adiar) return;
    setOcupado(true);
    setErro(null);
    const r = await acoes.adiar(prazoIso, motivo);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível adiar");
      return;
    }
    aoAdiada();
  }

  function abrirConversa() {
    if (destino) router.push(destino);
  }

  const acoesRapidas = pendente && (
    <>
      <Button variant="ghost" size="xs" onClick={() => onPainel(painel === "concluir" ? null : "concluir")} aria-pressed={painel === "concluir"} className="text-suave hover:text-tinta">
        <CheckIcon aria-hidden />
        Concluir
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="xs" disabled={ocupado} className="text-suave hover:text-tinta" />}>
          <CalendarClockIcon aria-hidden />
          Adiar
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {presets.map((p) => (
            <DropdownMenuItem key={p.chave} onClick={() => void adiarPreset(p.prazoIso, p.motivo)}>
              {p.rotulo}
              <span className="ml-auto pl-4 text-[11px] text-mute">09:00</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onPainel("repactuar")}>Outra data…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {destino && (
        <Button variant="ghost" size="xs" onClick={abrirConversa} className="text-suave hover:text-tinta">
          Abrir conversa
          <ArrowUpRightIcon aria-hidden />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Mais ações" className="text-suave hover:text-tinta" />}>
          <EllipsisIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onPainel("reatribuir")}>Reatribuir…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPainel("arquivar")}>Arquivar…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <li
      id={`tarefa-${t.id}`}
      className={cn("group relative border-b border-[#F1F0EC] last:border-b-0", emFoco || aberta ? "bg-[#FBFAF7]" : "hover:bg-[#FBFAF7]")}
      aria-current={emFoco ? "true" : undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* v4 · a POSIÇÃO na ordem de urgência, com a conta atrás dela (hover) */}
        {posicao != null && peso && <PosicaoUrgencia posicao={posicao} total={totalNaOrdem ?? posicao} peso={peso} />}

        {/* ALVO 1 · a caixa: abre o campo de resultado — não conclui sozinha (0037) */}
        <button
          type="button"
          disabled={fechada}
          onClick={(e) => {
            e.stopPropagation();
            onFocar?.();
            onPainel(painel === "concluir" ? null : "concluir");
          }}
          aria-label={fechada ? "Concluída" : `Concluir: ${t.titulo}`}
          aria-expanded={painel === "concluir"}
          className={cn(
            "mt-[3px] grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
            fechada ? "border-transparent bg-mute/60 text-branco" : painel === "concluir" ? "border-primary bg-primary text-branco" : "border-input bg-branco hover:border-primary",
          )}
        >
          {(fechada || painel === "concluir") && <CheckIcon className="size-3" strokeWidth={3} aria-hidden />}
        </button>

        <div className="min-w-0 flex-1">
          {/* ALVO 2 · título e lead: leva direto ao chat com o lead */}
          <div
            role={destino ? "link" : undefined}
            tabIndex={destino ? 0 : undefined}
            onClick={() => {
              onFocar?.();
              abrirConversa();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) abrirConversa();
            }}
            title={destino ? "Abrir a conversa com o lead" : undefined}
            className={cn("group/titulo flex items-baseline gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50", destino && "cursor-pointer")}
          >
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              {pendente && t.prioridade === "alta" && (
                <span className="mb-px size-1.5 shrink-0 self-center rounded-full bg-primary" title="prioridade alta" aria-label="prioridade alta" />
              )}
              {/* O RESUMO MORA AQUI desde 11/09 (pedido do Diogo): o mouse no título abre o
                  popover ancorado, sem clique, sem expandir e sem empurrar a lista. */}
              <ComResumoNoHover t={t} onVerNoFio={destino ? abrirConversa : undefined} className="block min-w-0 flex-1">
                <span
                  className={cn(
                    "block min-w-0 truncate text-[15px] font-medium leading-snug underline-offset-[3px]",
                    fechada ? "text-mute line-through decoration-mute/60" : "text-tinta",
                    destino && "group-hover/titulo:underline",
                  )}
                >
                  {t.titulo}
                </span>
              </ComResumoNoHover>
            </span>
            {t.lead_nome && <span className="shrink-0 text-[13px] text-mute">{t.lead_nome}</span>}
          </div>

          {/* ALVO 3 · a 2ª linha (e o porquê): clique expande os detalhes */}
          <div
            onClick={() => {
              onFocar?.();
              onAbrir(!aberta);
            }}
            className="cursor-pointer"
          >
            {/* o porquê continua na linha (11/09): com o resumo no HOVER, ele deixou de brigar
                com a versão inteira dentro do toggle — não há mais duas cópias na mesma tela. */}
            {jarvis && t.por_que && (
              <ComResumoNoHover t={t} onVerNoFio={destino ? abrirConversa : undefined} className="block">
                <p className={cn("mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug", fechada ? "text-mute/80" : "text-mute")}>
                  <MarcaJarvis tamanho={16} rotulo="Criada pelo Jarvis" className="mt-px shrink-0" />
                  <span className={cn("min-w-0", !detalhes && "truncate")}>{t.por_que}</span>
                </p>
              </ComResumoNoHover>
            )}
            {!jarvis && t.descricao && !detalhes && <p className="mt-0.5 truncate text-[13px] leading-snug text-mute">{t.descricao}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-mute">
              <span className={cn(t.vencida && "font-medium text-vermelho")}>{textoPrazoHumano(t, agora)}</span>
              {quem && (
                <>
                  <span aria-hidden className="text-linha-forte">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="grid size-[18px] place-items-center rounded-full bg-navy text-[8px] font-semibold text-branco" aria-hidden>
                      {iniciaisDe(quem)}
                    </span>
                    {primeiroNome}
                  </span>
                </>
              )}
              {t.tipo && (
                <>
                  <span aria-hidden className="text-linha-forte">·</span>
                  <span>{nomes.tipos.get(t.tipo) ?? t.tipo}</span>
                </>
              )}
              {t.status === "concluida" && t.resultado && (
                <>
                  <span aria-hidden className="text-linha-forte">·</span>
                  <span className="text-suave">{t.resultado}</span>
                </>
              )}
              {t.status === "arquivada" && (
                <>
                  <span aria-hidden className="text-linha-forte">·</span>
                  <span>arquivada{t.motivo_arquivo ? ` — ${t.motivo_arquivo}` : ""}</span>
                </>
              )}
            </div>
          </div>
          {erro && <p className="mt-1 text-[12px] font-medium text-vermelho">{erro}</p>}

          {/* DETALHES — o resumo do Jarvis primeiro; depois descrição, histórico e as ações completas.
              Altura 0 → auto animada (useMovimento): o resto da lista desce junto, sem pulo. */}
          <AnimatePresence initial={false}>
            {detalhes && (
              <motion.div key="detalhes" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
                <div className="mt-3 flex flex-col gap-3 border-t border-[#F1F0EC] pt-3 text-[13px]">
              {/* o RESUMO saiu daqui em 11/09 — ele mora no hover do título. O toggle ficou com o
                  que ele sempre fez melhor: o que não cabe num popover de passagem (o trecho
                  inteiro, a descrição, o histórico e as ações). */}
              {t.trecho && (
                <div className="flex flex-col gap-1">
                  <blockquote className="border-l-2 border-linha-forte pl-2.5 italic leading-snug text-suave">“{t.trecho}”</blockquote>
                  {destino && (
                    <button type="button" onClick={abrirConversa} className="w-fit text-[12.5px] text-mute underline-offset-[3px] hover:text-tinta hover:underline">
                      ver no fio
                    </button>
                  )}
                </div>
              )}
              {t.descricao && <p className="whitespace-pre-line leading-snug text-suave">{t.descricao}</p>}
              <Historico t={t} />
              {pendente && (
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="outline" size="xs" onClick={() => onPainel(painel === "concluir" ? null : "concluir")} aria-pressed={painel === "concluir"}>
                    <CheckIcon aria-hidden />
                    Concluir
                  </Button>
                  <span className="ml-1 text-[12px] text-mute">Adiar para</span>
                  {presets.map((p) => (
                    <Button key={p.chave} variant="ghost" size="xs" disabled={ocupado} onClick={() => void adiarPreset(p.prazoIso, p.motivo)} className="text-suave hover:text-tinta">
                      {p.rotulo}
                    </Button>
                  ))}
                  <Button variant="ghost" size="xs" onClick={() => onPainel("repactuar")} className="text-suave hover:text-tinta">
                    outra data…
                  </Button>
                  <span className="mx-1 h-4 w-px bg-linha" aria-hidden />
                  <Button variant="ghost" size="xs" onClick={() => onPainel("reatribuir")} className="text-suave hover:text-tinta">
                    Reatribuir
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => onPainel("arquivar")} className="text-suave hover:text-tinta">
                    Arquivar
                  </Button>
                  {destino && (
                    <Button variant="ghost" size="xs" onClick={abrirConversa} className="ml-auto text-suave hover:text-tinta">
                      Abrir conversa
                      <ArrowUpRightIcon aria-hidden />
                    </Button>
                  )}
                </div>
              )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* o chevron — ALVO 3, sempre visível e discreto */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onAbrir(!aberta);
          }}
          aria-label={aberta ? "Recolher detalhes" : "Ver detalhes"}
          aria-expanded={aberta}
          className="mt-px shrink-0 text-mute hover:text-tinta"
        >
          <ChevronDownIcon className={cn("transition-transform", detalhes && "rotate-180")} aria-hidden />
        </Button>

        {/* AÇÕES RÁPIDAS — no hover, sobre a 2ª linha; somem quando os detalhes estão abertos
            (lá as ações completas já estão na tela) */}
        {pendente && !detalhes && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bottom-2 right-11 flex items-center gap-0.5 rounded-md bg-[#FBFAF7] pl-3 opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100",
            )}
          >
            {acoesRapidas}
          </div>
        )}
      </div>

      {/* painéis inline — abaixo da linha, alinhados ao título */}
      {pendente && painel === "concluir" && (
        <div className="px-4 pb-3 pl-11">
          <PainelConcluir
            leadId={t.lead_id}
            tarefaId={t.id}
            executor={{
              concluir: async (resultado) => {
                const r = acoes.concluir ? await acoes.concluir(resultado) : { ok: false, motivo: "sem executor" };
                if (r.ok) aoConcluida(resultado);
                return r;
              },
            }}
            aoSucesso={() => undefined}
            onFechar={() => onPainel(null)}
          />
        </div>
      )}
      {pendente && (painel === "reatribuir" || painel === "repactuar" || painel === "arquivar") && (
        <div className="px-4 pb-3 pl-11">
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
            modoInicial={painel}
            semPresets
            aoSucesso={aoMudar}
            onFechar={() => onPainel(null)}
          />
        </div>
      )}
    </li>
  );
}

/** o histórico da tarefa — o ledger dela, do mais antigo ao mais novo; sem dado, só "criada em" */
function Historico({ t }: { t: TarefaVisao }) {
  const eventos: EventoTarefa[] = t.historico?.length ? t.historico : [{ quando: t.criado_em, tipo: "criada", texto: "criada" }];
  return (
    <ol className="flex flex-col gap-0.5 text-[12.5px] text-mute">
      {eventos.map((ev, i) => (
        <li key={i} className="flex items-baseline gap-2">
          <span className="w-[110px] shrink-0 font-mono text-[11.5px] tabular-nums">{dataHoraCurta(ev.quando)}</span>
          <span className={cn(ev.tipo === "criada" ? "text-suave" : "text-mute")}>{ev.texto}</span>
        </li>
      ))}
    </ol>
  );
}
