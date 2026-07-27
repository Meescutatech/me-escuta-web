import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

/*
 * F3 · Atalho local do middleware (Trilha B, R16-05).
 *
 * Duas coisas são provadas aqui, e a segunda é a que impede o atalho de virar buraco de auth:
 *
 *  1. O middleware decide SEM tocar a rede quando o cookie de sessão está fresco, e cai no
 *     caminho completo (getUser + refresh) em todos os outros casos. A prova de "não tocou a
 *     rede" é um DUPLO no lugar do createServerClient: se o middleware o instanciar, o contador
 *     sobe. Não é inferência por tempo nem por grep.
 *
 *  2. O gate de autenticidade do `app/(app)/layout.tsx` continua ATIVO. O atalho só é seguro
 *     porque um cookie forjado morre no layout; se alguém remover aquele getUser, o atalho passa
 *     a ser uma porta aberta. Um `grep -q getUser` não protege isso — passa com a chamada
 *     comentada, ou com o retorno ignorado (achado B-5 da AUDITORIA-SPECS-FASE1). Aqui o arquivo
 *     é PARSEADO (AST do TypeScript) e se afirma que a chamada existe no componente, que o
 *     usuário é capturado, e que a ausência dele redireciona.
 *
 * O analisador do item 2 é ele mesmo verificado em três partes (ARB-07): vacuidade, controles
 * negativos que precisam ACUSAR, e a medida contra o arquivo real.
 *
 * Nota de ambiente: o ESM do node exige extensão, e o código do app importa como o bundler
 * resolve — `next/server` e `./sessao-cookie`. O hook abaixo faz essa resolução só para o teste,
 * em vez de alterar imports do código de produção por causa da suíte.
 */

registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador === "next/server") return seguinte("next/server.js", contexto);
    try {
      return seguinte(especificador, contexto);
    } catch (erro) {
      const semExtensao = especificador.startsWith(".") && !path.extname(especificador);
      if (!semExtensao) throw erro;
      return seguinte(`${especificador}.ts`, contexto);
    }
  },
});

const { NextRequest } = await import("next/server.js");
const { atualizarSessao } = await import("../lib/supabase/middleware.ts");

// ───────────────────────── ferramentas do teste ─────────────────────────

const AGORA = 1_750_000_000_000; // ms
const agoraSeg = AGORA / 1000;

const b64url = (s: string) => Buffer.from(s).toString("base64url");

function jwtFake(exp: number): string {
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub: "u1", exp }))}.assinatura`;
}

/** Valor de cookie no formato que o @supabase/ssr grava. */
function valorCookieSessao(exp: number): string {
  const json = JSON.stringify({ access_token: jwtFake(exp), refresh_token: "r", expires_at: exp });
  return `base64-${Buffer.from(json).toString("base64url")}`;
}

function requisicao(rota: string, cookies: Record<string, string> = {}, cabecalhos: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
    .join("; ");
  return new NextRequest(`https://app.local${rota}`, {
    headers: cookie ? { cookie, ...cabecalhos } : cabecalhos,
  });
}

/**
 * Duplo do cliente Supabase. Conta instanciações: o único caminho de rede do middleware é este
 * cliente, então `chamadas === 0` é a prova de que o atalho não fez round-trip.
 */
function duploDeCliente(usuario: { id: string } | null) {
  const espiao = { instanciacoes: 0, getUser: 0 };
  const criarCliente = () => {
    espiao.instanciacoes += 1;
    return {
      auth: {
        async getUser() {
          espiao.getUser += 1;
          return { data: { user: usuario } };
        },
      },
    };
  };
  return { espiao, criarCliente };
}

const ehRedirecionamento = (r: { status: number }) => r.status === 307 || r.status === 308;
const destino = (r: { headers: Headers }) => r.headers.get("location");

// ═════════════════════════ 1 · os cinco casos do atalho ═════════════════════════

