"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { ROTULO_PRAZO, ROTULO_MOTIVO, ehPrazoCurto, type EstadoProposta, type PropostaJarvis } from "./tipos";

/**
 * PARTES COMPARTILHADAS das superfícies do Jarvis — o que o card do fio e o card de /tarefas têm
 * em comum, para que as duas telas mostrem a MESMA proposta com a mesma cara. Nada aqui é
 * exportado para fora de `components/jarvis/`.
 */

export function tempoDesde(iso: string | null | undefined, agoraMs = Date.now()): string {
  if (!iso) return "há pouco";
  const min = Math.max(1, Math.round((agoraMs - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** "Hoje" / "Amanhã" / "Esta semana" para prazo curto; data curta para ISO. */
export function textoPrazo(prazo: PropostaJarvis["prazo"]): string {
  if (!prazo) return "sem prazo";
  if (ehPrazoCurto(prazo)) return ROTULO_PRAZO[prazo];
  const t = dataHoraCurta(prazo);
  return t || String(prazo);
}

export function prazoUrgente(prazo: PropostaJarvis["prazo"], agoraMs = Date.now()): boolean {
  if (!prazo) return false;
  if (ehPrazoCurto(prazo)) return prazo === "hoje";
  const t = new Date(prazo).getTime();
  return Number.isFinite(t) && t - agoraMs < 24 * 3_600_000;
}

/** A cor do rail esquerdo — é o estado a um relance na varredura do fio. */
export const RAIL: Record<EstadoProposta, string> = {
  proposta: "border-l-navy",
  aceita: "border-l-verde",
  ajustada: "border-l-verde",
  descartada: "border-l-linha-forte",
  feita: "border-l-verde",
};

/** Rótulo de campo — sentence case, pequeno, sem caixa alta. */
export function Rotulo({ children }: { children: React.ReactNode }) {
  return <dt className="pt-[3px] text-[11.5px] font-semibold leading-tight text-mute">{children}</dt>;
}

export function Trecho({ texto, href, onIr }: { texto: string; href?: string | null; onIr?: () => void }) {
  const corpo = (
    <blockquote className="border-l-2 border-linha-forte pl-2.5 text-[12.5px] italic leading-snug text-suave">
      “{texto}”
    </blockquote>
  );
  if (!href && !onIr) return corpo;
  return (
    <div className="flex flex-col gap-1">
      {corpo}
      {href ? (
        <a href={href} className="w-fit text-[11.5px] font-medium text-navy underline-offset-2 hover:underline">
          ver no fio
        </a>
      ) : (
        <button type="button" onClick={onIr} className="w-fit text-[11.5px] font-medium text-navy underline-offset-2 hover:underline">
          ver no fio
        </button>
      )}
    </div>
  );
}

/**
 * A frase de cabeçalho do estado — quem decidiu e quando. É sempre PESSOA: "Sara aceitou",
 * "Ana Paula ajustou", "Rodolfo descartou", "feita por Sara". O Jarvis nunca aparece como sujeito
 * de uma decisão sobre a própria proposta.
 */
export function fraseDoEstado(p: PropostaJarvis): string | null {
  const quem = p.decidido_por ?? "alguém";
  const quando = p.decidido_em ? ` · ${dataHoraCurta(p.decidido_em)}` : "";
  switch (p.estado) {
    case "proposta":
      return null;
    case "aceita":
      return `${quem} aceitou${quando}`;
    case "ajustada":
      return `${quem} ajustou e aceitou${quando}`;
    case "descartada": {
      const motivo = p.motivo_descarte ? ` · ${ROTULO_MOTIVO[p.motivo_descarte].toLowerCase()}` : "";
      return `${quem} descartou${quando}${motivo}`;
    }
    case "feita": {
      const por = p.feita_por ?? p.decidido_por ?? "alguém";
      const em = p.feita_em ? ` · ${dataHoraCurta(p.feita_em)}` : "";
      return `feita por ${por}${em}`;
    }
  }
}

export function SeloEstado({ estado, className }: { estado: EstadoProposta; className?: string }) {
  if (estado === "proposta") return null;
  if (estado === "descartada") {
    return <span className={cn("inline-flex items-center rounded-full bg-hover px-2 py-px text-[11px] font-medium text-suave", className)}>descartada</span>;
  }
  if (estado === "feita") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-verde px-2 py-px text-[11px] font-semibold text-branco", className)}>
        <CheckIcon className="size-3" strokeWidth={3} /> feita
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-verde-bg px-2 py-px text-[11px] font-semibold text-verde", className)}>
      <CheckIcon className="size-3" strokeWidth={3} /> {estado === "ajustada" ? "tarefa criada com ajustes" : "tarefa criada"}
    </span>
  );
}

/** "era: Ligar amanhã · Ana Paula" — o que a pessoa mudou em relação ao proposto. */
export function textoDoOriginal(p: PropostaJarvis): string | null {
  const o = p.original;
  if (!o) return null;
  const partes: string[] = [];
  if (o.fazer && o.fazer !== p.fazer) partes.push(o.fazer);
  if (o.prazo !== undefined && o.prazo !== p.prazo) partes.push(textoPrazo(o.prazo ?? null).toLowerCase());
  if (o.responsavel_nome && o.responsavel_nome !== p.responsavel_nome) partes.push(o.responsavel_nome);
  return partes.length ? `era: ${partes.join(" · ")}` : null;
}
