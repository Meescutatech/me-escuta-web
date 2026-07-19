"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CardLead, Origem } from "@/lib/dados/funil";
import { textoTempoCurto, timerVelho } from "@/lib/tempo";
import { cn } from "@/lib/utils";

/*
 * Card ENXUTO do redesign Notion-minimalista (fase 1). Spec: kanban-v2.html §4/§5.
 *  - nome dominante (ou telefone quando o nome é lixo de anúncio) + telefone + 1 sinal + valor
 *  - kommo:id e metadados técnicos saem do card → tooltip nativo (title)
 *  - timer discreto no canto (warm quando parado)
 *  - barra de foco 2px laranja à esquerda quando selecionado
 *  - sugestão da Clara inline com ✓ / ✕ (agente propõe, humano valida)
 *  - chip de responsável = MAPA de 2 cores: laranja = IA (Clara), navy = humano
 */

const ORIGEM_ROTULO: Record<Origem, string> = { wa: "WhatsApp", ig: "Instagram", meta: "Meta Ads", ind: "Indicação" };

function moeda(v: number | null): string {
  if (v == null) return "";
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Formata telefone BR em (DD) 9XXXX-XXXX; devolve o original se não bater. */
function fmtTelefone(t: string | null): string {
  if (!t) return "";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/**
 * "Dado ruim é decisão de UI" (spec §5): nome null / lixo de anúncio ("Facebook Nº1052…") /
 * só dígitos → NÃO exibe. O título vira o telefone + rótulo discreto da origem.
 */
function nomeRuim(nome: string | null): boolean {
  if (!nome) return true;
  const n = nome.trim();
  if (n.length < 2) return true;
  if (/^(facebook|instagram|meta|whats?app|lead|cliente|contato|novo lead|sem nome)\b/i.test(n)) return true;
  if (/n[º°o]\s*\d/i.test(n)) return true; // "Nº1052"
  if (!/[a-zà-ú]/i.test(n)) return true; // sem letras (telefone puro etc.)
  return false;
}

/** Detecta responsável IA (Clara) pelo nome derivado do `dono`. Tudo mais = humano. */
function respEhIA(nome: string): boolean {
  return /clara|jarvis|\bia\b/i.test(nome);
}
function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1] ? p[1][0] : "")).toUpperCase();
}

function ChipResp({ nome, tipo }: { nome: string; tipo: "dm" | "sara" | "fono" }) {
  const ia = respEhIA(nome);
  return (
    <span
      title={nome}
      className={cn(
        "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[0.62rem] font-semibold text-branco",
        ia ? "bg-laranja" : "bg-navy", // laranja = IA · navy = humano (um único navy — spec da legenda)
      )}
    >
      {ia ? "C" : tipo === "fono" ? "F" : iniciais(nome)}
    </span>
  );
}

