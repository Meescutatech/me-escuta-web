import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 15/09/2026 — A PESSOA É UMA, OS FIOS SÃO VÁRIOS.
 *
 * Pedido do COO, com print do Kommo: *"Abrimos um fio novo mas bem dividido e parecido com o kommo
 * mesma página em threads diferentes"*. Lá, a página do contato mostra os blocos empilhados, cada um
 * com a etiqueta do canal no topo ("FINANCEIRO", "Me Escuta") e o número da conversa no rodapé.
 *
 * Hoje o drawer do card lê UMA conversa por lead: `lerConversaDoLeadAcao` faz
 * `.order(atualizado_em).limit(1).maybeSingle()`. Com o 1a no ar (fio novo por número), o mesmo lead
 * passa a ter mais de um fio — e a tela mostraria só o mais recente, escondendo o resto sem avisar.
 * Medido em produção em 15/09: 5 leads reais já têm 2+ fios, um deles tem 3.
 *
 * O que estes testes protegem, em ordem de dano:
 *  1. um fio sumir da tela — a conversa existe, foi respondida, e a pessoa não vê;
 *  2. a etiqueta do bloco ser inventada em vez de vir do `chipDoNumero` (M7) — lá o
 *     `phone_number_id` NUNCA vira rótulo (em canal não oficial ele é `lite:<nome-da-fono>`), e os
 *     selos de TESTE e de identidade ausente já estão resolvidos;
 *  3. REGRESSÃO: o lead de um fio só (a esmagadora maioria) parar de funcionar;
 *  4. lead sem conversa nenhuma virar erro em vez de vazio honesto.
 *
 * A ordem e o rótulo são REGRA PURA de propósito: no 1a a guarda sobre texto-fonte passou no estado
 * quebrado e só a de comportamento reprovou. Aqui o texto-fonte cobre só o que é costura.
 */

const MOD = "../lib/conversas/fios-do-lead.ts";
const acoes = readFileSync(new URL("../app/(app)/funil/actions.ts", import.meta.url), "utf8");

// só o TIPO é estático (some em runtime): o import de valor segue dinâmico dentro de cada teste,
// que é o que deixa o vermelho falar quando o módulo ainda não existe.
import type { FioDoLead } from "../lib/conversas/fios-do-lead.ts";

/** Um fio como a view `core.v_conversa` o entrega (colunas conferidas em produção, 15/09). */
function fio(p: Partial<FioDoLead> = {}): FioDoLead {
  return {
    conversaId: "conv-1",
    phone_number_id: "627327023793464",
    numero_apelido: "CLARA",
    numero_e164: "+15557252751",
    finalidade: "producao",
    atualizado_em: "2026-09-15T22:40:00Z",
    mensagens: [],
    ...p,
  };
}

// ═══════════════════════ a ordem ═══════════════════════

test("o fio mais recente vem primeiro — é onde a conversa está viva", async () => {
  const { ordenarFiosDoLead } = await import(MOD);
  const r = ordenarFiosDoLead([
    fio({ conversaId: "antigo", atualizado_em: "2026-09-01T13:46:00Z" }),
    fio({ conversaId: "novo", atualizado_em: "2026-09-15T22:40:00Z" }),
    fio({ conversaId: "meio", atualizado_em: "2026-09-10T10:00:00Z" }),
  ]);
  assert.deepEqual(
    r.map((f: { conversaId: string }) => f.conversaId),
    ["novo", "meio", "antigo"],
  );
});

test("NENHUM fio some na ordenação — sumiço silencioso é o dano nº 1", async () => {
  const { ordenarFiosDoLead } = await import(MOD);
  const entrada = [fio({ conversaId: "a" }), fio({ conversaId: "b" }), fio({ conversaId: "c" })];
  assert.equal(ordenarFiosDoLead(entrada).length, 3);
});

test("fio sem `atualizado_em` não some nem quebra a ordem — vai para o fim", async () => {
  const { ordenarFiosDoLead } = await import(MOD);
  const r = ordenarFiosDoLead([
    fio({ conversaId: "sem-data", atualizado_em: null }),
    fio({ conversaId: "com-data", atualizado_em: "2026-09-15T22:40:00Z" }),
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].conversaId, "com-data");
  assert.equal(r[1].conversaId, "sem-data");
});

test("lead sem conversa devolve lista vazia — não é erro, é vazio honesto", async () => {
  const { ordenarFiosDoLead } = await import(MOD);
  assert.deepEqual(ordenarFiosDoLead([]), []);
});

test("REGRESSÃO · um fio só continua sendo um fio só", async () => {
  const { ordenarFiosDoLead } = await import(MOD);
  const r = ordenarFiosDoLead([fio({ conversaId: "unico" })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].conversaId, "unico");
});

// ═══════════════════════ a etiqueta ═══════════════════════

test("a etiqueta do bloco vem do chipDoNumero — não é rótulo inventado", async () => {
  const { rotuloDoFio } = await import(MOD);
  const { chipDoNumero } = await import("../components/conversas/regras/numero.ts");
  const f = fio({ numero_apelido: "CLARA" });
  assert.deepEqual(rotuloDoFio(f), chipDoNumero(f));
});

test("canal não oficial NUNCA mostra `lite:` na etiqueta (CA-9 vale no bloco também)", async () => {
  const { rotuloDoFio } = await import(MOD);
  const r = rotuloDoFio(
    fio({ phone_number_id: "lite:diogo", numero_apelido: "diogo", numero_e164: null }),
  );
  assert.equal(r.rotulo.includes("lite:"), false);
});

test("o selo de TESTE aparece no bloco — é o que corrige um engano ativo", async () => {
  const { rotuloDoFio } = await import(MOD);
  const r = rotuloDoFio(fio({ finalidade: "teste" }));
  assert.equal(r.selos.includes("teste"), true);
});

// ═══════════════════════ a costura ═══════════════════════

test("a action devolve TODOS os fios — o `.limit(1)` era o teto invisível", () => {
  assert.equal(
    /\.limit\(1\)[\s\S]{0,80}maybeSingle\(\)/.test(acoes),
    false,
    "enquanto houver limit(1)+maybeSingle o lead com 3 fios mostra 1 e esconde 2, sem avisar",
  );
});

test("a action traz as colunas que o chip exige — senão a etiqueta cai no caso errado", () => {
  // sem `phone_number_id` e `finalidade` o chip não distingue "não cadastrado" de "sem identidade",
  // e o selo TESTE some justamente quando todo mundo está testando.
  assert.match(acoes, /phone_number_id/);
  assert.match(acoes, /finalidade/);
});
