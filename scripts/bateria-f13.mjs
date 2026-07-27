// bateria-f13.mjs — uma mutação por asserção do PORTÃO F13 (ARB-23).
//
// Uso:  cd me-escuta-web && npm run bateria:f13

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);

await rodarBateria({
  nome: "F13",
  comando: ["node", "--experimental-strip-types", p("scripts/portao-f13-midia.mjs")],
  mutacoes: [
    {
      id: "M0",
      protege: "(0) vacuidade — 'as URLs são idênticas' sobre nenhuma URL é verdade vazia",
      arquivo: p("lib/dados/conversas.ts"),
      de: `          if (url) m.midia_url = url;`,
      para: `          if (false && url) m.midia_url = url;`,
      esperaVermelho: /VERMELHO· \(0\) vacuidade/,
    },
    {
      id: "M0bis",
      protege: "(0-bis) a premissa do item é MEDIDA, não deduzida",
      arquivo: p("scripts/portao-f13-midia.mjs"),
      // sem a espera, as duas assinaturas caem no mesmo segundo e saem IGUAIS — a medição passaria
      // a dizer "a URL já é estável", que é o contrário do que ela mediu de verdade
      de: `await new Promise((r) => setTimeout(r, 1100)); // o token da Meta/GoTrue tem \`iat\` em segundos`,
      para: `// espera removida pela mutação M0bis`,
      esperaVermelho: /VERMELHO· \(0-bis\) assinar o mesmo caminho 2× devolveu a MESMA URL/,
    },
    {
      id: "M1",
      protege: "(1) N releituras não multiplicam a URL — é o download repetido que o item corta",
      arquivo: p("lib/dados/conversas.ts"),
      // assina tudo sempre: o cache vira enfeite e a foto volta a ser rebaixada a cada refresh
      de: `        const faltando = precisaAssinar(ARMAZEM_MIDIA, caminhos, agora);`,
      para: `        const faltando = caminhos;`,
      esperaVermelho: /VERMELHO· \(1\) \d+ releituras produziram \d+ URLs distintas/,
    },
    {
      id: "M2",
      protege: "(2) duas releituras seguidas devolvem o MESMO conjunto, caractere a caractere",
      arquivo: p("lib/conversas/cache-midia.ts"),
      // o cache nunca acerta: tecnicamente "funciona", e o navegador baixa tudo de novo
      de: `  return idadeSeg >= 0 && idadeSeg < TTL_CACHE_SEG;`,
      para: `  return false;`,
      esperaVermelho: /VERMELHO· \(2\) duas releituras seguidas devolveram conjuntos de URL diferentes/,
    },
    {
      id: "M3",
      protege: "(3) passado o TTL, a URL é reassinada — senão um dia entregamos assinatura vencida",
      arquivo: p("lib/conversas/cache-midia.ts"),
      // cache eterno: é o modo de falha mais visível do item (a foto vira erro em PT-BR)
      de: `  const idadeSeg = (agoraMs - entrada.assinadaEm) / 1000;`,
      para: `  const idadeSeg = 0;`,
      esperaVermelho: /VERMELHO· \(3\) depois do TTL a URL NÃO mudou/,
    },
    {
      id: "M4",
      protege: "(4) a margem entre cache e assinatura existe",
      arquivo: p("lib/conversas/cache-midia.ts"),
      de: `export const MARGEM_SEG = 600;`,
      para: `export const MARGEM_SEG = 0;`,
      esperaVermelho: /VERMELHO· \(4\) margem inválida/,
    },
    {
      id: "M5",
      protege: "(5) o controle negativo é capaz de acusar o comportamento antigo",
      arquivo: p("scripts/portao-f13-midia.mjs"),
      de: `const urlsSemCache = new Set();
for (let i = 0; i < RELEITURAS; i++) {`,
      para: `const urlsSemCache = new Set();
for (let i = 0; i < 1; i++) {`,
      esperaVermelho: /VERMELHO· \(5\) controle negativo não acusou/,
    },
    {
      id: "M6",
      protege: '(6) loading="lazy" na <img>',
      arquivo: p("components/conversas/bolha-imagem.tsx"),
      de: `              loading="lazy"`,
      para: `              data-loading-removido="lazy"`,
      esperaVermelho: /VERMELHO· \(6\) a <img> não tem loading="lazy"/,
    },
    {
      id: "M7",
      protege: '(7) decoding="async" na <img>',
      arquivo: p("components/conversas/bolha-imagem.tsx"),
      de: `              decoding="async"`,
      para: `              data-decoding-removido="async"`,
      esperaVermelho: /VERMELHO· \(7\) a <img> não tem decoding="async"/,
    },
    {
      id: "M8",
      protege: "(8) espaço reservado — a foto que chega não empurra as vizinhas",
      arquivo: p("components/conversas/bolha-imagem.tsx"),
      de: `              width={208}
              height={144}`,
      para: ``,
      esperaVermelho: /VERMELHO· \(8\) a <img> não reserva espaço/,
    },
    {
      id: "M9",
      protege: "(9) o degrade da bolha (sem URL em lote, ela busca sozinha)",
      arquivo: p("components/conversas/bolha-imagem.tsx"),
      de: `    obterUrlMidia(caminho)`,
      para: `    Promise.resolve({ ok: false, url: null })`,
      esperaVermelho: /VERMELHO· \(9\) o degrade da bolha foi perdido/,
    },
  ],
});
