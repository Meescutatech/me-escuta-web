// portao-d70-nivel-acao.mjs — PORTÃO da AÇÃO `definirNivelCanal` (D70/D71).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUE ESTE PORTÃO EXISTE — e ele nasceu de um furo desta mesma rodada
//
// A action `definirNivelCanal` subiu com TRÊS portões (domínio → `validarTrocaNivel` → versão do
// termo) e ZERO exercício. Provado por mutação pelo revisor adversarial, e reproduzido aqui antes
// de escrever uma linha:
//
//   · trocar `if (exigeAceiteDoTermo(...))` por `if (false && exigeAceiteDoTermo(...))`
//                                                       → npm test 913/913 verde
//   · apagar o bloco inteiro do `validarTrocaNivel` + o `return` de recusa
//                                                       → npm test 913/913 verde E lint limpo
//
// Os testes de `tests/canais.test.ts` exercitam a FUNÇÃO PURA `validarTrocaNivel`, nunca o fato de
// ela ser CHAMADA. E isso pesa mais aqui do que pesaria em qualquer outra action, por uma razão
// MEDIDA no corpo vivo de `api.registrar_evento` (08/09/2026): o bloco `if v_tipo like 'canal\_%'`
// confere papel, presença de `canal_id`, antissegredo e existência do canal — e NADA MAIS. Não há
// guarda de banco para "nível só existe em canal não oficial" nem para "sem consentimento da
// titular o canal não sai do estrito". Para essas duas regras, esta action é a ÚNICA aplicação que
// existe. Guarda que só existe num lugar e não é exercitada em lugar nenhum não é guarda.
//
// COMO ELE JULGA — pelo EFEITO, nunca pelo valor de retorno sozinho:
// a pergunta é "a porta foi chamada?". Um `ok:false` bonito com o `api.registrar_evento` já
// disparado seria um evento gravado num ledger append-only por uma ação que a tela diz ter
// recusado. Por isso toda asserção de recusa vem em par: `ok === false` E `rpcs.length === 0`.
//
// NÃO TOCA BANCO NENHUM, e não precisa de stack local: roda a AÇÃO REAL (importada, não uma
// réplica) contra o cliente falso da casa, através dos stubs do `portao-resolver.mjs`.
//
// As três partes exigidas pela ARB-07:
//   VACUIDADE     — se o caminho FELIZ não chamar a porta, o portão RECUSA antes de julgar
//                   qualquer recusa. Sem isso, "nenhuma escrita aconteceu" seria verdade também
//                   numa action quebrada que não escreve nunca.
//   CONTROLE NEG. — o caminho feliz escreve, e o readback que NÃO confirma reprova mesmo depois
//                   da escrita ter acontecido.
//   MEDIDA        — para cada caso: o veredito, o motivo e QUANTAS chamadas à porta saíram.
//
// Uso:  cd me-escuta-web && npm run portao:d70-nivel
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { ligarStubsDeServidor } from "./portao-resolver.mjs";

// os stubs precisam estar ligados ANTES do primeiro import do código de produção: `next/cache`
// (revalidatePath) e `@/lib/supabase/server` (cookies) estouram fora de uma requisição do Next.
ligarStubsDeServidor();

const falhas = [];
const linhas = [];
const ok = (m) => linhas.push(`  VERDE   · ${m}`);
const nok = (m) => {
  linhas.push(`  VERMELHO· ${m}`);
  falhas.push(m);
};
function exigir(cond, msg) {
  if (cond) ok(msg);
  else nok(msg);
}
function recusar(msg) {
  console.error(`\nPORTÃO D70/ação · RECUSADO — ${msg}`);
  process.exit(2);
}

