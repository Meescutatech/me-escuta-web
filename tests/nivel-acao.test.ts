/*
 * D70/D71 · os TRÊS PORTÕES de `definirNivelCanal`, exercitados DENTRO da suíte.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE (medido em 08/09/2026, não deduzido) ═══
 *
 * A action subiu com três portões — domínio → `validarTrocaNivel` → versão do termo — e a suíte
 * inteira ficava verde sem nenhum deles. Provado por MUTAÇÃO, com a suíte rodada a cada passo:
 *
 *   · apagar o bloco do `validarTrocaNivel` + o `return` de recusa  → npm test 918/918, lint limpo
 *   · `if (exigeAceiteDoTermo(...))` → `if (false && exigeAceiteDoTermo(...))` → 918/918, lint limpo
 *   · apagar o `if (!nivelValido(nivel))` e castar o alvo          → 918/918, lint limpo
 *
 * Existe um portão que pega os três (`scripts/portao-d70-nivel-acao.mjs`, e ele REPROVOU nas três
 * mutações) — mas ele roda por `npm run portao:d70-nivel`, fora do `npm test`. Guarda que só
 * dispara quando alguém lembra de chamá-la protege menos do que parece: o caminho normal de quem
 * mexe neste código é rodar a suíte.
 *
 * `tests/canais.test.ts` exercita a FUNÇÃO PURA `validarTrocaNivel`; o que faltava é o fato de ela
 * ser CHAMADA. E isso pesa mais aqui do que em outra action, por uma razão medida no corpo vivo de
 * `api.registrar_evento`: o bloco `if v_tipo like 'canal\_%'` confere papel, presença de
 * `canal_id`, antissegredo e existência do canal — e NADA MAIS. Não há guarda de banco para "nível
 * só existe em canal não oficial" nem para "sem consentimento da titular o canal não sai do
 * estrito". Para essas duas, esta action é a única aplicação que existe.
 *
 * ═══ COMO ESTES TESTES JULGAM: pelo EFEITO, nunca pelo valor de retorno sozinho ═══
 *
 * A pergunta é "a porta foi chamada?". Um `ok:false` bonito com o `api.registrar_evento` já
 * disparado seria um evento gravado num ledger append-only por uma ação que a tela diz ter
 * recusado. Por isso toda asserção de recusa vem em par: `ok === false` E `escritas === 0`.
 *
 * Roda a AÇÃO REAL (importada, não uma réplica) contra o cliente falso de
 * `scripts/apoio-banco-canal.mjs` — o mesmo do portão, para as duas guardas não divergirem. Zero
 * banco, zero rede.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ligarStubsDeServidor } from "../scripts/portao-resolver.mjs";
import {
  CANAL_LITE,
  COLUNAS_COM_NIVEL,
  criarBancoDeCanal,
} from "../scripts/apoio-banco-canal.mjs";
import {
  MOTIVO_ACEITE_NAO_GRAVOU,
  TERMO_VERSAO,
  aceiteEntaoNivel,
} from "../components/configuracoes/regras/lite-sessao.ts";

// ANTES do primeiro import do código de produção: `next/cache` (revalidatePath) e
// `@/lib/supabase/server` (cookies) estouram fora de uma requisição do Next.
ligarStubsDeServidor();

// dinâmico e DEPOIS do `ligarStubsDeServidor()` — o ESM resolve o grafo estático inteiro antes de
// avaliar qualquer coisa, então um import estático aqui pegaria `next/headers` de verdade.
const { definirNivelCanal } = await import("../app/(app)/configuracoes/canais/actions.ts");

interface Rodada {
  r: { ok: boolean; motivo?: string };
  escritas: Array<{ schema: string; nome: string; args: { p?: { tipo?: string; payload?: Record<string, unknown> } } }>;
  linha: Record<string, unknown>;
}

/**
 * Roda a ação real uma vez.
 * `nivelDepois` é o `nivel` que a view passa a devolver DEPOIS do registro — é o que o readback lê.
 * Padrão: o nível pedido (a projeção funcionou).
 */
