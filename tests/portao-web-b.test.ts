import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ARQUIVO_ESCRITA,
  ENV_SEGREDO_PERMITIDO,
  ESCRITA_SEM_READBACK_HERDADA,
  PORTAO_CAMINHO_ANEXO,
  PORTAO_CONTRASTE,
  PORTAO_CLIENTE,
  PORTAO_FRONTEIRA,
  PORTAO_PAPEL,
  PORTAO_READBACK,
  PORTAO_SEGREDO,
  PORTAO_TIPOS_DECLARADOS,
  PORTAO_TOKEN_NA_UI,
  PORTOES,
  avaliarTodos,
  formatarViolacoes,
  type Arquivo,
} from "../components/configuracoes/regras/portao.ts";

/*
 * OS PORTÕES DE SEGURANÇA DA WEB-B — correção do E-5 da auditoria ("os três portões provam
 * compilação e uma função pura, e nenhum critério de segurança").
 *
 * Cada portão é exercido nos DOIS SENTIDOS, no mesmo arquivo de teste:
 *   · APROVA sobre os arquivos REAIS da trilha, lidos do disco agora;
 *   · REPROVA sobre um arquivo sintético que viola exatamente aquela regra.
 *
 * O segundo é o que impede o portão de virar decoração. Portão que nunca se viu reprovando não
 * prova nada — e verde decorativo é pior que portão nenhum, porque dá confiança.
 */

const RAIZ = new URL("..", import.meta.url).pathname;

const PASTAS_DA_TRILHA = [
  "app/(app)/configuracoes",
  // M5 (R18): o suporte SAIU de baixo de /configuracoes e virou rota de primeiro nível. Sem esta
  // linha, `app/(app)/suporte/actions.ts` some do conjunto varrido — e a suíte fica VERDE, porque
  // `varrer()` engole pasta inexistente com `catch { return acc }`. Medido no momento do move:
  //   arquivos varridos em 4af84bd .......... 37   (com suporte/actions.ts)
  //   arquivos varridos logo após o move .... 35   (sem ele)
  //   `node --test tests/portao-web-b.test.ts` ..... 29 pass, 0 fail   ← o portão cego, verde
  // O portão que ficou cego é o CAMINHO_ANEXO, que guarda o contrato `<uid>/` de que a RLS do
  // bucket depende. Registrado em E-110.
  "app/(app)/suporte",
  "components/configuracoes",
  "components/suporte",
];

function varrer(dir: string, acc: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entradas) {
    const caminho = join(dir, e);
    if (statSync(caminho).isDirectory()) varrer(caminho, acc);
    else if (/\.(ts|tsx)$/.test(e)) acc.push(caminho);
  }
  return acc;
}

/** Os arquivos REAIS da trilha, agora. Nada de fixture: o portão mede o que existe. */
function arquivosDaTrilha(): Arquivo[] {
  const achados: Arquivo[] = [];
  for (const pasta of PASTAS_DA_TRILHA) {
    for (const abs of varrer(join(RAIZ, pasta))) {
      achados.push({ caminho: relative(RAIZ, abs), conteudo: readFileSync(abs, "utf8") });
    }
  }
  return achados;
}

const REAIS = arquivosDaTrilha();

// ═══════════════════════ o sentido que APROVA ═══════════════════════

test("a varredura encontra os arquivos da trilha — portão sobre lista vazia prova nada", () => {
  assert.ok(REAIS.length >= 10, `só ${REAIS.length} arquivos varridos`);
  const nomes = REAIS.map((a) => a.caminho);
  assert.ok(nomes.includes(ARQUIVO_ESCRITA), "o ponto único de escrita tem de existir");
  assert.ok(nomes.some((n) => n.endsWith("regras/canais.ts")));
  assert.ok(nomes.some((n) => n.endsWith("regras/suporte.ts")));
  assert.ok(nomes.some((n) => n.endsWith("canais/actions.ts")));
});

/*
 * INVARIANTE QUE RECUPERA A PROTEÇÃO (E-110, e MÉTODO §5: trocar a régua remove um alarme).
 *
 * Acrescentar `app/(app)/suporte` à lista acima conserta ESTE move. Não conserta o PRÓXIMO: a
 * varredura é por PASTA, e um arquivo que muda de pasta sai do conjunto em silêncio, porque
 * `varrer()` trata pasta inexistente como zero arquivos — que é indistinguível de "a pasta está
 * vazia" e de "a pasta nunca existiu".
 *
 * A defesa não é lembrar de editar a lista: é ancorar o portão nos ARQUIVOS que ele existe para
 * proteger, por nome, onde quer que eles morem. Se um deles sair do conjunto, isto fica VERMELHO
 * e diz o que fazer — em vez de o portão inteiro ficar verde sobre um arquivo a menos.
 */
