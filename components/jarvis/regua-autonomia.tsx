"use client";

import { LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { MarcaJarvis, type VarianteMarca } from "./marca";

/**
 * A RÉGUA DE AUTONOMIA DO JARVIS, por tipo de ação — v2 na dieta (W-J, 10/09/2026).
 *
 * Vocabulário do banco: nível ∈ auto | propor | proibido (0165) e TETO ∈ auto | propor (0161:
 * "teto ≠ configuração — declara o que é PERMITIDO configurar"). Uma linha por capacidade; à
 * direita, três posições em texto (Faz sozinho · Propõe · Nunca) num trilho `muted`, a ativa em
 * `card` com hairline — sem navy chapado, sem chip gritando. A posição que o teto não deixa
 * escolher leva um cadeado de 14px inline e o fundamento da 0161 no tooltip.
 *
 * As do Art. III.3 (preço, negociação, crédito, conduta clínica) vêm travadas em "Nunca", numa
 * seção própria com uma linha de explicação. Não é switch desligado; é linha sem switch. Mudar
 * uma posição vira `autonomia_alterada{capacidade, nivel}`, com quem e quando — nunca deploy.
 */

export type NivelAutonomia = "auto" | "propor" | "proibido";
export type TetoAutonomia = "auto" | "propor";

export interface LinhaAutonomia {
  chave: string;
  rotulo: string;
  descricao: string;
  nivel: NivelAutonomia;
  teto: TetoAutonomia;
  fundamento: string;
  travada?: boolean;
  alteradaPor?: string | null;
}

const POSICOES: Array<{ nivel: NivelAutonomia; rotulo: string; ajuda: string }> = [
  { nivel: "auto", rotulo: "Faz sozinho", ajuda: "O Jarvis executa e registra; ninguém aprova." },
  { nivel: "propor", rotulo: "Propõe", ajuda: "O Jarvis propõe no fio e alguém aceita, ajusta ou descarta." },
  { nivel: "proibido", rotulo: "Nunca", ajuda: "O Jarvis nem propõe." },
];

function cabeNoTeto(nivel: NivelAutonomia, teto: TetoAutonomia): boolean {
  return nivel !== "auto" || teto === "auto";
}

export interface ReguaAutonomiaProps {
  linhas: LinhaAutonomia[];
  podeEditar: boolean;
  onMudar?: (chave: string, nivel: NivelAutonomia) => void;
  marca?: VarianteMarca;
  className?: string;
}

export function ReguaAutonomia({ linhas, podeEditar, onMudar, marca = "arco", className }: ReguaAutonomiaProps) {
  const livres = linhas.filter((l) => !l.travada);
  const travadas = linhas.filter((l) => l.travada);

  return (
    <section className={cn("rounded-md border border-border bg-card", className)} aria-label="Autonomia do Jarvis por tipo de ação">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MarcaJarvis variante={marca} tamanho={16} className="text-foreground" />
        <h2 className="text-[13.5px] font-medium text-foreground">O que o Jarvis faz sozinho e o que ele propõe</h2>
        {!podeEditar && <span className="ml-auto text-[12px] text-muted-foreground">só leitura</span>}
      </header>

      <ul className="divide-y divide-border">
        {livres.map((l) => (
          <Linha key={l.chave} linha={l} podeEditar={podeEditar} onMudar={onMudar} />
        ))}
      </ul>

      {travadas.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 border-y border-border bg-muted/40 px-4 py-2 text-[12px] text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden />
            Nunca é do Jarvis — Constituição, Art. III.3. Muda por emenda, não por configuração.
          </p>
          <ul className="divide-y divide-border">
            {travadas.map((l) => (
              <Linha key={l.chave} linha={l} podeEditar={false} />
            ))}
          </ul>
        </>
      )}

      <footer className="border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
        Cada mudança fica registrada com quem mudou e quando, e vale na hora.
      </footer>
    </section>
  );
}

function Linha({ linha: l, podeEditar, onMudar }: { linha: LinhaAutonomia; podeEditar: boolean; onMudar?: (chave: string, nivel: NivelAutonomia) => void }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium", l.travada ? "text-muted-foreground" : "text-foreground")}>{l.rotulo}</p>
        <p className="text-[12.5px] leading-normal text-muted-foreground">
          {l.descricao}
          {l.alteradaPor && !l.travada && <span className="ml-1.5 text-[11.5px]">· mudou por último: {l.alteradaPor}</span>}
        </p>
      </div>

      <div role="radiogroup" aria-label={`Autonomia para ${l.rotulo}`} className="inline-flex shrink-0 self-start rounded-md bg-muted p-0.5 text-[12px] sm:self-auto">
        {POSICOES.map((pos) => {
          const ativa = l.nivel === pos.nivel;
          const cabe = cabeNoTeto(pos.nivel, l.teto);
          const bloqueada = l.travada || !cabe || !podeEditar;
          const botao = (
            <button
              type="button"
              role="radio"
              aria-checked={ativa}
              aria-disabled={bloqueada}
              disabled={bloqueada && !ativa ? true : undefined}
              onClick={() => {
                if (bloqueada || ativa) return;
                onMudar?.(l.chave, pos.nivel);
              }}
              title={pos.ajuda}
              className={cn(
                "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                ativa && "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]",
                !ativa && !bloqueada && "text-muted-foreground hover:text-foreground",
                !ativa && bloqueada && "cursor-not-allowed text-muted-foreground/60",
              )}
            >
              {((!cabe && !l.travada) || (l.travada && ativa)) && <LockIcon className="size-3.5" aria-hidden />}
              {pos.rotulo}
            </button>
          );
          if (!cabe && !l.travada) {
            return (
              <HintTooltip key={pos.nivel} title={`Teto: ${l.teto === "propor" ? "Propõe" : "Faz sozinho"}`} content={l.fundamento} side="top">
                {botao}
              </HintTooltip>
            );
          }
          if (l.travada && ativa) {
            return (
              <HintTooltip key={pos.nivel} title="Art. III.3" content={l.fundamento} side="top">
                {botao}
              </HintTooltip>
            );
          }
          return <span key={pos.nivel}>{botao}</span>;
        })}
      </div>
    </li>
  );
}