describe("F3 · o middleware decide localmente quando a sessão está fresca", () => {
  test("caso 1 · cookie fresco em rota de app → segue SEM nenhuma chamada de rede", async () => {
    const { espiao, criarCliente } = duploDeCliente({ id: "u1" });
    const req = requisicao("/conversas", { "sb-abc-auth-token": valorCookieSessao(agoraSeg + 3600) });

    const resposta = await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

    assert.equal(espiao.instanciacoes, 0, "o atalho NÃO pode instanciar o cliente Supabase");
    assert.equal(espiao.getUser, 0, "o atalho NÃO pode chamar getUser");
    assert.equal(ehRedirecionamento(resposta), false, "sessão fresca em rota de app segue adiante");
    assert.equal(resposta.status, 200);
  });

  test("caso 2 · sem cookie de sessão → caminho completo, e rota de app redireciona com ?proxima", async () => {
    const { espiao, criarCliente } = duploDeCliente(null);
    const req = requisicao("/conversas");

    const resposta = await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

    assert.equal(espiao.getUser, 1, "sem cookie o caminho completo TEM de rodar");
    assert.equal(ehRedirecionamento(resposta), true);
    assert.equal(destino(resposta), "https://app.local/login?proxima=%2Fconversas");
  });

  test("caso 3 · cookie ilegível → caminho completo (NÃO é tratado como sessão válida)", async () => {
    for (const lixo of ["nao-e-json", "base64-@@@!", ""]) {
      const { espiao, criarCliente } = duploDeCliente(null);
      const req = requisicao("/funil", { "sb-abc-auth-token": lixo });

      const resposta = await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

      assert.equal(espiao.getUser, 1, `cookie ilegível (${JSON.stringify(lixo)}) tem de cair no caminho completo`);
      assert.equal(ehRedirecionamento(resposta), true);
    }
  });

  test("caso 4 · dentro da margem de 60 s → caminho completo (o refresh não se perde)", async () => {
    for (const exp of [agoraSeg + 30, agoraSeg + 59, agoraSeg - 10]) {
      const { espiao, criarCliente } = duploDeCliente({ id: "u1" });
      const req = requisicao("/conversas", { "sb-abc-auth-token": valorCookieSessao(exp) });

      await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

      assert.equal(espiao.getUser, 1, `exp em ${exp - agoraSeg}s tem de percorrer o caminho completo`);
    }
  });

  test("caso 5 · /login com sessão fresca → redireciona para /funil, ainda sem rede", async () => {
    const { espiao, criarCliente } = duploDeCliente({ id: "u1" });
    const req = requisicao("/login", { "sb-abc-auth-token": valorCookieSessao(agoraSeg + 3600) });

    const resposta = await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

    assert.equal(espiao.instanciacoes, 0, "o atalho decide o /login sem tocar a rede");
    assert.equal(ehRedirecionamento(resposta), true);
    assert.equal(destino(resposta), "https://app.local/funil");
  });
});

// ═════════════════════════ 2 · os demais critérios EARS ═════════════════════════

describe("F3 · critérios EARS restantes", () => {
  test("rota pública sem sessão responde sem redirecionar", async () => {
    for (const rota of ["/login", "/auth/callback", "/convite/abc"]) {
      const { criarCliente } = duploDeCliente(null);
      const resposta = await atualizarSessao(requisicao(rota), { criarCliente, agoraMs: AGORA });
      assert.equal(ehRedirecionamento(resposta), false, `${rota} é pública`);
    }
  });

  test("cookie fatiado em chunks fora de ordem é remontado antes de decidir", async () => {
    const valor = valorCookieSessao(agoraSeg + 3600);
    const meio = Math.ceil(valor.length / 2);
    const { espiao, criarCliente } = duploDeCliente({ id: "u1" });
    const req = requisicao("/conversas", {
      "sb-abc-auth-token.1": valor.slice(meio),
      "sb-abc-auth-token.0": valor.slice(0, meio),
    });

    const resposta = await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

    assert.equal(espiao.getUser, 0, "chunks fora de ordem ainda são sessão fresca");
    assert.equal(ehRedirecionamento(resposta), false);
  });

  test("prefetch/RSC com sessão fresca paga zero chamada de rede", async () => {
    const { espiao, criarCliente } = duploDeCliente({ id: "u1" });
    const req = requisicao(
      "/funil",
      { "sb-abc-auth-token": valorCookieSessao(agoraSeg + 3600) },
      { RSC: "1", "Next-Router-Prefetch": "1" },
    );

    await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

    assert.equal(espiao.instanciacoes, 0);
  });

  test("o relógio é o real quando não injetado (a decisão não depende do teste)", async () => {
    const { espiao, criarCliente } = duploDeCliente({ id: "u1" });
    const expDaqui1h = Math.floor(Date.now() / 1000) + 3600;
    const req = requisicao("/conversas", { "sb-abc-auth-token": valorCookieSessao(expDaqui1h) });

    await atualizarSessao(req, { criarCliente });

    assert.equal(espiao.getUser, 0);
  });

  test("com sessão fresca o cookie de sessão continua na requisição repassada", async () => {
    const valor = valorCookieSessao(agoraSeg + 3600);
    const { criarCliente } = duploDeCliente({ id: "u1" });
    const req = requisicao("/conversas", { "sb-abc-auth-token": valor });

    await atualizarSessao(req, { criarCliente, agoraMs: AGORA });

    assert.equal(req.cookies.get("sb-abc-auth-token")?.value, valor, "o atalho não pode comer o cookie");
  });
});

