"use client";

import Link from "next/link";
import { segmentosComMencao } from "@/lib/conversas/mencao";
import type { RegistroInterno as Registro } from "@/lib/conversas/registro-timeline";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { cn } from "@/lib/utils";

/**
 * Nota ou tarefa publicada, dentro da timeline da conversa (C2 · mockup estado f).
 * Ocupa a largura toda e não tem bolha: bolha é só do que trafega com o cliente.
 *
 * W-D3 (Diogo, 22:40) · a MESMA dieta da nota do Jarvis (`components/jarvis/proposta-inline.tsx`):
 * fundo `muted/30`, borda fina, cabeçalho de 12px muted — "Nota interna · Sara · 02:32" — e o
 * texto em peso normal. Saíram o âmbar, a barra lateral e o rótulo em caixa alta: o que diz
 * "isto fica entre nós" é a forma (largura toda, sem bolha), não a cor gritando.
 */

const CAIXA = "self-stretch rounded-md border border-border/60 bg-muted/30 px-3 py-2";
const CABECALHO = "mb-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground";

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function primeiroNome(nome: string | null): string | null {
  if (!nome) return null;
  return nome.includes("@") ? nome.split("@")[0] : nome.trim().split(/\s+/)[0];
}

export function RegistroInterno({ registro }: { registro: Registro }) {
  const nota = registro.tipo === "nota";
  const segmentos = segmentosComMencao(registro.texto, registro.mencoes);

  // F2 / D62 · a tarefa que o JARVIS criou a partir desta conversa. É REGISTRO, não pedido:
  // sem botão de aprovar (criar_tarefa está em `auto`, 0297). O que a autonomia muda é quem
  // aprova, não a transparência — por isso o POR QUE e o trecho citado ficam à vista.
  if (!nota && registro.jarvis) {
    const j = registro.jarvis;
    return (
      <article className={CAIXA}>
        <header className={CABECALHO}>
          <span>Jarvis criou uma tarefa</span>
          <span aria-hidden>·</span>
          <span>{registro.responsavel ? `para ${primeiroNome(registro.responsavel)}` : "sem responsável"}</span>
          <span aria-hidden>·</span>
          <time dateTime={registro.criado_em}>{hora(registro.criado_em)}</time>
        </header>
        <p className="text-[13.5px] leading-snug text-foreground">
          <span className="font-medium">{j.fazer}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">
          {j.por_que}
          {j.trecho && <em> “{j.trecho}”</em>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          {registro.prazo && (
            <span>
              vence <span className="tabular-nums text-foreground">{dataHoraCurta(registro.prazo)}</span>
            </span>
          )}
          {registro.prazo && <span aria-hidden>·</span>}
          <Link
            href={`/tarefas?status=abertas#tarefa-${registro.id}`}
            className="underline-offset-[3px] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
          >
            ver tarefa
          </Link>
        </p>
      </article>
    );
  }

  return (
    <article className={CAIXA}>
      <header className={CABECALHO}>
        <span>{nota ? "Nota interna" : "Tarefa"}</span>
        <span aria-hidden>·</span>
        <span>
          {nota
            ? (primeiroNome(registro.autor) ?? "equipe")
            : registro.responsavel
              ? `para ${primeiroNome(registro.responsavel)}`
              : "sem responsável"}
        </span>
        <span aria-hidden>·</span>
        <time dateTime={registro.criado_em}>{hora(registro.criado_em)}</time>
      </header>

      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug text-foreground">
        {segmentos.map((s, i) =>
          s.tipo === "mencao" ? (
            <span key={i} className={cn("rounded px-1 font-medium", s.alvo === "agente" ? "bg-laranja-cl font-mono text-[12.5px] text-laranja-esc" : "bg-bolha-out text-navy")}>
              {s.texto}
            </span>
          ) : (
            <span key={i}>{s.texto}</span>
          ),
        )}
      </p>

      {!nota && registro.prazo && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          vence <span className="tabular-nums text-foreground">{dataHoraCurta(registro.prazo)}</span>
        </p>
      )}
    </article>
  );
}
