import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIAS,
  contarCampo,
  contarItens,
  definicaoDoRascunho,
  exigeFaixa,
  LIMITE_BOTOES,
  LIMITE_CABECALHO,
  LIMITE_CORPO_HSM,
  LIMITE_NOME,
  LIMITE_RODAPE,
  LIMITE_TEXTO_BOTAO,
  motivoParametroInvalido,
  nomeDeTitulo,
  nomeValido,
  ordenarTemplates,
  podeEnviar,
  podeGerirTemplatesWhatsapp,
  POSICAO_DIVISORIA,
  posicionaisDe,
  preencher,
  problemasDoRascunho,
  rascunhoVazio,
  reguaDoTemplate,
  rotuloRecategorizacao,
  TETO_TEMPLATES_NAO_VERIFICADO,
  tituloLegivel,
  variaveisDaDefinicao,
  variaveisDe,
  variaveisMalFormadas,
  vereditoEnvioTemplate,
  daDefinicaoDaPorta,
  origemDoTemplate,
  paraDefinicaoDaPorta,
  placeholdersDe,
  type RascunhoTemplate,
  type StatusTemplate,
  type TemplateWhatsapp,
} from "../lib/templates-whatsapp.ts";

/*
 * SPEC-B-TEMPLATE-HSM — a lógica pura do template da Meta.
 * L1 (§8.2): contador usado/limite, âmbar em 90%, vermelho ao estourar.
 * L2 (§8 · Design tela 5): a régua com a divisória de posse.
 * L3 (§3): escrever e submeter são dois atos — o rascunho recusa ANTES da Meta.
 * VE1/VE3/VE4 (§6): o espelho local do que a porta recusa.
 */

function tpl(parcial: Partial<TemplateWhatsapp> = {}): TemplateWhatsapp {
  return {
    id: "t1",
    canal_id: "608866985643828",
    nome: "retomar_avaliacao",
    idioma: "pt_BR",
    categoria: "UTILITY",
    definicao: {
      cabecalho: "Sua avaliação auditiva",
      corpo: "Oi {{nome}}, aqui é a Me Escuta.",
      rodape: null,
      botoes: [],
      exemplos: { nome: "Maria" },
    },
    status: "aprovado",
    meta_template_id: "m1",
    motivo_status: null,
    categoria_submetida: null,
    autor_id: null,
    criado_em: null,
    atualizado_em: null,
    arquivado_em: null,
    canal_rotulo: "Pré-venda",
    ...parcial,
  };
}

function rascunho(parcial: Partial<RascunhoTemplate> = {}): RascunhoTemplate {
  return {
    ...rascunhoVazio("608866985643828"),
    nome: "retomar_avaliacao",
    corpo: "Oi {{nome}}, aqui é a Me Escuta.",
    exemplos: { nome: "Maria" },
    ...parcial,
  };
}

// ────────────────────────── L1 · contador ──────────────────────────

test("L1 · o contador mostra usado/limite, nunca 'restam N'", () => {
  const c = contarCampo("a".repeat(947), LIMITE_CORPO_HSM);
  assert.equal(c.texto, "947/1024");
  assert.equal(c.usado, 947);
  assert.equal(c.limite, 1024);
});

test("L1 · âmbar a partir de 90% do limite — o aviso chega ANTES do estouro", () => {
  // 90% de 1024 = 921.6 → o alerta começa em 922, não em 921.
  assert.equal(contarCampo("a".repeat(921), LIMITE_CORPO_HSM).estado, "ok");
  assert.equal(contarCampo("a".repeat(922), LIMITE_CORPO_HSM).estado, "perto");
  assert.equal(contarCampo("a".repeat(947), LIMITE_CORPO_HSM).estado, "perto");
});

test("L1 · vermelho só DEPOIS de passar; no limite exato ainda dá para submeter", () => {
  assert.equal(contarCampo("a".repeat(LIMITE_RODAPE), LIMITE_RODAPE).estado, "perto");
  assert.equal(contarCampo("a".repeat(LIMITE_RODAPE + 1), LIMITE_RODAPE).estado, "estourou");
  // o caso do desenho: rodapé de 63 num limite de 60
  assert.equal(contarCampo("a".repeat(63), 60).texto, "63/60");
  assert.equal(contarCampo("a".repeat(63), 60).estado, "estourou");
});

