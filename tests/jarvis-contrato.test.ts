import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fraseDoContexto,
  interpretarContexto,
  lerEventosSse,
  rotuloFerramenta,
  sugestoesPorContexto,
} from "../lib/jarvis/contrato.ts";

// F9 · contrato do ?contexto= (F4) e leitura do SSE — sem rede, sem DOM.

const LEAD = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";

test("?contexto= codificado (pathname+search) vira rota/busca/ids", () => {
  const c = interpretarContexto(encodeURIComponent(`/funil?etapa=qualificado&lead=${LEAD}`));
  assert.equal(c.rota, "/funil");
  assert.equal(c.busca, `?etapa=qualificado&lead=${LEAD}`);
  assert.equal(c.lead_id, LEAD);
  assert.equal(c.conversa_id, null);
});

test("/lead/<uuid> e /conversas?c=<uuid> extraem os ids", () => {
  assert.equal(interpretarContexto(`/lead/${LEAD}`).lead_id, LEAD);
  const c = interpretarContexto(`/conversas?c=${CONV}`);
  assert.equal(c.conversa_id, CONV);
  assert.equal(c.rota, "/conversas");
});

test("entrada suja nao explode: vazio, nao-URL, uuid invalido", () => {
  assert.deepEqual(interpretarContexto(null), { rota: "/", busca: null, lead_id: null, conversa_id: null });
  assert.equal(interpretarContexto("javascript:alert(1)").rota, "/");
  assert.equal(interpretarContexto("/lead/nao-e-uuid").lead_id, null);
  assert.equal(interpretarContexto("%E0%A4%A").rota, "/");
});

test("frase de contexto: filtros aparecem, ids nao", () => {
  assert.equal(fraseDoContexto(interpretarContexto("/funil?etapa=qualificado")), "Você está no funil filtrado por etapa=qualificado");
  assert.equal(fraseDoContexto(interpretarContexto(`/lead/${LEAD}`)), "Você está na ficha de um lead");
  assert.equal(fraseDoContexto(interpretarContexto("/")), "Você está no dashboard");
  assert.equal(fraseDoContexto(interpretarContexto("/coisa-desconhecida")), null);
});

test("sugestoes: 3 por tela; marketing so ve perguntas de marketing", () => {
  const funil = sugestoesPorContexto(interpretarContexto("/funil"), "membro");
  assert.equal(funil.length, 3);
  assert.ok(funil[0].includes("AGORA"));
  const lead = sugestoesPorContexto(interpretarContexto(`/lead/${LEAD}`), "membro");
  assert.equal(lead[0], "Resuma este lead");
  const mkt = sugestoesPorContexto(interpretarContexto("/funil"), "marketing");
  assert.ok(mkt.every((s) => !/conversa|tarefa/i.test(s)));
});

test("SSE: evento inteiro sai, meio evento fica no resto", () => {
  const a = lerEventosSse('data: {"tipo":"texto","delta":"oi"}\n\ndata: {"tipo":"fim","ses');
  assert.equal(a.eventos.length, 1);
  assert.deepEqual(a.eventos[0], { tipo: "texto", delta: "oi" });
  assert.equal(a.resto, 'data: {"tipo":"fim","ses');
  const b = lerEventosSse(a.resto + 'sao_id":"x","tokens":{"entrada":1,"saida":2},"duracao_ms":3,"modelo":"m"}\n\n');
  assert.equal(b.eventos.length, 1);
  assert.equal(b.eventos[0].tipo, "fim");
  assert.equal(b.resto, "");
  const c = lerEventosSse(": comentario\n\ndata: nao-e-json\n\n");
  assert.equal(c.eventos.length, 0);
});

test("rotulo humano das ferramentas", () => {
  assert.equal(rotuloFerramenta("consultar_funil"), "consultou o funil");
  assert.equal(rotuloFerramenta("outra_coisa"), "outra coisa");
});