// ── o "banco": uma linha de canal, os filtros de verdade, e a porta contada ──────────────────
//
// Implementa a parte do postgrest-js que a action usa (select/eq/not/limit), aplicando os `eq` de
// verdade — sem isso o readback aprovaria qualquer coisa e o portão mediria a si mesmo.
function criarBanco({ canal, papel, colunasDaView, aoRegistrar }) {
  const rpcs = [];
  const consultas = [];

  function tabela(nome) {
    const eqs = [];
    const q = {
      select(colunas) {
        q._colunas = colunas ?? "";
        return q;
      },
      eq(campo, valor) {
        eqs.push({ campo, valor });
        return q;
      },
      not(campo) {
        eqs.push({ campo, valor: "<naoNulo>" });
        return q;
      },
      order: () => q,
      limit() {
        return q._resolver();
      },
      _resolver() {
        const pedidas = String(q._colunas ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        // PostgREST recusa a CONSULTA INTEIRA por uma coluna que a view não tem — é o degrau.
        const faltando = pedidas.find((c) => !colunasDaView.includes(c));
        consultas.push({ tabela: nome, colunas: q._colunas, faltando: faltando ?? null });
        if (faltando) {
          return Promise.resolve({
            data: null,
            error: { message: `column ${nome}.${faltando} does not exist`, code: "42703" },
          });
        }
        const casa = eqs.every((f) =>
          f.valor === "<naoNulo>" ? canal[f.campo] != null : canal[f.campo] === f.valor,
        );
        const linhasResp = casa ? [Object.fromEntries(pedidas.map((c) => [c, canal[c] ?? null]))] : [];
        return Promise.resolve({ data: linhasResp, error: null });
      },
      then(res, rej) {
        return q._resolver().then(res, rej);
      },
    };
    return q;
  }

  return {
    rpcs,
    consultas,
    schema(nomeSchema) {
      return {
        from: (t) => tabela(t),
        rpc: async (nome, args) => {
          rpcs.push({ schema: nomeSchema, nome, args });
          if (nome === "papel_atual") return { data: papel, error: null };
          if (nome === "registrar_evento") return aoRegistrar(args);
          return { data: null, error: { message: `rpc inesperada: ${nome}` } };
        },
      };
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}

/** As 18 colunas medidas em produção + as duas do D70 — o mundo DEPOIS da migration. */
const COLUNAS_COM_NIVEL = [
  "canal_id", "nome", "provedor", "ativo", "numero", "waba_id", "area_efetiva", "inbox_desde",
  "pareado_em", "consentimento_em", "consentimento_titular", "consentimento_texto_versao",
  "risco_ban_aceito", "desativado_em", "criado_em", "finalidade", "consentimento_por",
  "departamento", "nivel", "nivel_declarado",
];

const CANAL_LITE = {
  canal_id: "lite:jade",
  nome: "Jade",
  provedor: "nao_oficial",
  ativo: true,
  numero: null,
  waba_id: null,
  area_efetiva: "comercial",
  inbox_desde: "2026-09-08T00:00:00Z",
  pareado_em: "2026-09-08T17:06:00Z",
  consentimento_em: "2026-09-08T17:00:00Z",
  consentimento_titular: "Jade",
  consentimento_texto_versao: "v2", // = TERMO_VERSAO vigente
  risco_ban_aceito: true,
  desativado_em: null,
  criado_em: "2026-09-08T16:00:00Z",
  finalidade: "producao",
  consentimento_por: null,
  departamento: "pre_venda",
  nivel: "estrito",
  nivel_declarado: false,
};

/**
 * Roda a AÇÃO REAL uma vez.
 * @param {object} o
 * @param {object} [o.canal]   sobrescritas da linha do canal
 * @param {string} [o.papel]   o que `api.papel_atual` devolve
 * @param {string} o.nivel     o nível pedido
 * @param {string} [o.nivelDepois] o `nivel` que a view passa a devolver DEPOIS do registro
 *                                 (é o que o readback lê). Padrão: o nível pedido.
 */
async function rodar({ canal = {}, papel = "admin", nivel, nivelDepois }) {
  const linha = { ...CANAL_LITE, ...canal };
  const banco = criarBanco({
    canal: linha,
    papel,
    colunasDaView: COLUNAS_COM_NIVEL,
    aoRegistrar: () => {
      // a porta aceitou e a projeção rodou: a view passa a responder o nível novo
      linha.nivel = nivelDepois ?? nivel;
      linha.nivel_declarado = true;
      return { data: { evento_id: "evt-d70", posicao_global: 4242, duplicado: false }, error: null };
    },
  });
  globalThis.__PORTAO_CLIENTE__ = banco;
  const r = await definirNivelCanal(linha.canal_id, nivel);
  const escritas = banco.rpcs.filter((c) => c.nome === "registrar_evento");
  return { r, escritas, banco };
}

// dinâmico e DEPOIS de `ligarStubsDeServidor()` — o ESM resolve o grafo estático inteiro antes de
// avaliar qualquer coisa, então um import estático aqui pegaria `next/headers` de verdade.
const { definirNivelCanal } = await import("../app/(app)/configuracoes/canais/actions.ts");
const { TERMO_VERSAO } = await import("../components/configuracoes/regras/lite-sessao.ts");

console.log("PORTÃO D70/ação · os três portões de `definirNivelCanal`, medidos pelo EFEITO");
console.log(`  termo vigente = ${TERMO_VERSAO} · nenhum banco tocado`);
console.log("");

// ── 0 · VACUIDADE: o caminho FELIZ tem de escrever. Senão nada abaixo prova nada ─────────────
const feliz = await rodar({ nivel: "aberto" });
if (!feliz.r.ok || feliz.escritas.length !== 1) {
  recusar(
    `o caminho feliz não escreveu (ok=${feliz.r.ok} motivo=${JSON.stringify(feliz.r.motivo ?? null)} ` +
      `escritas=${feliz.escritas.length}). Sem escrita no caminho feliz, "não escreveu" nas recusas ` +
      "seria verdade até numa action que nunca escreve — o portão mediria a si mesmo.",
  );
}
const env = feliz.escritas[0].args?.p ?? {};
exigir(env.tipo === "canal_nivel_definido", `caminho feliz escreve o tipo certo (${env.tipo})`);
exigir(
  env.payload?.canal_id === "lite:jade" && env.payload?.nivel === "aberto",
  `payload leva canal e nível (${JSON.stringify(env.payload ?? null)})`,
);
exigir(feliz.escritas[0].schema === "api", "a escrita sai pelo schema `api`, nunca por `core`");

// ── 1 · PORTÃO DE DOMÍNIO: nível fora do domínio não chega à porta ──────────────────────────
for (const podre of ["livre_total", "ABERTO", "aberto ", "", "estritoo"]) {
  const { r, escritas } = await rodar({ nivel: podre });
  exigir(
    r.ok === false && escritas.length === 0,
    `domínio recusa ${JSON.stringify(podre)} SEM chamar a porta (ok=${r.ok} escritas=${escritas.length})`,
  );
}

// ── 2 · PORTÃO `validarTrocaNivel`: papel, provedor, consentimento ──────────────────────────
{
  const { r, escritas } = await rodar({ nivel: "aberto", papel: "membro" });
  exigir(
    r.ok === false && escritas.length === 0 && /admin|Propriet/i.test(r.motivo ?? ""),
    `papel "membro" recusado sem tocar a porta (motivo=${JSON.stringify((r.motivo ?? "").slice(0, 48))})`,
  );
}
{
  const { r, escritas } = await rodar({ nivel: "aberto", papel: null });
  exigir(r.ok === false && escritas.length === 0, "papel nulo (leitura indisponível) recusa fechado");
}
{
  // canal OFICIAL: o nível não existe lá, e gravar o evento poria configuração falsa no ledger
  const { r, escritas } = await rodar({
    nivel: "aberto",
    canal: { canal_id: "627327023793464", provedor: "waba" },
  });
  exigir(
    r.ok === false && escritas.length === 0 && /nao oficial|não oficial/i.test(r.motivo ?? ""),
    "canal WABA recusado sem tocar a porta — nível só existe no não oficial",
  );
}
{
  // sem consentimento da titular, afrouxar o filtro expõe o WhatsApp pessoal dela
  const { r, escritas } = await rodar({
    nivel: "responde_qualquer_um",
    canal: { consentimento_em: null, consentimento_texto_versao: null },
  });
  exigir(
    r.ok === false && escritas.length === 0 && /consentimento/i.test(r.motivo ?? ""),
    "sem consentimento registrado o canal NÃO sai do estrito, e a porta não é chamada",
  );
}

// ── 3 · PORTÃO DA VERSÃO DO TERMO (D70.b) — a segunda rede, e é a única que pega o RE-consentimento
//
// O readback de `canal_consentimento_registrado` confere `consentimento_em not null`, e num
// RE-consentimento essa coluna JÁ era não nula: aquele readback é vácuo nesse caso e diria "ok"
// mesmo que a versão não tivesse sido atualizada. Quem pega é este portão, que relê a versão do
// BANCO (não da tela) e compara com a vigente.
{
  const { r, escritas } = await rodar({
    nivel: "aberto",
    canal: { consentimento_texto_versao: "v1" },
  });
  exigir(
    r.ok === false && escritas.length === 0 && r.motivo?.includes("v1") && r.motivo?.includes(TERMO_VERSAO),
    "aceite em versão VELHA barra a troca sem tocar a porta, e o motivo nomeia as duas versões",
  );
}
{
  const { r, escritas } = await rodar({
    nivel: "aberto",
    canal: { consentimento_texto_versao: null },
  });
  exigir(
    r.ok === false && escritas.length === 0,
    "versão do aceite NÃO REGISTRADA barra também — não saber qual versão é o mesmo que saber que não foi esta",
  );
}
{
  // VOLTAR para o estrito nunca exige aceite novo: apertar o filtro é sempre seguro, e travar o
  // caminho de volta prenderia a titular no nível mais permissivo justamente quando ela quer sair.
  const { r, escritas } = await rodar({
    nivel: "estrito",
    canal: { nivel: "aberto", nivel_declarado: true, consentimento_texto_versao: "v1" },
  });
  exigir(
    r.ok === true && escritas.length === 1,
    `voltar ao estrito passa mesmo com aceite velho (ok=${r.ok} escritas=${escritas.length})`,
  );
}

// ── 4 · CONTROLE NEGATIVO do readback: escreveu, mas a projeção não mudou o nível ────────────
{
  const { r, escritas } = await rodar({ nivel: "aberto", nivelDepois: "estrito" });
  exigir(
    r.ok === false && escritas.length === 1,
    `escrita aceita + nível INALTERADO na view = ok:false (ok=${r.ok} escritas=${escritas.length})`,
  );
  exigir(
    /proje/i.test(r.motivo ?? ""),
    `o motivo fala da projeção, não de "salvo" (${JSON.stringify((r.motivo ?? "").slice(0, 60))})`,
  );
}

// ── 5 · canal inexistente: recusa antes de tudo ─────────────────────────────────────────────
{
  const banco = criarBanco({
    canal: { ...CANAL_LITE, canal_id: "lite:outra" },
    papel: "admin",
    colunasDaView: COLUNAS_COM_NIVEL,
    aoRegistrar: () => ({ data: { evento_id: "x", posicao_global: 1 }, error: null }),
  });
  globalThis.__PORTAO_CLIENTE__ = banco;
  const r = await definirNivelCanal("lite:nao-existe", "aberto");
  const escritas = banco.rpcs.filter((c) => c.nome === "registrar_evento");
  exigir(r.ok === false && escritas.length === 0, "canal inexistente recusa sem tocar a porta");
}

// ── veredito ────────────────────────────────────────────────────────────────────────────────
console.log(linhas.join("\n"));
console.log("");
if (falhas.length > 0) {
  console.error(`PORTÃO D70/ação REPROVA — ${falhas.length} falha(s):`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`PORTÃO D70/ação APROVA — ${linhas.length} asserções, ação REAL, zero banco.`);
