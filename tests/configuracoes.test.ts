import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO,
  autorDaVersao,
  conteudoIgual,
  contratoDe,
  estadoBotaoPublicar,
  ordenarHistorico,
  origemDaVersao,
  payloadConfigPublicada,
  podeEditarConfig,
  podePublicarConfig,
  temErro,
  validarConteudo,
  versaoResultante,
  type Conteudo,
  type VersaoHistorico,
} from "../components/configuracoes/regras/config.ts";
import {
  CHAVE_SUSPEITA,
  CONFERENCIA_WEB_B,
  EXCECOES_WEB_B,
  TIPOS_ESCRITOS_WEB_B,
  chavesSuspeitas,
  classificarErroPorta,
  excecaoWebB,
  exigeRecarregar,
  montarEnvelope,
  motivoTipoSemConferencia,
  payloadSeguro,
  regraWebB,
  resolverFiltro,
  resolverFiltros,
  tipoDeclarado,
} from "../components/configuracoes/regras/porta.ts";

/*
 * F14 (editor de configuração) + o limite de escrita das quatro telas.
 *
 * O defeito que estes testes existem para impedir é sempre o mesmo, em duas caras:
 *   · valor que passa na tela e o motor não lê (lição do contrato-followup);
 *   · escrita que entra no ledger e não projeta, com a tela dizendo "salvo" (lição da R14/R15).
 */

// ═══════════════════════ allowlist: o que a tela oferece ═══════════════════════

const EXISTENTES = [
  "canal_captacao",
  "convite",
  "demo_clara",
  "expediente",
  "ficha_lead",
  "flag.walking_skeleton",
  "funil_vendas",
  "numero_whatsapp",
  "presenca",
  "tipo_tarefa",
];

test("flag.* NUNCA aparece — é interna e muda por migration (ARB-18.3)", () => {
  const v = podeEditarConfig("flag.walking_skeleton", EXISTENTES);
  assert.equal(v.editavel, false);
  assert.match((v as { motivo: string }).motivo, /flag/i);
});

test("chave que não existe em core.config é recusada — criar chave nova é migration", () => {
  const v = podeEditarConfig("chave_inventada", EXISTENTES);
  assert.equal(v.editavel, false);
  assert.match((v as { motivo: string }).motivo, /não existe|migration/);
});

test("funil_vendas fica FORA do editor genérico — tem tela própria", () => {
  const v = podeEditarConfig("funil_vendas", EXISTENTES);
  assert.equal(v.editavel, false);
  assert.match((v as { motivo: string }).motivo, /tela própria/);
});

test("numero_whatsapp é recusada por ser NO-OP — editar não mudaria roteamento (ARB-18.2)", () => {
  const v = podeEditarConfig("numero_whatsapp", EXISTENTES);
  assert.equal(v.editavel, false);
  assert.match((v as { motivo: string }).motivo, /no-op|canal_whatsapp|Canais/i);
});

test("as configs de menor risco são editáveis pelo editor genérico", () => {
  for (const nome of ["tipo_tarefa", "expediente", "convite", "presenca", "canal_captacao", "ficha_lead"]) {
    assert.equal(podeEditarConfig(nome, EXISTENTES).editavel, true, nome);
  }
});

test("todo item do catálogo declara consequência e onde aparece", () => {
  for (const c of CATALOGO) {
    assert.ok(c.consequencia.length > 10, c.nome);
    assert.ok(c.ondeAparece.length > 0, c.nome);
    if (!c.editorGenerico) assert.ok(c.motivoForaDoEditor, `${c.nome} sem motivo`);
  }
});

// ═══════════════════════ contratos: espelho do leitor real ═══════════════════════

test("tipo_tarefa: espelha o formato que core.tipo_tarefa_valido() casa", () => {
  const bom: Conteudo = { tipos: [{ chave: "confirmar_consulta", rotulo: "Confirmar consulta", ativo: true }] };
  assert.deepEqual(validarConteudo("tipo_tarefa", bom), []);

  assert.ok(temErro(validarConteudo("tipo_tarefa", { tipos: [] })));
  assert.ok(temErro(validarConteudo("tipo_tarefa", {})));
  assert.ok(temErro(validarConteudo("tipo_tarefa", { tipos: [{ chave: "Confirmar Consulta", rotulo: "x" }] })));
  assert.ok(temErro(validarConteudo("tipo_tarefa", { tipos: [{ chave: "a", rotulo: "" }] })));
});