test("L1 · contagem de itens segue a mesma forma (botões)", () => {
  assert.equal(contarItens(2, LIMITE_BOTOES).texto, "2/10");
  assert.equal(contarItens(2, LIMITE_BOTOES).estado, "ok");
  assert.equal(contarItens(11, LIMITE_BOTOES).estado, "estourou");
});

// ────────────────────────── L2 · a régua ──────────────────────────

const TODOS_STATUS: StatusTemplate[] = [
  "rascunho",
  "enviando",
  "pendente",
  "aprovado",
  "recusado",
  "pausado",
  "desativado",
];

test("L2 · a régua tem sempre 4 segmentos, em todos os status", () => {
  for (const status of TODOS_STATUS) {
    const r = reguaDoTemplate({ status });
    assert.equal(r.segmentos.length, 4, `${status} deveria ter 4 segmentos`);
    assert.ok(r.rotulo.length > 0, `${status} sem rótulo`);
  }
});

test("L2 · a divisória cai depois do 2º segmento — 2 nossos, 2 da Meta", () => {
  assert.equal(POSICAO_DIVISORIA, 2);
});

test("L2 · antes da divisória o atraso é NOSSO; em análise é da META", () => {
  assert.equal(reguaDoTemplate({ status: "rascunho" }).dono, "nos");
  assert.equal(reguaDoTemplate({ status: "enviando" }).dono, "nos");
  assert.equal(reguaDoTemplate({ status: "pendente" }).dono, "meta");
  // aprovado/recusado/pausado são desfecho: ninguém está esperando nada.
  assert.equal(reguaDoTemplate({ status: "aprovado" }).dono, null);
  assert.equal(reguaDoTemplate({ status: "recusado" }).dono, null);
});

test("L2 · rascunho só acende o 1º segmento; aprovado acende os quatro", () => {
  assert.deepEqual(reguaDoTemplate({ status: "rascunho" }).segmentos, [
    "agora",
    "futuro",
    "futuro",
    "futuro",
  ]);
  assert.deepEqual(reguaDoTemplate({ status: "aprovado" }).segmentos, [
    "feito",
    "feito",
    "feito",
    "feito",
  ]);
});

test("L2 · recusado e pausado diferem no ÚLTIMO segmento — vermelho vs âmbar", () => {
  assert.equal(reguaDoTemplate({ status: "recusado" }).segmentos[3], "falhou");
  assert.equal(reguaDoTemplate({ status: "pausado" }).segmentos[3], "pausa");
});

test("§8.5 · o motivo da recusa vem CRU da Meta, sem tradução nossa", () => {
  const r = reguaDoTemplate({ status: "recusado", motivo_status: "INVALID_FORMAT" });
  assert.equal(r.detalhe, "INVALID_FORMAT");
});

test("§8.5 · o estado é do tamanho da consequência: só pausado ganha faixa", () => {
  // pausado = mensagens estão falhando AGORA sem mudança nossa. Os outros ficam na linha.
  for (const status of TODOS_STATUS) {
    assert.equal(exigeFaixa({ status }), status === "pausado", `faixa errada em ${status}`);
  }
  assert.ok(reguaDoTemplate({ status: "pausado" }).grave);
  assert.ok(!reguaDoTemplate({ status: "recusado" }).grave);
});

test("L2 · ordem da lista: quem exige ação primeiro, aprovado por último", () => {
  const ordenados = ordenarTemplates([
    tpl({ id: "a", nome: "aprovado_um", status: "aprovado" }),
    tpl({ id: "b", nome: "pausado_um", status: "pausado" }),
    tpl({ id: "c", nome: "rascunho_um", status: "rascunho" }),
  ]);
  assert.deepEqual(
    ordenados.map((t) => t.status),
    ["pausado", "rascunho", "aprovado"],
  );
});

// ────────────────────────── §8.4 · recategorização silenciosa ──────────────────────────

test("§8.4 · a tela mostra 'Marketing ← Utilidade' quando a Meta recategorizou", () => {
  const r = rotuloRecategorizacao({ categoria: "MARKETING", categoria_submetida: "UTILITY" });
  assert.equal(r.texto, "Marketing ← Utilidade");
  assert.ok(r.recategorizado);
});

