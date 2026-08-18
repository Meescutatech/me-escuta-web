/**
 * O JARVIS OLHANDO A CONVERSA — workshop 12/08:
 * "o Jarvis podia ficar monitorando a conversa e sugerir uma tarefa. Ele faz a sugestão e ela só
 *  clica pra aprovar ou não."
 *
 * Isto é a REGRA que decide se há sugestão, e ela é pura: entra o fio da conversa e o relógio,
 * sai uma proposta ou `null`. Nada de I/O, nada de modelo — no sistema real quem escreve o texto
 * é o agente; o que este módulo trava é o CONTRATO da proposta, que é a parte que não pode mudar:
 *
 *   toda sugestão carrega MOTIVO e EVIDÊNCIA, ou não existe.
 *
 * O motivo não é enfeite. "Criar tarefa: ligar amanhã" sem dizer de onde saiu é uma ordem, e a
 * Sarah não obedece ordem de robô — nem deveria. Por isso as duas regras abaixo só disparam
 * quando existe uma mensagem concreta para citar, e o texto do motivo é derivado dela e do
 * tempo medido, nunca genérico.
 *
 * As duas situações que valem hoje, e são as duas que sangram no Kommo:
 *  1. O CLIENTE falou por último e ninguém respondeu — a conversa está parada do nosso lado.
 *  2. NÓS prometemos voltar ("vou ver", "te confirmo") e não voltamos — a promessa venceu.
 *
 * Fora disso a resposta é `null`, e `null` é resposta legítima: agente que sugere alguma coisa em
 * toda conversa vira ruído, e ruído é como uma sugestão boa passa despercebida.
 */

import type { SugestaoTarefa } from "@/components/conversas/sugestao-tarefa";

/** Só o que a regra lê de uma mensagem — assinatura mínima, para o teste não montar a `Mensagem` inteira. */
export interface FalaLida {
  id: string;
  direcao: "entrada" | "saida";
  corpo: string | null;
  criado_em: string;
}

/** Cliente falou e ninguém respondeu por mais que isto → vale uma tarefa. */
export const HORAS_SEM_RESPOSTA = 2;
/** Prometemos voltar e não voltamos por mais que isto → a promessa venceu. */
export const HORAS_PROMESSA_VENCIDA = 20;

/**
 * Marcas de promessa em PT-BR falado de atendimento. Lista curta e literal de propósito: é melhor
 * deixar passar uma promessa escrita de um jeito que não previmos do que acusar promessa onde não
 * houve — sugestão errada gasta o crédito que a sugestão certa vai precisar.
 */
const PROMESSAS = [
  "vou ver",
  "vou verificar",
  "vou confirmar",
  "vou checar",
  "te confirmo",
  "te retorno",
  "te aviso",
  "te falo",
  "te mando",
  "te envio",
  "já te",
  "assim que",
  "fico de",
  "deixa eu ver",
  "vou olhar",
];

const HORA = 3_600_000;