test("tipo_tarefa: chave repetida é erro — a segunda vira letra morta no banco", () => {
  const p = validarConteudo("tipo_tarefa", {
    tipos: [{ chave: "a", rotulo: "A" }, { chave: "a", rotulo: "B" }],
  });
  assert.ok(p.some((x) => /repetida/.test(x.motivo)));
});

test("tipo_tarefa: tirar um tipo EM USO vira aviso com o nome do que some", () => {
  const p = validarConteudo(
    "tipo_tarefa",
    { tipos: [{ chave: "pos_venda", rotulo: "Pós-venda" }] },
    { tiposTarefaEmUso: ["pos_venda", "validar_serasa"] },
  );
  const av = p.find((x) => x.gravidade === "aviso");
  assert.ok(av);
  assert.match(av!.motivo, /validar_serasa/);
  assert.ok(!temErro(p), "aviso não impede publicar");
});

test("expediente: fim antes do início é erro, e o motivo diz o efeito", () => {
  assert.deepEqual(validarConteudo("expediente", { inicio: "08:00", fim: "18:00", dias_semana: [1, 2, 3, 4, 5] }), []);
  const p = validarConteudo("expediente", { inicio: "18:00", fim: "08:00", dias_semana: [1] });
  assert.ok(temErro(p));
  assert.ok(p.some((x) => /nunca escreve|depois do início/.test(x.motivo)));
});

test("expediente: hora fora do formato e dia fora de 0..6 são recusados", () => {
  assert.ok(temErro(validarConteudo("expediente", { inicio: "8h", fim: "18:00", dias_semana: [1] })));
  assert.ok(temErro(validarConteudo("expediente", { inicio: "08:00", fim: "18:00", dias_semana: [7] })));
  assert.ok(temErro(validarConteudo("expediente", { inicio: "08:00", fim: "18:00", dias_semana: [] })));
});

test("convite: validade fora de 1..90 é erro; ligar e-mail sem DNS é aviso", () => {
  assert.deepEqual(validarConteudo("convite", { dias_validade: 7, envio_email_ativo: false }), []);
  assert.ok(temErro(validarConteudo("convite", { dias_validade: 0, envio_email_ativo: false })));
  assert.ok(temErro(validarConteudo("convite", { dias_validade: 7, envio_email_ativo: "sim" })));
  const p = validarConteudo("convite", { dias_validade: 7, envio_email_ativo: true });
  assert.ok(!temErro(p));
  assert.match(p[0].motivo, /DNS|não chegar/);
});

test("presenca: tolerância <= batimento é erro — todo batimento pontual contaria atraso", () => {
  assert.deepEqual(
    validarConteudo("presenca", { batimento_seg: 60, tolerancia_seg: 180, interacao_seg: 300 }),
    [],
  );
  assert.ok(temErro(validarConteudo("presenca", { batimento_seg: 60, tolerancia_seg: 60, interacao_seg: 300 })));
});

test("presenca: mudar batimento avisa que o front pulsa 60 s POR CÓDIGO (divergência real)", () => {
  const p = validarConteudo("presenca", { batimento_seg: 30, tolerancia_seg: 180, interacao_seg: 300 });
  assert.ok(!temErro(p));
  assert.ok(p.some((x) => /lib\/presenca\.ts|por código/i.test(x.motivo)));
});

test("presenca: interacao_seg não tem leitor — mudar avisa que não tem efeito", () => {
  const p = validarConteudo("presenca", { batimento_seg: 60, tolerancia_seg: 180, interacao_seg: 999 });
  assert.ok(p.some((x) => /não tem efeito|nenhum leitor/.test(x.motivo)));
});

test("ficha_lead: campo SEM slug é erro — o leitor o descarta em silêncio", () => {
  const bom = { grupos: [{ nome: "Principal", campos: [{ slug: "nome", rotulo: "Nome" }] }] };
  assert.deepEqual(validarConteudo("ficha_lead", bom), []);
  const p = validarConteudo("ficha_lead", { grupos: [{ nome: "P", campos: [{ rotulo: "Nome" }] }] });
  assert.ok(temErro(p));
  assert.ok(p.some((x) => /DESCARTADO em silêncio/.test(x.motivo)));
});

