import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HORA_MANHA,
  HORA_TARDE,
  MAX_DIAS_PROGRAMACAO,
  civil,
  foraDaJanela,
  frasePrograma,
  instante,
  opcoesProgramar,
  paraValorLocal,
  proximaHoraCheia,
  validarEscolha,
} from "../lib/conversas/programar-envio.ts";

/*
 * Contrato do "enviar agora ou programar" (workshop 12/08, pedido nº 1): cópia do Gmail, no fuso
 * fixo da operação (-03:00). O que estes testes travam é justamente o que um relógio de navegador
 * quebraria em silêncio — "amanhã de manhã" tem de ser 8h em São Paulo para todo mundo.
 */

/** quarta-feira, 13/08/2025, 14:30 em São Paulo */
const QUA_1430 = instante(2025, 8, 13, 14, 30);

test("civil e instante são inversos no fuso da operação", () => {
  const c = civil(QUA_1430);
  assert.deepEqual(
    { ano: c.ano, mes: c.mes, dia: c.dia, hora: c.hora, min: c.min },
    { ano: 2025, mes: 8, dia: 13, hora: 14, min: 30 },
  );
  assert.equal(c.diaSemana, 3); // quarta
});

test("instante trata a hora como -03:00, não como UTC", () => {
  // 13/08/2025 14:30 em SP = 17:30 UTC
  assert.equal(new Date(QUA_1430).toISOString(), "2025-08-13T17:30:00.000Z");
});

test("atalhos: amanhã de manhã às 8h e amanhã à tarde às 13h", () => {
  const o = opcoesProgramar(QUA_1430);
  const manha = o.find((x) => x.chave === "amanha_manha")!;
  const tarde = o.find((x) => x.chave === "amanha_tarde")!;
  assert.equal(civil(manha.quando).hora, HORA_MANHA);
  assert.equal(civil(tarde.quando).hora, HORA_TARDE);
  assert.equal(civil(manha.quando).dia, 14);
  assert.equal(manha.detalhe, "qui, 08:00");
});

test("segunda de manhã é a PRÓXIMA segunda — na segunda, some para daqui a 7 dias", () => {
  const seg = instante(2025, 8, 11, 10, 0); // segunda
  const alvo = opcoesProgramar(seg).find((x) => x.chave === "segunda_manha")!;
  const c = civil(alvo.quando);
  assert.equal(c.diaSemana, 1);
  assert.equal(c.dia, 18); // a seguinte, não hoje
});

test("no domingo, 'segunda de manhã' colide com 'amanhã de manhã' e a repetida some", () => {
  const dom = instante(2025, 8, 17, 10, 0); // domingo
  const o = opcoesProgramar(dom);
  assert.equal(o.filter((x) => x.chave === "segunda_manha").length, 0);
  assert.ok(o.some((x) => x.chave === "amanha_manha"));
  // e nenhum instante aparece duas vezes
  assert.equal(new Set(o.map((x) => x.quando)).size, o.length);
});

test("nenhum atalho oferecido está no passado", () => {
  for (const base of [instante(2025, 8, 13, 23, 59), instante(2025, 8, 14, 7, 59), QUA_1430]) {
    for (const o of opcoesProgramar(base)) assert.ok(o.quando > base, `${o.chave} no passado`);
  }
});

test("validarEscolha recusa horário passado com motivo", () => {
  const r = validarEscolha("2025-08-13T14:00", QUA_1430);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /já passou/);
});

test("validarEscolha recusa formato inválido e além do teto", () => {
  assert.equal(validarEscolha("", QUA_1430).ok, false);
  assert.equal(validarEscolha("13/08/2025 15:00", QUA_1430).ok, false);
  const longe = paraValorLocal(QUA_1430 + (MAX_DIAS_PROGRAMACAO + 1) * 86_400_000);
  assert.equal(validarEscolha(longe, QUA_1430).ok, false);
});

test("validarEscolha aceita futuro e devolve o instante no fuso da operação", () => {
  const r = validarEscolha("2025-08-14T09:15", QUA_1430);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quando, instante(2025, 8, 14, 9, 15));
});

test("frasePrograma: hoje e amanhã são relativos; de dois dias em diante leva a data", () => {
  assert.equal(frasePrograma(instante(2025, 8, 13, 18, 0), QUA_1430), "hoje às 18:00");
  assert.equal(frasePrograma(instante(2025, 8, 14, 8, 0), QUA_1430), "amanhã às 08:00");
  assert.equal(frasePrograma(instante(2025, 8, 19, 8, 0), QUA_1430), "ter, 19/08 às 08:00");
});