const ARQUIVOS_QUE_O_PORTAO_PROTEGE = [
  { fim: "suporte/actions.ts", porque: "monta o caminho `<uid>/` de que a RLS do bucket depende (CAMINHO_ANEXO)" },
  { fim: "canais/actions.ts", porque: "escreve canal, e é onde o readback foi exigido" },
  { fim: "regras/suporte.ts", porque: "é a única forma de montar caminho de anexo nesta trilha" },
  { fim: "regras/canais.ts", porque: "define Papel e a validação de canal" },
];

test("os arquivos que os portões existem para proteger continuam DENTRO do conjunto varrido", () => {
  const nomes = REAIS.map((a) => a.caminho);
  for (const { fim, porque } of ARQUIVOS_QUE_O_PORTAO_PROTEGE) {
    assert.ok(
      nomes.some((n) => n.endsWith(fim)),
      `${fim} saiu da varredura — os portões passam a dar VERDE sem olhar para ele. ` +
        `Ele ${porque}. Se o arquivo mudou de pasta, acrescente a pasta em PASTAS_DA_TRILHA; ` +
        `se foi removido de propósito, tire-o desta lista NO MESMO commit.`,
    );
  }
});

test("TODOS os portões aprovam os arquivos reais da Web-B", () => {
  const v = avaliarTodos(REAIS);
  assert.deepEqual(v, [], `\n${formatarViolacoes(v)}`);
});

test("cada portão declara o que prova", () => {
  for (const p of PORTOES) {
    assert.ok(p.prova.length > 20, p.nome);
  }
  assert.equal(PORTOES.length, 9);
});

// ═══════════════════════ o sentido que REPROVA ═══════════════════════

function arq(caminho: string, conteudo: string): Arquivo[] {
  return [{ caminho, conteudo }];
}

test("SEGREDO reprova env secreta não declarada", () => {
  const v = PORTAO_SEGREDO.avaliar(
    arq("components/configuracoes/dados/x.ts", 'const t = process.env.UAZAPI_INSTANCE_TOKEN;'),
  );
  assert.equal(v.length, 1);
  assert.match(v[0].motivo, /não declarada/);
  assert.equal(v[0].linha, 1);
});

test("SEGREDO reprova segredo em NEXT_PUBLIC_ (vai inteiro para o browser)", () => {
  const v = PORTAO_SEGREDO.avaliar(
    arq("components/configuracoes/x.tsx", 'const t = process.env.NEXT_PUBLIC_RUNTIME_TOKEN;'),
  );
  assert.ok(v.some((x) => /NEXT_PUBLIC/.test(x.motivo)));
});

test("SEGREDO reprova credencial literal embutida (JWT, token da Graph, chave longa)", () => {
  const casos: [string, RegExp][] = [
    ['const a = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc";', /JWT/],
    ['const b = "EAAGm0PX4ZCpsBA1234567890abcdefghij";', /Graph/],
    ['const c = "0123456789abcdef0123456789abcdef01234567";', /hex/],
  ];
  for (const [linha, esperado] of casos) {
    const v = PORTAO_SEGREDO.avaliar(arq("components/configuracoes/x.ts", linha));
    assert.ok(v.some((x) => esperado.test(x.motivo)), linha);
  }
});

test("SEGREDO aprova a env DECLARADA — a allowlist é a lista, não a ausência de regra", () => {
  assert.deepEqual(
    PORTAO_SEGREDO.avaliar(arq("components/configuracoes/dados/x.ts", "const t = process.env.RUNTIME_LITE_TOKEN;")),
    [],
  );
  assert.ok(Object.keys(ENV_SEGREDO_PERMITIDO).length >= 1);
  for (const motivo of Object.values(ENV_SEGREDO_PERMITIDO)) assert.ok(motivo.length > 20);
});

test("CLIENTE reprova componente client lendo process.env", () => {
  const v = PORTAO_CLIENTE.avaliar(
    arq("components/configuracoes/painel.tsx", '"use client";\nconst t = process.env.QUALQUER;'),
  );
  assert.ok(v.some((x) => /process\.env/.test(x.motivo)));
});

test("CLIENTE reprova componente client importando módulo de dados (arrasta o servidor junto)", () => {
  const v = PORTAO_CLIENTE.avaliar(
    arq("components/configuracoes/painel.tsx", '"use client";\nimport { lerCanais } from "../dados/canais";'),
  );
  assert.ok(v.some((x) => /módulo de dados/.test(x.motivo)));
});

