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
const { lerCanais } = await import("../components/configuracoes/dados/canais.ts");

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PARTE 2 · dados/canais.ts — CINCO degraus (D70 acrescentou o de cima), e o mundo de HOJE é o 2º
//
// Mesmo raciocínio da parte 1, com um degrau a mais. Aqui a queda tem DOIS eixos independentes:
// `inbox_desde` (que já existia antes do M7) e as duas colunas novas. Um degrau que caia demais
// custa a tela de canais inteira; um que caia de menos devolve lista vazia.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const CANAIS = [
  { canal_id: "627327023793464", nome: "producao", provedor: "waba", ativo: true,
    numero: null, waba_id: null, area_efetiva: "comercial", pareado_em: null,
    consentimento_em: null, consentimento_titular: null, consentimento_texto_versao: null,
    risco_ban_aceito: false, desativado_em: null, criado_em: "2026-07-20T20:16:55Z",
    inbox_desde: "2026-07-20T00:30:17Z", finalidade: "teste", consentimento_por: null,
    departamento: "pre_venda", nivel: "aberto", nivel_declarado: true },
  { canal_id: "608866985643828", nome: "teste_meta", provedor: "waba", ativo: true,
    numero: "+15556418435", waba_id: "1063927472233881", area_efetiva: "comercial", pareado_em: null,
    consentimento_em: null, consentimento_titular: null, consentimento_texto_versao: null,
    risco_ban_aceito: false, desativado_em: null, criado_em: "2026-07-20T20:16:55Z",
    inbox_desde: "2026-07-20T20:25:00Z", finalidade: "teste", consentimento_por: null,
    departamento: "pre_venda", nivel: "estrito", nivel_declarado: false },
];

/**
 * @param {"d70"|"so_nivel"|"r22"|"m7"|"corte"|"base"|"nenhum"} ate  o degrau mais alto que o
 *        "banco" aceita.
 *
 * ⚠️ O NOME DA VARIÁVEL LOCAL É `altura`, e não `nivel`, desde a D70 — `nivel` agora é uma COLUNA
 * do produto, e duas coisas diferentes com o mesmo nome dentro do mesmo fixture é exatamente como
 * um portão passa a medir a si mesmo.
 *
 * ⭐ `so_nivel` existe porque o FORMATO DA VIEW AINDA NÃO FOI ESCRITO pela trilha do banco, e a
 * forma mais provável é justamente essa: `nivel` derivado de `config_jsonb` (é o que o runtime já
 * faz) e nenhuma coluna `nivel_declarado`. Sem este degrau, a web exigiria as duas colunas, o
 * degrau de cima erraria 42703 e `nivelLegivel` ficaria false PARA SEMPRE — botão desabilitado e
 * feature nascida morta, com rc=0 e nenhum erro em log nenhum.
 */
function responderCanais(ate) {
  const ordem = { d70: 6, so_nivel: 5, r22: 4, m7: 3, corte: 2, base: 1, nenhum: 0 };
  return (q) => {
    if (q.tabela !== "v_canal_whatsapp") return { data: [] };
    const cols = q.colunas ?? "";
    // a ORDEM importa: "nivel_declarado" contém "nivel", então ele tem de ser testado primeiro,
    // senão os dois degraus de cima viram um só e o `so_nivel` nunca é exercitado.
    const altura = cols.includes("nivel_declarado")
      ? 6
      : cols.includes("nivel")
        ? 5
        : cols.includes("departamento")
          ? 4
          : cols.includes("finalidade")
            ? 3
            : cols.includes("inbox_desde")
              ? 2
              : 1;
    if (altura > ordem[ate]) {
      return { data: null, error: { message: `column v_canal_whatsapp.x does not exist` } };
    }
    const pedidas = cols.split(",").map((c) => c.trim());
    return { data: CANAIS.map((l) => Object.fromEntries(pedidas.map((c) => [c, l[c] ?? null]))) };
  };
}