test("ficha_lead: campo com valor gravado que some vira aviso", () => {
  const p = validarConteudo(
    "ficha_lead",
    { grupos: [{ nome: "P", campos: [{ slug: "nome", rotulo: "Nome" }] }] },
    { slugsFichaEmUso: ["nome", "cpf"] },
  );
  assert.ok(p.some((x) => x.gravidade === "aviso" && /cpf/.test(x.motivo)));
});

test("funil_vendas: etapa EM USO que não for declarada é ERRO — é o que o banco recusa", () => {
  const p = validarConteudo(
    "funil_vendas",
    { etapas: [{ chave: "novo", nome: "Novo" }] },
    { etapasEmUso: ["novo", "arquivado"] },
  );
  assert.ok(temErro(p));
  assert.ok(p.some((x) => /arquivado/.test(x.motivo)));
});

test("funil_vendas sem a chave etapas é recusado como o banco recusa", () => {
  assert.ok(temErro(validarConteudo("funil_vendas", { colunas: [] })));
});

test("nome sem contrato não publica — a tela não valida o que não sabe validar", () => {
  assert.ok(temErro(validarConteudo("qualquer_coisa", { a: 1 })));
  assert.equal(contratoDe("qualquer_coisa"), null);
});

test("conteúdo que não é objeto é recusado antes de qualquer validador", () => {
  assert.ok(temErro(validarConteudo("expediente", [] as unknown as Conteudo)));
});

// ═══════════════════════ igual ao vigente / botão publicar ═══════════════════════