test("§8.4 · sem prova de troca, o chip mostra só a categoria atual — seta errada é pior", () => {
  assert.deepEqual(rotuloRecategorizacao({ categoria: "UTILITY", categoria_submetida: null }), {
    texto: "Utilidade",
    recategorizado: false,
  });
  assert.equal(
    rotuloRecategorizacao({ categoria: "UTILITY", categoria_submetida: "UTILITY" }).recategorizado,
    false,
  );
});

test("§8.4 · toda categoria traz a consequência escrita, não só o nome", () => {
  assert.equal(CATEGORIAS.length, 3); // a Meta tem três, e só três
  for (const c of CATEGORIAS) assert.ok(c.consequencia.length > 20, `${c.chave} sem consequência`);
});

// ────────────────────────── nome e variáveis ──────────────────────────

test("nome: minúsculas, números e _ — e não passa de 512", () => {
  assert.ok(nomeValido("retomar_avaliacao"));
  assert.ok(!nomeValido("Retomar_Avaliacao"));
  assert.ok(!nomeValido("retomar avaliacao"));
  assert.ok(!nomeValido("retomar-avaliacao"));
  assert.ok(!nomeValido(""));
  assert.ok(!nomeValido("a".repeat(LIMITE_NOME + 1)));
});

test("nomeDeTitulo tira acento e vira slug — sugestão editável, não imposição", () => {
  assert.equal(nomeDeTitulo("Retomar avaliação"), "retomar_avaliacao");
  assert.equal(nomeDeTitulo("Condição especial de agosto"), "condicao_especial_de_agosto");
});

test("o título legível mora num lugar só — lista e popover não podem grafar diferente", () => {
  assert.equal(tituloLegivel("retomar_avaliacao"), "Retomar avaliacao");
  assert.equal(tituloLegivel("segunda_via_boleto"), "Segunda via boleto");
  // nome degenerado não vira string vazia na tela: o identificador cru volta como rótulo
  assert.equal(tituloLegivel("_"), "_");
  assert.equal(tituloLegivel(""), "");
});

test("variáveis nomeadas saem únicas e na ordem de leitura", () => {
  assert.deepEqual(variaveisDe("Olá {{nome}}! Sua consulta é {{data}} às {{hora}}, {{nome}}."), [
    "nome",
    "data",
    "hora",
  ]);
  assert.deepEqual(variaveisDe("sem variável nenhuma"), []);
});

test("posicional e nomeada são coisas diferentes, e a Meta não aceita as duas juntas", () => {
  assert.deepEqual(posicionaisDe("Oi {{1}}, o valor é {{2}}"), ["1", "2"]);
  const p = problemasDoRascunho(rascunho({ corpo: "Oi {{nome}}, veja {{1}}", exemplos: { nome: "Maria" } }));
  assert.ok(p.some((x) => x.mensagem.includes("não misture")));
});

test("variável mal escrita é acusada na edição, não na recusa 24h depois", () => {
  assert.deepEqual(variaveisMalFormadas("Oi {{Nome}} e {{primeiro nome}}"), [
    "{{Nome}}",
    "{{primeiro nome}}",
  ]);
  assert.deepEqual(variaveisMalFormadas("Oi {{nome}} e {{1}}"), []);
});

test("as variáveis do template somam cabeçalho + corpo, sem repetir", () => {
  assert.deepEqual(
    variaveisDaDefinicao({
      cabecalho: "Olá {{nome}}",
      corpo: "{{nome}}, sua consulta é {{data}}",
      rodape: null,
      botoes: [],
      exemplos: {},
    }),
    ["nome", "data"],
  );
});

// ────────────────────────── L3 · o que impede submeter ──────────────────────────

test("L3 · rascunho válido não tem problema nenhum", () => {
  assert.deepEqual(problemasDoRascunho(rascunho()), []);
});