// ─────── DEGRAU D70 (o de cima): a view TEM `nivel`. É o mundo DEPOIS da migration ───────
const cD70 = await lerCanais({ cliente: criarClienteFalso(responderCanais("d70")) });
if (cD70.canais.length === 0) {
  console.error("PORTÃO RECUSA POR VACUIDADE: o fixture do degrau D70 não devolveu linha nenhuma.");
  process.exit(2);
}
exigir(cD70.nivelLegivel === true, "canais degrau D70: nivelLegivel devia estar ligado");
exigir(cD70.declaracaoLegivel === true, "canais degrau D70: declaracaoLegivel devia estar ligado");
exigir(cD70.canais.length === CANAIS.length, `canais degrau D70 PERDEU LINHA: veio ${cD70.canais.length}`);
{
  const aberto = cD70.canais.find((c) => c.canal_id === "627327023793464");
  const naoDeclarado = cD70.canais.find((c) => c.canal_id === "608866985643828");
  exigir(aberto?.nivel === "aberto", "canais degrau D70: o nível declarado não chegou");
  exigir(aberto?.nivel_declarado === true, "canais degrau D70: a marca de declaração não chegou");
  exigir(naoDeclarado?.nivel_declarado === false, "canais degrau D70: 'nunca declarado' virou declarado");
}

// ─────── DEGRAU D70 com valor PODRE: a coluna existe, o conteúdo não é do domínio ───────
// É o caso que o fail-closed existe para pegar, e ele NÃO é hipotético: `nivel` sai de
// `config_jsonb`, que aceita qualquer texto. Um `UPDATE` à mão pode gravar "livre" ali.
const cPodre = await lerCanais({
  cliente: criarClienteFalso((q) => {
    const r = responderCanais("d70")(q);
    if (!r.data) return r;
    return { data: r.data.map((l) => ({ ...l, nivel: "livre_total", nivel_declarado: true })) };
  }),
});
exigir(
  cPodre.canais.every((c) => c.nivel === null),
  "FAIL-CLOSED FALHOU: valor fora do domínio chegou à tela como nível — ignorância virou permissão",
);
exigir(
  cPodre.canais.every((c) => c.nivel_declarado === false),
  "FAIL-CLOSED FALHOU: ruído gravado no banco foi contado como DECLARAÇÃO de alguém",
);
console.log(
  `fail-closed do nível medido — valor "livre_total" chegou como ` +
    `nivel=${JSON.stringify(cPodre.canais[0]?.nivel ?? null)} declarado=${cPodre.canais[0]?.nivel_declarado}`,
);

// ─────── DEGRAU SÓ-`nivel`: a view expõe `nivel` e NÃO `nivel_declarado` (forma B) ───────
//
// É o degrau que impede a feature de nascer morta. Se a trilha do banco derivar o nível de
// `config_jsonb` sem criar uma coluna de "alguém declarou" — que é o que o runtime já faz —, a web
// TEM de continuar lendo o nível e dizer, com todas as letras, que a PROCEDÊNCIA dele é que não
// deu para ler. O que não pode acontecer é `nivelLegivel=false` permanente.
const cSoNivel = await lerCanais({ cliente: criarClienteFalso(responderCanais("so_nivel")) });
if (cSoNivel.canais.length === 0) {
  console.error("PORTÃO RECUSA POR VACUIDADE: o fixture do degrau só-nivel não devolveu linha nenhuma.");
  process.exit(2);
}
exigir(cSoNivel.canais.length === CANAIS.length, `degrau só-nivel PERDEU LINHA: veio ${cSoNivel.canais.length}`);
exigir(
  cSoNivel.nivelLegivel === true,
  "degrau só-nivel: nivelLegivel devia estar LIGADO — exigir `nivel_declarado` mataria a feature numa base sã",
);
exigir(
  cSoNivel.declaracaoLegivel === false,
  "degrau só-nivel: declaracaoLegivel devia ser FALSE — esta base não diz quem escolheu",
);
{
  const aberto = cSoNivel.canais.find((c) => c.canal_id === "627327023793464");
  exigir(aberto?.nivel === "aberto", "degrau só-nivel: o nível VIGENTE tem de chegar mesmo sem a segunda coluna");
  exigir(
    cSoNivel.canais.every((c) => c.nivel_declarado === false),
    "degrau só-nivel: sem a coluna, `nivel_declarado` NÃO pode ser afirmado — quem separa os casos é declaracaoLegivel",
  );
}

