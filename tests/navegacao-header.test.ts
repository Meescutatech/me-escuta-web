import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ITENS_MENU_CONTA,
  PARAM_CONTEXTO_JARVIS,
  ROTA_SIGNOUT,
  hrefJarvis,
  hrefRelatarProblema,
  itensSidebar,
  linhaDepartamentos,
} from "../lib/header/navegacao.ts";
import { lerTituloDaRota } from "../lib/header/titulos.ts";

/*
 * F4 (27/08) — navegação e header. O que se prova aqui é a LISTA (o que entra, o que saiu, em que
 * ordem), o contrato `contexto` com a F9 e o menu do avatar. O que só o navegador prova (foco,
 * hover, Esc) fica no QA humano.
 */

const base = { pathname: "/funil", contFunil: 1234, contNaoLidas: 0, contVencidas: null };

test("Jarvis é o primeiro item e Dashboard o segundo", () => {
  const it = itensSidebar(base);
  assert.deepEqual(it.slice(0, 2).map((i) => [i.href, i.rotulo]), [
    ["/jarvis", "Jarvis"],
    ["/", "Dashboard"],
  ]);
});

test("Fila de validação, Configurações e Relatar problema SAÍRAM do menu", () => {
  const rotulos = itensSidebar({ ...base, verMarketing: true }).map((i) => i.rotulo);
  for (const fora of ["Fila de validação", "Configurações", "Relatar problema", "Visão geral"]) {
    assert.ok(!rotulos.includes(fora), `${fora} não pode estar no menu`);
  }
  const hrefs = itensSidebar({ ...base, verMarketing: true }).map((i) => i.href);
  assert.ok(!hrefs.some((h) => h.startsWith("/fila") || h.startsWith("/configuracoes") || h.startsWith("/suporte")));
});

test("ordem completa com marketing: Jarvis · Dashboard · Funil · Conversas · Tarefas · Marketing", () => {
  assert.deepEqual(
    itensSidebar({ ...base, verMarketing: true }).map((i) => i.rotulo),
    ["Jarvis", "Dashboard", "Funil", "Conversas", "Tarefas", "Marketing"],
  );
  assert.equal(itensSidebar(base).length, 5, "sem marketing são 5");
});

test("contadores: funil sempre que houver número; conversas/tarefas só acima de zero", () => {
  const it = itensSidebar({ pathname: "/", contFunil: 1234, contNaoLidas: 0, contVencidas: 3 });
  const por = Object.fromEntries(it.map((i) => [i.rotulo, i]));
  assert.equal(por.Funil.cont, (1234).toLocaleString("pt-BR"));
  assert.equal(por.Conversas.cont, null);
  assert.equal(por.Conversas.ponto, false);
  assert.equal(por.Tarefas.cont, "3");
  assert.equal(por.Tarefas.tom, "vermelho");
  assert.equal(por.Tarefas.ponto, true);
  assert.equal(por.Jarvis.cont, null, "Jarvis não tem badge — a badge da fila morreu com ela");
});

test("ativo: `/` só casa exato; os outros casam por prefixo", () => {
  const raiz = itensSidebar({ ...base, pathname: "/" });
  assert.equal(raiz.find((i) => i.rotulo === "Dashboard")!.ativa, true);
  const jarvis = itensSidebar({ ...base, pathname: "/jarvis?contexto=%2Ffunil" });
  assert.equal(jarvis.find((i) => i.rotulo === "Jarvis")!.ativa, true);
  assert.equal(jarvis.find((i) => i.rotulo === "Dashboard")!.ativa, false);
});

test("título da raiz acompanha o menu: Dashboard, não Visão geral", () => {
  assert.equal(lerTituloDaRota("/"), "Dashboard");
  assert.equal(lerTituloDaRota("/jarvis"), "Jarvis");
});

// ═══════════════ contrato com a F9: o parâmetro chama-se `contexto` ═══════════════

test("hrefJarvis leva pathname+search codificados no parâmetro `contexto`", () => {
  assert.equal(PARAM_CONTEXTO_JARVIS, "contexto");
  assert.equal(hrefJarvis("/funil", ""), "/jarvis?contexto=%2Ffunil");
  assert.equal(hrefJarvis("/conversas", "lead=abc&aba=x"), "/jarvis?contexto=%2Fconversas%3Flead%3Dabc%26aba%3Dx");
  assert.equal(hrefJarvis("/conversas", "?lead=abc"), "/jarvis?contexto=%2Fconversas%3Flead%3Dabc");
  assert.equal(hrefJarvis("", ""), "/jarvis?contexto=%2F");
  const url = new URL(hrefJarvis("/lead/6f0c", "aba=hist"), "http://x");
  assert.equal(url.searchParams.get("contexto"), "/lead/6f0c?aba=hist");
});

test("Relatar problema mantém o `?de=` com a rota real", () => {
  assert.equal(hrefRelatarProblema("/funil"), "/suporte?de=%2Ffunil");
});

// ═══════════════ menu do avatar ═══════════════

test("menu do avatar: Configurações e Sair, nessa ordem; Sair aponta para a rota de signout", () => {
  assert.deepEqual(
    ITENS_MENU_CONTA.map((i) => [i.rotulo, i.href]),
    [
      ["Configurações", "/configuracoes"],
      ["Sair", ROTA_SIGNOUT],
    ],
  );
  assert.equal(ROTA_SIGNOUT, "/auth/signout");
});

test("linha de departamentos: junta com ' · '; vazio explica, não fica em branco", () => {
  assert.equal(linhaDepartamentos(["Comercial", "Pós-venda"]), "Comercial · Pós-venda");
  assert.match(linhaDepartamentos([]), /Sem vínculo/);
});

// ═══════════════ o que ficou no código (a lista acima não basta se a tela ignorar) ═══════════════

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
const identidade = readFileSync(new URL("../components/header/identidade.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/header.tsx", import.meta.url), "utf8");

test("sidebar desenha a lista de `itensSidebar` e não tem mais rodapé de Sair", () => {
  assert.match(sidebar, /itensSidebar\(/);
  assert.ok(!/\/auth\/signout/.test(sidebar), "form de signout saiu da sidebar");
  assert.ok(!/rotulo:\s*"/.test(sidebar), "nenhum rótulo inline — a lista vem só de lib/header/navegacao");
});

test("menu do avatar é role=menu com menuitems, fecha com Esc e tem Configurações + Sair", () => {
  assert.match(identidade, /role="menu"/);
  assert.match(identidade, /role="menuitem"/);
  assert.match(identidade, /"Escape"/);
  assert.match(identidade, /focus-visible:ring/);
  assert.match(identidade, /ITENS_MENU_CONTA/);
  assert.match(identidade, /action=\{ROTA_SIGNOUT\}/);
  assert.match(identidade, /method="post"/);
});

test("header tem o gatilho do Jarvis ao lado do sino e o Relatar problema desta tela", () => {
  assert.match(header, /<JarvisGatilho usuarioId=\{usuarioId\} papel=\{meuPapel\} \/>/);
  assert.match(header, /<RelatarDestaTela/);
  assert.ok(header.indexOf("<JarvisGatilho") < header.indexOf("<Sino"), "Jarvis vem antes do sino");
  assert.ok(!/data-slot="jarvis"/.test(header), "o slot vazio foi ocupado");
});
