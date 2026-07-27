// bateria-f6-a3.mjs — MUT-F6-4 re-rodada (achado A-3 do Aferidor).
//
// O Aferidor mediu, na bateria cheia do F6, que a asserção do DUPLICADO roda contra a réplica
// `escreverComoAUI` do portão, e não contra o artefato real: tirar a propagação do `duplicado` do
// retorno de `registrarEventoUI` deixava o portão VERDE — MUT-F6-4 SOBREVIVIA.
//
// Critério do conserto, declarado por ele: MUT-F6-4 re-rodada MORRE. É o que esta bateria mede.
//
// Uso:  cd me-escuta-web && npm run bateria:f6-a3

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);

await rodarBateria({
  nome: "F6 · A-3 (MUT-F6-4)",
  comando: ["node", "--experimental-strip-types", p("scripts/portao-f6-readback.mjs")],
  mutacoes: [
    {
      id: "MUT-F6-4",
      protege: "o retorno REAL de registrarEventoUI propaga `duplicado`",
      arquivo: p("app/(app)/funil/actions.ts"),
      // exatamente a mutação que sobrevivia antes do conserto
      de: `  return { ok: true, ...(resposta?.duplicado ? { duplicado: true } : {}) };`,
      para: `  return { ok: true };`,
      esperaVermelho: /VERMELHO· \(5\) o retorno de registrarEventoUI NÃO propaga `duplicado`/,
    },
  ],
});
