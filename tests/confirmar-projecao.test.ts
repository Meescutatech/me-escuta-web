import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFERENCIA,
  EXCECOES,
  MOTIVO_NAO_PROJETADO,
  acoesDeclaradas,
  avaliarProjecao,
  excecaoDe,
  motivoFalhaVerificacao,
  posicaoParaConferir,
  temConferencia,
} from "../lib/eventos/confirmar-projecao.ts";

/*
 * Read-back do limite de escrita (R15): o ledger aceitar não é sucesso — sucesso
 * é a projeção existir. O caso real que motivou isto: dispatcher sem o ramo
 * template_* aceitou `template_criado` e a UI fechou o form "com sucesso"
 * enquanto core.template_mensagem ficava intacta (verificação clicada, item 5).
 */

// ── posicaoParaConferir: quando HÁ o que conferir ────────────────────────────

test("resposta normal expõe a posicao_global para conferência", () => {
  assert.equal(
    posicaoParaConferir({ duplicado: false, evento_id: "e1", posicao_global: 42 }),
    42,
  );
});

test("duplicado:true é idempotência, não falha — nada a conferir", () => {
  assert.equal(
    posicaoParaConferir({ duplicado: true, evento_id: "e1", posicao_global: 42 }),
    null,
  );
});

test("resposta sem posicao_global (contrato antigo) não inventa falha", () => {
  assert.equal(posicaoParaConferir({ duplicado: false, evento_id: "e1" }), null);
  assert.equal(posicaoParaConferir(null), null);
  assert.equal(posicaoParaConferir(undefined), null);
});

// ── avaliarProjecao: o veredito ──────────────────────────────────────────────

test("projeção encontrada → ok", () => {
  assert.deepEqual(avaliarProjecao(true), { ok: true });
});

test("REGISTRADO MAS NÃO PROJETADO → ok:false com motivo honesto (o caso da R15)", () => {
  const r = avaliarProjecao(false);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NAO_PROJETADO);
});

test("nada a conferir (duplicado ou contrato antigo) → ok", () => {
  assert.deepEqual(avaliarProjecao(null), { ok: true });
});

// ── o fio inteiro, como a action usa ─────────────────────────────────────────

test("fio duplicado: no-op idempotente nunca chega a ler a projeção e termina ok", () => {
  const resposta = { duplicado: true, evento_id: "e9", posicao_global: 7 };
  const posicao = posicaoParaConferir(resposta);
  assert.equal(posicao, null); // a action pula a leitura
  assert.deepEqual(avaliarProjecao(null), { ok: true });
});

test("fio da colisão futura: evento aceito, leitura volta vazia, sucesso é negado", () => {
  const resposta = { duplicado: false, evento_id: "e9", posicao_global: 7 };
  const posicao = posicaoParaConferir(resposta);
  assert.equal(posicao, 7);
  const encontrou = false; // select ... where ultima_posicao = 7 → 0 linhas
  const veredito = avaliarProjecao(encontrou);
  assert.equal(veredito.ok, false);
  assert.match(veredito.motivo ?? "", /não apareceu/);
});

// ── a tabela ação → conferência, linha a linha ─────────────────────────────────────────────────
//
// Este bloco é a mitigação do risco central do F6: errar UMA linha faz a ação reportar falha em
// toda escrita bem-sucedida — pior que o defeito de hoje, porque a escrita ACONTECEU e o operador
// para de confiar na tela. Cada expectativa foi conferida contra o corpo VIVO do projetor no banco
// (`select pg_get_functiondef(oid) ...`), não contra a documentação. As duas primeiras DIVERGEM do
// que a spec da Fase 1 previa, e as duas teriam reprovado escritas corretas.

test("anotacao_adicionada confere pelo EVENTO — core.anotacao não tem coluna de posição", () => {
  const r = CONFERENCIA.anotacao_adicionada;
  assert.equal(r.tabela, "anotacao");
  assert.equal(r.por, "evento");
  assert.equal(r.por === "evento" && r.coluna, "id");
});

test("mencao_lida confere por ESTADO — o projetor tem 'and m.lida_em is null'", () => {
  const r = CONFERENCIA.mencao_lida;
  assert.equal(r.por, "estado");
  if (r.por !== "estado") return;
  assert.equal(r.tabela, "mencao");
  assert.equal(r.chave, "id");
  assert.equal(r.campoPayload, "mencao_id");
  assert.equal(r.naoNulo, "lida_em");
});

