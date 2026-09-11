"use client";

import { ChevronRightIcon } from "lucide-react";
import type { ResultadoEvento } from "@/app/(app)/funil/actions";
import { MarcaJarvis } from "@/components/jarvis/marca";
import { PropostaTarefaCard } from "@/components/jarvis/proposta-tarefa-card";
import { dePropostaPendente, ehPrazoCurto, type AjusteProposta } from "@/components/jarvis/tipos";
import { prazoCurtoParaIso } from "@/lib/tarefas/adiar";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import type { AjustePropostaTarefa, PropostaTarefaPendente } from "@/lib/tarefas/propostas";
import { cn } from "@/lib/utils";
import type { PessoaAtiva } from "./acoes-tarefa";

/*
 * O QUE O JARVIS AINDA NÃO CRIOU — v2 (10/09, 22:40).
 *
 * D62: `criar_tarefa` é AUTOMÁTICO. A tarefa do Jarvis nasce criada e vive na lista como qualquer
 * outra (linha.tsx, com o arco). Este bloco só existe para os TIPOS EM MODO "PROPÕE"
 * (lib/tarefas/autonomia.ts) — os que exigem um humano antes de virar tarefa. É pequeno, vem
 * recolhido, e some quando não há nada: uma linha "Jarvis sugere 2 tarefas ›" acima da lista.
 * Aberto, cada sugestão é a nota do W-J (variante (a), sem lateral), com Aceitar · Ajustar ·
 * Descartar.
 *
 * Eventos (lib/tarefas/propostas.ts): aceitar → `validar_sugestao(aprovada)`; ajustar →
 * `validar_sugestao(aprovada, payload)` com `ajustada_de`; descartar → `validar_sugestao(rejeitada)`.
 */

export type ValidarProposta = (
  p: PropostaTarefaPendente,
  decisao: "aprovada" | "rejeitada",
  ajuste?: AjustePropostaTarefa,
  motivoDescarte?: string | null,
) => Promise<ResultadoEvento>;

export function BlocoPropostas({
  propostas,
  pessoas,
  agora,
  validar,
  aberto,
  onToggle,
}: {
  propostas: PropostaTarefaPendente[];
  pessoas: PessoaAtiva[];
  agora: number;
  validar: ValidarProposta;
  aberto: boolean;
  onToggle: () => void;
}) {
  if (propostas.length === 0) return null;
  const n = propostas.length;
  return (
    <section aria-label="Sugestões do Jarvis" className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="group inline-flex items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-[13px] text-mute transition-colors hover:bg-hover hover:text-tinta"
      >
        <MarcaJarvis tamanho={16} className="text-mute" />
        <span>
          Jarvis sugere <span className="font-medium text-suave">{n} {n === 1 ? "tarefa" : "tarefas"}</span>
          {!aberto && <span className="text-mute"> — ainda não estão na lista</span>}
        </span>
        <ChevronRightIcon className={cn("size-3.5 transition-transform", aberto && "rotate-90")} aria-hidden />
      </button>
      {aberto && (
        <div className="mt-2 flex flex-col gap-2">
          {propostas.map((p) => (
            <PropostaTarefaCard
              key={p.id}
              variante="a"
              proposta={dePropostaPendente(p, pessoas)}
              responsaveis={pessoas}
              hrefConversa={p.lead_id ? destinoDaTarefa({ lead_id: p.lead_id, criado_em: p.criado_em }) : null}
              agoraMs={agora}
              onAceitar={(_, ajuste) => void validar(p, "aprovada", ajuste ? traduzirAjuste(ajuste, agora) : undefined)}
              onDescartar={(_, motivo, observacao) => void validar(p, "rejeitada", undefined, observacao ? `${motivo}: ${observacao}` : motivo)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** O ajuste da nota do W-J fala em prazo curto; o `tarefa_criada` fala em ISO. */
function traduzirAjuste(a: AjusteProposta, agora: number): AjustePropostaTarefa {
  const saida: AjustePropostaTarefa = {};
  if (a.fazer !== undefined) saida.fazer = a.fazer;
  if (a.responsavel_id !== undefined) saida.responsavel_id = a.responsavel_id;
  if (a.prazo !== undefined) saida.prazo = a.prazo == null ? null : ehPrazoCurto(a.prazo) ? prazoCurtoParaIso(a.prazo, agora) : a.prazo;
  return saida;
}
