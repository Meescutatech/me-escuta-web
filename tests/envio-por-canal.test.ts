import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 15/09/2026 — O NÚMERO ESCOLHIDO TEM DE SAIR PELO NÚMERO ESCOLHIDO.
 *
 * Relato do COO, testando com três números: *"testei enviar por esses 3 números, mas todas as msgs
 * vieram para mim pelo teste_meta"*. Não era allowlist da Meta e não era o guarda do emissor
 * (aquele foi o `4ed8b9b`, de ontem): o seletor "Enviando por X ▾" **nunca chegou ao envio**.
 *
 * A cadeia, medida em 15/09 antes de escrever uma linha:
 *   composer.tsx:443   onEnviarTexto(texto, deTemplate)      ← sem canal
 *   inbox.tsx:1684     despachar(texto, undefined, …)        ← sem canal
 *   inbox.tsx:825      enviarMensagem(selecionada.id, …)     ← sem canal
 *   actions.ts:76      payload = { conversa_id, corpo }      ← a porta deriva o número DA CONVERSA
 * e `fioNovo` (composer.tsx:189) existe só para pintar o aviso âmbar e a cor do rótulo.
 *
 * O que estes testes protegem, em ordem de dano:
 *  1. a mensagem sair por um número que não é o escolhido — a paciente responde para a pessoa
 *     errada, e no Lite isso significa o WhatsApp PESSOAL de outra fonoaudióloga;
 *  2. o canal escolhido ser inventado pela tela em vez de vir da lista que o servidor autorizou;
 *  3. abrir fio novo sem telefone — a porta recusa com PMEE5 e a mensagem some sem projeção;
 *  4. REGRESSÃO: responder na própria conversa parar de funcionar, que é 100% do uso de hoje
 *     (medido: 397 conversas, e só 5 leads reais têm mais de um fio).
 *
 * Duas camadas de propósito. A regra pura prova a DECISÃO; as asserções sobre o texto-fonte provam
 * que a decisão ATRAVESSA a cadeia — porque aqui o que falta não é uma conta errada, é um
 * parâmetro que não existe, e um teste de unidade sobre a função nova passa verdinho com a tela
 * continuando a mandar tudo pelo número da conversa. Foi essa fronteira que mordeu ontem (E-438).
 */

const MOD = "../lib/conversas/envio-canal.ts";

const composer = readFileSync(new URL("../components/conversas/composer.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/(app)/conversas/actions.ts", import.meta.url), "utf8");

const CANAIS = [
  { id: "627327023793464", apelido: "CLARA", producao: true },
  { id: "608866985643828", apelido: "teste_meta", producao: false },
  { id: "lite:diogo", apelido: "diogo", producao: false },
];

// ═══════════════════════ camada 1 · a decisão (regra pura) ═══════════════════════

test("mesmo canal da conversa ⇒ responde NA conversa, sem inventar fio novo", async () => {
  const { escolherCanalDeEnvio } = await import(MOD);
  const r = escolherCanalDeEnvio({
    canalEscolhidoId: "627327023793464",
    canalDaConversaId: "627327023793464",
    telefone: "+5531968900000",
    canaisPermitidos: CANAIS,
  });
  assert.equal(r.modo, "mesma_conversa");
});

test("canal NÃO escolhido (seletor intocado) também responde na conversa", async () => {
  const { escolherCanalDeEnvio } = await import(MOD);
  const r = escolherCanalDeEnvio({
    canalEscolhidoId: null,
    canalDaConversaId: "627327023793464",
    telefone: "+5531968900000",
    canaisPermitidos: CANAIS,
  });
  assert.equal(r.modo, "mesma_conversa");
});

test("canal diferente ⇒ FIO NOVO, carregando o phone_number_id e o telefone", async () => {
  const { escolherCanalDeEnvio } = await import(MOD);
  const r = escolherCanalDeEnvio({
    canalEscolhidoId: "608866985643828",
    canalDaConversaId: "627327023793464",
    telefone: "+5531968900000",
    canaisPermitidos: CANAIS,
  });
  assert.equal(r.modo, "fio_novo");
  // é este par que a porta usa para achar ou criar a conversa: md5(phone_number_id|telefone)
  assert.equal(r.phone_number_id, "608866985643828");
  assert.equal(r.telefone, "+5531968900000");
});

test("o Lite é canal como outro qualquer — `lite:` não é caso especial na escolha", async () => {
  const { escolherCanalDeEnvio } = await import(MOD);
  const r = escolherCanalDeEnvio({
    canalEscolhidoId: "lite:diogo",
    canalDaConversaId: "627327023793464",
    telefone: "+5531968900000",
    canaisPermitidos: CANAIS,
  });
  assert.equal(r.modo, "fio_novo");
  assert.equal(r.phone_number_id, "lite:diogo");
});

