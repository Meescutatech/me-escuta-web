"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, CalendarClockIcon, CheckIcon, EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarcaJarvis } from "@/components/jarvis/marca";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { iniciaisDe, nomeResponsavel } from "@/lib/dados/tarefa-calculos";
import { presetsAdiar } from "@/lib/tarefas/adiar";
import { textoPrazoHumano } from "@/lib/tarefas/dia";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import { cn } from "@/lib/utils";
import { AcoesTarefa, type PessoaAtiva } from "./acoes-tarefa";
import { PainelConcluir } from "./concluir-tarefa";
import type { AcoesDaTarefa } from "./executor";

/*
 * A LINHA DA LISTA DE TAREFAS — v2 (10/09, 22:40, depois da reprovação do Diogo: "a lista está
 * uma merda").
 *
 * O que ele apontou e o que mudou:
 *  · A v1 era um card cheio de chips, selo, trilho e vermelho. Agora é TEXTO em duas linhas:
 *      ☐ ● Título 15px medium                                     Lead (muted)
 *          ◠ o porquê do Jarvis, 13px muted                         (só quando o Jarvis criou)
 *          vence hoje · 22:53  ·  (SO) Sara  ·  Confirmar exame
 *    Vermelho SÓ no prazo, e só quando venceu. Tipo é texto, não chip. Zero pastilha cinza.
 *  · Jarvis cria tarefa AUTOMATICAMENTE (D62): a tarefa dele é tarefa de verdade, na lista, com
 *    a marca de origem — o ARCO (components/jarvis/marca.tsx, escolhido pelo Diogo) em muted,
 *    abrindo a linha do porquê. Não é card à parte, não é "proposta".
 *  · Prioridade = um ponto de 6px antes do título, laranja para ALTA. Média e baixa: nada — a
 *    ordem dentro do grupo já as separa (lib/tarefas/dia.ts).
 *  · Ações aparecem no HOVER (e no foco do percurso): Concluir · Adiar ▾ (Amanhã · 3 dias ·
 *    Próxima segunda · Outra data…) · Abrir conversa · ⋯ (Reatribuir · Arquivar). Aparecem sobre
 *    a segunda linha, à direita, sem mexer no layout da linha.
 *  · Concluir abre o campo de resultado logo abaixo (a regra do 0037: sem resultado não fecha).
 *
 * A linha inteira é clicável (leva à conversa ancorada, 31/08) — exceto o que é botão dentro
 * dela, que faz stopPropagation.
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
  painel,
  onPainel,
  aoConcluida,
  aoAdiada,
  aoMudar,
  onFocar,
}: {
  t: TarefaVisao;
  agora: number;
  nomes: Nomes;
  pessoas: PessoaAtiva[];
  acoes: AcoesDaTarefa;
  /** a tarefa em foco no percurso do dia: ações sempre visíveis, fundo marcado */
  emFoco?: boolean;
  painel: PainelLinha;
  onPainel: (p: PainelLinha) => void;
  /** depois de concluir — o pai abre o "e agora?" com o resultado em mãos */
  aoConcluida: (resultado: string) => void;
  aoAdiada: () => void;
  aoMudar: () => void;
  onFocar?: () => void;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pendente = t.status === "pendente";
  const fechada = !pendente;
  const destino = destinoDaTarefa(t);
  const quem = nomeResponsavel(t, nomes.membros);
  const primeiroNome = quem ? quem.split(/\s+/)[0] : null;
  const jarvis = t.origem === "jarvis_conversa";
  const presets = presetsAdiar(agora);

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

  function abrir() {
    if (destino) router.push(destino);
  }

  return (
    <li
      id={`tarefa-${t.id}`}
      className={cn(
        "group relative border-b border-[#F1F0EC] last:border-b-0",
        emFoco ? "bg-[#FBFAF7]" : "hover:bg-[#FBFAF7]",
      )}
      aria-current={emFoco ? "true" : undefined}
    >
      <div
        role={destino ? "link" : undefined}
        tabIndex={destino ? 0 : undefined}
        onClick={() => {
          onFocar?.();
          abrir();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) abrir();
        }}
        className={cn("flex items-start gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50", destino && "cursor-pointer")}
      >
        {/* a caixa de marcar — abre o campo de resultado, não conclui sozinha (0037) */}
        <button
          type="button"
          disabled={fechada}
          onClick={(e) => {
            e.stopPropagation();
            onPainel(painel === "concluir" ? null : "concluir");
          }}
          aria-label={fechada ? "Concluída" : `Concluir: ${t.titulo}`}
          aria-expanded={painel === "concluir"}
          className={cn(
            "mt-[3px] grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
            fechada
              ? "border-transparent bg-mute/60 text-branco"
              : painel === "concluir"
                ? "border-primary bg-primary text-branco"
                : "border-input bg-branco hover:border-primary",
          )}
        >
          {(fechada || painel === "concluir") && <CheckIcon className="size-3" strokeWidth={3} aria-hidden />}
        </button>

        <div className="min-w-0 flex-1">
          {/* linha 1 — título e lead */}
          <div className="flex items-baseline gap-3">
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              {pendente && t.prioridade === "alta" && (
                <span className="mb-px size-1.5 shrink-0 self-center rounded-full bg-primary" title="prioridade alta" aria-label="prioridade alta" />
              )}
              <span className={cn("min-w-0 truncate text-[15px] font-medium leading-snug", fechada ? "text-mute line-through decoration-mute/60" : "text-tinta")}>
                {t.titulo}
              </span>
            </span>
            {t.lead_nome && <span className="shrink-0 text-[13px] text-mute">{t.lead_nome}</span>}
          </div>

          {/* linha do Jarvis — o porquê, com a marca de origem abrindo a frase */}
          {jarvis && t.por_que && (
            <p className={cn("mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug", fechada ? "text-mute/80" : "text-mute")}>
              <MarcaJarvis tamanho={16} rotulo="Criada pelo Jarvis" className="mt-px shrink-0" />
              <span className="min-w-0">
                {t.por_que}
                {t.trecho && (emFoco || painel) && <span className="italic"> — “{t.trecho}”</span>}
              </span>
            </p>
          )}
          {!jarvis && t.descricao && (
            <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-mute">{t.descricao}</p>
          )}

          {/* linha 2 — prazo · responsável · tipo, e o desfecho quando fechada */}
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
          {erro && <p className="mt-1 text-[12px] font-medium text-vermelho">{erro}</p>}
        </div>

        {/* AÇÕES — no hover, no foco de teclado e na tarefa em foco. Absolutas sobre a segunda
            linha para a linha não pular de tamanho ao passar o mouse. */}
        {pendente && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bottom-2 right-3 flex items-center gap-0.5 rounded-md bg-[#FBFAF7] pl-3 opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100",
              emFoco && "opacity-100",
            )}
          >
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onPainel(painel === "concluir" ? null : "concluir")}
              aria-pressed={painel === "concluir"}
              className="text-suave hover:text-tinta"
            >
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
              <Button variant="ghost" size="xs" onClick={abrir} className="text-suave hover:text-tinta">
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