// ─────── DEGRAU R22 · ⭐ ESTE É O MUNDO DE HOJE, e é ele que produção responde ───────
//
// MEDIDO em produção 08/09/2026 (`information_schema.columns` de `core.v_canal_whatsapp`): 18
// colunas, exatamente as de COLUNAS_R22, incluindo `departamento`. Ou seja, o degrau que responde
// hoje é o do R22 — NÃO o do M7, como este arquivo dizia até 08/09.
//
// Sem este bloco o portão não exercitava o degrau de produção: marcar `d70: true` na linha do R22
// (o erro de copiar-colar mais provável quando a migration entrar) passava com rc=0 — e aí a tela
// AFIRMA ter lido um nível que nunca leu, `podeSalvar` destrava, e a gestora dispara uma troca que
// não pode ter efeito. É o engano do M7 outra vez, com um botão junto.
const cR22 = await lerCanais({ cliente: criarClienteFalso(responderCanais("r22")) });
if (cR22.canais.length === 0) {
  console.error("PORTÃO RECUSA POR VACUIDADE: o fixture do degrau R22 não devolveu linha nenhuma.");
  process.exit(2);
}
exigir(cR22.canais.length === CANAIS.length, `degrau R22 (produção HOJE) PERDEU LINHA: veio ${cR22.canais.length}`);
exigir(cR22.indisponivel === false && cR22.corteLegivel && cR22.m7Legivel && cR22.r22Legivel,
  "degrau R22: os quatro sinais antigos deviam estar ligados");
exigir(
  cR22.nivelLegivel === false,
  "degrau R22: nivelLegivel devia ser FALSE — é o estado REAL de produção em 08/09/2026",
);
exigir(cR22.declaracaoLegivel === false, "degrau R22: declaracaoLegivel devia ser FALSE");
exigir(
  cR22.canais.every((c) => c.nivel === null && c.nivel_declarado === false),
  "degrau R22: sem a coluna, nível vem nulo e NÃO declarado — supor 'estrito lido' é o engano do M7",
);
exigir(cR22.canais[0].departamento === "pre_venda", "degrau R22: departamento devia chegar");

const cM7 = await lerCanais({ cliente: criarClienteFalso(responderCanais("m7")) });
if (cM7.canais.length === 0) {
  console.error("PORTÃO RECUSA POR VACUIDADE: o fixture de canais não devolveu linha nenhuma.");
  process.exit(2);
}
exigir(cM7.indisponivel === false && cM7.corteLegivel && cM7.m7Legivel, "canais degrau M7: os três sinais deviam estar ligados");
// ⚠️ CORRIGIDO 08/09: este comentário dizia "⭐ ESTE É O MUNDO DE HOJE" sobre o degrau M7, e era
// falso — produção tem `departamento`, logo responde no degrau R22, exercitado logo acima. Aqui o
// que se mede é o degrau ANTERIOR (base sem a 0130). A exigência continua valendo nos dois: sem a
// coluna, a tela TEM de dizer que não leu, em vez de desenhar "Estrito" como se soubesse.
exigir(cM7.nivelLegivel === false, "canais degrau M7: nivelLegivel devia ser FALSE");
exigir(cM7.declaracaoLegivel === false, "canais degrau M7: declaracaoLegivel devia ser FALSE");
exigir(
  cM7.canais.every((c) => c.nivel === null && c.nivel_declarado === false),
  "canais degrau M7: sem a coluna, nível tem de vir nulo e NÃO declarado — supor 'estrito lido' é o engano do M7",
);
if (cM7.canais.length === CANAIS.length) {
  exigir(cM7.canais[0].finalidade === "teste", "canais degrau M7: finalidade não chegou");
  exigir(cM7.canais[0].inbox_desde !== null, "canais degrau M7: inbox_desde não chegou");
}

