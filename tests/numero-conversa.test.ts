import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROTULO_NAO_CADASTRADO,
  ROTULO_SEM_NUMERO,
  chipDoNumero,
  rotuloSelo,
  vereditoEnvio,
  type ContextoEnvio,
  type OrigemConversa,
} from "../components/conversas/regras/numero.ts";

/*
 * M7 · o chip de número na conversa. O que estes testes protegem, em ordem de dano:
 *  1. o `phone_number_id` vazar como rótulo — em canal não oficial ele é `lite:<nome-da-fono>`,
 *     e `core.conversa` é legível por TODO `authenticated` (CA-9);
 *  2. o selo TESTE sumir justamente quando 100% das conversas são de teste (CA-12);
 *  3. o composer BLOQUEAR envio por número de teste — ensaio legítimo quebra (CA-13, sentido b);
 *  4. o composer NÃO avisar — a pessoa descobre depois, que é o estado de hoje (CA-13, sentido a);
 *  5. o chip ficar em branco: ausência de rótulo é indistinguível de bug de renderização.
 */

function origem(p: Partial<OrigemConversa> = {}): OrigemConversa {
  return {
    phone_number_id: "627327023793464",
    numero_apelido: "producao",
    numero_e164: "+15557252751",
    finalidade: "teste",
    ...p,
  };
}

function ctx(p: Partial<ContextoEnvio> = {}): ContextoEnvio {
  return { ...origem(), canal_ativo: true, ...p };
}

// ══════════════════════════ os cinco casos, e os cinco existem hoje ══════════════════════════

test("cadastrado e legível mostra o APELIDO — nunca o phone_number_id", () => {
  const c = chipDoNumero(origem({ numero_apelido: "producao" }));
  assert.equal(c.rotulo, "producao");
  assert.equal(c.caso, "cadastrado");
});

test("CA-9 · o rótulo NUNCA contém `lite:` — é o nome da fono e a RLS existe para escondê-lo", () => {
  // Conversa de canal não oficial que o papel `membro` não consegue ler: apelido vem nulo.
  // Se alguém "melhorar" o degrade caindo para o phone_number_id, este teste fica vermelho.
  const c = chipDoNumero(origem({ phone_number_id: "lite:sarah-muller", numero_apelido: null, numero_e164: null }));
  assert.equal(c.rotulo, ROTULO_NAO_CADASTRADO);
  assert.ok(!c.rotulo.includes("lite:"));
  assert.ok(!c.titulo.includes("lite:"));
  assert.ok(!c.titulo.includes("sarah"));
});

test("conversa SEM contraparte diz isso — são 13 linhas medidas em produção", () => {
  const c = chipDoNumero(origem({ phone_number_id: null, numero_apelido: null, numero_e164: null }));
  assert.equal(c.rotulo, ROTULO_SEM_NUMERO);
  assert.equal(c.caso, "sem_numero");
  assert.equal(c.atencao, false); // não é problema, é a natureza da linha
});

test("a ordem dos casos importa: sem número vem ANTES de não cadastrado", () => {
  // Invertido, uma conversa sem contraparte acusaria um cadastro que falta e não existe.
  assert.equal(chipDoNumero(origem({ phone_number_id: null, numero_apelido: null })).caso, "sem_numero");
});

test("número não cadastrado (os `pnid_*`) tem rótulo próprio e marca atenção", () => {
  const c = chipDoNumero(origem({ phone_number_id: "pnid_e2e", numero_apelido: null, numero_e164: null }));
  assert.equal(c.caso, "nao_cadastrado");
  assert.equal(c.atencao, true);
});

test("cadastrado SEM identidade — o estado real do 627327023793464 — marca o selo e a atenção", () => {
  const c = chipDoNumero(origem({ numero_apelido: "producao", numero_e164: null }));
  assert.equal(c.caso, "cadastrado_sem_identidade");
  assert.equal(c.rotulo, "producao"); // o apelido continua aparecendo
  assert.ok(c.selos.includes("sem_identidade"));
  assert.equal(c.atencao, true);
});

test("NENHUM caso devolve rótulo vazio — branco é indistinguível de bug de renderização", () => {
  const casos: OrigemConversa[] = [
    origem(),
    origem({ numero_e164: null }),
    origem({ numero_apelido: null, numero_e164: null }),
    origem({ phone_number_id: null, numero_apelido: null, numero_e164: null }),
    origem({ numero_apelido: "   " }),
    origem({ finalidade: null }),
  ];
  for (const o of casos) {
    const c = chipDoNumero(o);
    assert.ok(c.rotulo.trim().length > 0, `rótulo vazio em ${JSON.stringify(o)}`);
    assert.ok(c.titulo.trim().length > 0, `título vazio em ${JSON.stringify(o)}`);
  }
});

