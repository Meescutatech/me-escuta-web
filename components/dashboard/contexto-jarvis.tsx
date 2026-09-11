"use client";

import { useContextoJarvis } from "@/lib/jarvis/contexto";

/**
 * O que o dashboard conta ao Jarvis (W-JX, `useContextoJarvis`): em que tela ele está, o que mais
 * pesa agora e as perguntas que fazem sentido AQUI. É por isso que a pílula do canto diz
 * "no painel · 4 conversas sem resposta" em vez de ficar muda.
 *
 * Client component de uma linha porque o painel é servidor. Sem o provedor montado (galeria,
 * teste isolado) o hook é no-op — nada quebra.
 */
export function ContextoJarvisDashboard({
  aba,
  aviso,
  sugestoes,
}: {
  aba: string;
  /** o item mais grave da lista de atenção, já formatado */
  aviso: { texto: string; quantidade: number | null; previa: string | null; pergunta: string | null } | null;
  sugestoes: string[];
}) {
  useContextoJarvis({
    titulo: aba,
    sugestoes: sugestoes.slice(0, 4),
    aviso: aviso ? { onde: "no painel", quantidade: aviso.quantidade, texto: aviso.texto, previa: aviso.previa, pergunta: aviso.pergunta } : null,
  });
  return null;
}