test("L3 · a lista traz TODOS os problemas de uma vez, não o primeiro", () => {
  // o caso exato do desenho: rodapé estourado E exemplo faltando ⇒ "duas coisas impedem o envio"
  const p = problemasDoRascunho(
    rascunho({
      corpo: "Oi {{nome}}, sua consulta é {{data}}",
      rodape: "a".repeat(63),
      exemplos: { nome: "Maria" },
    }),
  );
  assert.equal(p.length, 2);
  assert.ok(p.some((x) => x.campo === "rodape" && x.mensagem.includes("3 caracteres")));
  assert.ok(p.some((x) => x.campo === "exemplos" && x.mensagem.includes("{{data}}")));
});

test("§9 · exemplo de variável é OBRIGATÓRIO — a Meta recusa sem ele", () => {
  const p = problemasDoRascunho(rascunho({ exemplos: {} }));
  assert.ok(p.some((x) => x.campo === "exemplos"));
  // exemplo em branco conta como ausente: espaço não é amostra
  assert.ok(problemasDoRascunho(rascunho({ exemplos: { nome: "   " } })).some((x) => x.campo === "exemplos"));
});

test("cabeçalho aceita 1 variável; rodapé, nenhuma", () => {
  assert.ok(
    problemasDoRascunho(
      rascunho({ cabecalho: "{{a}} e {{b}}", exemplos: { nome: "M", a: "1", b: "2" } }),
    ).some((x) => x.campo === "cabecalho"),
  );
  assert.ok(
    problemasDoRascunho(rascunho({ rodape: "até {{data}}", exemplos: { nome: "M", data: "hoje" } })).some(
      (x) => x.campo === "rodape",
    ),
  );
});

test("limites duros de cabeçalho e corpo entram na lista com o excedente nomeado", () => {
  const p = problemasDoRascunho(rascunho({ cabecalho: "a".repeat(LIMITE_CABECALHO + 5) }));
  assert.ok(p.some((x) => x.campo === "cabecalho" && x.mensagem.includes("5 caracteres")));
  const q = problemasDoRascunho(rascunho({ corpo: "a".repeat(LIMITE_CORPO_HSM + 1) }));
  assert.ok(q.some((x) => x.campo === "corpo" && x.mensagem.includes("1 caractere")));
});

test("botões: teto total, teto por tipo e texto de 25", () => {
  const quick = (i: number) => ({ tipo: "QUICK_REPLY" as const, texto: `b${i}` });
  assert.ok(
    problemasDoRascunho(rascunho({ botoes: Array.from({ length: 11 }, (_, i) => quick(i)) })).some(
      (x) => x.campo === "botoes",
    ),
  );
  assert.ok(
    problemasDoRascunho(
      rascunho({
        botoes: [
          { tipo: "URL", texto: "a", url: "https://x" },
          { tipo: "URL", texto: "b", url: "https://y" },
          { tipo: "URL", texto: "c", url: "https://z" },
        ],
      }),
    ).some((x) => x.mensagem.includes("botões de link")),
  );
  assert.ok(
    problemasDoRascunho(
      rascunho({ botoes: [{ tipo: "QUICK_REPLY", texto: "a".repeat(LIMITE_TEXTO_BOTAO + 1) }] }),
    ).some((x) => x.campo === "botoes"),
  );
  assert.ok(
    problemasDoRascunho(rascunho({ botoes: [{ tipo: "URL", texto: "abrir", url: "" }] })).some((x) =>
      x.mensagem.includes("sem endereço"),
    ),
  );
});

// ────────────────────────── prévia ──────────────────────────

test("§8.1 · a prévia troca a variável pelo valor e nunca inventa o que não tem", () => {
  assert.equal(preencher("Oi {{nome}}, dia {{data}}", { nome: "Maria" }), "Oi Maria, dia {{data}}");
  assert.equal(preencher("Oi {{nome}}", { nome: "  " }), "Oi {{nome}}");
});

// ────────────────────────── VE1 · o coração da spec ──────────────────────────

test("VE1 · só template APROVADO pode ser enviado", () => {
  for (const status of TODOS_STATUS) {
    assert.equal(podeEnviar(tpl({ status })), status === "aprovado", `podeEnviar errado em ${status}`);
  }
});

test("VE1 · template arquivado não sai, mesmo aprovado", () => {
  assert.ok(!podeEnviar(tpl({ status: "aprovado", arquivado_em: "2026-08-01T00:00:00Z" })));
});

