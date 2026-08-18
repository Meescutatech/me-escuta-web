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
 *  1. AUDIOMETRIA em aberto — o exame foi assunto e ninguém voltou a ele. É o dia da operação.
 *  2. O CLIENTE falou por último e ninguém respondeu — a conversa está parada do nosso lado.
 *  3. NÓS prometemos voltar ("vou ver", "te confirmo") e não voltamos — a promessa venceu.
 *
 * O QUE MUDOU NA D10 (18/08): a regra não decide mais se aparece um cartão. Ela produz uma
 * PROPOSTA com um TIPO, e quem decide o que acontece com ela é `decidirAutonomia(tipo)`, lendo
 * a config. Tipo `auto` nasce tarefa criada, sem cartão; tipo `propor` vira cartão; tipo
 * `proibido` não é sequer produzido. A razão está na reação do Diogo ao cartão de "ninguém
 * respondeu há 28 dias": ali não existe julgamento a fazer, e pedir aprovação para algo sem
 * julgamento é gastar a atenção que o cartão importante vai precisar.
 *
 * Fora disso a resposta é `null`, e `null` é resposta legítima: agente que sugere alguma coisa em
 * toda conversa vira ruído, e ruído é como uma sugestão boa passa despercebida.
 */

// relativo + extensão: o alias `@/` não resolve sob `node --test`, e o contrato desta regra
// mora na suíte. Mesma convenção de `funil-ordenacao.ts` e de `composer.tsx`.
import { decidirAutonomia } from "../tarefas/autonomia.ts";
import type { PropostaTarefa } from "../tarefas/proposta.ts";

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
/** Audiometria virou assunto e a conversa esfriou por mais que isto → cobrar o exame. */
export const HORAS_AUDIOMETRIA_PARADA = 20;

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

/** O assunto que manda no dia: audiometria. Inclui como a operação e o paciente escrevem. */
const MARCAS_AUDIOMETRIA = ["audiometria", "audiometra", "exame de audi", "teste de audi"];

/** Sinais de que o exame JÁ aconteceu — o que desliga a cobrança. */
const MARCAS_EXAME_FEITO = ["já fiz", "ja fiz", "já fez", "ja fez", "fiz o exame", "fizemos o exame", "resultado do exame", "segue o exame", "laudo"];

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

function contem(corpo: string | null, marcas: string[]): boolean {
  if (!corpo) return false;
  const t = corpo.toLowerCase();
  return marcas.some((m) => t.includes(m));
}

/** Contém marca de promessa? Comparação em minúsculas, sem acento-normalização (as marcas não têm). */
export function ehPromessa(corpo: string | null): boolean {
  return contem(corpo, PROMESSAS);
}

/** A conversa tratou de audiometria em algum momento? */
export function falouDeAudiometria(falas: Pick<FalaLida, "corpo">[]): boolean {
  return falas.some((f) => contem(f.corpo, MARCAS_AUDIOMETRIA));
}

/** Alguém já disse que o exame aconteceu? Se sim, cobrar seria a UI não ter lido a conversa. */
export function exameJaFeito(falas: Pick<FalaLida, "corpo">[]): boolean {
  return falas.some((f) => contem(f.corpo, MARCAS_EXAME_FEITO));
}