test("igualdade ignora ordem de CHAVE e respeita ordem de LISTA", () => {
  assert.ok(conteudoIgual({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(conteudoIgual({ t: [{ x: 1 }, { y: 2 }] }, { t: [{ x: 1 }, { y: 2 }] }));
  assert.ok(!conteudoIgual({ t: [1, 2] }, { t: [2, 1] })); // ordem do funil É significativa
  assert.ok(!conteudoIgual({ a: 1 }, { a: 1, b: 2 }));
});

test("igual ao vigente NÃO publica — versão nova sem mudança polui o histórico", () => {
  const r = estadoBotaoPublicar({
    papel: "admin",
    editavel: true,
    conteudo: { dias_validade: 7 },
    vigente: { dias_validade: 7 },
    problemas: [],
    justificativa: "nada",
  });
  assert.equal(r.habilitado, false);
  assert.match(r.motivo!, /nada mudou/);
});

test("membro não publica; erro no conteúdo não publica; sem justificativa não publica", () => {
  const base = { editavel: true, conteudo: { a: 1 }, vigente: { a: 2 }, problemas: [], justificativa: "mudei X" };
  assert.equal(estadoBotaoPublicar({ ...base, papel: "membro" }).habilitado, false);
  assert.equal(
    estadoBotaoPublicar({
      ...base,
      papel: "admin",
      problemas: [{ campo: "x", motivo: "y", gravidade: "erro" }],
    }).habilitado,
    false,
  );
  assert.equal(estadoBotaoPublicar({ ...base, papel: "admin", justificativa: "  " }).habilitado, false);
  assert.equal(estadoBotaoPublicar({ ...base, papel: "admin" }).habilitado, true);
});

test("aviso não impede publicar", () => {
  const r = estadoBotaoPublicar({
    papel: "owner",
    editavel: true,
    conteudo: { a: 1 },
    vigente: { a: 2 },
    problemas: [{ campo: "x", motivo: "cuidado", gravidade: "aviso" }],
    justificativa: "mudei",
  });
  assert.equal(r.habilitado, true);
});

test("papel de publicação é admin/owner", () => {
  assert.ok(podePublicarConfig("admin") && podePublicarConfig("owner"));
  assert.ok(!podePublicarConfig("membro") && !podePublicarConfig(null));
});

// ═══════════════════════ payload e versão ═══════════════════════

test("o payload manda versao_base e NÃO manda versao — quem carimba é a porta", () => {
  const p = payloadConfigPublicada({ nome: "convite", versaoBase: 1, conteudo: { a: 1 }, justificativa: "  por quê  " });
  assert.deepEqual(p, { nome: "convite", versao_base: 1, conteudo: { a: 1 }, motivo: "por quê" });
  assert.ok(!("versao" in p));
});

test("a versão resultante é a vigente + 1", () => {
  assert.equal(versaoResultante(3), 4);
});

// ═══════════════════════ histórico ═══════════════════════

function versao(p: Partial<VersaoHistorico>): VersaoHistorico {
  return {
    nome: "convite",
    versao: 1,
    payload: {},
    vigente_desde: null,
    criado_por: "seed:0035",
    evento_id: null,
    vigente: false,
    publicado_por_nome: null,
    publicado_por_email: null,
    ...p,
  };
}

test("versão de seed NÃO inventa autor — 'publicado por —' é honesto", () => {
  assert.equal(autorDaVersao(versao({})), null);
  assert.equal(origemDaVersao(versao({})), "migration_ou_script");
});

test("versão publicada pela tela mostra a pessoa", () => {
  const v = versao({ evento_id: "e1", publicado_por_nome: "Diogo", criado_por: "humano:uid" });
  assert.equal(autorDaVersao(v), "Diogo");
  assert.equal(origemDaVersao(v), "tela");
});

test("histórico sai da mais nova para a mais velha", () => {
  const h = ordenarHistorico([versao({ versao: 1 }), versao({ versao: 3 }), versao({ versao: 2 })]);
  assert.deepEqual(h.map((v) => v.versao), [3, 2, 1]);
});

// ═══════════════════════ o limite de escrita ═══════════════════════

test("conflito de versão chega como SQLSTATE 40001 — e é ele que a tela precisa reconhecer", () => {
  assert.equal(classificarErroPorta("40001"), "conflito_versao");
  assert.equal(classificarErroPorta("serialization_failure"), "conflito_versao");
  assert.ok(exigeRecarregar(classificarErroPorta("40001")));
});

test("PMEE3 é descarte ESPERADO, não falha — não retentar", () => {
  assert.equal(classificarErroPorta("PMEE3"), "descarte_esperado");
  assert.equal(classificarErroPorta("PMEE2"), "sem_bloco_conversa");
  assert.ok(!exigeRecarregar("descarte_esperado"));
});

test("papel insuficiente, recusa de conteúdo e objeto ausente são classes distintas", () => {
  assert.equal(classificarErroPorta("42501"), "permissao");
  assert.equal(classificarErroPorta("23514"), "recusa");
  assert.equal(classificarErroPorta("22023"), "recusa");
  assert.equal(classificarErroPorta("42P01"), "indisponivel");
  assert.equal(classificarErroPorta("PGRST205"), "indisponivel");
  assert.equal(classificarErroPorta(null), "outro");
  assert.equal(classificarErroPorta("XX999"), "outro");
});

test("o envelope é exatamente o que a porta espera, sem ator nem origem", () => {
  assert.deepEqual(montarEnvelope("config_publicada", "ext", { nome: "convite" }), {
    tipo: "config_publicada",
    id_externo: "ext",
    versao_payload: 1,
    payload: { nome: "convite" },
  });
});

test("a guarda antissegredo espelha a regex da porta e desce nos níveis", () => {
  assert.ok(CHAVE_SUSPEITA.test("access_token"));
  assert.ok(CHAVE_SUSPEITA.test("qr_code"));
  assert.ok(CHAVE_SUSPEITA.test("API-KEY"));
  assert.deepEqual(chavesSuspeitas({ nome: "x", dentro: { senha: 1 } }), ["dentro.senha"]);
  assert.deepEqual(chavesSuspeitas({ lista: [{ secretKey: 1 }] }), ["lista[0].secretKey"]);
  assert.ok(payloadSeguro({ nome: "convite", conteudo: { dias_validade: 7 } }).ok);
  assert.ok(!payloadSeguro({ nome: "x", token: "abc" }).ok);
});

// ═══════════ a tabela ação → conferência: FAIL-CLOSED ═══════════

test("todo tipo escrito pela Web-B tem conferência OU exceção declarada", () => {
  for (const tipo of TIPOS_ESCRITOS_WEB_B) assert.ok(tipoDeclarado(tipo), tipo);
  assert.equal(TIPOS_ESCRITOS_WEB_B.length, 10);
});

test("tipo NÃO declarado é FALHA, não sucesso — é a correção sobre o helper do F6", () => {
  assert.equal(tipoDeclarado("canal_inventado"), false);
  assert.match(motivoTipoSemConferencia("canal_inventado"), /não tem conferência/);
  assert.match(motivoTipoSemConferencia("canal_inventado"), /dispatcher/);
});

test("cada regra diz POR QUE aquela é a chave certa", () => {
  for (const [tipo, r] of Object.entries(CONFERENCIA_WEB_B)) {
    assert.ok(r.porque.length > 20, tipo);
    assert.ok(r.filtros.length > 0, tipo);
  }
});

test("ativar confere o ESTADO, não só a existência da linha", () => {
  const r = regraWebB("canal_ativado")!;
  assert.ok(r.filtros.some((f) => f.campo === "ativo" && f.op === "igual" && f.valor === true));
});

test("config_publicada confere a VERSÃO RESULTANTE (base + 1), não o nome", () => {
  const r = regraWebB("config_publicada")!;
  const filtros = resolverFiltros(r, { nome: "convite", versao_base: 3 }, null)!;
  assert.deepEqual(filtros, [
    { campo: "nome", tipo: "igual", valor: "convite" },
    { campo: "versao", tipo: "igual", valor: 4 },
  ]);
});

test("comentário de ticket confere pelo id do EVENTO (a tabela não tem posição)", () => {
  const r = regraWebB("suporte_ticket_comentado")!;
  assert.deepEqual(resolverFiltros(r, {}, "evt-1"), [{ campo: "id", tipo: "igual", valor: "evt-1" }]);
  // sem evento_id não dá para conferir — e a resolução falha em vez de conferir "qualquer linha"
  assert.equal(resolverFiltros(r, {}, null), null);
});

test("consentimento confere a COLUNA PREENCHIDA, não a linha", () => {
  const r = regraWebB("canal_consentimento_registrado")!;
  assert.deepEqual(resolverFiltros(r, { canal_id: "lite:jade" }, null), [
    { campo: "canal_id", tipo: "igual", valor: "lite:jade" },
    { campo: "consentimento_em", tipo: "naoNulo" },
  ]);
});

test("filtro sem valor derruba a conferência inteira — senão 'esta linha' vira 'qualquer linha'", () => {
  const r = regraWebB("canal_atualizado")!;
  assert.equal(resolverFiltros(r, { canal_id: "lite:jade" }, null), null); // faltou `nome`
  assert.equal(resolverFiltro({ campo: "x", op: "igualPayload", dePayload: "y" }, {}, null), null);
  assert.equal(resolverFiltro({ campo: "v", op: "igualPayloadMais1", dePayload: "b" }, { b: "3" }, null), null);
});

test("aceite_contato_registrado é exceção DECLARADA (ledger-only), com motivo", () => {
  const e = excecaoWebB("aceite_contato_registrado")!;
  assert.ok(e.conferirLedger);
  assert.match(e.motivo, /ledger-only|CONTRATO-C/);
  assert.equal(regraWebB("aceite_contato_registrado"), null);
  assert.equal(Object.keys(EXCECOES_WEB_B).length, 1);
});

// ═══ ARB-26 · a identidade do ticket nasce do EVENTO, não de um id mandado pela tela ═══

test("a abertura de ticket confere pelo evento_id — foi o portão de escrita real que pegou isto", () => {
  // A regra anterior lia `v_suporte_ticket` por `payload.ticket_id`. O projetor da 0070 crava
  // `id = evento.id` e NUNCA lê esse campo: a releitura devolvia ZERO para toda abertura
  // bem-sucedida — a tela acusaria falha em cima de uma escrita que funcionou, que é pior que o
  // defeito que o readback existe para pegar.
  const r = regraWebB("suporte_ticket_aberto")!;
  assert.deepEqual(r.filtros, [{ campo: "id", op: "igualEvento" }]);
  assert.deepEqual(resolverFiltros(r, {}, "evt-abertura"), [
    { campo: "id", tipo: "igual", valor: "evt-abertura" },
  ]);
  // sem evento_id não há como conferir — e a resolução falha em vez de conferir "qualquer linha"
  assert.equal(resolverFiltros(r, { ticket_id: "inventado" }, null), null);
  assert.match(r.porque, /ARB-26|nasce do evento/i);
});

test("nenhuma regra desta trilha confere por um id que a própria tela inventou", () => {
  // o padrão que produziu o defeito: filtrar por um campo do payload que o projetor ignora.
  // `ticket_id` só é legítimo em comentar/resolver, onde ele APONTA para um ticket que já existe.
  for (const [tipo, r] of Object.entries(CONFERENCIA_WEB_B)) {
    if (tipo === "suporte_ticket_aberto") continue;
    const porPayload = r.filtros.filter((f) => f.op === "igualPayload");
    for (const f of porPayload) {
      assert.ok(
        f.dePayload !== "ticket_id" || tipo !== "suporte_ticket_aberto",
        `${tipo} confere por um id de criação vindo do payload`,
      );
    }
  }
});