function ms(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "há 3 horas" / "há 2 dias" — a medida que entra no motivo. Nunca arredonda para cima. */
export function haQuantoTempo(desdeMs: number, agora: number): string {
  const h = Math.floor((agora - desdeMs) / HORA);
  if (h < 1) return "há menos de uma hora";
  if (h === 1) return "há 1 hora";
  if (h < 48) return `há ${h} horas`;
  return `há ${Math.floor(h / 24)} dias`;
}

/** "ontem, 15:34" / "hoje, 09:12" / "12/08, 15:34" — o carimbo da citação, no fuso da operação. */
export function carimbo(quandoMs: number, agora: number): string {
  const sp = (x: number) => new Date(x - 3 * HORA);
  const dia = (x: number) => Math.floor((x - 3 * HORA) / 86_400_000);
  const d = sp(quandoMs);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const delta = dia(agora) - dia(quandoMs);
  if (delta === 0) return `hoje, ${hhmm}`;
  if (delta === 1) return `ontem, ${hhmm}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}, ${hhmm}`;
}

/** Contém marca de promessa? Comparação em minúsculas, sem acento-normalização (as marcas não têm). */
export function ehPromessa(corpo: string | null): boolean {
  if (!corpo) return false;
  const t = corpo.toLowerCase();
  return PROMESSAS.some((p) => t.includes(p));
}

function corta(texto: string, max = 180): string {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

/** Prazo proposto, em texto: hoje se ainda dá, senão amanhã de manhã. */
function prazoSugerido(agora: number): string {
  const h = new Date(agora - 3 * HORA).getUTCHours();
  if (h < 17) return "hoje, 17:00";
  return "amanhã, 09:00";
}

export interface ContextoSugestao {
  nomeLead: string;
  /** quem a proposta indica como responsável — o dono da conversa, não "alguém" */
  responsavel: string;
}

/**
 * A regra. Devolve a proposta ou `null`. Ignora mensagens sem corpo (áudio/imagem sem legenda):
 * sem texto não há o que citar, e sugestão sem citação está proibida pelo contrato deste módulo.
 */
export function sugerirTarefa(
  falas: FalaLida[],
  agora: number,
  ctx: ContextoSugestao,
): SugestaoTarefa | null {
  const comTexto = falas.filter((f) => (f.corpo ?? "").trim() !== "" && ms(f.criado_em) != null);
  if (comTexto.length === 0) return null;

  const ultima = comTexto[comTexto.length - 1];
  const tUltima = ms(ultima.criado_em)!;
  if (tUltima > agora) return null; // relógio torto: não inventa urgência a partir do futuro

  // ── 1 · o cliente falou por último e ninguém respondeu ──
  if (ultima.direcao === "entrada") {
    const horas = (agora - tUltima) / HORA;
    if (horas < HORAS_SEM_RESPOSTA) return null;
    return {
      id: `jarvis:${ultima.id}:sem-resposta`,
      titulo: `Responder ${ctx.nomeLead}`,
      motivo:
        `${ctx.nomeLead} falou por último ${haQuantoTempo(tUltima, agora)} e ninguém respondeu. ` +
        `Enquanto a conversa está parada do nosso lado, ela não anda para nenhum lugar — e é assim ` +
        `que um lead que já demonstrou interesse volta para o fim da fila.`,
      trecho: { texto: corta(ultima.corpo!), quando: carimbo(tUltima, agora), autor: ctx.nomeLead },
      tipo: "Enviar mensagem",
      prazoSugerido: prazoSugerido(agora),
      responsavelSugerido: ctx.responsavel,
    };
  }

  // ── 2 · nós prometemos voltar e não voltamos ──
  if (!ehPromessa(ultima.corpo)) return null;
  const horas = (agora - tUltima) / HORA;
  if (horas < HORAS_PROMESSA_VENCIDA) return null;

  // a última fala do cliente é a evidência mais útil aqui: é o que ela vai precisar reler
  const ultimaDoCliente = [...comTexto].reverse().find((f) => f.direcao === "entrada");
  const evidencia = ultimaDoCliente ?? ultima;
  const tEvidencia = ms(evidencia.criado_em)!;

  return {
    id: `jarvis:${ultima.id}:promessa`,
    titulo: `Ligar para ${ctx.nomeLead} e fechar o que foi prometido`,
    motivo:
      `Você disse que voltaria — “${corta(ultima.corpo!, 70)}” — e já se passaram ` +
      `${haQuantoTempo(tUltima, agora).replace(/^há /, "")}. Promessa que vence sem retorno é o ` +
      `que faz o cliente parar de responder, e o telefone resolve mais rápido que a mensagem.`,
    trecho: {
      texto: corta(evidencia.corpo!),
      quando: carimbo(tEvidencia, agora),
      autor: evidencia.direcao === "entrada" ? ctx.nomeLead : "Você",
    },
    tipo: "Ligar",
    prazoSugerido: prazoSugerido(agora),
    responsavelSugerido: ctx.responsavel,
  };
}
