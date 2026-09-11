"use client";

import { LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { MarcaJarvis } from "./marca";

/**
 * A RÉGUA DE AUTONOMIA por tipo de ação — dieta final (W-J, 10/09/2026 22:40). Serve QUALQUER
 * agente (`agente` no cabeçalho: Jarvis, Clara, Levindo, Priscila); para o Jarvis o arco é a
 * assinatura e o nome não se repete, para os outros vai o nome em texto. Hairline `border/60`,
 * sem fundo.
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

export interface AgenteDaRegua {
  /** `core.agente.id` — "jarvis", "clara", "levindo", "priscila" */
  id: string;
  nome: string;
}

export interface ReguaAutonomiaProps {
  linhas: LinhaAutonomia[];
  podeEditar: boolean;
  onMudar?: (chave: string, nivel: NivelAutonomia) => void;
  /** de quem é a régua — serve Clara, Levindo e Priscila também. Padrão: Jarvis. */
  agente?: AgenteDaRegua;
  className?: string;
  /** aceita e IGNORADA — a marca está travada no arco */
  marca?: string;
}

const JARVIS: AgenteDaRegua = { id: "jarvis", nome: "Jarvis" };

export function ReguaAutonomia({ linhas, podeEditar, onMudar, agente = JARVIS, className }: ReguaAutonomiaProps) {
  const ehJarvis = agente.id === "jarvis";
  const livres = linhas.filter((l) => !l.travada);
  const travadas = linhas.filter((l) => l.travada);

  return (
    <section className={cn("rounded-md border border-border/60", className)} aria-label={`Autonomia de ${agente.nome} por tipo de ação`}>
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">
        {ehJarvis ? <MarcaJarvis tamanho={16} rotulo="Jarvis" className="text-foreground" /> : <span className="font-medium text-foreground">{agente.nome}</span>}
        <h2 className="font-medium text-foreground">{ehJarvis ? "o que faz sozinho e o que propõe" : "— o que faz sozinho e o que propõe"}</h2>
        {!podeEditar && <span className="ml-auto">só leitura</span>}
      </header>

      <ul className="divide-y divide-border/60">
        {livres.map((l) => (
          <Linha key={l.chave} linha={l} podeEditar={podeEditar} onMudar={onMudar} />
        ))}
      </ul>

      {travadas.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 border-y border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden />
            Nunca {ehJarvis ? "" : `por ${agente.nome} `}— Constituição, Art. III.3. Muda por emenda, não por configuração.
          </p>
          <ul className="divide-y divide-border/60">
            {travadas.map((l) => (
              <Linha key={l.chave} linha={l} podeEditar={false} />
            ))}
          </ul>
        </>
      )}

      <footer className="border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
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
