// portao-m7-degrau-leitura.mjs — PORTÃO do degrau de leitura do M7 (R18, Portao).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUE ESTE PORTÃO EXISTE, e ele nasceu de uma lição do E-129
//
// "Meça o efeito em CADA CAMINHO que o chamador pode tomar." O `lerConversas` do M7 tem DOIS
// caminhos, e eu só tinha exercitado um:
//
//   degrau ALTO  · `core.v_conversa` JÁ tem numero_apelido/numero_e164/finalidade (pós-0094)
//   degrau BAIXO · a view ainda NÃO tem — e este é o que roda HOJE em produção
//
// O gradiente de risco é o INVERSO do gradiente de teste: eu exercitei o caminho novo, que é o
// interessante, e deixei sem exercitar o que está no ar. E o modo de falha do degrau baixo é o
// pior possível: **PostgREST recusa a consulta INTEIRA por uma coluna inexistente**, então uma
// queda de degrau quebrada devolve lista VAZIA — e lista vazia é indistinguível de "não há
// conversa". O inbox emudeceria para todo mundo, sem erro na tela.
//
// NÃO TOCA BANCO NENHUM. Usa o `criarClienteFalso` da casa, que imita o encadeamento do
// postgrest-js e responde o que este portão mandar. Roda em qualquer máquina, sem stack.
//
// As três partes da ARB-07:
//   VACUIDADE     — se o fixture não devolver conversa, o portão RECUSA antes de comparar. Medir
//                   degrade sobre lista vazia não julga nada (E-046).
//   CONTROLE NEG. — o degrau é REMOVIDO ao vivo (o falso passa a errar nos DOIS selects) e o
//                   portão exige ver a lista virar vazia. Sem isto, "a lista veio cheia" não prova
//                   que foi o degrau que a salvou.
//   MEDIDA        — nos dois degraus: quantas conversas voltaram, o valor de `origemLegivel`, e se
//                   os campos do chip vieram ou não.
//
// Uso:  cd me-escuta-web && node --experimental-strip-types scripts/portao-m7-degrau-leitura.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import "./portao-resolver.mjs";
import { criarClienteFalso } from "./cliente-falso.mjs";

// dinâmico, e é obrigatório: o resolver registra os hooks de `@/` e de extensão ao ser AVALIADO,
// e o ESM resolve todo o grafo estático antes de avaliar qualquer coisa. Import estático daqui
// falha com ERR_MODULE_NOT_FOUND em `@/lib` — medido.
const { lerConversas } = await import("../lib/dados/conversas.ts");

const COLUNAS_M7 = ["numero_apelido", "numero_e164", "finalidade"];

/** As 3 conversas do fixture cobrem os casos que o chip precisa distinguir. */
const LINHAS = [
  { id: "11111111-1111-1111-1111-111111111111", telefone: "+5531999990001", lead_id: null,
    mode: "IA", dono_atual: null, status: "aberta",
    atualizado_em: "2026-07-28T10:00:00Z", ultima_entrada_em: "2026-07-28T10:00:00Z",
    phone_number_id: "627327023793464", numero_apelido: "producao", numero_e164: null, finalidade: "teste" },
  { id: "22222222-2222-2222-2222-222222222222", telefone: "+5531999990002", lead_id: null,
    mode: "IA", dono_atual: null, status: "aberta",
    atualizado_em: "2026-07-28T09:00:00Z", ultima_entrada_em: "2026-07-28T09:00:00Z",
    phone_number_id: "pnid_e2e", numero_apelido: null, numero_e164: null, finalidade: null },
  { id: "33333333-3333-3333-3333-333333333333", telefone: null, lead_id: null,
    mode: "IA", dono_atual: null, status: "aberta",
    atualizado_em: "2026-07-28T08:00:00Z", ultima_entrada_em: "2026-07-28T08:00:00Z",
    phone_number_id: null, numero_apelido: null, numero_e164: null, finalidade: null },
];

/**
 * @param {"alto"|"baixo"|"nenhum"} degrau  quais selects de v_conversa o "banco" aceita.
 *   alto   = aceita tudo (view pós-0094)
 *   baixo  = recusa o select com as colunas do M7, aceita o base (o mundo de HOJE)
 *   nenhum = recusa os dois (CONTROLE NEGATIVO: é o degrade REMOVIDO)
 */
function responderPara(degrau) {
  return (q) => {
    if (q.tabela === "v_conversa") {
      if (q.head) return { data: null, count: LINHAS.length };
      const pediuM7 = COLUNAS_M7.some((c) => (q.colunas ?? "").includes(c));
      if (degrau === "nenhum") {
        return { data: null, error: { message: `column v_conversa.${COLUNAS_M7[0]} does not exist` } };
      }
      if (degrau === "baixo" && pediuM7) {
        // A recusa REAL do PostgREST: a consulta inteira cai, não só a coluna.
        return { data: null, error: { message: 'column v_conversa.numero_apelido does not exist' } };
      }
      // o "banco" só devolve as colunas pedidas — senão o teste passaria por vazamento do fixture
      const pedidas = (q.colunas ?? "").split(",").map((c) => c.trim());
      return { data: LINHAS.map((l) => Object.fromEntries(pedidas.map((c) => [c, l[c] ?? null]))) };
    }
    if (q.tabela === "v_config_vigente") return { data: { payload: { etapas: [] } } };
    return { data: [] };
  };
}