test("proximaHoraCheia nunca devolve um horário já passado", () => {
  for (const base of [QUA_1430, instante(2025, 8, 13, 23, 40), instante(2025, 8, 13, 0, 1)]) {
    const p = proximaHoraCheia(base);
    assert.ok(p > base);
    assert.equal(civil(p).min, 0);
  }
});

test("paraValorLocal produz exatamente o formato do input datetime-local", () => {
  assert.equal(paraValorLocal(instante(2025, 8, 4, 9, 5)), "2025-08-04T09:05");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// E4 · A JANELA DE 24h NA HORA DE ESCOLHER
//
// O menu é cópia do Gmail, e o Gmail não tem janela de 24h. Medido contra produção em 10/09,
// sobre as 29 conversas com janela aberta:
//     amanhã 8h .......... funcionaria em 25
//     amanhã 13h ......... funcionaria em 13
//     segunda de manhã ... ZERO
//     escolher data ...... ZERO (o teto é 90 DIAS; a janela é 24 HORAS)
// Antes disto a tela aceitava calada e só explicava horas depois, pelo banner de falha.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("segunda de manhã cai SEMPRE fora de uma janela de 24h — em qualquer dia da semana", () => {
  // é a asserção central do E4: não existe dia em que este atalho caiba na janela.
  for (let dia = 1; dia <= 28; dia++) {
    const agora = instante(2026, 9, dia, 10, 0);
    const janelaAte = agora + 24 * 3_600_000; // o máximo que a janela pode valer
    const segunda = opcoesProgramar(agora, janelaAte).find((o) => o.chave === "segunda_manha");
    if (!segunda) continue; // o menu esconde a opção quando ela coincide com "amanhã"
    assert.equal(segunda.foraDaJanela, true, `dia ${dia}`);
  }
});

test("amanhã de manhã cabe quando a janela alcança, e não cabe quando não alcança", () => {
  const agora = instante(2026, 9, 10, 18, 0); // quinta, 18h
  const amanha8 = instante(2026, 9, 11, 8, 0);

  const alcanca = opcoesProgramar(agora, amanha8 + 3_600_000).find((o) => o.chave === "amanha_manha");
  assert.equal(alcanca?.foraDaJanela, false);

  const naoAlcanca = opcoesProgramar(agora, amanha8 - 3_600_000).find((o) => o.chave === "amanha_manha");
  assert.equal(naoAlcanca?.foraDaJanela, true);
});

test("sem o dado da janela a tela NÃO afirma nada — null, nunca false", () => {
  // `false` diria "cabe na janela", que é uma afirmação. Sem o dado não há afirmação a fazer:
  // é o mesmo degrade honesto do resto da casa (a view do ambiente pode não trazer a coluna).
  const agora = instante(2026, 9, 10, 10, 0);
  for (const janela of [undefined, null, NaN]) {
    for (const o of opcoesProgramar(agora, janela as number | null)) {
      assert.equal(o.foraDaJanela, null, `${String(janela)} / ${o.chave}`);
    }
  }
});

test("foraDaJanela: a fronteira é o instante exato — igual ainda cabe, 1ms depois não", () => {
  const t = instante(2026, 9, 11, 8, 0);
  assert.equal(foraDaJanela(t, t), false, "exatamente no limite ainda sai");
  assert.equal(foraDaJanela(t + 1, t), true, "1ms depois, não");
  assert.equal(foraDaJanela(t - 1, t), false);
});

test("a opção fora da janela continua ESCOLHÍVEL — avisa, não bloqueia", () => {
  // A janela reabre quando a pessoa escreve. Programar para segunda é aposta legítima de quem
  // espera resposta no fim de semana; bloquear mataria o caso certo junto com o duvidoso.
  const agora = instante(2026, 9, 10, 10, 0);
  const opcoes = opcoesProgramar(agora, agora + 3_600_000);
  assert.ok(opcoes.length > 0, "o menu não some");
  assert.ok(
    opcoes.some((o) => o.foraDaJanela === true),
    "há opção marcada como fora da janela — e ela continua na lista, com seu `quando` válido",
  );
  for (const o of opcoes) assert.equal(typeof o.quando, "number");
});
