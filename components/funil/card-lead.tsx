"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CardLead, Origem, TipoResp } from "@/lib/dados/funil";
import { textoTempo, nivelSla } from "@/lib/tempo";
import { cn } from "@/lib/utils";

const ORIGEM_ROTULO: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };
const ORIGEM_CLASSE: Record<Origem, string> = {
  wa: "bg-verde-bg text-verde",
  ig: "bg-rosa-bg text-rosa",
  meta: "bg-azul-bg text-azul",
  ind: "bg-pessego text-laranja-esc",
};
const ORIGEM_PONTO: Record<Origem, string> = { wa: "bg-verde", ig: "bg-rosa", meta: "bg-azul", ind: "bg-laranja" };

const SLA_CLASSE = {
  ok: "bg-verde-bg text-verde",
  atencao: "bg-amarelo-bg text-amarelo",
  estourado: "bg-vermelho-bg text-vermelho",
} as const;

const RESP_CLASSE: Record<TipoResp, string> = { dm: "bg-navy", sara: "bg-roxo", fono: "bg-verde" };

function iniciais(nome: string): string {
  const p = nome.replace(/→/g, " ").trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}

function moeda(v: number | null): string {
  if (v == null) return "";
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function IconeRelogio() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} className="h-[11px] w-[11px] stroke-current" fill="none">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}
function IconeTelefone() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-[13px] w-[13px] shrink-0 stroke-mute" fill="none">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.8 2z" />
    </svg>
  );
}

export function CartaoLead({
  card,
  corEtapa,
  agora,
  onAbrir,
}: {
  card: CardLead;
  corEtapa: string;
  agora: number;
  onAbrir: (leadId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card:${card.lead_id}`,
    data: { leadId: card.lead_id, etapa: card.etapa },
  });

  const sla = nivelSla(card.entrou_etapa_em, agora);
  const valor = moeda(card.valor);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => onAbrir(card.lead_id)}
      className={cn(
        "relative cursor-grab touch-none select-none rounded-lg border border-borda bg-branco p-3 pl-4 shadow-suave transition-shadow hover:border-borda-forte hover:shadow-forte active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      {/* stripe colorida por etapa */}
      <span
        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r"
        style={{ background: corEtapa }}
      />

      <div className="mb-2 flex items-start gap-2">
        <span className="flex-1 text-sm font-semibold leading-tight text-navy">
          {card.nome}
          {card.idade != null && <span className="text-xs font-medium text-mute"> · {card.idade}a</span>}
        </span>
      </div>

      {card.telefone && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-suave">
          <IconeTelefone />
          {card.telefone}
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {card.origem && (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold", ORIGEM_CLASSE[card.origem])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", ORIGEM_PONTO[card.origem])} />
            {ORIGEM_ROTULO[card.origem]}
          </span>
        )}
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold", SLA_CLASSE[sla])} title="Tempo na etapa (meta: 48h)">
          <IconeRelogio />
          {textoTempo(card.entrou_etapa_em, agora)}
        </span>
      </div>

      {/* proposta pendente de um agente (propõe → valide) */}
      {card.proposta && (
        <div className="mb-2.5 flex items-center gap-2 rounded-md border border-azul-bd bg-azul-bg px-2.5 py-2 text-[0.72rem] leading-snug text-navy">
          <span
            className={cn(
              "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[0.62rem] font-bold text-branco",
              card.proposta.agente === "clara" ? "bg-gradient-to-br from-[#F2803F] to-[#EC662E]" : "bg-navy",
            )}
          >
            {card.proposta.agente === "clara" ? "C" : "L"}
          </span>
          <div>
            <span className="font-semibold text-navy">
              {card.proposta.agente === "clara" ? "Clara" : "Levindo"}
            </span>{" "}
            propõe: <span dangerouslySetInnerHTML={{ __html: card.proposta.texto }} /> ·{" "}
            <b className="font-bold text-laranja-esc">valide</b>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-borda pt-2.5">
        {card.responsavel && (
          <>
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.62rem] font-bold text-branco", RESP_CLASSE[card.responsavel.tipo])}>
              {card.responsavel.tipo === "fono" ? "F" : iniciais(card.responsavel.nome)}
            </span>
            <span className="text-xs text-mute">{card.responsavel.nome}</span>
          </>
        )}
        <span className="ml-auto font-mono text-sm font-bold text-navy">
          {valor || <span className="font-medium text-mute">sem valor</span>}
        </span>
      </div>
    </div>
  );
}
