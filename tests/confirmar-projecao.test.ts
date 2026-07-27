import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFERENCIA,
  EXCECOES,
  MOTIVO_NAO_PROJETADO,
  acoesDeclaradas,
  avaliarProjecao,
  confirmarProjecao,
  excecaoDe,
  motivoAcaoNaoDeclarada,
  motivoFalhaVerificacao,
  posicaoParaConferir,
  resolverFiltro,
  resolverFiltros,
  temConferencia,
  type ConferenciaProjecao,
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

/*
 * FAIL-CLOSED para ação não declarada (achado do Agent 2, R16-23).
 * A versão anterior devolvia {ok:true} para tipo fora do mapa — o defeito do F6 reintroduzido pela
 * porta dos fundos, e justamente nos tipos que estreiam (canal_*, config_publicada, suporte_*),
 * que a prova estática do portão não alcança porque ela só varre os arquivos desta trilha.
 */

test("ação fora do mapa NÃO é sucesso — e o motivo nomeia a ação", () => {
  assert.equal(temConferencia("canal_publicado"), false);
  assert.equal(excecaoDe("canal_publicado"), null);
  const m = motivoAcaoNaoDeclarada("canal_publicado");
  assert.match(m, /canal_publicado/, "quem for consertar precisa saber QUAL ação");
  assert.match(m, /não repita/, "a escrita aconteceu: repetir cria evento duplicado");
  assert.notEqual(m, MOTIVO_NAO_PROJETADO, "é falha de declaração, não de projeção");
});

test("tipo que ninguém declarou reprova — é a razão de ser do fail-closed", () => {
  // Este teste já listou `config_publicada` e `suporte_ticket_aberto` como não-declarados. Eles
  // PASSARAM a ser declarados no enxerto do ARB-28-bis, e é assim que tinha de ser: o fail-closed
  // nunca foi contra esses tipos, foi contra a AUSÊNCIA de declaração. O que ele protege é o tipo
  // que estreia sem ninguém dizer como se confere — então é isso que o teste fixa agora.
  for (const acao of ["canal_publicado", "tipo_que_ninguem_declarou", "suporte_ticket_arquivado"]) {
    assert.equal(temConferencia(acao), false, acao);
    assert.equal(excecaoDe(acao), null, acao);
  }
});

test("as ações que a UI já emite continuam declaradas — fail-closed não quebra caminho vivo", () => {
  // as três emitidas por variável (construirReatribuicao/Repactuacao/Arquivamento), que a prova
  // estática do portão NÃO vê, porque lá o tipo não é literal
  for (const acao of ["tarefa_reatribuida", "tarefa_prazo_repactuado", "tarefa_arquivada"]) {
    assert.ok(temConferencia(acao), `${acao} emitida por variável e precisa estar no mapa`);
  }
});

test("confirmarProjecao: ação desconhecida reprova SEM tocar no banco (o ramo é decidido antes)", async () => {
  // cliente-sentinela: qualquer leitura aqui é erro de desenho, e o teste explode dizendo isso.
  const proibido = {
    schema() {
      throw new Error("ação desconhecida não pode chegar a consultar o banco");
    },
  } as never;
  const r = await confirmarProjecao(proibido, "acao_que_ninguem_declarou", {}, {
    evento_id: "e1",
    posicao_global: 7,
  });
  assert.equal(r.ok, false, "fail-closed: sucesso aqui é o defeito do F6 pela porta dos fundos");
  assert.match(r.motivo ?? "", /acao_que_ninguem_declarou/);
});

test("confirmarProjecao: exceção declarada sem evento_id passa sem tocar no banco", async () => {
  const proibido = {
    schema() {
      throw new Error("não deveria consultar");
    },
  } as never;
  const r = await confirmarProjecao(proibido, "levindo_acionado", {}, null);
  assert.deepEqual(r, { ok: true });
});