// ═════════════ 3 · o gate do layout — teste-guarda por AST (correção B-5) ═════════════

/**
 * Lê o gate de autenticidade do layout do shell autenticado. Não é grep: o arquivo é parseado, e
 * cada uma das três afirmações é sobre a ÁRVORE — código comentado não existe na árvore, e chamada
 * com retorno descartado não produz o binding.
 */
export function analisarGateDeAuth(fonte: string) {
  const arquivo = ts.createSourceFile("layout.tsx", fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const componente = acharComponentePadrao(arquivo);
  const resultado = { chamaGetUser: false, capturaUsuario: false, barraSemUsuario: false, nomeDoUsuario: "" };
  if (!componente) return resultado;

  // (a) existe `<algo>.auth.getUser()` dentro do componente exportado default?
  const chamadas: ts.CallExpression[] = [];
  percorrer(componente, (no) => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      no.expression.name.text === "getUser" &&
      ts.isPropertyAccessExpression(no.expression.expression) &&
      no.expression.expression.name.text === "auth"
    ) {
      chamadas.push(no);
    }
  });
  resultado.chamaGetUser = chamadas.length > 0;
  if (chamadas.length === 0) return resultado;

  // (b) o retorno é aguardado e desestruturado até um identificador de usuário?
  for (const chamada of chamadas) {
    const espera = chamada.parent;
    if (!espera || !ts.isAwaitExpression(espera)) continue;
    const declaracao = espera.parent;
    if (!declaracao || !ts.isVariableDeclaration(declaracao)) continue;
    const nome = nomeDoUsuarioNoBinding(declaracao.name);
    if (nome) {
      resultado.capturaUsuario = true;
      resultado.nomeDoUsuario = nome;
      break;
    }
  }
  if (!resultado.capturaUsuario) return resultado;

  // (c) a ausência do usuário interrompe a renderização (redirect)?
  percorrer(componente, (no) => {
    if (!ts.isIfStatement(no)) return;
    const cond = no.expression;
    const negaUsuario =
      ts.isPrefixUnaryExpression(cond) &&
      cond.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isIdentifier(cond.operand) &&
      cond.operand.text === resultado.nomeDoUsuario;
    if (!negaUsuario) return;
    let redireciona = false;
    percorrer(no.thenStatement, (interno) => {
      if (ts.isCallExpression(interno) && ts.isIdentifier(interno.expression) && interno.expression.text === "redirect") {
        redireciona = true;
      }
    });
    if (redireciona) resultado.barraSemUsuario = true;
  });

  return resultado;
}

function percorrer(no: ts.Node, visitar: (no: ts.Node) => void) {
  visitar(no);
  no.forEachChild((filho) => percorrer(filho, visitar));
}

function acharComponentePadrao(arquivo: ts.SourceFile): ts.Node | null {
  let achado: ts.Node | null = null;
  for (const declaracao of arquivo.statements) {
    const modificadores = ts.canHaveModifiers(declaracao) ? (ts.getModifiers(declaracao) ?? []) : [];
    const exportado = modificadores.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const padrao = modificadores.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(declaracao) && exportado && padrao && declaracao.body) achado = declaracao.body;
    if (ts.isExportAssignment(declaracao)) achado = declaracao.expression;
  }
  return achado;
}

/** Em `const { data: { user } } = …` devolve "user"; em `const { data } = …` devolve null. */
function nomeDoUsuarioNoBinding(nome: ts.BindingName): string | null {
  if (!ts.isObjectBindingPattern(nome)) return null;
  for (const elemento of nome.elements) {
    const chave = elemento.propertyName ?? elemento.name;
    const nomeDaChave = ts.isIdentifier(chave) ? chave.text : "";
    if (nomeDaChave === "user" && ts.isIdentifier(elemento.name)) return elemento.name.text;
    if (ts.isObjectBindingPattern(elemento.name)) {
      const aninhado = nomeDoUsuarioNoBinding(elemento.name);
      if (aninhado) return aninhado;
    }
  }
  return null;
}

