"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Switch } from "@/components/ui/switch";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { cn } from "@/lib/utils";
import { CapaAgente } from "./glifos";
import { PontoEstado, TagAgente } from "./pecas";
import type { AgenteInteligencia } from "@/lib/ensaio/inteligencia";

/**
 * A GRADE DE AGENTES — quatro cards, e o estado se lê de longe.
 *
 * A ordem não é alfabética: quem está no ar vem primeiro. A capa carrega a assinatura do agente
 * em eco (ver `glifos.tsx`) e perde a cor quando ele está desligado, para que a fileira inteira
 * se leia sem ler uma palavra. O rodapé é a parte que ninguém desenha e que é a mais importante
 * aqui: QUEM VALIDA o que esse agente propõe — é o que separa este sistema de um robô solto.
 */

export function CartoesAgentes({
  agentes,
  gestao,
}: {
  agentes: AgenteInteligencia[];
  gestao: boolean;
}) {
  return (
    <div className="w-full px-6 py-7 2xl:px-8">
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">Agentes</h1>
        <p className="mt-1 max-w-[72ch] text-[13.5px] text-muted-foreground">
          Quatro agentes, cada um com as próprias ferramentas e o próprio limite. Nenhum decide
          crédito, conduta clínica ou preço — isso é Constituição, não configuração.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {agentes.map((a) => (
          <CartaoAgente key={a.chave} agente={a} gestao={gestao} />
        ))}
      </div>
    </div>
  );
}

function CartaoAgente({ agente: a, gestao }: { agente: AgenteInteligencia; gestao: boolean }) {
  const reduzido = useReducedMotion();
  const [ligado, setLigado] = React.useState(a.ativo);
  const impedido = a.pendencias.length > 0;

  const autoNaRegua = a.autonomia.some((l) => l.nivel === "auto");

  return (
    <motion.article
      whileHover={reduzido ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
    >
      <CapaAgente chave={a.glifo} tom={a.tom} ligado={ligado} />

      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <PontoEstado situacao={ligado ? "ligado" : a.situacao} />
          {a.ultima_acao && ligado && <span className="truncate">· {relativo(a.ultima_acao.em)}</span>}
        </div>

        <Link
          href={`/configuracoes/agentes/${a.chave}`}
          className="text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground underline-offset-4 hover:underline"
        >
          {a.nome}
        </Link>

        <p className="min-h-[38px] text-[13px] leading-snug text-muted-foreground">{a.frase}</p>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <TagAgente>{a.area}</TagAgente>
          <TagAgente>{autoNaRegua ? "faz sozinho e propõe" : "só propõe"}</TagAgente>
          <TagAgente>prompt v{a.versao_prompt}</TagAgente>
        </div>
      </div>

      <footer className="flex items-center gap-3 border-t border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex -space-x-1.5">
            {a.validadores.map((v) => (
              <HintTooltip key={v.id} title={v.nome} content={`Valida o que ${a.nome} propõe · ${v.papel}`}>
                {v.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.foto}
                    alt={v.nome}
                    className="size-6 rounded-full object-cover ring-2 ring-card"
                  />
                ) : (
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                    {iniciais(v.nome)}
                  </span>
                )}
              </HintTooltip>
            ))}
          </div>
          <span className="truncate text-[11.5px] text-muted-foreground">valida</span>
        </div>

        <Link
          href={`/configuracoes/agentes/${a.chave}`}
          className="shrink-0 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Abrir
        </Link>

        <HintTooltip
          title={impedido ? "Não dá para ligar ainda" : ligado ? "Desligar" : "Ligar"}
          content={impedido ? a.pendencias[0] : gestao ? "Vale na hora, e fica registrado." : "Só gestão liga e desliga agente."}
        >
          <span className="shrink-0">
            <Switch
              checked={ligado}
              onCheckedChange={(v) => setLigado(v)}
              disabled={!gestao || (impedido && !ligado)}
              aria-label={`${ligado ? "Desligar" : "Ligar"} ${a.nome}`}
            />
          </span>
        </HintTooltip>
      </footer>
    </motion.article>
  );
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function relativo(iso: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}
