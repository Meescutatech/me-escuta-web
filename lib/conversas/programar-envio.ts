/**
 * PROGRAMAR ENVIO — pedido nº 1 da Sarah no workshop de 12/08:
 * "Sabe quando você programa pra agendar um e-mail? Ela precisa disso. Enviar agora ou programar.
 *  Só isso. Copia o que tem no Google."
 *
 * Então é cópia do Gmail, não invenção: o botão de enviar vira um botão DIVIDIDO (enviar | seta),
 * e a seta abre a mesma lista curta que o Gmail abre — dois atalhos de amanhã, um da próxima
 * segunda, e "escolher data e hora". Nada mais.
 *
 * Lógica PURA e client-safe (sem I/O), como `funil-filtros.ts` — o componente não é testável no
 * setup atual, o contrato mora aqui e a suíte (`tests/programar-envio.test.ts`) morde ele.
 *
 * FUSO: -03:00 fixo, o mesmo que o dashboard e o filtro de período do funil usam. A operação é
 * uma só e fica em São Paulo; derivar do relógio do navegador faria "amanhã de manhã" significar
 * coisas diferentes para pessoas diferentes.
 */

const MS_HORA = 3_600_000;
const OFFSET_SP_MS = -3 * MS_HORA;

/** Hora "de manhã" e "à tarde" do Gmail (8h e 13h), na hora civil da operação. */
export const HORA_MANHA = 8;
export const HORA_TARDE = 13;

/** Teto de quanto se pode empurrar um envio. Gmail vai a 49 anos; aqui 90 dias basta e é honesto. */
export const MAX_DIAS_PROGRAMACAO = 90;

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

interface Civil {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  min: number;
  diaSemana: number; // 0 = domingo
}

/** Partes civis (fuso da operação) de um instante epoch. */
export function civil(ms: number): Civil {
  const d = new Date(ms + OFFSET_SP_MS);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    min: d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
  };
}

/** Instante epoch de uma data civil da operação. */
export function instante(ano: number, mes: number, dia: number, hora: number, min = 0): number {
  return Date.UTC(ano, mes - 1, dia, hora, min) - OFFSET_SP_MS;
}

/** Mesmo dia civil, deslocado por N dias, na hora pedida. */
function noDia(base: Civil, maisDias: number, hora: number): number {
  return instante(base.ano, base.mes, base.dia + maisDias, hora);
}

export interface OpcaoProgramar {
  chave: "amanha_manha" | "amanha_tarde" | "segunda_manha";
  rotulo: string;
  /** "ter, 08:00" — a segunda linha da opção, como no Gmail */
  detalhe: string;
  /** epoch ms */
  quando: number;
  /**
   * E4 · a janela livre de 24h já terá fechado quando esta hora chegar?
   *
   * `null` = não sabemos (a conversa não trouxe `janela_livre_ate`), e aí a tela não diz nada —
   * afirmar "vai falhar" sem o dado é pior que calar.
   */
  foraDaJanela: boolean | null;
}

/**
 * E4 — a hora escolhida cai FORA da janela livre de 24h do WhatsApp?
 *
 * POR QUE ISTO EXISTE, medido contra produção em 10/09 (29 conversas com janela aberta):
 *
 *     amanhã 8h ................ funcionaria em 25
 *     amanhã 13h ............... funcionaria em 13   ← menos da metade
 *     segunda de manhã ......... ZERO
 *     escolher data (até 90d) .. ZERO
 *
 * "Segunda de manhã" é um dos três atalhos que a cópia do Gmail trouxe, e ele **não pode funcionar
 * para nenhuma conversa do sistema**: a janela do WhatsApp dura 24 horas e a próxima segunda nunca
 * está a menos de 24 horas. O worker recusa com `fora_da_janela_24h`, e a tela só explica DEPOIS —
 * horas depois, quando a mensagem já não saiu. Este predicado move a notícia para o momento da
 * escolha, que é o único em que ela ainda serve para alguma coisa.
 *
 * ⚠️ AVISA, NÃO BLOQUEIA — e a diferença não é timidez. A janela REABRE quando a pessoa escreve de
 * novo: programar para segunda é aposta legítima de quem espera resposta no fim de semana.
 * Bloquear mataria o caso certo junto com o duvidoso. A tela diz o que sabe agora, e quem está
 * conversando decide.
 */
export function foraDaJanela(
  quandoMs: number,
  janelaAteMs: number | null | undefined,
): boolean | null {
  if (janelaAteMs == null || !Number.isFinite(janelaAteMs)) return null;
  return quandoMs > janelaAteMs;
}