const RAIZ = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CAMINHO_DO_LAYOUT = path.join(RAIZ, "app", "(app)", "layout.tsx");

describe("F3 · guarda: o gate de autenticidade do layout continua ativo", () => {
  // ── parte 1 de 3 · vacuidade: o analisador não aprova o vazio ──
  test("vacuidade · fonte vazia ou sem componente NÃO passa", () => {
    for (const fonte of ["", "// só um comentário", "const x = 1;", "export function Outra() { return null; }"]) {
      const r = analisarGateDeAuth(fonte);
      assert.equal(r.chamaGetUser, false, JSON.stringify(fonte));
      assert.equal(r.barraSemUsuario, false, JSON.stringify(fonte));
    }
  });

  // ── parte 2 de 3 · controles negativos: cada defeito plantado tem de ser ACUSADO ──
  test("controle negativo A · getUser COMENTADO é acusado (o que o grep deixaria passar)", () => {
    const fonte = `
      export default async function AppLayout() {
        const supabase = criarClienteServidor();
        // const { data: { user } } = await supabase.auth.getUser();
        const user = { id: "qualquer" };
        if (!user) redirect("/login");
        return null;
      }`;
    const r = analisarGateDeAuth(fonte);
    assert.equal(r.chamaGetUser, false, "chamada comentada não pode contar como gate");
  });

  test("controle negativo B · getUser chamado com o retorno DESCARTADO é acusado", () => {
    const fonte = `
      export default async function AppLayout() {
        const supabase = criarClienteServidor();
        await supabase.auth.getUser();
        if (!user) redirect("/login");
        return null;
      }`;
    const r = analisarGateDeAuth(fonte);
    assert.equal(r.chamaGetUser, true, "a chamada existe…");
    assert.equal(r.capturaUsuario, false, "…mas o usuário não é capturado — não é gate");
  });

  test("controle negativo C · captura o usuário mas NÃO barra a ausência dele", () => {
    const fonte = `
      export default async function AppLayout() {
        const supabase = criarClienteServidor();
        const { data: { user } } = await supabase.auth.getUser();
        return <div>{user?.email}</div>;
      }`;
    const r = analisarGateDeAuth(fonte);
    assert.equal(r.capturaUsuario, true);
    assert.equal(r.barraSemUsuario, false, "sem redirect não há gate");
  });

  test("controle negativo D · o redirect existe mas está preso a OUTRA condição", () => {
    const fonte = `
      export default async function AppLayout() {
        const supabase = criarClienteServidor();
        const { data: { user } } = await supabase.auth.getUser();
        if (!contadores) redirect("/login");
        return null;
      }`;
    const r = analisarGateDeAuth(fonte);
    assert.equal(r.barraSemUsuario, false, "a guarda tem de negar o USUÁRIO, não outra coisa");
  });

  test("o analisador aprova as duas formas legítimas (com e sem bloco)", () => {
    const corpo = (gate: string) => `
      export default async function AppLayout() {
        const supabase = criarClienteServidor();
        const { data: { user } } = await supabase.auth.getUser();
        ${gate}
        return null;
      }`;
    assert.equal(analisarGateDeAuth(corpo('if (!user) redirect("/login");')).barraSemUsuario, true);
    assert.equal(analisarGateDeAuth(corpo('if (!user) { redirect("/login"); }')).barraSemUsuario, true);
  });

  // ── parte 3 de 3 · a medida: o arquivo real de produção ──
  test("medida · app/(app)/layout.tsx chama getUser, captura o usuário e barra a ausência dele", () => {
    const fonte = readFileSync(CAMINHO_DO_LAYOUT, "utf8");
    const r = analisarGateDeAuth(fonte);

    assert.equal(r.chamaGetUser, true, "o layout PRECISA chamar supabase.auth.getUser()");
    assert.equal(r.capturaUsuario, true, "o retorno do getUser PRECISA ser capturado");
    assert.equal(
      r.barraSemUsuario,
      true,
      "sem usuário o layout PRECISA redirecionar — é o que faz o cookie forjado morrer aqui",
    );
  });
});
