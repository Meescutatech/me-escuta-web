import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIAS,
  contarCampo,
  contarItens,
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
