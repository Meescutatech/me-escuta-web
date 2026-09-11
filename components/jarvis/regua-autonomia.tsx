"use client";

import { LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { MarcaJarvis } from "./marca";

/**
 * A RÉGUA DE AUTONOMIA DO JARVIS, por tipo de ação (W-J, 10/09/2026) — para /configuracoes/inteligencia.
 *
 * O vocabulário é o do banco, não meu: nível ∈ auto | propor | proibido (0165, `autonomia_jsonb`) e
 * TETO ∈ auto | propor (0161, `flag.teto_autonomia`: "teto ≠ configuração — declara o que é
 * PERMITIDO configurar"). A régua mostra as duas camadas na mesma linha: as três posições, e o
 * cadeado na posição que o teto não deixa escolher — com o fundamento da 0161 no tooltip.
 *
 * As quatro do Art. III.3 (preço, negociação, crédito, conduta clínica) vêm TRAVADAS em "Nunca",
 * com o artigo escrito na linha. Não é um switch desligado; é uma linha que não tem switch. O
 * anti-padrão que isto evita é o do Salesforce: confirmação como flag escondida por action, que
 * quem opera não vê — aqui a régua é legível na tela em que se decide.
 *
 * Mudar uma posição é um evento (`autonomia_alterada{capacidade, nivel}`), com quem mudou e quando;
 * nunca é deploy. Quem não pode publicar config (membro) vê a régua em leitura, com a mesma cara.
 */

export type NivelAutonomia = "auto" | "propor" | "proibido";
export type TetoAutonomia = "auto" | "propor";

export interface LinhaAutonomia {
  /** chave da capacidade (`criar_tarefa`, `mover_etapa`, `falar_preco`…) */
  chave: string;
  rotulo: string;
  /** uma frase: o que o Jarvis faz quando esta capacidade age */
  descricao: string;
  nivel: NivelAutonomia;
  teto: TetoAutonomia;
  /** fundamento do teto (0161) — vai no tooltip do cadeado */
  fundamento: string;
  /** Art. III.3 — a linha nasce e morre em "Nunca" */
  travada?: boolean;
  /** quem mudou por último e quando — "Rodolfo · 08/09" */
  alteradaPor?: string | null;
}

const POSICOES: Array<{ nivel: NivelAutonomia; rotulo: string; ajuda: string }> = [
  { nivel: "auto", rotulo: "Faz sozinho", ajuda: "O Jarvis executa e registra; ninguém aprova." },
  { nivel: "propor", rotulo: "Propõe", ajuda: "O Jarvis propõe no fio e alguém aceita, ajusta ou descarta." },
  { nivel: "proibido", rotulo: "Nunca", ajuda: "O Jarvis nem propõe." },
];

/** `auto` só é permitido se o teto for `auto`; `propor` e `proibido` sempre cabem sob qualquer teto. */
function cabeNoTeto(nivel: NivelAutonomia, teto: TetoAutonomia): boolean {
  return nivel !== "auto" || teto === "auto";
}

export interface ReguaAutonomiaProps {
  linhas: LinhaAutonomia[];
  /** owner/admin editam; membro vê */
  podeEditar: boolean;
  onMudar?: (chave: string, nivel: NivelAutonomia) => void;
  className?: string;
}

export function ReguaAutonomia({ linhas, podeEditar, onMudar, className }: ReguaAutonomiaProps) {
  const livres = linhas.filter((l) => !l.travada);
  const travadas = linhas.filter((l) => l.travada);

  return (
    <section className={cn("rounded-[11px] border border-linha bg-branco", className)} aria-label="Autonomia do Jarvis por tipo de ação">
      <header className="flex items-center gap-2.5 border-b border-linha px-5 py-3.5">
        <MarcaJarvis tamanho={20} />
        <h2 className="text-[14px] font-[650] tracking-[-0.01em] text-navy">O que o Jarvis faz sozinho, o que ele propõe</h2>
        {!podeEditar && <span className="ml-auto text-[11.5px] text-suave">só leitura — quem publica é admin ou owner</span>}
      </header>

      <ul className="divide-y divide-linha">
        {livres.map((l) => (
          <Linha key={l.chave} linha={l} podeEditar={podeEditar} onMudar={onMudar} />
        ))}
      </ul>

      {travadas.length > 0 && (
        <>
          <div className="flex items-center gap-2 border-y border-linha bg-board px-5 py-2">
            <LockIcon className="size-3.5 text-suave" aria-hidden />
            <p className="text-[12px] text-suave">
              <span className="font-semibold text-tinta">Nunca é do Jarvis</span> — Constituição, Art. III.3. Não tem switch; muda por emenda, não por configuração.
            </p>
          </div>
          <ul className="divide-y divide-linha">
            {travadas.map((l) => (
              <Linha key={l.chave} linha={l} podeEditar={false} />
            ))}
          </ul>
        </>
      )}

      <footer className="border-t border-linha px-5 py-2.5 text-[11.5px] text-suave">
        Cada mudança fica registrada com quem mudou e quando, e vale na hora — nada aqui precisa de deploy.
      </footer>
    </section>
  );
}

function Linha({ linha: l, podeEditar, onMudar }: { linha: LinhaAutonomia; podeEditar: boolean; onMudar?: (chave: string, nivel: NivelAutonomia) => void }) {
  return (
    <li className={cn("flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4", l.travada && "opacity-80")}>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-tinta">{l.rotulo}</p>
        <p className="text-[12.5px] leading-normal text-suave">{l.descricao}</p>
        {l.alteradaPor && !l.travada && <p className="mt-0.5 text-[11px] text-mute">mudou por último: {l.alteradaPor}</p>}
      </div>

      <div
        role="radiogroup"
        aria-label={`Autonomia para ${l.rotulo}`}
        className={cn("inline-flex shrink-0 self-start rounded-md border p-0.5 text-[12px] sm:self-auto", l.travada ? "border-linha bg-board" : "border-linha-forte bg-branco")}
      >
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
                "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45",
                ativa && !l.travada && "bg-navy text-branco",
                ativa && l.travada && "bg-linha-forte text-tinta",
                !ativa && !bloqueada && "text-suave hover:bg-hover hover:text-tinta",
                !ativa && bloqueada && "cursor-not-allowed text-mute/70",
              )}
            >
              {!cabe && !l.travada && <LockIcon className="size-3" aria-hidden />}
              {l.travada && ativa && <LockIcon className="size-3" aria-hidden />}
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