const falhas = [];
function exigir(cond, msg) {
  if (!cond) falhas.push(msg);
}

// ─────────────────────── VACUIDADE, antes de qualquer comparação ───────────────────────
const alto = await lerConversas({ cliente: criarClienteFalso(responderPara("alto")) });
if (alto.conversas.length === 0) {
  console.error("PORTÃO RECUSA POR VACUIDADE: o fixture não devolveu conversa nenhuma no degrau");
  console.error("alto. Medir degrade sobre lista vazia não julga nada — o defeito é do portão.");
  process.exit(2);
}
console.log(`vacuidade OK — fixture devolveu ${alto.conversas.length} conversas`);

// ─────────────────────── MEDIDA · degrau ALTO (pós-0094) ───────────────────────
exigir(alto.origemLegivel === true, "degrau alto: origemLegivel devia ser true");
exigir(alto.conversas.length === LINHAS.length, `degrau alto: esperava ${LINHAS.length} conversas, veio ${alto.conversas.length}`);
if (alto.conversas.length >= LINHAS.length) {
  exigir(alto.conversas[0].numero_apelido === "producao", "degrau alto: o apelido do chip não chegou");
  exigir(alto.conversas[0].finalidade === "teste", "degrau alto: a finalidade não chegou");
  exigir(alto.conversas[1].numero_apelido === null, "degrau alto: canal não cadastrado devia vir com apelido nulo");
}

// ─────────────────────── MEDIDA · degrau BAIXO (o mundo de HOJE) ───────────────────────
const baixo = await lerConversas({ cliente: criarClienteFalso(responderPara("baixo")) });

// ESTA é a asserção que importa. Se o degrau quebrar, ela vai a zero e o inbox some.
exigir(
  baixo.conversas.length === LINHAS.length,
  `DEGRAU BAIXO PERDEU CONVERSA: esperava ${LINHAS.length}, veio ${baixo.conversas.length}. ` +
    "É o mundo de HOJE em produção, e lista vazia é indistinguível de 'não há conversa'",
);
exigir(baixo.origemLegivel === false, "degrau baixo: origemLegivel devia ser false — a tela não pode desenhar chip");

// ⚠ AS ASSERÇÕES POR LINHA SÓ RODAM SE HOUVER LINHA, e isto NÃO é zelo defensivo — foi medido.
//
// Sem esta guarda, a mutação que remove o degrau fazia o portão morrer com
// `TypeError: Cannot read properties of undefined (reading 'telefone')` na linha de baixo. O
// processo saía com rc=1, que é o MESMO rc de uma reprovação legítima — mas o veredito nunca
// imprimia, as asserções seguintes nunca rodavam, e a mensagem que chegava ao operador não dizia
// NADA sobre o defeito real (o inbox ter ficado vazio).
//
// É o MÉTODO §24 literal: controle vermelho não diz de que lado está o erro. Um portão que
// REPROVA POR CRASH parece funcionar — tem o rc certo — e é decoração, porque quem lê às 3h vê um
// TypeError e vai depurar o portão, não o produto.
if (baixo.conversas.length > 0) {
  exigir(
    baixo.conversas.every((c) => c.numero_apelido === null && c.finalidade === null),
    "degrau baixo: os campos do chip deviam vir nulos, e a tela não desenha chip nenhum",
  );
  // e o resto da lista continua íntegro — o degrau não pode custar as colunas antigas
  exigir(baixo.conversas[0].telefone === "+5531999990001", "degrau baixo: perdeu `telefone`");
  exigir(baixo.conversas[0].id === LINHAS[0].id, "degrau baixo: perdeu a ordem ou o id");
}

// ─────────────────────── CONTROLE NEGATIVO · o degrau REMOVIDO ───────────────────────
// Sem isto, "a lista veio cheia no degrau baixo" não prova que foi o degrade que a salvou.
const semDegrau = await lerConversas({ cliente: criarClienteFalso(responderPara("nenhum")) });
exigir(
  semDegrau.conversas.length === 0,
  "CONTROLE NEGATIVO FALHOU: com os dois selects recusados a lista devia vir VAZIA. " +
    "Se ela veio cheia, o fixture está vazando dado e o portão não mede o que diz",
);
console.log(`controle negativo OK — sem degrau a lista vem vazia (${semDegrau.conversas.length})`);

// ─────────────────────── veredito ───────────────────────
if (falhas.length > 0) {
  console.error(`\nPORTÃO REPROVA — ${falhas.length} asserção(ões):`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\nPORTÃO APROVA — degrau alto e degrau baixo medidos, controle negativo disparou.`);
console.log(`  alto:  ${alto.conversas.length} conversas · origemLegivel=${alto.origemLegivel}`);
console.log(`  baixo: ${baixo.conversas.length} conversas · origemLegivel=${baixo.origemLegivel}`);
process.exit(0);