// ══════════════════════════ CA-12 · o selo TESTE não se esconde ══════════════════════════

test("CA-12 · com TODAS as conversas em número de teste, TODAS levam o selo", () => {
  // O estado de hoje: 69 conversas de número cadastrado, os dois canais `teste`. A regra genérica
  // da casa (coluna de valor único some) apagaria exatamente o alarme. O chip é por LINHA e não
  // tem como consultar as outras — e é essa forma que torna o selo impossível de esconder.
  const lista = Array.from({ length: 69 }, () => chipDoNumero(origem({ finalidade: "teste" })));
  assert.equal(lista.filter((c) => c.selos.includes("teste")).length, 69);
});

test("o selo some SOZINHO quando a finalidade vira produção — sem ninguém mexer em nada", () => {
  const c = chipDoNumero(origem({ finalidade: "producao", numero_e164: "+5531998626387" }));
  assert.deepEqual(c.selos, []);
  assert.equal(c.atencao, false);
});

test("finalidade NULA não vira 'produção' — vira selo próprio de ausência", () => {
  // Antes da migration a coluna não existe. Tratar nulo como produção reproduziria na tela o
  // engano exato que o M7 existe para desfazer.
  const c = chipDoNumero(origem({ finalidade: null }));
  assert.ok(c.selos.includes("finalidade_ausente"));
  assert.ok(!c.selos.includes("teste"));
});

test("selo sem identidade e selo de teste se ACUMULAM — o 627327023793464 tem os dois", () => {
  const c = chipDoNumero(origem({ numero_apelido: "producao", numero_e164: null, finalidade: "teste" }));
  assert.deepEqual(c.selos, ["teste", "sem_identidade"]);
  assert.equal(rotuloSelo("teste"), "TESTE");
  assert.equal(rotuloSelo("sem_identidade"), "SEM IDENTIDADE");
});

// ══════════════════════════ CA-13 · o composer, nos DOIS sentidos ══════════════════════════

test("CA-13a · número de teste AVISA antes do clique — e NÃO bloqueia", () => {
  const v = vereditoEnvio(ctx({ finalidade: "teste" }));
  assert.equal(v.pode, true, "bloquear quebraria o ensaio legítimo — foi assim que as 12 de 27/07 chegaram");
  assert.ok(v.aviso);
  assert.match(v.aviso!, /lista de permiss/i);
  assert.equal(v.motivo, null);
});

test("CA-13b · número de produção não avisa nada — aviso constante vira ruído ignorado", () => {
  const v = vereditoEnvio(ctx({ finalidade: "producao", numero_e164: "+5531998626387" }));
  assert.equal(v.pode, true);
  assert.equal(v.aviso, null);
});

test("número não cadastrado DESABILITA o envio, com o motivo nomeado antes do clique", () => {
  // O sender devolveria `falha_permanente` (sender.ts:313-322). Falha permanente DEPOIS do clique
  // é pior que botão desabilitado antes dele.
  const v = vereditoEnvio(ctx({ phone_number_id: "pnid_e2e", numero_apelido: null, numero_e164: null }));
  assert.equal(v.pode, false);
  assert.match(v.motivo!, /PERMANENTE/);
});

test("canal DESLIGADO desabilita o envio", () => {
  const v = vereditoEnvio(ctx({ canal_ativo: false }));
  assert.equal(v.pode, false);
  assert.match(v.motivo!, /DESLIGADO/);
});

test("canal_ativo NULO não é 'está ligado' — mas também não bloqueia sozinho", () => {
  // "não sei" é uma categoria. O bloqueio vem do canal não cadastrado (que é o caso em que o
  // nulo realmente acontece), não de uma suposição sobre `ativo`.
  const v = vereditoEnvio(ctx({ canal_ativo: null }));
  assert.equal(v.pode, true);
});

test("conversa sem contraparte não tem por onde responder", () => {
  const v = vereditoEnvio(ctx({ phone_number_id: null, numero_apelido: null, numero_e164: null }));
  assert.equal(v.pode, false);
  assert.equal(v.respondePor, null);
});

test("o composer SEMPRE diz por qual número responde — e nunca oferece escolha", () => {
  // §5.2: o sistema nunca escolhe número. O veredito não tem campo de opções, e é de propósito:
  // enquanto responder pelo mesmo número for a regra, "respondeu pelo chip errado" não existe.
  const v = vereditoEnvio(ctx({ numero_apelido: "producao" }));
  assert.equal(v.respondePor, "producao");
  assert.equal("opcoes" in v, false);
});

test("cadastrado sem identidade avisa mas não bloqueia — dá para enviar, só não dá para conferir", () => {
  const v = vereditoEnvio(ctx({ numero_e164: null, finalidade: "producao" }));
  assert.equal(v.pode, true);
  assert.match(v.aviso!, /identidade/);
});