test("VE1 · pendente e recusado são recusados no envio, com motivo legível", () => {
  const pendente = vereditoEnvioTemplate(tpl({ status: "pendente" }), { nome: "Maria" });
  assert.equal(pendente.pode, false);
  assert.ok(pendente.motivo?.includes("em análise na meta"));

  const recusado = vereditoEnvioTemplate(tpl({ status: "recusado" }), { nome: "Maria" });
  assert.equal(recusado.pode, false);
  assert.ok(recusado.motivo?.includes("recusado"));
});

test("VE1 · sem template escolhido, não há envio", () => {
  assert.equal(vereditoEnvioTemplate(null, {}).pode, false);
});

test("VE3/VE4 · parâmetro em branco, com quebra de linha ou 4+ espaços não passa", () => {
  assert.ok(motivoParametroInvalido("")?.includes("branco"));
  assert.ok(motivoParametroInvalido("   ")?.includes("branco"));
  assert.ok(motivoParametroInvalido("Maria\nSilva")?.includes("quebra de linha"));
  assert.ok(motivoParametroInvalido("Maria\tSilva")?.includes("quebra de linha"));
  assert.ok(motivoParametroInvalido("Maria    Silva")?.includes("espaços"));
  assert.equal(motivoParametroInvalido("Maria Silva"), null);
  assert.equal(motivoParametroInvalido("Maria   Silva"), null); // 3 espaços ainda passam
});

test("VE3/VE4 · o envio nomeia QUAL variável está errada, não 'erro ao enviar'", () => {
  const v = vereditoEnvioTemplate(tpl(), {});
  assert.equal(v.pode, false);
  assert.ok(v.motivo?.includes("{{nome}}"));
  assert.equal(vereditoEnvioTemplate(tpl(), { nome: "Maria" }).pode, true);
});

// ────────────────────────── papel e teto ──────────────────────────

test("§8.6 · criar/submeter/arquivar é admin ou owner; membro vê e usa", () => {
  assert.ok(podeGerirTemplatesWhatsapp("owner"));
  assert.ok(podeGerirTemplatesWhatsapp("admin"));
  assert.ok(!podeGerirTemplatesWhatsapp("membro"));
  assert.ok(!podeGerirTemplatesWhatsapp(null));
});

test("o teto exibido é o de portfólio NÃO verificado — que é o nosso hoje", () => {
  assert.equal(TETO_TEMPLATES_NAO_VERIFICADO, 250);
});

// ══════════════ RF-8 · a tradução TELA ↔ BANCO — sem ela, nada grava ══════════════
//
// Estes testes FALHAM contra o código sem a implementação, e é o ponto: a branch de 07/08 mandava
// a forma plana no payload, e a porta (`0117`) recusaria 100% das criações com "a definicao exige
// corpo.texto". Guarda que ninguém viu disparar é guarda ausente — aqui ela dispara.

test("RF-8 · o payload sai na forma do BANCO: corpo.texto, nunca corpo string", () => {
  const d = paraDefinicaoDaPorta(definicaoDoRascunho(rascunho()));
  assert.equal(d.corpo.texto, "Oi {{nome}}, aqui é a Me Escuta.");
  assert.deepEqual(d.corpo.exemplos, ["Maria"]);
  // o que a porta testa é `v_def ? 'cabecalho'` — chave AUSENTE, jamais null presente
  assert.ok(!("cabecalho" in d));
  assert.ok(!("rodape" in d));
});

test("RF-8 · exemplos são ARRAY POR COMPONENTE, na ordem das variáveis daquele texto", () => {
  const d = paraDefinicaoDaPorta({
    cabecalho: "Olá {{nome}}",
    corpo: "{{saudacao}}, a consulta é {{data}} às {{hora}}",
    rodape: "Me Escuta",
    botoes: [{ tipo: "URL", texto: "Abrir", url: "https://x/{{codigo}}" }],
    exemplos: { nome: "Ana", saudacao: "Bom dia", data: "12/09", hora: "14h", codigo: "abc" },
  });
  // o banco compara o tamanho do array com a contagem de variáveis DAQUELE componente (VA6)
  assert.deepEqual(d.cabecalho, { tipo: "texto", texto: "Olá {{nome}}", exemplos: ["Ana"] });
  assert.deepEqual(d.corpo.exemplos, ["Bom dia", "12/09", "14h"]);
  assert.deepEqual(d.rodape, { texto: "Me Escuta" });
  assert.deepEqual(d.botoes?.[0].exemplos, ["abc"]);
});