/*
 * ═══════════ ENXERTO ARB-28-bis · modo `filtros` + as 10 linhas das telas B ═══════════
 *
 * O arquivo é meu (Agent 1) e o fail-closed é a base; o modo `filtros`, o resolvedor puro e as dez
 * linhas vêm de web-b @ dde4d3c, onde o Agent 2 mostrou que os três modos existentes não expressam
 * as regras dele — as views das telas B não trazem `ultima_posicao`, então a conferência é pelo
 * EFEITO ESPERADO. Espremer isso nos modos antigos teria enfraquecido o readback EM SILÊNCIO para
 * "a linha existe" (linha que já existia antes da ação).
 *
 * Estes testes vieram junto com o dado, adaptados só no que dependia de arquivos da web-b que não
 * existem nesta branch: a lista dos 10 tipos é declarada aqui em vez de importada.
 */

/** Os 10 tipos que a Web-B escreve (a lista viva mora em components/configuracoes/regras/porta.ts). */
const TIPOS_ESCRITOS_WEB_B = [
  "canal_registrado",
  "canal_atualizado",
  "canal_ativado",
  "canal_desativado",
  "canal_consentimento_registrado",
  "config_publicada",
  "suporte_ticket_aberto",
  "suporte_ticket_comentado",
  "suporte_ticket_resolvido",
  "aceite_contato_registrado",
];

function regraWebB(tipo: string): Extract<ConferenciaProjecao, { por: "filtros" }> {
  const r = CONFERENCIA[tipo];
  assert.ok(r && r.por === "filtros", `${tipo} deveria conferir por filtros`);
  return r as Extract<ConferenciaProjecao, { por: "filtros" }>;
}

test("enxerto · todo tipo escrito pela Web-B tem conferência OU exceção declarada", () => {
  for (const tipo of TIPOS_ESCRITOS_WEB_B) {
    assert.ok(temConferencia(tipo) || excecaoDe(tipo), tipo);
  }
  assert.equal(TIPOS_ESCRITOS_WEB_B.length, 10);
});

test("enxerto · o fail-closed NÃO atinge as 10: com a linha na tabela, elas são conhecidas", () => {
  // é o ponto do ARB-28-bis: não há choque entre o fail-closed e as linhas da web-b
  for (const tipo of TIPOS_ESCRITOS_WEB_B) {
    assert.notEqual(
      temConferencia(tipo) || excecaoDe(tipo) !== null,
      false,
      `${tipo} cairia no fail-closed`,
    );
  }
});

test("enxerto · toda regra das telas B confere por EFEITO, nunca só pela existência da linha", () => {
  for (const tipo of TIPOS_ESCRITOS_WEB_B) {
    if (excecaoDe(tipo)) continue;
    const r = regraWebB(tipo);
    assert.ok(r.filtros.length > 0, tipo);
    assert.ok(r.tabela.length > 0, tipo);
  }
});

test("enxerto · ativar confere o ESTADO, não só a existência da linha", () => {
  const r = regraWebB("canal_ativado");
  assert.ok(r.filtros.some((f) => f.campo === "ativo" && f.op === "igual" && f.valor === true));
});

test("enxerto · config_publicada confere a VERSÃO RESULTANTE (base + 1), não o nome", () => {
  const r = regraWebB("config_publicada");
  assert.deepEqual(resolverFiltros(r.filtros, { nome: "convite", versao_base: 3 }, null), [
    { campo: "nome", tipo: "igual", valor: "convite" },
    { campo: "versao", tipo: "igual", valor: 4 },
  ]);
});

test("enxerto · comentário de ticket confere pelo id do EVENTO (a tabela não tem posição)", () => {
  const r = regraWebB("suporte_ticket_comentado");
  assert.deepEqual(resolverFiltros(r.filtros, {}, "evt-1"), [
    { campo: "id", tipo: "igual", valor: "evt-1" },
  ]);
  assert.equal(resolverFiltros(r.filtros, {}, null), null);
});

