"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ResultadoEvento } from "@/app/(app)/funil/actions";
import { AssinaturaJarvis } from "@/components/jarvis/marca";
import { PropostaTarefaCard } from "@/components/jarvis/proposta-tarefa-card";
import { dePropostaPendente, ehPrazoCurto, type AjusteProposta } from "@/components/jarvis/tipos";
import { prazoCurtoParaIso } from "@/lib/tarefas/adiar";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import type { AjustePropostaTarefa, PropostaTarefaPendente } from "@/lib/tarefas/propostas";
import { cn } from "@/lib/utils";
import type { PessoaAtiva } from "./acoes-tarefa";

/*
 * PROPOSTAS DO JARVIS À ESPERA DE ALGUÉM (W-D5, 10/09 · benchmark §4 item 9).
 *
 * O CARD é o do W-J (`components/jarvis/proposta-tarefa-card.tsx`): uma cara só para o Jarvis no
 * app — o mesmo desenho que aparece no fio da conversa e na galeria `/jarvis/galeria`. Este
 * arquivo só faz a COSTURA com a /tarefas: o bloco recolhível "Jarvis propõe N", o adaptador do
 * nosso tipo (`PropostaTarefaPendente` → `PropostaJarvis`, `dePropostaPendente`) e a tradução do
 * ajuste de volta (prazo curto "hoje/amanhã/esta semana" → ISO, que é o que o `tarefa_criada`
 * grava).
 *
 * Três saídas, três eventos (lib/tarefas/propostas.ts): aceitar → `validar_sugestao(aprovada)`;
 * ajustar → `validar_sugestao(aprovada, payload)` com `ajustada_de`; descartar →
 * `validar_sugestao(rejeitada)`. O MOTIVO do descarte que o card do W-J coleta ainda não tem
 * para onde ir na porta (registrado no STATUS como [E]).
 *
 * As propostas ficam no topo da view do dia, acima das tarefas, porque é a primeira coisa a
 * decidir de manhã — o que entra na fila antes de começar a fila.
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
  return (
    <section aria-label="Propostas do Jarvis" className="mb-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[12.5px] transition-colors hover:bg-hover"
      >
        <AssinaturaJarvis tamanho={20} sufixo="propõe" />
        <span className="font-mono text-[11.5px] tabular-nums text-suave">
          {propostas.length} {propostas.length === 1 ? "tarefa" : "tarefas"}
        </span>
        <span className="hidden text-[12px] text-mute sm:inline">· nada foi criado ainda — você decide o que entra na fila</span>
        <ChevronDownIcon className={cn("ml-auto size-3.5 text-mute transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto && (
        <div className="mt-1.5 flex flex-col gap-2">
          {propostas.map((p) => (
            <PropostaTarefaCard
              key={p.id}
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

/** O ajuste do card do W-J fala em prazo curto; o `tarefa_criada` fala em ISO. */
function traduzirAjuste(a: AjusteProposta, agora: number): AjustePropostaTarefa {
  const saida: AjustePropostaTarefa = {};
  if (a.fazer !== undefined) saida.fazer = a.fazer;
  if (a.responsavel_id !== undefined) saida.responsavel_id = a.responsavel_id;
  if (a.prazo !== undefined) saida.prazo = a.prazo == null ? null : ehPrazoCurto(a.prazo) ? prazoCurtoParaIso(a.prazo, agora) : a.prazo;
  return saida;
}