async function rodar(opcoes: {
  canal?: Record<string, unknown>;
  papel?: string | null;
  nivel: string;
  nivelDepois?: string;
  canalIdPedido?: string;
}): Promise<Rodada> {
  const linha: Record<string, unknown> = { ...CANAL_LITE, ...(opcoes.canal ?? {}) };
  const banco = criarBancoDeCanal({
    canal: linha,
    papel: opcoes.papel === undefined ? "admin" : opcoes.papel,
    colunasDaView: COLUNAS_COM_NIVEL,
    aoRegistrar: () => {
      // a porta aceitou e a projeção rodou: a view passa a responder o nível novo
      linha.nivel = opcoes.nivelDepois ?? opcoes.nivel;
      linha.nivel_declarado = true;
      return { data: { evento_id: "evt-d70", posicao_global: 4242, duplicado: false }, error: null };
    },
  });
  (globalThis as Record<string, unknown>).__PORTAO_CLIENTE__ = banco;
  const r = await definirNivelCanal(
    opcoes.canalIdPedido ?? (linha.canal_id as string),
    opcoes.nivel,
  );
  const escritas = banco.rpcs.filter((c: { nome: string }) => c.nome === "registrar_evento");
  return { r, escritas, linha };
}

/*
 * ─────────────── 0 · VACUIDADE ───────────────
 * Sem isto, "não escreveu" nas recusas seria verdade até numa action que nunca escreve — os testes
 * mediriam a si mesmos. Este é o único teste do arquivo cuja falha invalida todos os outros.
 */
test("D70/ação · o caminho FELIZ escreve — sem isso, todo 'não escreveu' abaixo é vácuo", async () => {
  const { r, escritas } = await rodar({ nivel: "aberto" });
  assert.equal(r.ok, true, `caminho feliz recusou: ${r.motivo ?? ""}`);
  assert.equal(escritas.length, 1);
  const env = escritas[0].args?.p ?? {};
  assert.equal(env.tipo, "canal_nivel_alterado");
  assert.equal(env.payload?.canal_id, "lite:jade");
  assert.equal(env.payload?.nivel, "aberto");
  assert.equal(escritas[0].schema, "api", "a escrita sai pelo schema `api`, nunca por `core`");
});

// ─────────────── 1 · PORTÃO DE DOMÍNIO ───────────────

test("D70/ação · nível fora do domínio NÃO chega à porta", async () => {
  for (const podre of ["livre_total", "ABERTO", "aberto ", "", "estritoo"]) {
    const { r, escritas } = await rodar({ nivel: podre });
    assert.equal(r.ok, false, `${JSON.stringify(podre)} passou pelo domínio`);
    assert.equal(escritas.length, 0, `${JSON.stringify(podre)} chegou a escrever no ledger`);
    assert.match(r.motivo ?? "", /não existe/);
  }
});

// ─────────────── 2 · PORTÃO `validarTrocaNivel` (papel · provedor · consentimento) ───────────────

test("D70/ação · papel 'membro' é recusado SEM tocar a porta", async () => {
  const { r, escritas } = await rodar({ nivel: "aberto", papel: "membro" });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
  assert.match(r.motivo ?? "", /admin|Propriet/i);
});

test("D70/ação · papel nulo (leitura indisponível) recusa FECHADO", async () => {
  const { r, escritas } = await rodar({ nivel: "aberto", papel: null });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
});

test("D70/ação · canal OFICIAL não tem nível — recusa sem escrever config falsa no ledger", async () => {
  const { r, escritas } = await rodar({
    nivel: "aberto",
    canal: { canal_id: "627327023793464", provedor: "waba" },
  });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
  assert.match(r.motivo ?? "", /nao oficial|não oficial/i);
});

test("D70/ação · sem consentimento da titular o canal NÃO sai do estrito", async () => {
  // o dano aqui é de TERCEIRO: afrouxar o filtro expõe o WhatsApp pessoal dela, e ninguém nesta
  // conversa pode consentir no lugar dela.
  const { r, escritas } = await rodar({
    nivel: "responde_qualquer_um",
    canal: { consentimento_em: null, consentimento_texto_versao: null },
  });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
  assert.match(r.motivo ?? "", /consentimento/i);
});

// ─────────────── 3 · PORTÃO DA VERSÃO DO TERMO (D70.b) ───────────────

test("D70/ação · aceite em versão VELHA barra a troca, e o motivo nomeia as duas versões", async () => {
  // Esta é a única rede que pega o RE-consentimento: o readback de
  // `canal_consentimento_registrado` confere `consentimento_em not null`, e num re-consentimento
  // essa coluna JÁ era não nula — ele diria "ok" mesmo sem a versão ter sido atualizada. Quem pega
  // é este portão, que relê a versão do BANCO, não da tela.
  const { r, escritas } = await rodar({ nivel: "aberto", canal: { consentimento_texto_versao: "v1" } });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
  assert.match(r.motivo ?? "", /v1/);
  assert.match(r.motivo ?? "", new RegExp(TERMO_VERSAO));
});

test("D70/ação · versão do aceite NÃO REGISTRADA barra também", async () => {
  // não saber qual versão ela aceitou é o mesmo que saber que não foi esta
  const { r, escritas } = await rodar({
    nivel: "aberto",
    canal: { consentimento_texto_versao: null },
  });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
});

