import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

import { COLUNAS_CARD, COLUNAS_CARD_BASE } from "../lib/dados/funil-calculos.ts";

/*
 * ── O DEGRAU DA COR: a única execução que separa "board sem a linha" de "board VAZIO" ──────────
 *
 * `lerCardsReais` pede as 15 colunas (`COLUNAS_CARD`) e, no ERRO, repete só com as 12 da base
 * (`COLUNAS_CARD_BASE`). O motivo está no comentário de `COLUNAS_ULTIMA_MENSAGEM`: o PostgREST
 * não ignora coluna inexistente — ele derruba a consulta INTEIRA. Sem o degrau, o dia em que a
 * migration 0280/0281 não tiver descido o board não fica "sem a linha de mensagem": fica vazio,
 * com 97 leads no banco e zero cards na tela, cinco dias antes do teste com a Sarah.
 *
 * Até 22/08 esse caminho NÃO TINHA COMO SER EXERCITADO: `lerCardsReais` criava o cliente por
 * dentro. O conserto foi dar a ela o `cliente?` que `lerEtapasReais`/`lerSlaEtapas`/`buscarLeads`
 * já tinham. Este teste é a razão de o parâmetro existir.
 *
 * Ele conta as colunas pedidas em cada chamada — não confia em "não deu erro". Contra a versão
 * sem degrau (uma consulta só), o primeiro caso devolveria `cards: []` e falharia aqui.
 */

/** Espião de consulta: registra o `select` de cada chamada e devolve a resposta programada. */
function clienteFalso(respostas: { erro: boolean; linhas?: any[] }[], tarefas: any = { data: [], error: null }) {
  const selects: string[] = [];
  let i = 0;
  const construtor = (aoResolver: () => any, anota: boolean) => {
    const alvo: any = {
      select(colunas: string) {
        // só as colunas da `v_lead_card` interessam à régua: a leitura de tarefas é outra
        // consulta, dispara em paralelo e não faz parte do degrau
        if (anota) selects.push(colunas);
        return alvo;
      },
      // toda a cadeia do PostgREST que o código usa devolve o próprio construtor
      in: () => alvo,
      eq: () => alvo,
      not: () => alvo,
      order: () => alvo,
      limit: () => alvo,
      // é o `await` que dispara: o construtor do supabase-js é thenable
      then: (ok: (v: any) => any, falha?: (e: any) => any) => Promise.resolve(aoResolver()).then(ok, falha),
    };
    return alvo;
  };
  return {
    selects,
    cliente: {
      schema: () => ({
        from: (tabela: string) => {
          if (tabela === "tarefa") return construtor(() => tarefas, false);
          return construtor(() => {
            const r = respostas[Math.min(i, respostas.length - 1)];
            i += 1;
            return r.erro
              ? { data: null, error: { message: "column v_lead_card.ultima_mensagem_corpo does not exist" } }
              : { data: r.linhas ?? [], error: null };
          }, true);
        },
      }),
    } as any,
  };
}

const LINHA_BASE = {
  lead_id: "11111111-1111-1111-1111-111111111111",
  nome: "Maria",
  telefone: "5527998316220",
  etapa: "lead",
  entrou_etapa_em: "2026-08-20T10:00:00Z",
  valor: null,
  origem: "whatsapp",
  dono: null,
  dono_id: null,
  dono_nome: null,
  tags: null,
  kommo_lead_id: "999",
};

test("degrau: view SEM as colunas de última mensagem → board com cards, sem a linha (nunca vazio)", async () => {
  const { lerCardsReais } = await import("../lib/dados/funil.ts");
  // 1ª chamada erra (COLUNAS_CARD), 2ª volta com dado (COLUNAS_CARD_BASE)
  const { cliente, selects } = clienteFalso([{ erro: true }, { erro: false, linhas: [LINHA_BASE, { ...LINHA_BASE, lead_id: "22222222-2222-2222-2222-222222222222", nome: "João" }] }]);

  const { cards, corte } = await lerCardsReais(["lead", "qualificado"], cliente);

  // o EFEITO, não a saída limpa: o board tem os dois cards que o banco tem
  assert.equal(cards.length, 2, "o degrau existe para o board NÃO ficar vazio quando a view é a antiga");
  assert.equal(cards[0].nome, "Maria");
  assert.equal(cards[0].ultima_mensagem, undefined, "sem as 3 colunas o card não desenha a linha — não inventa uma");
  assert.equal(corte, false);

  // e a prova de que foi mesmo o degrau, e não sorte: duas consultas, nesta ordem de colunas
  assert.deepEqual(selects, [COLUNAS_CARD, COLUNAS_CARD_BASE]);
});

test("degrau: view COM as colunas → uma consulta só, e a linha de mensagem vem preenchida", async () => {
  const { lerCardsReais } = await import("../lib/dados/funil.ts");
  const { cliente, selects } = clienteFalso([
    {
      erro: false,
      linhas: [
        {
          ...LINHA_BASE,
          ultima_mensagem_corpo: "oi, quero marcar",
          ultima_mensagem_em: "2026-08-21T14:00:00Z",
          ultima_mensagem_direcao: "entrada",
        },
      ],
    },
  ]);

  const { cards } = await lerCardsReais(["lead"], cliente);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].ultima_mensagem, {
    texto: "oi, quero marcar",
    em: "2026-08-21T14:00:00Z",
    de: "cliente",
  });
  assert.deepEqual(selects, [COLUNAS_CARD], "com a view nova o degrau não é usado — uma ida ao banco, não duas");
});

test("as DUAS consultas falhando → board vazio honesto (o degrau não vira desculpa para inventar)", async () => {
  const { lerCardsReais } = await import("../lib/dados/funil.ts");
  const { cliente, selects } = clienteFalso([{ erro: true }, { erro: true }]);

  const { cards, corte } = await lerCardsReais(["lead"], cliente);

  assert.deepEqual(cards, [], "leitura indisponível é leitura indisponível — não se preenche com nada");
  assert.equal(corte, false);
  assert.deepEqual(selects, [COLUNAS_CARD, COLUNAS_CARD_BASE], "tentou o degrau antes de desistir");
});
