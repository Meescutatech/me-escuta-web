import type { ItemAcao } from "@/components/jarvis/lista-de-acoes";
import type { FerramentaUsada } from "./contrato";

/**
 * O FORMATO DA RESPOSTA DO JARVIS (W-JX, 11/09/2026) — extraído de `components/jarvis/resposta.tsx`
 * para que o motor (`usar-conversa.ts`) e a fixture não precisem importar componente.
 * `components/jarvis/resposta.tsx` reexporta tudo: quem já importava de lá não muda uma linha.
 *
 * Duas coisas novas sobre a v4 de ontem, as duas para o Jarvis MOSTRAR O TRABALHO:
 *   `passos` — o que ele fez, na ordem em que fez, aparecendo enquanto acontece e colapsando em
 *              "como cheguei aqui" depois de responder;
 *   `acoes`  — o que dá para fazer com a resposta sem sair da tela (criar tarefa, abrir a conversa,
 *              filtrar a tela em que a pessoa já está).
 */

export type BlocoResposta =
  | { tipo: "texto"; texto: string }
  | { tipo: "numeros"; itens: Array<{ rotulo: string; valor: string; href?: string | null; destino?: string | null }> }
  | { tipo: "linhas"; itens: Array<{ texto: string; href?: string | null; destino?: string | null }> }
  | { tipo: "acoes"; rotulo?: string | null; itens: ItemAcao[] };

/** Um passo do trabalho: "leu a conversa de Maria Aparecida · 31 mensagens". */
export interface PassoJarvis {
  id: string;
  texto: string;
  estado: "andamento" | "feito" | "falhou";
  /** o que ele achou ali — 11,5px muted, só quando o trace está aberto */
  detalhe?: string | null;
  /** duração medida (ensaio: simulada) */
  ms?: number | null;
}

/**
 * O que a resposta oferece FAZER. `filtrar` é o caso que justifica o overlay existir: aplica o
 * filtro na rota em que a pessoa já está e fecha — ninguém navega para lugar nenhum.
 */
export interface AcaoResposta {
  id: string;
  rotulo: string;
  tipo: "abrir" | "criar_tarefa" | "filtrar";
  /** `abrir`: para onde */
  href?: string | null;
  /** `filtrar`: a query a aplicar na rota atual, ex.: "filtro=sem_resposta" */
  filtro?: string | null;
  /** `criar_tarefa`: o que a tarefa diria (ainda sem backend — ver STATUS) */
  detalhe?: string | null;
}

export interface RespostaJarvis {
  frase: string | null;
  blocos: BlocoResposta[];
  consultas: FerramentaUsada[];
  passos?: PassoJarvis[];
  acoes?: AcaoResposta[];
  /** ISO */
  em: string;
  erro?: string | null;
}

export interface RegistroPergunta {
  id: string;
  pergunta: string;
  resposta: RespostaJarvis;
}