test("D70/ação · VOLTAR ao estrito passa mesmo com aceite velho — apertar o filtro nunca exige termo", async () => {
  // travar o caminho de volta prenderia a titular no nível mais permissivo justamente quando ela
  // quer sair dele.
  const { r, escritas } = await rodar({
    nivel: "estrito",
    canal: { nivel: "aberto", nivel_declarado: true, consentimento_texto_versao: "v1" },
  });
  assert.equal(r.ok, true, r.motivo ?? "");
  assert.equal(escritas.length, 1);
});

// ─────────────── 4 · CONTROLE NEGATIVO do readback ───────────────

test("D70/ação · escrita aceita + nível INALTERADO na view = ok:false (a tela não diz 'salvo')", async () => {
  const { r, escritas } = await rodar({ nivel: "aberto", nivelDepois: "estrito" });
  assert.equal(escritas.length, 1, "a escrita TEM de ter acontecido — senão o controle é vácuo");
  assert.equal(r.ok, false);
  assert.match(r.motivo ?? "", /proje/i);
});

// ─────────────── 5 · canal inexistente ───────────────

test("D70/ação · canal inexistente recusa antes de tudo, sem tocar a porta", async () => {
  const { r, escritas } = await rodar({ nivel: "aberto", canalIdPedido: "lite:nao-existe" });
  assert.equal(r.ok, false);
  assert.equal(escritas.length, 0);
  assert.match(r.motivo ?? "", /não encontrado/);
});

/*
 * ─────────── 6 · A ORDEM: aceite ANTES do nível, e o nível NÃO sai se o aceite falhar ───────────
 *
 * Os dois eventos saem do mesmo clique (`DialogoAceiteENivel`): primeiro
 * `canal_consentimento_registrado`, depois `canal_nivel_alterado`. Se a ordem inverter, ou se o
 * segundo sair mesmo com o primeiro falhando, o canal sai do estrito com a titular tendo aceitado
 * OUTRO texto — e o evento do nível fica num ledger append-only sem base nenhuma atrás dele.
 *
 * Enquanto a sequência morava dentro do `onClick`, nada a exercia. Agora ela é `aceiteEntaoNivel`,
 * e estes três testes a chamam com espiões que registram a sequência real.
 */

test("D70/ordem · o aceite sai ANTES do nível — nesta ordem, sempre", async () => {
  const chamadas: string[] = [];
  const r = await aceiteEntaoNivel({
    registrarAceite: async () => {
      chamadas.push("canal_consentimento_registrado");
      return { ok: true };
    },
    trocarNivel: () => {
      chamadas.push("canal_nivel_alterado");
    },
  });
  assert.deepEqual(r, { trocou: true });
  assert.deepEqual(chamadas, ["canal_consentimento_registrado", "canal_nivel_alterado"]);
});

test("D70/ordem · aceite que NÃO grava impede o nível de sair — e o motivo é o do aceite", async () => {
  const chamadas: string[] = [];
  const r = await aceiteEntaoNivel({
    registrarAceite: async () => {
      chamadas.push("canal_consentimento_registrado");
      return { ok: false, motivo: "a porta recusou o consentimento" };
    },
    trocarNivel: () => {
      chamadas.push("canal_nivel_alterado");
    },
  });
  assert.equal(r.trocou, false);
  assert.equal(r.motivo, "a porta recusou o consentimento");
  assert.deepEqual(chamadas, ["canal_consentimento_registrado"], "o nível NÃO pode ter sido pedido");
});

test("D70/ordem · aceite sem motivo ainda assim barra, com texto que a titular entende", async () => {
  const chamadas: string[] = [];
  const r = await aceiteEntaoNivel({
    registrarAceite: async () => ({ ok: false }),
    trocarNivel: () => {
      chamadas.push("canal_nivel_alterado");
    },
  });
  assert.equal(r.trocou, false);
  assert.equal(r.motivo, MOTIVO_ACEITE_NAO_GRAVOU);
  assert.deepEqual(chamadas, []);
});

test("D70/ordem · aceite que ESTOURA não vira nível trocado em silêncio", async () => {
  // rede pior que recusa: `registrarConsentimento` pode rejeitar (rede caiu no meio). O nível não
  // pode sair na sequência de uma promessa rejeitada.
  const chamadas: string[] = [];
  await assert.rejects(
    aceiteEntaoNivel({
      registrarAceite: async () => {
        throw new Error("fetch failed");
      },
      trocarNivel: () => {
      chamadas.push("canal_nivel_alterado");
    },
    }),
    /fetch failed/,
  );
  assert.deepEqual(chamadas, []);
});
