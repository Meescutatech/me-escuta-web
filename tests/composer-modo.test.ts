import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMANDOS,
  MOTIVO_TRAVA,
  despacharAoCliente,
  efeitoDoComando,
  ehModoInterno,
  menuComandos,
  podeEnviarAoCliente,
  termoComando,
  type ModoComposer,
} from "../lib/conversas/composer-modo.ts";
import type { TemplateMensagem } from "../lib/templates.ts";

/*
 * Rodada 13 / Bloco C — C1 (gatilho do `/`) e C3 (TRAVA DE ENVIO).
 * A trava é o risco nº 1 da spec: nota interna vazando para o cliente. Estes testes existem
 * para provar que a proibição vive no CAMINHO DE ENVIO, não no CSS do botão.
 */

// ═══════════ C1 — o `/` só abre menu no início do campo ═══════════

test("barra no início do campo abre o menu com todos os comandos", () => {
  assert.deepEqual(menuComandos("/"), COMANDOS);
});

test("barra no meio de uma frase é texto comum — nenhum menu", () => {
  assert.equal(termoComando("confirmar o retorno em 23/07"), null);
  assert.deepEqual(menuComandos("confirmar o retorno em 23/07"), []);
});

test("data em PT-BR digitada no começo do campo não vira comando", () => {
  // "/07 já respondi" — barra inicial, mas com espaço: é frase, não comando
  assert.equal(termoComando("/07 já respondi"), null);
  assert.deepEqual(menuComandos("/07 já respondi"), []);
});

test("o termo filtra o menu em tempo real", () => {
  assert.deepEqual(menuComandos("/no").map((c) => c.comando), ["/nota"]);
  assert.deepEqual(menuComandos("/tar").map((c) => c.comando), ["/tarefa"]);
});

test("termo que não casa com nada fecha o menu sem erro", () => {
  assert.deepEqual(menuComandos("/xyz"), []);
});

test("acento e caixa não atrapalham o filtro", () => {
  assert.deepEqual(menuComandos("/NÓ").map((c) => c.comando), ["/nota"]);
});

// ═══════════ C3 — TRAVA DE ENVIO ═══════════

const INTERNOS: ModoComposer[] = ["nota", "tarefa"];

test("em modo interno o caminho de envio NÃO chama a função que envia", () => {
  for (const modo of INTERNOS) {
    let chamadas = 0;
    const r = despacharAoCliente(modo, "isso aqui é interno", () => {
      chamadas += 1;
    });
    assert.equal(chamadas, 0, `modo ${modo} deixou o envio passar — nota interna vazaria`);
    assert.equal(r.enviado, false);
    assert.equal(r.motivo, MOTIVO_TRAVA);
  }
});

test("em modo mensagem o envio acontece normalmente, com o texto aparado", () => {
  const enviados: string[] = [];
  const r = despacharAoCliente("mensagem", "  bom dia, Maria  ", (t) => enviados.push(t));
  assert.equal(r.enviado, true);
  assert.deepEqual(enviados, ["bom dia, Maria"]);
});

test("modo mensagem com campo vazio não envia (e não é a trava)", () => {
  let chamadas = 0;
  const r = despacharAoCliente("mensagem", "   ", () => {
    chamadas += 1;
  });
  assert.equal(chamadas, 0);
  assert.equal(r.enviado, false);
  assert.notEqual(r.motivo, MOTIVO_TRAVA);
});

test("a trava vence mesmo com texto que parece mensagem de cliente", () => {
  // regressão: a decisão é do MODO, nunca do conteúdo
  let chamadas = 0;
  despacharAoCliente("nota", "Oi Maria, tudo bem?", () => {
    chamadas += 1;
  });
  assert.equal(chamadas, 0);
});

test("só o modo mensagem pode falar com o cliente", () => {
  assert.equal(podeEnviarAoCliente("mensagem"), true);
  assert.equal(podeEnviarAoCliente("nota"), false);
  assert.equal(podeEnviarAoCliente("tarefa"), false);
});