test("canal fora da lista autorizada é RECUSADO — a tela não inventa por onde falar", async () => {
  const { escolherCanalDeEnvio } = await import(MOD);
  const r = escolherCanalDeEnvio({
    canalEscolhidoId: "999_nao_autorizado",
    canalDaConversaId: "627327023793464",
    telefone: "+5531968900000",
    canaisPermitidos: CANAIS,
  });
  assert.equal(r.modo, "recusado");
  assert.match(r.motivo, /autoriz/i);
});

test("fio novo SEM telefone é recusado antes de sair — a porta recusaria com PMEE5", async () => {
  const { escolherCanalDeEnvio } = await import(MOD);
  const r = escolherCanalDeEnvio({
    canalEscolhidoId: "608866985643828",
    canalDaConversaId: "627327023793464",
    telefone: null,
    canaisPermitidos: CANAIS,
  });
  assert.equal(r.modo, "recusado");
  assert.match(r.motivo, /telefone/i);
});

// ═══════════════ camada 2 · a decisão ATRAVESSA a cadeia (contrato) ═══════════════

test("o composer REPASSA o canal escolhido — hoje `fioNovo` só pinta aviso", () => {
  // `canalEscolhido` já existe no estado (composer.tsx:187) e `fioNovo` já é calculado (:189).
  // O defeito é que nenhum dos dois entra na chamada de envio.
  assert.match(
    composer,
    /onEnviarTexto\(\s*texto\s*,\s*deTemplate\s*,\s*canalEscolhido/,
    "onEnviarTexto tem de receber o canal escolhido, não só o texto e o template",
  );
});

test("a prop `onEnviarTexto` declara o canal no tipo — senão o TS aceita a omissão em silêncio", () => {
  assert.match(
    composer,
    /onEnviarTexto:\s*\(\s*texto:\s*string\s*,\s*templateId\?:[^)]*,\s*canal/,
    "a assinatura da prop precisa carregar o canal",
  );
});

test("o inbox repassa o canal até a action — o elo onde ele se perde hoje", () => {
  assert.match(inbox, /function despachar\([^)]*canal/, "despachar tem de aceitar o canal");
  assert.match(
    inbox,
    /enviarMensagem\([\s\S]{0,260}canal/,
    "a chamada de enviarMensagem tem de carregar o canal",
  );
});

/*
 * ⚠️ 15/09 · ESTE BLOCO NASCEU FRACO E FOI TROCADO NO MESMO DIA.
 *
 * A primeira versão afirmava que as palavras `phone_number_id`, `telefone` e `conversa_id`
 * apareciam em `actions.ts`. O teste de mutação reprovou o TESTE: com o payload mandando o par
 * JUNTO do `conversa_id` — o defeito exato que se quer impedir, porque a porta então completa pela
 * conversa apontada e o número escolhido se perde em silêncio — as três palavras continuavam lá e a
 * suíte seguia 12/0. Guarda que passa no estado quebrado é decoração.
 *
 * Por isso o payload virou FUNÇÃO PURA: o que importa não é o texto do arquivo, é a exclusividade
 * entre os dois modos. Mesma lição do E-438, de ontem.
 */

test("fio novo manda o PAR e NÃO manda conversa_id", async () => {
  const { montarPayloadEnvio } = await import(MOD);
  const p = montarPayloadEnvio({
    conversaId: "conv-1",
    canalDestino: { phone_number_id: "608866985643828", telefone: "+5531900000000" },
  });
  assert.equal(p.phone_number_id, "608866985643828");
  assert.equal(p.telefone, "+5531900000000");
  assert.equal(
    "conversa_id" in p,
    false,
    "com conversa_id no payload a porta completa pela conversa e ignora o número escolhido",
  );
});

test("responder na própria conversa manda conversa_id e NÃO manda o par", async () => {
  const { montarPayloadEnvio } = await import(MOD);
  const p = montarPayloadEnvio({ conversaId: "conv-1", canalDestino: null });
  assert.equal(p.conversa_id, "conv-1");
  assert.equal("phone_number_id" in p, false);
  assert.equal("telefone" in p, false);
});

test("a action monta o payload pela regra única — não remonta na mão", () => {
  // DRY com dente: se a action voltar a montar o objeto inline, a exclusividade acima deixa de
  // valer no caminho real e os dois testes puros continuariam verdes.
  assert.match(actions, /montarPayloadEnvio\(/, "a action tem de usar a regra única do payload");
});

test("REGRESSÃO · responder na própria conversa continua mandando conversa_id", () => {
  // 100% do uso de hoje. Se isto quebrar, o conserto do raro derrubou o comum.
  assert.match(
    actions,
    /payload:\s*Record<string,\s*unknown>\s*=\s*\{\s*conversa_id:\s*conversaId\s*\}|conversa_id:\s*conversaId/,
    "o caminho de sempre não pode desaparecer",
  );
});

test("REGRESSÃO · a trava de modo interno continua valendo no caminho novo", () => {
  // nota e tarefa NUNCA falam com o cliente, por nenhum canal (C3 · composer-modo).
  assert.match(composer, /despacharAoCliente\(/, "o portão único de saída continua sendo usado");
});