export function CartaoLead({
  card,
  agora,
  selecionado,
  onAbrir,
  onResolverSugestao,
}: {
  card: CardLead;
  agora: number;
  selecionado: boolean;
  onAbrir: (leadId: string) => void;
  onResolverSugestao?: (leadId: string, decisao: "aprovada" | "descartada") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card:${card.lead_id}`,
    data: { leadId: card.lead_id, etapa: card.etapa },
  });
  const [sugestaoResolvida, setSugestaoResolvida] = useState<null | "aprovada" | "descartada">(null);

  const ruim = nomeRuim(card.nome);
  const valor = moeda(card.valor);
  const origemLabel = card.origem ? ORIGEM_ROTULO[card.origem] : null;
  const velho = timerVelho(card.entrou_etapa_em, agora);
  const timer = textoTempoCurto(card.entrou_etapa_em, agora);

  // 1 sinal significativo (spec §4): quando o nome é lixo, o sinal é "Lead · <origem>";
  // com nome real, o sinal é a própria origem. Nada além disso no card.
  const sinal = ruim ? (origemLabel ? `Lead · ${origemLabel}` : "Lead") : origemLabel;
  const sinalAds = card.origem === "meta";

  const titulo = [
    card.kommo_lead_id ? `kommo:${card.kommo_lead_id}` : null,
    origemLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  function resolver(ev: React.MouseEvent, decisao: "aprovada" | "descartada") {
    ev.stopPropagation();
    setSugestaoResolvida(decisao);
    onResolverSugestao?.(card.lead_id, decisao);
  }

  const mostraSugestao = card.proposta && !sugestaoResolvida;
  const nomeAgente = card.proposta?.agente === "lev" ? "Levindo" : "Clara";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => onAbrir(card.lead_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir(card.lead_id);
        }
      }}
      title={titulo || undefined}
      className={cn(
        "relative cursor-grab touch-none select-none rounded-[9px] border bg-branco px-[11px] pb-[9px] pt-[10px] transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50",
        selecionado ? "border-linha-forte" : "border-linha hover:border-linha-forte hover:shadow-[0_1px_6px_rgba(37,47,99,.06)]",
        isDragging && "opacity-40",
      )}
    >
      {/* barra de foco 2px laranja à esquerda (card selecionado) */}
      <span
        className={cn(
          "absolute bottom-[9px] left-0 top-[9px] w-[2px] rounded-[2px] transition-colors",
          selecionado ? "bg-laranja" : "bg-transparent",
        )}
      />

      <div className="flex items-start gap-2">
        <div
          className={cn(
            "min-w-0 flex-1 truncate text-[0.9rem] font-semibold leading-[1.25] text-navy",
            ruim && "tabular-nums",
          )}
        >
          {ruim ? fmtTelefone(card.telefone) || "Lead sem telefone" : card.nome}
        </div>
        {valor ? (
          <span className="shrink-0 pt-px text-[0.82rem] font-semibold tabular-nums text-tinta">{valor}</span>
        ) : card.responsavel ? (
          <ChipResp nome={card.responsavel.nome} tipo={card.responsavel.tipo} />
        ) : null}
      </div>

      {!ruim && card.telefone && (
        <div className="mt-0.5 text-[0.78rem] tabular-nums text-suave">{fmtTelefone(card.telefone)}</div>
      )}

      {(sinal || timer) && (
        <div className="mt-2 flex items-center gap-2">
          {sinal && (
            <span
              className={cn(
                "inline-flex min-w-0 items-center gap-1.5 truncate text-[0.74rem] text-suave",
              )}
            >
              <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", sinalAds ? "bg-pt-ads" : "bg-mute")} />
              {sinal}
            </span>
          )}
          {timer && (
            <span
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-[0.72rem]",
                velho ? "font-bold text-timer-velho" : "text-mute", // peso 700 + ícone: canal não-cor (WCAG 1.4.1)
              )}
              title={velho ? "Lead parado há muitos dias" : undefined}
            >
              {velho && (
                <svg viewBox="0 0 24 24" strokeWidth={2.4} className="h-3 w-3 stroke-current" fill="none">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4l2.5 1.5" strokeLinecap="round" />
                </svg>
              )}
              {timer}
            </span>
          )}
          {valor && card.responsavel && <ChipResp nome={card.responsavel.nome} tipo={card.responsavel.tipo} />}
        </div>
      )}

      {/* sugestão da IA inline — agente propõe, humano valida (spec §7) */}
      {mostraSugestao && card.proposta && (
        <div className="mt-[9px] flex items-center gap-[7px] border-t border-dashed border-linha-forte pt-2">
          <span className="min-w-0 flex-1 text-[0.72rem] leading-tight text-suave">
            <b className="font-semibold text-navy">{nomeAgente} sugere:</b>{" "}
            <span dangerouslySetInnerHTML={{ __html: card.proposta.texto }} />
          </span>
          <button
            type="button"
            onClick={(e) => resolver(e, "aprovada")}
            title="Aprovar sugestão"
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-laranja-cl text-laranja-esc transition-colors hover:bg-laranja hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] stroke-current" fill="none">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => resolver(e, "descartada")}
            title="Descartar"
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-3 w-3 stroke-current" fill="none">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