function corta(texto: string, max = 180): string {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

/** Prazo proposto, em texto: hoje se ainda dá, senão amanhã de manhã. */
function prazoSugerido(agora: number): string {
  const h = new Date(agora - 3 * HORA).getUTCHours();
  return h < 17 ? "hoje, 17:00" : "amanhã, 09:00";
}

export interface ContextoSugestao {
  nomeLead: string;
  /** quem a proposta indica como responsável — o dono da conversa, não "alguém" */
  responsavel: string;
}

/**
 * A regra. Devolve a PROPOSTA (com tipo) ou `null`. Ignora mensagens sem corpo (áudio/imagem sem
 * legenda): sem texto não há o que citar, e proposta sem citação está proibida pelo contrato.
 *
 * A ordem das regras é a prioridade da operação: audiometria primeiro, porque é o gate que
 * destrava todo o resto e é o que a operação persegue o dia inteiro.
 */
export function proporTarefa(
  falas: FalaLida[],
  agora: number,
  ctx: ContextoSugestao,
): PropostaTarefa | null {
  const comTexto = falas.filter((f) => (f.corpo ?? "").trim() !== "" && ms(f.criado_em) != null);
  if (comTexto.length === 0) return null;

  const ultima = comTexto[comTexto.length - 1];
  const tUltima = ms(ultima.criado_em)!;
  if (tUltima > agora) return null; // relógio torto: não inventa urgência a partir do futuro
  const paradaHa = (agora - tUltima) / HORA;

  const ultimaDoCliente = [...comTexto].reverse().find((f) => f.direcao === "entrada");

  // ── 1 · audiometria em aberto — o gate do dia ──
  if (
    falouDeAudiometria(comTexto) &&
    !exameJaFeito(comTexto) &&
    paradaHa >= HORAS_AUDIOMETRIA_PARADA
  ) {
    const evid = [...comTexto].reverse().find((f) => contem(f.corpo, MARCAS_AUDIOMETRIA)) ?? ultima;
    const tEvid = ms(evid.criado_em)!;
    return {
      id: `jarvis:${ultima.id}:audiometria`,
      tipoChave: "confirmar_exame",
      fazer: `Cobrar a audiometria de ${ctx.nomeLead}`,
      porqueAgora:
        `A audiometria entrou na conversa ${haQuantoTempo(tEvid, agora)} e ninguém voltou a ela — ` +
        `não há confirmação de agendamento nem de exame feito, e a conversa está parada ` +
        `${haQuantoTempo(tUltima, agora)}. Sem audiometria não existe decisão de venda: ` +
        `enquanto ela não sai, nada mais neste lead anda.`,
      trecho: {
        texto: corta(evid.corpo!),
        quando: carimbo(tEvid, agora),
        autor: evid.direcao === "entrada" ? ctx.nomeLead : "Você",
      },
      prazoSugerido: prazoSugerido(agora),
      responsavelSugerido: ctx.responsavel,
    };
  }

  // ── 2 · o cliente falou por último e ninguém respondeu ──
  if (ultima.direcao === "entrada") {
    if (paradaHa < HORAS_SEM_RESPOSTA) return null;
    return {
      id: `jarvis:${ultima.id}:sem-resposta`,
      tipoChave: "acompanhar_follow_up",
      fazer: `Responder ${ctx.nomeLead}`,
      porqueAgora:
        `${ctx.nomeLead} falou por último ${haQuantoTempo(tUltima, agora)} e ninguém respondeu. ` +
        `Enquanto a conversa está parada do nosso lado, ela não anda para nenhum lado — e é assim ` +
        `que um lead que já demonstrou interesse volta para o fim da fila.`,
      trecho: { texto: corta(ultima.corpo!), quando: carimbo(tUltima, agora), autor: ctx.nomeLead },
      prazoSugerido: prazoSugerido(agora),
      responsavelSugerido: ctx.responsavel,
    };
  }

  // ── 3 · nós prometemos voltar e não voltamos ──
  if (!ehPromessa(ultima.corpo)) return null;
  if (paradaHa < HORAS_PROMESSA_VENCIDA) return null;

  // a última fala do cliente é a evidência mais útil aqui: é o que ela vai precisar reler
  const evidencia = ultimaDoCliente ?? ultima;
  const tEvidencia = ms(evidencia.criado_em)!;

  return {
    id: `jarvis:${ultima.id}:promessa`,
    tipoChave: "ligar_lead",
    fazer: `Ligar para ${ctx.nomeLead} e fechar o que foi prometido`,
    porqueAgora:
      `Você disse que voltaria — “${corta(ultima.corpo!, 70)}” — e já se passaram ` +
      `${haQuantoTempo(tUltima, agora).replace(/^há /, "")}. Promessa que vence sem retorno é o ` +
      `que faz o cliente parar de responder, e o telefone resolve mais rápido que a mensagem.`,
    trecho: {
      texto: corta(evidencia.corpo!),
      quando: carimbo(tEvidencia, agora),
      autor: evidencia.direcao === "entrada" ? ctx.nomeLead : "Você",
    },
    prazoSugerido: prazoSugerido(agora),
    responsavelSugerido: ctx.responsavel,
  };
}

/**
 * O DESPACHO — o que a tela deve fazer com a proposta, segundo a config de autonomia (D10).
 *
 * Três saídas e nada mais:
 *   `criada`  → a tarefa nasce criada e vai direto para a fila. Nenhum cartão. O motivo continua
 *               visível NA FILA, com desfazer — o que a autonomia muda é quem aprova, não a
 *               transparência.
 *   `propor`  → cartão de aprovar/recusar, porque existe decisão real a tomar.
 *   `null`    → não há nada a dizer, ou o tipo é `proibido` (Art. III.3) e nem proposta nasce.
 */
export type Despacho =
  | { modo: "criada"; proposta: PropostaTarefa; fundamento: string }
  | { modo: "propor"; proposta: PropostaTarefa; fundamento: string; rebaixadoPeloTeto: boolean }
  | null;

export function avaliarConversa(
  falas: FalaLida[],
  agora: number,
  ctx: ContextoSugestao,
): Despacho {
  const proposta = proporTarefa(falas, agora, ctx);
  if (!proposta) return null;

  const d = decidirAutonomia(proposta.tipoChave);
  // `proibido` não vira nem cartão: propor um ato que o Art. III.3 veda é oferecer à Sarah uma
  // aprovação que ela não tem poder de dar. Melhor não existir.
  if (d.nivel === "proibido") return null;
  if (d.nivel === "auto") return { modo: "criada", proposta, fundamento: d.fundamento };
  return {
    modo: "propor",
    proposta,
    fundamento: d.fundamento,
    rebaixadoPeloTeto: d.rebaixadoPeloTeto,
  };
}
