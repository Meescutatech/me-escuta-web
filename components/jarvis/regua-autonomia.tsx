"use client";

import { LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { Switch } from "@/components/ui/switch";
import { MarcaJarvis } from "./marca";

/**
 * A RÉGUA DE AUTONOMIA por tipo de ação. Serve QUALQUER agente (`agente` no cabeçalho: Jarvis,
 * Clara, Levindo, Priscila); para o Jarvis o arco é a assinatura e o nome não se repete, para os
 * outros vai o nome em texto. Hairline `border/60`, sem fundo.
 *
 * ── 14/09/2026 · DE TRÊS POSIÇÕES PARA UM INTERRUPTOR, e o motivo não é estética ────────────
 *
 * Ela nasceu com três posições em texto (Faz sozinho · Propõe · Nunca), espelhando o vocabulário
 * do banco (`auto | propor | proibido`, 0165). O vocabulário continua com três — o que mudou é o
 * que a TELA pode prometer.
 *
 * O consumidor real é BINÁRIO. `lerGateJarvis` (runtime, `src/jarvis/tarefas/worker.ts:92`) exige
 * `criar_tarefa === 'auto'`; em qualquer outro nível o Jarvis **não propõe — ele cala**. Uma
 * posição "Propõe" clicável seria um botão que promete uma fila de sugestões e entrega silêncio,
 * que é a classe exata de mentira que esta tela vinha corrigindo. Decisão do Diogo em 14/09:
 * "corta essa feature por enquanto. Só liga ou desliga".
 *
 * Então: **Ligado = `auto`, Desligado = `proibido`**, e nada mais. `propor` continua EXIBÍVEL,
 * porque existe no banco (a Clara tem quatro capacidades assim hoje) — o que não existe é o
 * caminho da tela para chegar nele.
 *
 * O TETO (`flag.teto_autonomia` · `core.teto_capacidade`, fail-closed em `propor`) decide quem
 * tem interruptor: capacidade que não aceita `auto` não ganha controle nenhum, porque
 * `api.registrar_evento` recusaria — e a tela não oferece o que o banco recusa. As do Art. III.3
 * (preço, negociação, crédito, conduta clínica) caem aí por Constituição, não por configuração.
 *
 * Mudar uma posição vira `autonomia_alterada{agente_id, capacidade, nivel, motivo}`, com quem e
 * quando — nunca deploy.
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

/** O que cada nível quer dizer, em palavra de gente. `propor` só é LIDO, nunca oferecido. */
export const ROTULO_NIVEL: Record<NivelAutonomia, string> = {
  auto: "Faz sozinho",
  propor: "Propõe; alguém aprova",
  proibido: "Não faz",
};

/** true = tem interruptor. Teto abaixo de `auto` (ou linha travada) não tem. */
export function temInterruptor(l: LinhaAutonomia): boolean {
  return !l.travada && l.teto === "auto";
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
  /** chaves com gravação em voo — o interruptor delas fica inerte até o servidor responder */
  gravando?: ReadonlySet<string>;
  /** de quem é a régua — serve Clara, Levindo e Priscila também. Padrão: Jarvis. */
  agente?: AgenteDaRegua;
  className?: string;
  /** aceita e IGNORADA — a marca está travada no arco */
  marca?: string;
}

const JARVIS: AgenteDaRegua = { id: "jarvis", nome: "Jarvis" };

export function ReguaAutonomia({
  linhas,
  podeEditar,
  onMudar,
  gravando,
  agente = JARVIS,
  className,
}: ReguaAutonomiaProps) {
  const ehJarvis = agente.id === "jarvis";
  const livres = linhas.filter((l) => temInterruptor(l));
  const travadas = linhas.filter((l) => !temInterruptor(l));

  return (
    <section
      className={cn("rounded-md border border-border/60", className)}
      aria-label={`Autonomia de ${agente.nome} por tipo de ação`}
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">
        {ehJarvis ? (
          <MarcaJarvis tamanho={16} rotulo="Jarvis" className="text-foreground" />
        ) : (
          <span className="font-medium text-foreground">{agente.nome}</span>
        )}
        <h2 className="font-medium text-foreground">
          {ehJarvis ? "o que faz sozinho" : "— o que faz sozinho"}
        </h2>
        {!podeEditar && <span className="ml-auto">só leitura</span>}
      </header>

      {livres.length > 0 && (
        <ul className="divide-y divide-border/60">
          {livres.map((l) => (
            <Linha
              key={l.chave}
              linha={l}
              podeEditar={podeEditar}
              gravando={gravando?.has(l.chave) === true}
              agente={agente}
              onMudar={onMudar}
            />
          ))}
        </ul>
      )}

      {travadas.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 border-y border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden />
            Sem interruptor {ehJarvis ? "" : `para ${agente.nome} `}— o teto não deixa pôr em
            automático. Muda por emenda, não por configuração.
          </p>
          <ul className="divide-y divide-border/60">
            {travadas.map((l) => (
              <Linha key={l.chave} linha={l} podeEditar={false} gravando={false} agente={agente} />
            ))}
          </ul>
        </>
      )}

      <footer className="border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
        Cada mudança fica registrada com quem mudou e quando, e vale na próxima passada do agente.
      </footer>
    </section>
  );
}

function Linha({
  linha: l,
  podeEditar,
  gravando,
  agente,
  onMudar,
}: {
  linha: LinhaAutonomia;
  podeEditar: boolean;
  gravando: boolean;
  agente: AgenteDaRegua;
  onMudar?: (chave: string, nivel: NivelAutonomia) => void;
}) {
  const ligado = l.nivel === "auto";
  const comInterruptor = temInterruptor(l);

  return (
    <li className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium", comInterruptor ? "text-foreground" : "text-muted-foreground")}>
          {l.rotulo}
        </p>
        <p className="text-[12.5px] leading-normal text-muted-foreground">
          {l.descricao}
          {l.alteradaPor && comInterruptor && (
            <span className="ml-1.5 text-[11.5px]">· mudou por último: {l.alteradaPor}</span>
          )}
        </p>
      </div>

      {comInterruptor ? (
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          {/*
            `propor` não é oferecido, mas EXISTE no banco: dizer só "não faz" para uma capacidade
            que hoje propõe seria trocar uma mentira por outra. O interruptor fica desligado (não
            faz sozinho) e o estado real vai escrito ao lado.
          */}
          {l.nivel === "propor" && (
            <span className="text-[11.5px] text-muted-foreground">hoje: {ROTULO_NIVEL.propor}</span>
          )}
          <Switch
            checked={ligado}
            disabled={!podeEditar || gravando}
            onCheckedChange={(v) => onMudar?.(l.chave, v ? "auto" : "proibido")}
            aria-label={`${ligado ? "Desligar" : "Ligar"} "${l.rotulo}" de ${agente.nome}`}
          />
          <span className="w-[86px] text-[12px] text-muted-foreground">
            {ligado ? ROTULO_NIVEL.auto : ROTULO_NIVEL.proibido}
          </span>
        </div>
      ) : (
        <HintTooltip title={`Teto: ${l.teto === "auto" ? "Faz sozinho" : "Propõe"}`} content={l.fundamento} side="top">
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[5px] bg-muted px-2.5 py-1 text-[12px] text-muted-foreground sm:self-auto">
            <LockIcon className="size-3.5" aria-hidden />
            {ROTULO_NIVEL[l.nivel]}
          </span>
        </HintTooltip>
      )}
    </li>
  );
}
