"use client";

import { useMemo } from "react";
import { useJarvis, type ContextoJarvisTela } from "@/lib/jarvis/contexto";
import type { ContextoTela, PapelUsuario } from "@/lib/jarvis/contrato";
import { SuperficieJarvis } from "./superficie";

/**
 * `/jarvis` — A TELA CHEIA (W-JX, 11/09/2026).
 *
 * Depois desta rodada a página não tem desenho próprio: ela é a MESMA `SuperficieJarvis` do
 * overlay ⌘K e do painel lateral, na medida `pagina` — campo grande no topo, resposta em blocos na
 * largura de leitura à esquerda, perguntas prontas e histórico à direita. Uma linguagem só, e o
 * histórico é o mesmo (`jarvis:perguntas:<uid>`): o que você perguntou pelo ⌘K no funil está aqui.
 *
 * A assinatura segue a de ontem — quem já monta `PerguntaJarvis` não muda nada.
 */
export function PerguntaJarvis({
  usuarioId,
  papel,
  contexto,
  perguntaInicial = null,
  enviarAoAbrir = false,
  ensaio = false,
  sugestoes,
}: {
  usuarioId: string;
  papel: PapelUsuario;
  contexto: ContextoTela;
  perguntaInicial?: string | null;
  enviarAoAbrir?: boolean;
  /** ensaio: responde na hora pela fixture, sem rede */
  ensaio?: boolean;
  /** perguntas prontas; sem elas, as do contexto */
  sugestoes?: string[];
}) {
  const jarvis = useJarvis();

  // A página pode ser montada FORA do provedor (galeria, teste isolado). Sem ele, o contexto rico
  // é derivado do contrato que a página já recebe — nada quebra; só não há aviso nem item aberto.
  const contextoRico = useMemo<ContextoJarvisTela>(() => {
    if (jarvis.montado) return jarvis.contexto;
    return {
      rota: contexto.rota,
      busca: contexto.busca,
      titulo: null,
      item: contexto.conversa_id
        ? { tipo: "conversa", id: contexto.conversa_id }
        : contexto.lead_id
          ? { tipo: "lead", id: contexto.lead_id }
          : null,
      filtros: {},
      sugestoes: sugestoes ?? null,
      aviso: null,
    };
  }, [jarvis.montado, jarvis.contexto, contexto, sugestoes]);

  return (
    <SuperficieJarvis
      usuarioId={usuarioId}
      papel={papel}
      contexto={contextoRico}
      contratoTela={contexto}
      ensaio={ensaio}
      medida="pagina"
      sugestoes={sugestoes}
      perguntaInicial={perguntaInicial}
      enviarAoAbrir={enviarAoAbrir}
    />
  );
}
