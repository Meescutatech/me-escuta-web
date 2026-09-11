"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hash, ListChecks, MessageSquare, Sparkle } from "lucide-react";
import { MapaNos, type LigacaoMapa, type NoMapa } from "@/components/ui/mapa-nos";
import { GlifoAgente } from "./glifos";
import type { MapaInteligencia } from "@/lib/ensaio/inteligencia";

/**
 * O MAPA DA INTELIGÊNCIA — a operação inteira em uma tela: de onde vem o que os agentes leem,
 * quem valida o que eles propõem e o que sai disso.
 *
 * A pergunta que o mapa responde não é "quais agentes existem" (a lista faz isso). É "o que
 * acontece quando entra uma mensagem". Por isso a leitura é da esquerda para a direita, em quatro
 * colunas, e passar o mouse em qualquer nó acende o CAMINHO inteiro que passa por ele.
 *
 * O detalhe que vale a tela: duas ligações atravessam a coluna do meio sem parar nela. São as
 * capacidades em `auto` — hoje, criar tarefa (Jarvis) e responder (Clara). É a Constituição
 * desenhada: tudo o mais para na coluna de quem valida.
 */

const ICONE_SAIDA: Record<string, React.ComponentType<{ className?: string }>> = {
  "saida:tarefa": ListChecks,
  "saida:mensagem": MessageSquare,
  "saida:proposta": Sparkle,
};

export function MapaInteligenciaTela({ mapa }: { mapa: MapaInteligencia }) {
  const router = useRouter();

  const nos: NoMapa[] = React.useMemo(
    () =>
      mapa.nos.map((n) => {
        const Saida = ICONE_SAIDA[n.id];
        const icone =
          n.grupo === "agente" && n.glifo ? (
            <GlifoAgente chave={n.glifo} tamanho={20} />
          ) : n.grupo === "numero" ? (
            <Hash className="size-4 text-muted-foreground" />
          ) : n.grupo === "validador" && n.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.foto} alt="" className="size-5 rounded-full object-cover" />
          ) : Saida ? (
            <Saida className="size-4 text-muted-foreground" />
          ) : undefined;
        return {
          id: n.id,
          x: n.x,
          y: n.y,
          titulo: n.titulo,
          subtitulo: n.subtitulo,
          rodape: n.rodape,
          estado: n.estado,
          icone,
          aoAbrir: n.agente ? () => router.push(`/configuracoes/agentes/${n.agente}`) : undefined,
          abrirRotulo: n.agente ? `Abrir ${n.titulo}` : undefined,
        };
      }),
    [mapa.nos, router],
  );

  const ligacoes: LigacaoMapa[] = mapa.ligacoes;
  const c = mapa.contagem;

  return (
    <div className="w-full px-6 py-7 2xl:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">Mapa da inteligência</h1>
          <p className="mt-1 max-w-[68ch] text-[13.5px] text-muted-foreground">
            O que entra pelos números, quem lê, quem valida e o que sai como evento. Arraste para
            reorganizar; passe o mouse em qualquer peça para acender o caminho dela.
          </p>
        </div>
        <Link
          href="/configuracoes/agentes"
          className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver os agentes
        </Link>
      </header>

      <MapaNos
        nos={nos}
        ligacoes={ligacoes}
        colunas={mapa.colunas}
        largura={mapa.largura}
        altura={mapa.altura}
        larguraNo={200}
        className="mx-auto"
        rodape={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {c.numeros} números · {c.agentes} agentes · {c.ligados} ligados · {c.conexoes} conexões
            </span>
            <span className="text-muted-foreground/70">arraste para reposicionar</span>
            <span className="ml-auto inline-flex items-center gap-2">
              <svg width="34" height="6" aria-hidden className="overflow-visible">
                <line x1="0" y1="3" x2="34" y2="3" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="2 5" />
              </svg>
              linha pontilhada = o agente faz sozinho, sem ninguém no caminho
            </span>
          </div>
        }
      />
    </div>
  );
}