test("CLIENTE não incomoda o servidor — a mesma linha num arquivo sem 'use client' passa", () => {
  assert.deepEqual(
    PORTAO_CLIENTE.avaliar(arq("components/configuracoes/dados/x.ts", 'import { a } from "../dados/canais";')),
    [],
  );
});

test("READBACK reprova chamada a registrar_evento fora do ponto único", () => {
  const v = PORTAO_READBACK.avaliar([
    { caminho: ARQUIVO_ESCRITA, conteudo: "conferir confirmarProjecao" },
    {
      caminho: "app/(app)/configuracoes/canais/actions.ts",
      conteudo: 'await supabase.schema("api").rpc("registrar_evento", { p });',
    },
  ]);
  assert.equal(v.length, 1);
  assert.match(v[0].motivo, /ponto único/);
});

test("READBACK reprova o ponto único que escreve SEM conferir a projeção", () => {
  const v = PORTAO_READBACK.avaliar([
    { caminho: ARQUIVO_ESCRITA, conteudo: 'rpc("registrar_evento", { p });\nreturn { ok: true };' },
  ]);
  assert.equal(v.length, 1);
  assert.match(v[0].motivo, /não confere a projeção/);
});

test("READBACK reprova a AUSÊNCIA do ponto único", () => {
  const v = PORTAO_READBACK.avaliar(arq("components/configuracoes/regras/canais.ts", "export const x = 1;"));
  assert.ok(v.some((x) => /não existe/.test(x.motivo)));
});

test("PAPEL reprova página de gestão sem papel_atual", () => {
  const v = PORTAO_PAPEL.avaliar(
    arq("app/(app)/configuracoes/canais/page.tsx", "export default function P() { return null; }"),
  );
  assert.equal(v.length, 1);
  assert.match(v[0].motivo, /papel_atual/);
});

test("PAPEL aprova a mesma página quando ela resolve o papel", () => {
  assert.deepEqual(
    PORTAO_PAPEL.avaliar(
      arq("app/(app)/configuracoes/canais/page.tsx", 'const p = await supabase.schema("api").rpc("papel_atual");'),
    ),
    [],
  );
});

test("CAMINHO_ANEXO reprova caminho de bucket montado à mão", () => {
  const v = PORTAO_CAMINHO_ANEXO.avaliar(
    arq("app/(app)/configuracoes/suporte/actions.ts", 'const p = `suporte-anexos/${ticketId}/x.png`;'),
  );
  assert.ok(v.some((x) => /à mão/.test(x.motivo)));
});

test("CAMINHO_ANEXO reprova upload sem o caminho vindo da função", () => {
  const v = PORTAO_CAMINHO_ANEXO.avaliar(
    arq("app/(app)/configuracoes/suporte/actions.ts", "await bucket.upload(nome, dados);"),
  );
  assert.ok(v.some((x) => /caminhoAnexoSuporte/.test(x.motivo)));
});

test("FRONTEIRA reprova arquivo fora da Web-B (colisão de trilha)", () => {
  const v = PORTAO_FRONTEIRA.avaliar([
    { caminho: "lib/canais.ts", conteudo: "" },
    { caminho: "middleware.ts", conteudo: "" },
    { caminho: "components/configuracoes/regras/canais.ts", conteudo: "" },
  ]);
  assert.equal(v.length, 2);
  assert.deepEqual(v.map((x) => x.caminho).sort(), ["lib/canais.ts", "middleware.ts"]);
});

test("FRONTEIRA aprova a exceção NOMINAL da sidebar (ARB-05)", () => {
  assert.deepEqual(PORTAO_FRONTEIRA.avaliar(arq("components/sidebar.tsx", "")), []);
});

test("TIPOS_DECLARADOS reprova tipo de evento sem conferência declarada", () => {
  const v = PORTAO_TIPOS_DECLARADOS.avaliar(
    arq("app/(app)/configuracoes/canais/actions.ts", 'registrar({ tipo: "canal_despareado" });'),
  );
  assert.equal(v.length, 1);
  assert.match(v[0].motivo, /canal_despareado/);
  assert.match(v[0].motivo, /dispatcher/);
});

test("TIPOS_DECLARADOS aprova os tipos declarados", () => {
  assert.deepEqual(
    PORTAO_TIPOS_DECLARADOS.avaliar(
      arq("app/(app)/configuracoes/canais/actions.ts", 'tipo: "canal_registrado", outro: "suporte_ticket_aberto"'),
    ),
    [],
  );
});

// ═══════════════════════ o que os portões cobrem, dito por escrito ═══════════════════════