test("todo modo interno é reconhecido como interno", () => {
  assert.equal(ehModoInterno("mensagem"), false);
  for (const modo of INTERNOS) assert.equal(ehModoInterno(modo), true);
});

test("todo comando de MODO leva a um modo interno — nenhum comando de modo envia ao cliente", () => {
  for (const c of COMANDOS) {
    assert.equal(ehModoInterno(c.modo), true);
    assert.equal(podeEnviarAoCliente(c.modo), false);
  }
});

// ═══════════ T1 — templates no menu, e NENHUM comando chama a função de envio ═══════════
// (reescrita do invariante C3 para o menu com templates — exigência (a) do GO 25/07)

const TPL: TemplateMensagem = {
  id: "tpl-1",
  titulo: "Boas-vindas",
  atalho: "boas_vindas",
  corpo: "Oi {{nome}}, aqui é a {{atendente}} da Me Escuta! Podemos falar {{quando}}?",
  ativo: true,
  autor_id: null,
  atualizado_em: null,
  arquivado_em: null,
  motivo_arquivo: null,
};

test("barra sozinha lista comandos fixos E templates, nesta ordem", () => {
  const menu = menuComandos("/", [TPL]);
  assert.deepEqual(
    menu.map((c) => c.comando),
    ["/nota", "/tarefa", "/boas_vindas"],
  );
});

test("o termo filtra templates por atalho e por título, sem acento/caixa", () => {
  assert.deepEqual(menuComandos("/BOA", [TPL]).map((c) => c.comando), ["/boas_vindas"]);
  assert.deepEqual(menuComandos("/vind", [TPL]).map((c) => c.comando), ["/boas_vindas"]);
});

test("data em PT-BR continua não abrindo menu, mesmo com templates", () => {
  assert.deepEqual(menuComandos("confirmar em 23/07", [TPL]), []);
  assert.deepEqual(menuComandos("/07 já respondi", [TPL]), []);
});

test("NENHUM comando do menu chama a função de envio — modo entra em modo interno; template só escreve no rascunho", () => {
  for (const c of menuComandos("/", [TPL])) {
    const efeito = efeitoDoComando(c, { nome: "Maria", atendente: "Sara" });
    if (c.acao === "modo") {
      assert.equal(efeito.tipo, "entrar_modo");
      if (efeito.tipo === "entrar_modo") assert.equal(ehModoInterno(efeito.modo), true);
    } else {
      assert.equal(efeito.tipo, "inserir_rascunho");
    }
    // a união é exaustiva (never-check em efeitoDoComando): nada aqui envia — o único
    // caminho ao cliente segue sendo despacharAoCliente, testado acima e abaixo.
  }
});

test("escolher template substitui as variáveis com valor e deixa o resto literal e pendente", () => {
  const [cmd] = menuComandos("/boas", [TPL]);
  const efeito = efeitoDoComando(cmd, { nome: "Maria", atendente: "Sara" });
  assert.equal(efeito.tipo, "inserir_rascunho");
  if (efeito.tipo !== "inserir_rascunho") return;
  assert.equal(efeito.texto, "Oi Maria, aqui é a Sara da Me Escuta! Podemos falar {{quando}}?");
  assert.equal(efeito.templateId, "tpl-1");
  assert.deepEqual(efeito.pendentes, ["{{quando}}"]);
});

test("a trava de placeholder: texto com {{...}} pendente NÃO envia, com motivo", () => {
  let chamadas = 0;
  const r = despacharAoCliente("mensagem", "Oi {{nome}}, tudo bem?", () => {
    chamadas += 1;
  });
  assert.equal(chamadas, 0, "placeholder pendente deixou o envio passar — o cliente veria {{nome}}");
  assert.equal(r.enviado, false);
  assert.match(r.motivo ?? "", /variável sem valor/);
});

test("com as variáveis resolvidas o envio passa normalmente", () => {
  const enviados: string[] = [];
  const r = despacharAoCliente("mensagem", "Oi Maria, aqui é a Sara!", (t) => enviados.push(t));
  assert.equal(r.enviado, true);
  assert.deepEqual(enviados, ["Oi Maria, aqui é a Sara!"]);
});