test("enxerto · consentimento confere a COLUNA PREENCHIDA, não a linha", () => {
  const r = regraWebB("canal_consentimento_registrado");
  assert.deepEqual(resolverFiltros(r.filtros, { canal_id: "lite:jade" }, null), [
    { campo: "canal_id", tipo: "igual", valor: "lite:jade" },
    { campo: "consentimento_em", tipo: "naoNulo" },
  ]);
});

test("enxerto · filtro sem valor derruba a conferência — senão 'esta linha' vira 'qualquer linha'", () => {
  const r = regraWebB("canal_atualizado");
  assert.equal(resolverFiltros(r.filtros, { canal_id: "lite:jade" }, null), null); // faltou `nome`
  assert.equal(resolverFiltro({ campo: "x", op: "igualPayload", dePayload: "y" }, {}, null), null);
  assert.equal(
    resolverFiltro({ campo: "v", op: "igualPayloadMais1", dePayload: "b" }, { b: "3" }, null),
    null,
  );
});

test("enxerto · ARB-26: a abertura de ticket confere pelo evento_id, não por id da tela", () => {
  // A regra anterior lia `v_suporte_ticket` por `payload.ticket_id`. O projetor da 0070 crava
  // `id = evento.id` e NUNCA lê esse campo: a releitura devolvia ZERO para toda abertura
  // bem-sucedida — a tela acusaria falha em cima de escrita que funcionou, que é pior que o
  // defeito que o readback existe para pegar. Foi o portão de escrita real que pegou isto.
  const r = regraWebB("suporte_ticket_aberto");
  assert.deepEqual(r.filtros, [{ campo: "id", op: "igualEvento" }]);
  assert.deepEqual(resolverFiltros(r.filtros, {}, "evt-abertura"), [
    { campo: "id", tipo: "igual", valor: "evt-abertura" },
  ]);
  assert.equal(resolverFiltros(r.filtros, { ticket_id: "inventado" }, null), null);
});

test("enxerto · aceite_contato_registrado é exceção DECLARADA (ledger-only), com motivo", () => {
  const e = excecaoDe("aceite_contato_registrado")!;
  assert.ok(e.conferirLedger);
  assert.match(e.motivo, /Ledger-only|CONTRATO-C/);
  assert.ok(!temConferencia("aceite_contato_registrado"));
  // duas exceções: a da web-b (ledger-only por desenho) e levindo_acionado (só no ledger, para o
  // runtime consumir). Ambas com motivo escrito — ausência de conferência nunca por esquecimento.
  assert.equal(Object.keys(EXCECOES).length, 2);
  for (const [tipo, ex] of Object.entries(EXCECOES)) assert.ok(ex.motivo.length > 40, tipo);
});

test("enxerto · modo filtros monta a releitura com todos os filtros, e falha se faltar dado", async () => {
  const chamadas: Array<{ campo: string; valor: unknown; tipo: string }> = [];
  const consulta: any = {
    eq(campo: string, valor: unknown) {
      chamadas.push({ campo, valor, tipo: "eq" });
      return consulta;
    },
    not(campo: string, _op: string, valor: unknown) {
      chamadas.push({ campo, valor, tipo: "not" });
      return consulta;
    },
    limit: async () => ({ data: [{ ativo: true }], error: null }),
  };
  const cliente = {
    schema: () => ({ from: () => ({ select: () => consulta }) }),
  } as never;

  const ok = await confirmarProjecao(cliente, "canal_ativado", { canal_id: "lite:jade" }, {
    evento_id: "e1",
    posicao_global: 9,
  });
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(chamadas, [
    { campo: "canal_id", valor: "lite:jade", tipo: "eq" },
    { campo: "ativo", valor: true, tipo: "eq" },
  ]);

  // faltou `canal_id` no payload: reprova em vez de conferir "qualquer linha"
  const semDado = await confirmarProjecao(cliente, "canal_ativado", {}, { evento_id: "e1" });
  assert.equal(semDado.ok, false);
  assert.match(semDado.motivo ?? "", /faltou dado/);
});
