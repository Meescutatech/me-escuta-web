// bateria-f22.mjs — uma mutação por asserção do PORTÃO F22 (ARB-23).
//
// Uso:  cd me-escuta-web && npm run bateria:f22

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);

await rodarBateria({
  nome: "F22",
  comando: ["node", "--experimental-strip-types", p("scripts/portao-f22-paginacao.mjs")],
  mutacoes: [
    {
      id: "M0",
      protege: "(0) vacuidade — paginação medida sem segunda página não julga nada",
      arquivo: p("scripts/portao-f22-paginacao.mjs"),
      de: `const QUANTAS = 60; // > 50, que é o teto de uma página`,
      para: `const QUANTAS = 10; // > 50, que é o teto de uma página`,
      esperaVermelho: /VERMELHO· \(0\) vacuidade/,
    },
    {
      id: "M1",
      protege: "(1) o total é o do FILTRO do inbox, não de qualquer conversa",
      arquivo: p("lib/dados/conversas.ts"),
      // contar sem o filtro é o erro silencioso clássico: o número fica plausível e errado
      de: `      .select("*", { count: "exact", head: true })
      .eq("visivel_inbox", true);
    return error ? null : count ?? 0;`,
      para: `      .select("*", { count: "exact", head: true });
    return error ? null : count ?? 0;`,
      esperaVermelho: /VERMELHO· \(1\) total divergente/,
    },
    {
      id: "M2",
      protege: "(2) o total NÃO é o tamanho da página — a mentira original do item",
      arquivo: p("lib/dados/conversas.ts"),
      de: `    const corte = houveCorte(jaCarregadas + conversas.length, total, limite);
    return { conversas, total, corte, proximoCursor: proximoCursor(conversas, corte) };`,
      para: `    const corte = houveCorte(jaCarregadas + conversas.length, total, limite);
    return { conversas, total: conversas.length, corte, proximoCursor: proximoCursor(conversas, corte) };`,
      esperaVermelho: /VERMELHO· \(2\) total == tamanho da página/,
    },
    {
      id: "M3",
      protege: "(3) a varredura cobre TUDO — sem repetir e sem buraco",
      arquivo: p("lib/conversas/paginacao.ts"),
      // "acabou" declarado cedo demais: a página 1 vira o fim, e as outras somem calado — que é
      // exatamente o defeito de origem (44 conversas inalcançáveis)
      de: `  if (!temMais || pagina.length === 0) return null;`,
      para: `  if (!temMais || pagina.length === 0 || pagina.length > 0) return null;`,
      esperaVermelho: /VERMELHO· \(3\) a varredura PULOU/,
    },
    {
      id: "M4",
      protege: "(4) o desempate por id — sem ele, carimbo empatado pula ou repete linha",
      arquivo: p("lib/conversas/paginacao.ts"),
      de: `    \`and(ultima_entrada_em.eq.\${em},id.gt.\${c.id})\`,
    \`ultima_entrada_em.is.null\`,`,
      para: `    \`ultima_entrada_em.is.null\`,`,
      esperaVermelho: /VERMELHO· \(4\) página pequena quebrou/,
    },
    {
      id: "M5",
      protege: "(5) tudo carregado ⇒ sem corte e sem 'carregar mais'",
      arquivo: p("lib/conversas/paginacao.ts"),
      // promete uma próxima página que não existe
      de: `  if (total != null) return carregadas < total;`,
      para: `  if (total != null) return carregadas <= total;`,
      esperaVermelho: /VERMELHO· \(5\) tudo carregado mas corte=true/,
    },
    {
      id: "M6",
      protege: "(6) cursor corrompido recomeça do topo, não vira outra consulta",
      arquivo: p("lib/conversas/paginacao.ts"),
      // "adivinhar" um cursor parecido em vez de recusar: a lista vem reembaralhada e ninguém vê
      de: `  try {
    bruto = JSON.parse(cru);
  } catch {
    return null;
  }`,
      para: `  try {
    bruto = JSON.parse(cru);
  } catch {
    return { em: null, id: "00000000-0000-4000-8000-000000000000" };
  }`,
      esperaVermelho: /VERMELHO· \(6\) cursor corrompido mudou a página/,
    },
    {
      id: "M7",
      protege: "(7) o controle negativo é capaz de acusar o OFFSET",
      arquivo: p("scripts/portao-f22-paginacao.mjs"),
      // mover uma linha que JÁ está na página 1 não desloca a fronteira: o offset sobreviveria por
      // acidente e o controle negativo pararia de controlar
      de: `      [\`\${PREFIXO}%\`, LIM_MOV + 2],`,
      para: `      [\`\${PREFIXO}%\`, 0],`,
      esperaVermelho: /VERMELHO· \(7\) controle negativo não acusou/,
    },
    {
      id: "M8",
      protege: "(8) a aba Todas usa o total do servidor",
      arquivo: p("components/conversas/inbox.tsx"),
      de: `            ["todas", \`Todas · \${rotuloContagem("todas")}\`],`,
      para: `            ["todas", \`Todas · \${contagens.todas}\`],`,
      esperaVermelho: /VERMELHO· \(8\) não achei a aba Todas ligada ao total/,
    },
    {
      id: "M9",
      protege: "(9) a tela DECLARA o corte — esconder calado é o defeito de origem",
      arquivo: p("components/conversas/inbox.tsx"),
      de: `          {corteAtual && (`,
      para: `          {false && (`,
      esperaVermelho: /VERMELHO· \(9\) a tela não declara o corte/,
    },
  ],
});