// degrau do meio: a view tem `inbox_desde` mas não as colunas do M7 — É O MUNDO DE HOJE.
const cHoje = await lerCanais({ cliente: criarClienteFalso(responderCanais("corte")) });
exigir(cHoje.canais.length === CANAIS.length,
  `CANAIS · DEGRAU DE HOJE PERDEU LINHA: esperava ${CANAIS.length}, veio ${cHoje.canais.length}. A tela de canais ficaria vazia`);
exigir(cHoje.indisponivel === false, "canais degrau de hoje: indisponivel devia ser false — a tela não pode dizer que a view sumiu");
exigir(cHoje.m7Legivel === false, "canais degrau de hoje: m7Legivel devia ser false");
exigir(cHoje.corteLegivel === true, "canais degrau de hoje: corteLegivel devia continuar true");
if (cHoje.canais.length > 0) {
  exigir(cHoje.canais[0].finalidade === null, "canais degrau de hoje: finalidade devia vir NULA, e a tela diz 'Não declarada'");
  exigir(cHoje.canais[0].inbox_desde !== null, "canais degrau de hoje: inbox_desde devia continuar chegando");
}

// degrau de baixo: nem `inbox_desde`. Continua tendo de listar.
const cBase = await lerCanais({ cliente: criarClienteFalso(responderCanais("base")) });
exigir(cBase.canais.length === CANAIS.length, `CANAIS · DEGRAU BASE PERDEU LINHA: veio ${cBase.canais.length}`);
exigir(cBase.corteLegivel === false, "canais degrau base: corteLegivel devia ser false — a ativação passa a exigir o corte sempre");

// CONTROLE NEGATIVO: nenhum degrau responde -> `indisponivel`, e a tela DIZ isso em vez de fingir
// lista vazia. Sem esta parte, "a lista veio cheia" não prova que foram os degraus que a salvaram.
const cNada = await lerCanais({ cliente: criarClienteFalso(responderCanais("nenhum")) });
exigir(cNada.canais.length === 0, "canais controle negativo: com tudo recusado a lista devia vir vazia");
exigir(cNada.nivelLegivel === false, "canais controle negativo: nivelLegivel devia ser false");
exigir(cNada.indisponivel === true,
  "canais controle negativo: `indisponivel` devia ser TRUE. É o que faz a tela dizer 'indisponível' em vez de fingir 'não há canais'");
console.log(`controle negativo de canais OK — tudo recusado -> indisponivel=${cNada.indisponivel}`);

// ─────────────────────── veredito ───────────────────────
if (falhas.length > 0) {
  console.error(`\nPORTÃO REPROVA — ${falhas.length} asserção(ões):`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\nPORTÃO APROVA — degrau alto e degrau baixo medidos, controle negativo disparou.`);
console.log(`  conversas · alto:  ${alto.conversas.length} · origemLegivel=${alto.origemLegivel}`);
console.log(`  conversas · baixo: ${baixo.conversas.length} · origemLegivel=${baixo.origemLegivel}`);
console.log(`  canais    · d70:   ${cD70.canais.length} · nivelLegivel=${cD70.nivelLegivel} declaracaoLegivel=${cD70.declaracaoLegivel}
  canais    · so_nivel: ${cSoNivel.canais.length} · nivelLegivel=${cSoNivel.nivelLegivel} declaracaoLegivel=${cSoNivel.declaracaoLegivel}
  canais    · r22 (o que PRODUÇÃO responde hoje): ${cR22.canais.length} · nivelLegivel=${cR22.nivelLegivel}
  canais    · m7:    ${cM7.canais.length} · m7Legivel=${cM7.m7Legivel} corte=${cM7.corteLegivel}`);
console.log(`  canais    · hoje:  ${cHoje.canais.length} · m7Legivel=${cHoje.m7Legivel} corte=${cHoje.corteLegivel}`);
console.log(`  canais    · base:  ${cBase.canais.length} · m7Legivel=${cBase.m7Legivel} corte=${cBase.corteLegivel}`);
process.exit(0);