/**
 * Os atalhos do menu. O Gmail some com a opção que já passou (às 14h ele não oferece "hoje de
 * manhã"), e não repete o mesmo instante em duas linhas — quando amanhã JÁ É segunda, "segunda de
 * manhã" sairia idêntica a "amanhã de manhã". Aqui vale a mesma regra: opção que não muda nada
 * some, em vez de virar uma segunda linha que faz o mesmo.
 *
 * `janelaAteMs` é opcional: sem ele cada opção sai com `foraDaJanela: null` e a tela fica calada,
 * que é o comportamento de antes do E4 — nada quebra em quem chamar sem o segundo argumento.
 */
export function opcoesProgramar(agoraMs: number, janelaAteMs?: number | null): OpcaoProgramar[] {
  const c = civil(agoraMs);
  const amanhaManha = noDia(c, 1, HORA_MANHA);
  const amanhaTarde = noDia(c, 1, HORA_TARDE);
  // dias até a próxima segunda-feira: hoje domingo (0) → 1; hoje segunda (1) → 7.
  const ateSegunda = ((8 - c.diaSemana) % 7) || 7;
  const segundaManha = noDia(c, ateSegunda, HORA_MANHA);

  const brutas: OpcaoProgramar[] = [
    { chave: "amanha_manha", rotulo: "Amanhã de manhã", detalhe: detalhe(amanhaManha), quando: amanhaManha, foraDaJanela: foraDaJanela(amanhaManha, janelaAteMs) },
    { chave: "amanha_tarde", rotulo: "Amanhã à tarde", detalhe: detalhe(amanhaTarde), quando: amanhaTarde, foraDaJanela: foraDaJanela(amanhaTarde, janelaAteMs) },
    { chave: "segunda_manha", rotulo: "Segunda de manhã", detalhe: detalhe(segundaManha), quando: segundaManha, foraDaJanela: foraDaJanela(segundaManha, janelaAteMs) },
  ];

  const vistos = new Set<number>();
  return brutas.filter((o) => {
    if (o.quando <= agoraMs) return false;
    if (vistos.has(o.quando)) return false;
    vistos.add(o.quando);
    return true;
  });
}

/** "ter, 08:00" — dia curto + hora, o rodapé de cada opção do menu. */
export function detalhe(ms: number): string {
  const c = civil(ms);
  return `${DIAS_CURTOS[c.diaSemana]}, ${p2(c.hora)}:${p2(c.min)}`;
}

/**
 * Frase do estado programado: "amanhã às 08:00", "hoje às 15:30", "ter, 19/08 às 08:00".
 * Perto é relativo (é o que a pessoa acabou de escolher); longe recebe a data, porque a partir
 * de dois dias "quinta" sozinho já não diz QUAL quinta.
 */
export function frasePrograma(quandoMs: number, agoraMs: number): string {
  const a = civil(agoraMs);
  const q = civil(quandoMs);
  const hhmm = `${p2(q.hora)}:${p2(q.min)}`;
  const diasDeDiferenca = Math.round(
    (instante(q.ano, q.mes, q.dia, 12) - instante(a.ano, a.mes, a.dia, 12)) / 86_400_000,
  );
  if (diasDeDiferenca === 0) return `hoje às ${hhmm}`;
  if (diasDeDiferenca === 1) return `amanhã às ${hhmm}`;
  return `${DIAS_CURTOS[q.diaSemana]}, ${p2(q.dia)}/${p2(q.mes)} às ${hhmm}`;
}

export type Veredito = { ok: true; quando: number } | { ok: false; motivo: string };

/**
 * Valida o que veio do `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm", lido no fuso da
 * operação). Devolve MOTIVO em vez de só `false`: o menu precisa dizer por que o botão está
 * desligado, senão a Sarah fica clicando num botão morto sem saber o que fazer.
 */
export function validarEscolha(valorLocal: string, agoraMs: number): Veredito {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valorLocal.trim());
  if (!m) return { ok: false, motivo: "Escolha uma data e um horário." };
  const quando = instante(+m[1], +m[2], +m[3], +m[4], +m[5]);
  if (Number.isNaN(quando)) return { ok: false, motivo: "Data inválida." };
  if (quando <= agoraMs) return { ok: false, motivo: "Esse horário já passou." };
  if (quando - agoraMs > MAX_DIAS_PROGRAMACAO * 86_400_000)
    return { ok: false, motivo: `No máximo ${MAX_DIAS_PROGRAMACAO} dias à frente.` };
  return { ok: true, quando };
}

/** Instante → valor do `<input type="datetime-local">`, no fuso da operação. */
export function paraValorLocal(ms: number): string {
  const c = civil(ms);
  return `${c.ano}-${p2(c.mes)}-${p2(c.dia)}T${p2(c.hora)}:${p2(c.min)}`;
}

/** Sugestão inicial do seletor: a próxima hora cheia, nunca um horário que já passou. */
export function proximaHoraCheia(agoraMs: number): number {
  const c = civil(agoraMs);
  return instante(c.ano, c.mes, c.dia, c.hora + 1, 0);
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}
