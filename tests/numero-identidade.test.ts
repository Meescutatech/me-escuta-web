import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROTULO_NAO_VISIVEL,
  identidadeDoNumero,
  numeroLegivel,
  viaDoNumero,
  type OrigemConversa,
} from "../components/conversas/regras/numero.ts";

/*
 * 16/09/2026 — QUAL NÚMERO É ESTE, na régua que divide os fios.
 *
 * A régua dizia só "CLARA". O pedido: *"mostre clara e o número… coloca no hover também uma forma
 * de ver qual é o número, no caso API oficial"*. Tudo aqui sai de dado que a tela JÁ tem
 * (`phone_number_id`, `numero_e164`, `finalidade`) — nenhuma ida nova ao banco.
 *
 * ⚠️ O QUE NÃO EXISTE, e por isso não é prometido em lugar nenhum: o `verified_name`, o nome que
 * aparece no WhatsApp de quem recebe. Ele não é coluna de `core.canal_whatsapp` — vive só na Graph
 * API e num comentário da migration `0094` (conferido em 28/07: `627327023793464` → "Me Escuta",
 * `608866985643828` → "Test Number"). Inventar esse nome na tela seria o mesmo erro do rótulo que
 * o M7 existe para impedir.
 *
 * Estes testes são de COMPORTAMENTO, sobre função pura — não sobre texto-fonte. É a guarda que a
 * casa prefere quando a regra dá para isolar, porque não depende de como o JSX está escrito.
 */

const oficial: OrigemConversa = {
  phone_number_id: "608866985643828",
  numero_apelido: "teste_meta",
  numero_e164: "+15556418435",
  finalidade: "teste",
};

test("o número vira legível sem inventar dígito", () => {
  assert.equal(numeroLegivel("+5531988887777"), "+55 31 98888-7777");
  assert.equal(numeroLegivel("+553133334444"), "+55 31 3333-4444");
  assert.equal(numeroLegivel("+15556418435"), "+1 555-641-8435");
});

test("número que não conheço o formato sai COMO ESTÁ, nunca remendado", () => {
  // formatar por adivinhação é pior que não formatar: o número deixa de bater com o que a pessoa
  // procura no WhatsApp, e ninguém percebe que foi a tela que mexeu.
  assert.equal(numeroLegivel("+4407911123456"), "+4407911123456");
  assert.equal(numeroLegivel("+55319"), "+55319");
});

test("sem número não se inventa string vazia", () => {
  assert.equal(numeroLegivel(null), null);
  assert.equal(numeroLegivel("   "), null);
});

test("a VIA sai do phone_number_id — `lite:` é o número pessoal de uma fono", () => {
  assert.equal(viaDoNumero("608866985643828"), "oficial");
  assert.equal(viaDoNumero("lite:jade"), "lite");
  assert.equal(viaDoNumero(null), "desconhecida");
});

test("a identidade diz o número e por onde ele sai", () => {
  const id = identidadeDoNumero(oficial);
  assert.equal(id.numero, "+1 555-641-8435");
  assert.equal(id.via, "oficial");
  assert.match(id.detalhe, /API oficial/);
  assert.match(id.detalhe, /\+1 555-641-8435/);
});

test("no Lite o detalhe DIZ que é o WhatsApp pessoal da fono", () => {
  // é a diferença que muda o comportamento de quem está escrevendo: no Lite, o número é de uma
  // pessoa, e o que sai de lá sai no nome dela.
  const id = identidadeDoNumero({ ...oficial, phone_number_id: "lite:jade", numero_apelido: "Jade" });
  assert.equal(id.via, "lite");
  assert.match(id.detalhe, /pessoal/i);
  assert.doesNotMatch(id.detalhe, /lite:jade/, "o phone_number_id NUNCA vai para a tela (CA-9)");
});

test("número ilegível pela RLS DIZ isso — não fica em branco nem some", () => {
  const id = identidadeDoNumero({ ...oficial, numero_e164: null });
  assert.equal(id.numero, ROTULO_NAO_VISIVEL);
  assert.match(id.detalhe, /API oficial/, "a via continua sendo dita: ela não depende do E.164");
});

test("o detalhe NUNCA carrega o phone_number_id, em nenhum caso", () => {
  // CA-9 de novo, agora sobre o texto do hover: `core.conversa` é legível por todo
  // `authenticated`, e o id do canal não oficial carrega o nome da fonoaudióloga.
  for (const o of [
    oficial,
    { ...oficial, phone_number_id: "lite:maria-clara", numero_apelido: null, numero_e164: null, finalidade: null },
    { ...oficial, finalidade: null },
  ] as OrigemConversa[]) {
    const { detalhe } = identidadeDoNumero(o);
    if (o.phone_number_id) assert.doesNotMatch(detalhe, new RegExp(o.phone_number_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("finalidade TESTE aparece no detalhe — é o que explica a mensagem não chegar", () => {
  assert.match(identidadeDoNumero(oficial).detalhe, /teste/i);
  assert.doesNotMatch(identidadeDoNumero({ ...oficial, finalidade: "producao" }).detalhe, /lista de permissão/i);
});
