// bateria-f24.mjs — uma mutação por asserção do PORTÃO F24a (ARB-23).
//
// Uso:  cd me-escuta-web && npm run bateria:f24

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);

await rodarBateria({
  nome: "F24a",
  comando: ["node", "--experimental-strip-types", p("scripts/portao-f24-painel.mjs")],
  mutacoes: [
    {
      id: "M0",
      protege: "(0) vacuidade — painel sem o que contar aprova qualquer implementação",
      arquivo: p("scripts/portao-f24-painel.mjs"),
      de: `  for (let dia = 0; dia < 6; dia++) {`,
      para: `  for (let dia = 0; dia < 0; dia++) {`,
      esperaVermelho: /VERMELHO· \(0\) vacuidade/,
    },
    {
      id: "M1",
      protege: "(1) o painel cabe em <= 12 requisições",
      arquivo: p("lib/dados/dashboard.ts"),
      // nunca agrega: volta a ser 1 head-count por etapa, que é o defeito de origem
      de: `  if (!error && data && data.length <= TETO_LEADS_AGREGACAO) {
    return contarPorEtapa(data as Array<{ etapa?: string | null }>, etapas.map((e) => e.chave));
  }`,
      para: `  if (false && !error && data && data.length <= TETO_LEADS_AGREGACAO) {
    return contarPorEtapa(data as Array<{ etapa?: string | null }>, etapas.map((e) => e.chave));
  }`,
      esperaVermelho: /VERMELHO· \(1\) lerPainel faz \d+ requisições, acima do teto/,
    },
    {
      id: "M2",
      protege: "(2) a contagem por etapa não muda de número ao mudar de técnica",
      arquivo: p("lib/dados/dashboard-calculos.ts"),
      // limite silencioso: conta só as primeiras 100 linhas. O número fica plausível e errado.
      de: `  for (const l of linhas) {
    const k = l.etapa == null ? "" : String(l.etapa);`,
      para: `  for (const l of linhas.slice(0, 100)) {
    const k = l.etapa == null ? "" : String(l.etapa);`,
      esperaVermelho: /VERMELHO· \(2\) contagem por etapa DIVERGIU/,
    },
    {
      id: "M3",
      protege: "(3) mensagens por dia não mudam de número ao mudar de técnica",
      arquivo: p("lib/dados/dashboard-calculos.ts"),
      de: `    if (m.direcao === "entrada") b.entrada += 1;
    else if (m.direcao === "saida") b.saida += 1;`,
      para: `    if (m.direcao === "entrada") b.saida += 1;
    else if (m.direcao === "saida") b.entrada += 1;`,
      esperaVermelho: /VERMELHO· \(3\) mensagens por dia DIVERGIRAM/,
    },
    {
      id: "M4",
      protege: "(4) a entrega não muda de número ao mudar de técnica",
      arquivo: p("lib/dados/dashboard-calculos.ts"),
      // "enviado" não é entregue: contar como entregue infla a taxa de entrega do painel
      de: `const ESTADOS_ENTREGUE = new Set(["entregue", "lido"]);`,
      para: `const ESTADOS_ENTREGUE = new Set(["entregue", "lido", "enviado"]);`,
      esperaVermelho: /VERMELHO· \(4\) entrega DIVERGIU/,
    },
    {
      id: "M5",
      protege: "(5) acima do teto o fallback assume — senão o teto é decorativo",
      arquivo: p("lib/dados/dashboard.ts"),
      // agrega SEMPRE: no dia em que a janela tiver 50 mil linhas, o painel fica mais lento do que
      // era antes e ninguém percebe
      de: `  if (!error && data && data.length <= TETO_LEADS_AGREGACAO) {`,
      para: `  if (!error && data) {`,
      esperaVermelho: /VERMELHO· \(5\) acima do teto NÃO caiu no fallback/,
    },
    {
      id: "M6",
      protege: "(6) falha de um bloco não contamina os vizinhos",
      arquivo: p("lib/dados/dashboard.ts"),
      // zero inventado no lugar de indisponível: a tela passa a mostrar 0 onde não sabe
      de: `  const { count, error } = await q;
  return error ? null : count ?? 0;`,
      para: `  const { count, error } = await q;
  return error ? 0 : count ?? 0;`,
      esperaVermelho: /VERMELHO· \(6\) falha de um bloco contaminou/,
    },
    {
      id: "M7",
      protege: "(7) o controle negativo é capaz de acusar o caminho antigo",
      arquivo: p("scripts/portao-f24-painel.mjs"),
      // controle negativo que não reencena as 14 contagens por etapa deixa de controlar
      de: `  for (const e of etapasReais)
    await s.schema("core").from("v_lead_card").select("*", { count: "exact", head: true }).eq("etapa", e.chave);`,
      para: `  for (const e of [])
    await s.schema("core").from("v_lead_card").select("*", { count: "exact", head: true }).eq("etapa", e.chave);`,
      esperaVermelho: /VERMELHO· \(7\) controle negativo não acusou/,
    },
    {
      id: "M8",
      protege: "(8) o ponto de troca para o F24b fica declarado no código",
      arquivo: p("lib/dados/dashboard.ts"),
      de: ` * PONTO DE TROCA do F24b (contrato no §F24b da Trilha D): no dia em que
 * \`api.painel_resumo(p_dias int default 7)\` existir — devolvendo UM jsonb com as chaves que`,
      para: ` * (ponto de troca removido pela mutação M8 — no dia em que
 * a funcao de banco existir, devolvendo UM jsonb com as chaves que`,
      esperaVermelho: /VERMELHO· \(8\) não há ponto de troca declarado/,
    },
  ],
});