test("o ciclo de vida da tarefa confere core.tarefa.ultima_posicao", () => {
  for (const acao of [
    "tarefa_criada",
    "tarefa_concluida",
    "tarefa_reatribuida",
    "tarefa_prazo_repactuado",
    "tarefa_arquivada",
    "tarefa_assumida",
  ]) {
    const r = CONFERENCIA[acao];
    assert.ok(r, `${acao} tem de estar na tabela`);
    assert.equal(r.tabela, "tarefa", acao);
    assert.equal(r.por, "posicao", acao);
    assert.equal(r.por === "posicao" && r.coluna, "ultima_posicao", acao);
  }
});

test("cada ação aponta para a projeção que o SEU projetor escreve", () => {
  const esperado: Record<string, [string, string]> = {
    etapa_alterada: ["estado_lead", "ultima_posicao"],
    dono_atribuido: ["lead", "ultima_posicao"],
    lead_atualizado: ["lead_campo", "ultima_posicao"],
    mencao_criada: ["mencao", "ultima_posicao"],
    mencao_promovida_tarefa: ["mencao", "ultima_posicao"],
    conversa_assumida: ["conversa", "posse_posicao"],
    conversa_devolvida: ["conversa", "posse_posicao"],
  };
  for (const [acao, [tabela, coluna]] of Object.entries(esperado)) {
    const r = CONFERENCIA[acao];
    assert.ok(r, `${acao} tem de estar na tabela`);
    assert.equal(r.tabela, tabela, acao);
    assert.equal(r.por, "posicao", acao);
    assert.equal(r.por === "posicao" && r.coluna, coluna, acao);
  }
});

test("a posse da conversa tem coluna PRÓPRIA (0012), não ultima_posicao", () => {
  const r = CONFERENCIA.conversa_assumida;
  assert.equal(r.por === "posicao" && r.coluna, "posse_posicao");
});

// ── exceções: ausência DECLARADA, com motivo ───────────────────────────────────────────────────

test("enviar_mensagem_humana É conferível — a exceção que a spec previa não existe", () => {
  // Medido no projetor vivo: proj_mensagem_saida insere em core.mensagem na mesma transação,
  // id = id do evento, status_entrega='na_fila'. A bolha nasce junto; sair de fato é do sender.
  assert.equal(excecaoDe("enviar_mensagem_humana"), null);
  assert.equal(temConferencia("enviar_mensagem_humana"), true);
  const r = CONFERENCIA.enviar_mensagem_humana;
  assert.equal(r.tabela, "mensagem");
  assert.equal(r.por, "evento");
  assert.equal(r.por === "evento" && r.coluna, "id");
});

test("levindo_acionado é exceção: tipo deliberadamente sem projetor", () => {
  const e = excecaoDe("levindo_acionado");
  assert.ok(e);
  assert.match(e.motivo, /sem projetor/i);
  assert.equal(e.conferirLedger, true);
});

test("toda exceção tem motivo com substância — ausência explicada, não anotada", () => {
  for (const [acao, e] of Object.entries(EXCECOES)) {
    assert.ok(e.motivo.length > 60, `${acao}: motivo curto demais para explicar uma ausência`);
  }
});

test("nenhuma ação é ao mesmo tempo conferida e excepcionada", () => {
  for (const acao of Object.keys(EXCECOES)) {
    assert.equal(temConferencia(acao), false, `${acao} está nos dois lugares`);
  }
});

test("toda escrita da UI está DECLARADA: ou confere, ou tem exceção com motivo", () => {
  const declaradas = new Set(acoesDeclaradas());
  const escritasDaUI = [
    "anotacao_adicionada",
    "tarefa_criada",
    "tarefa_concluida",
    "tarefa_reatribuida",
    "tarefa_prazo_repactuado",
    "tarefa_arquivada",
    "mencao_criada",
    "mencao_lida",
    "mencao_promovida_tarefa",
    "lead_atualizado",
    "etapa_alterada",
    "dono_atribuido",
    "conversa_assumida",
    "conversa_devolvida",
    "enviar_mensagem_humana",
    "levindo_acionado",
  ];
  for (const acao of escritasDaUI) {
    assert.ok(declaradas.has(acao), `${acao} não está declarada — nem conferência, nem exceção`);
  }
});

test("falha de LEITURA é distinta de 'não projetou' — nunca assumir sucesso", () => {
  const m = motivoFalhaVerificacao("fetch failed");
  assert.notEqual(m, MOTIVO_NAO_PROJETADO);
  assert.match(m, /não deu para confirmar/);
  assert.match(m, /fetch failed/);
});

test("tipo desconhecido não inventa veredito nem vira exceção silenciosa", () => {
  assert.equal(temConferencia("tipo_que_nao_existe"), false);
  assert.equal(excecaoDe("tipo_que_nao_existe"), null);
});