test("RF-8 · ida e volta devolve o rascunho original", () => {
  const original = definicaoDoRascunho(
    rascunho({
      cabecalho: "Olá {{nome}}",
      corpo: "{{nome}}, sua consulta é {{data}}",
      rodape: "Me Escuta",
      botoes: [
        { tipo: "QUICK_REPLY", texto: "Sim", url: null, telefone: null },
        { tipo: "URL", texto: "Abrir", url: "https://x/{{codigo}}", telefone: null },
      ],
      exemplos: { nome: "Ana", data: "12/09", codigo: "abc" },
    }),
  );
  const volta = daDefinicaoDaPorta(paraDefinicaoDaPorta(original));
  assert.deepEqual(volta.corpo, original.corpo);
  assert.deepEqual(volta.cabecalho, original.cabecalho);
  assert.deepEqual(volta.rodape, original.rodape);
  assert.deepEqual(volta.exemplos, original.exemplos);
  assert.deepEqual(
    volta.botoes.map((b) => ({ tipo: b.tipo, texto: b.texto, url: b.url })),
    [
      { tipo: "QUICK_REPLY", texto: "Sim", url: null },
      { tipo: "URL", texto: "Abrir", url: "https://x/{{codigo}}" },
    ],
  );
});

test("RF-8 · POSICIONAL sobrevive à ida e volta — é o caso de 323 de 323 na produção", () => {
  const plano = {
    cabecalho: null,
    corpo: "Oi {{1}}, sua parcela de {{2}} vence amanhã.",
    rodape: null,
    botoes: [],
    exemplos: { "1": "Ana", "2": "R$ 240" },
  };
  const daPorta = paraDefinicaoDaPorta(plano);
  assert.deepEqual(daPorta.corpo.exemplos, ["Ana", "R$ 240"]);
  assert.deepEqual(daDefinicaoDaPorta(daPorta).exemplos, { "1": "Ana", "2": "R$ 240" });
});

test("RF-8 · variável posicional EXIGE exemplo — senão a VA6 recusa a criação", () => {
  // sem este comportamento, um template posicional sairia com `exemplos: []` e a porta devolveria
  // "corpo tem 2 variavel(is) e 0 exemplo(s)" — que é a recusa que os 323 importados provocariam.
  assert.deepEqual(placeholdersDe("Oi {{1}}, o valor é {{2}}, {{1}}"), ["1", "2"]);
  const p = problemasDoRascunho(rascunho({ corpo: "Oi {{1}}", exemplos: {} }));
  assert.ok(p.some((x) => x.campo === "exemplos"));
});

test("RF-8 · sem valor conhecido, o exemplo vai VAZIO e o array mantém o tamanho", () => {
  // a VA6 compara CARDINALIDADE: array curto vira a recusa "N variavel(is) e M exemplo(s)", que
  // aponta para o campo errado. Quem barra o envio incompleto é `problemasDoRascunho`, não isto.
  const d = paraDefinicaoDaPorta({
    cabecalho: null,
    corpo: "Oi {{nome}}, dia {{data}}",
    rodape: null,
    botoes: [],
    exemplos: { nome: "Ana" },
  });
  assert.deepEqual(d.corpo.exemplos, ["Ana", ""]);
});

test("RF-8 (negativo) · rascunho sem corpo é recusado AQUI, antes de a porta ver", () => {
  const p = problemasDoRascunho(rascunho({ corpo: "" }));
  assert.ok(p.some((x) => x.campo === "corpo"));
});

test("RF-8 · cabeçalho de MÍDIA volta sem texto e com o tipo — nunca como título vazio", () => {
  // 28 dos 323 templates da produção têm cabeçalho IMAGE/VIDEO. Mostrá-los como cabeçalho de
  // texto em branco seria a tela afirmar que não há cabeçalho onde há.
  const d = daDefinicaoDaPorta({
    corpo: { texto: "Oi {{1}}", exemplos: ["Ana"] },
    cabecalho: { tipo: "imagem", texto: "" },
  });
  assert.equal(d.cabecalho, null);
  assert.equal(d.cabecalho_tipo, "imagem");
});