test("a formatação das violações mostra portão, arquivo, linha e motivo", () => {
  const texto = formatarViolacoes([{ portao: "segredo", caminho: "x.ts", linha: 7, motivo: "y" }]);
  assert.match(texto, /segredo/);
  assert.match(texto, /x\.ts:7/);
  assert.equal(formatarViolacoes([]), "sem violações");
});

test("TOKEN_NA_UI reprova o VALOR do token num .tsx e num componente client", () => {
  const noTsx = PORTAO_TOKEN_NA_UI.avaliar(
    arq("components/configuracoes/painel.tsx", "export const T = () => <span>{canal.token}</span>;"),
  );
  assert.equal(noTsx.length, 1);
  assert.match(noTsx[0].motivo, /vira HTML/);

  for (const linha of [
    "const token = props.credencial;",
    "<Campo token={x} />",
    "const h = { token: cfg.segredo };",
    "const u = process.env.RUNTIME_LITE_TOKEN;",
  ]) {
    assert.equal(
      PORTAO_TOKEN_NA_UI.avaliar(arq("components/suporte/x.ts", '"use client";\n' + linha)).length,
      1,
      linha,
    );
  }
});

test("TOKEN_NA_UI deixa passar a palavra em PROSA — foi o rodapé do mockup que corrigiu a regra", () => {
  // "O token de cada número vem do ambiente do servidor — esta tela nunca o pede." é a linha que
  // conta à gestora que a tela nao pede credencial. Proibir a palavra apagaria justamente ela.
  assert.deepEqual(
    PORTAO_TOKEN_NA_UI.avaliar(
      arq(
        "components/configuracoes/tabela.tsx",
        "<p>O token de cada número vem do ambiente do servidor — esta tela nunca o pede.</p>",
      ),
    ),
    [],
  );
  assert.deepEqual(
    PORTAO_TOKEN_NA_UI.avaliar(arq("components/configuracoes/x.tsx", "/* O TOKEN NÃO APARECE aqui. */")),
    [],
  );
});

test("TOKEN_NA_UI deixa o SERVIDOR nomear a env declarada — é ele que fala com o runtime", () => {
  assert.deepEqual(
    PORTAO_TOKEN_NA_UI.avaliar(
      arq("components/configuracoes/dados/lite-sessao.ts", "const token = process.env.RUNTIME_LITE_TOKEN;"),
    ),
    [],
  );
});

test("a dívida de readback herdada é DECLARADA, nomeada e não pode crescer", () => {
  const entradas = Object.entries(ESCRITA_SEM_READBACK_HERDADA);
  assert.equal(entradas.length, 3, "a lista pode encolher; crescer significa readback novo perdido");
  for (const [caminho, motivo] of entradas) {
    assert.ok(caminho.startsWith("app/(app)/configuracoes/"), caminho);
    assert.ok(motivo.length > 40, `${caminho}: motivo raso`);
    assert.ok(REAIS.some((a) => a.caminho === caminho), `${caminho} não existe mais — tire da lista`);
  }
});

test("a herança NÃO isenta arquivo novo: a mesma violação num arquivo fora da lista reprova", () => {
  const v = PORTAO_READBACK.avaliar([
    { caminho: ARQUIVO_ESCRITA, conteudo: "conferir confirmarProjecao" },
    { caminho: "app/(app)/configuracoes/novo/actions.ts", conteudo: 'rpc("registrar_evento", { p });' },
  ]);
  assert.equal(v.length, 1);
  assert.equal(v[0].caminho, "app/(app)/configuracoes/novo/actions.ts");
});

// ═══ C1 do parecer do Vitrine ME · --pt não carrega informação (2,61:1) ═══

test("CONTRASTE reprova rótulo estrutural em text-mute", () => {
  const v = PORTAO_CONTRASTE.avaliar(
    arq(
      "components/configuracoes/x.tsx",
      '<span className="text-[11.5px] uppercase tracking-[0.06em] text-mute">ETAPAS</span>',
    ),
  );
  assert.equal(v.length, 1);
  assert.match(v[0].motivo, /2,61:1/);
});

test("CONTRASTE aprova o mesmo rótulo em text-suave, e não incomoda placeholder", () => {
  assert.deepEqual(
    PORTAO_CONTRASTE.avaliar(
      arq("components/configuracoes/x.tsx", '<span className="uppercase tracking-[0.06em] text-suave">ETAPAS</span>'),
    ),
    [],
  );
  // placeholder e desabilitado continuam podendo usar --pt: é para isso que o token existe
  assert.deepEqual(
    PORTAO_CONTRASTE.avaliar(
      arq("components/configuracoes/x.tsx", '<input className="placeholder:text-mute" />'),
    ),
    [],
  );
});