test("RF-8 · jsonb torto não derruba a tela: vira vazio, nunca inventado", () => {
  const d = daDefinicaoDaPorta({ corpo: 42, botoes: "nada", rodape: null });
  assert.equal(d.corpo, "");
  assert.deepEqual(d.botoes, []);
  assert.equal(d.rodape, null);
});

// ══════════════ RF-9.1 · a origem é derivada, sem coluna nova ══════════════

test("RF-9.1 · autor_id distingue o que nasceu aqui do que veio da Meta", () => {
  assert.equal(origemDoTemplate({ autor_id: "u1", nome: "retomar_avaliacao" }), "aqui");
  assert.equal(origemDoTemplate({ autor_id: null, nome: "retomar_avaliacao" }), "meta");
});

test("RF-9.1 · o sufixo de 6 caracteres do Kommo é o terceiro caso — 229 dos 323", () => {
  assert.equal(origemDoTemplate({ autor_id: null, nome: "rui_ts4qd9" }), "paciente");
  // template escrito aqui não vira "por paciente" só por terminar em 6 caracteres
  assert.equal(origemDoTemplate({ autor_id: "u1", nome: "rui_ts4qd9" }), "aqui");
});

/*
 * ── `cabecalho_midia`: a chave que o web não lia (C1 da revisão de 14/09) ──────────────────────
 *
 * Medido entre os dois repos: `cabecalho_midia` aparecia 10× no runtime e ZERO aqui. Cabeçalho de
 * texto e de mídia moram em chaves DIFERENTES da mesma `definicao` — o runtime os separou para que
 * a validação da porta (VA6) não precise inspecionar o de mídia. Lendo só `d.cabecalho`, os 28 dos
 * 323 templates da WABA de produção com cabeçalho IMAGE/VIDEO chegavam como "sem cabeçalho": a
 * fono escolheria um, mandaria, e a primeira notícia da mídia faltando seria a RECUSA do sender.
 */

test("cabeçalho de MÍDIA chega com o tipo certo — e não como 'sem cabeçalho'", () => {
  const d = daDefinicaoDaPorta({
    corpo: { texto: "Olá {{nome}}" },
    cabecalho_midia: { formato: "IMAGE", exemplo_handle: ["4::aW..."] },
  });
  assert.equal(d.cabecalho_tipo, "imagem");
  // texto é `null` de propósito: mídia não tem título, e uma string vazia desenharia uma linha em
  // branco onde deveria haver o selo do tipo
  assert.equal(d.cabecalho, null);
});

test("os quatro formatos de mídia da Meta traduzem, e o desconhecido não vira 'texto'", () => {
  const tipo = (formato: string) => daDefinicaoDaPorta({ corpo: { texto: "x" }, cabecalho_midia: { formato } }).cabecalho_tipo;
  assert.equal(tipo("IMAGE"), "imagem");
  assert.equal(tipo("VIDEO"), "video");
  assert.equal(tipo("DOCUMENT"), "documento");
  assert.equal(tipo("LOCATION"), "localizacao");
  // formato novo da Meta não pode cair em "texto": "sem cabeçalho" é justamente a mentira que
  // este teste existe para impedir
  assert.notEqual(tipo("STICKER_QUALQUER_COISA"), "texto");
});

test("cabeçalho de TEXTO continua exatamente como era", () => {
  const d = daDefinicaoDaPorta({
    corpo: { texto: "corpo" },
    cabecalho: { tipo: "texto", texto: "Oi {{1}}", exemplos: ["Ana"] },
  });
  assert.equal(d.cabecalho_tipo, "texto");
  assert.equal(d.cabecalho, "Oi {{1}}");
});

test("template sem cabeçalho nenhum não inventa um", () => {
  const d = daDefinicaoDaPorta({ corpo: { texto: "só corpo" } });
  assert.equal(d.cabecalho, null);
  // `undefined`, e não "texto": ausência de cabeçalho é diferente de cabeçalho de texto vazio, e o
  // construtor usa essa diferença para não desenhar um campo que o template não tem
  assert.equal(d.cabecalho_tipo, undefined);
});
