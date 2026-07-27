// bateria-f21.mjs — uma mutação por asserção do PORTÃO F21 (ARB-23).
//
// Uso:  cd me-escuta-web && npm run bateria:f21

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);

await rodarBateria({
  nome: "F21",
  comando: ["node", "--experimental-strip-types", p("scripts/portao-f21-data-inbox.mjs")],
  mutacoes: [
    {
      id: "M0",
      protege: "(0) vacuidade — portão sobre lista vazia não julga nada",
      arquivo: p("lib/dados/conversas.ts"),
      // a lista devolve vazio: sem conversa nenhuma, TODAS as outras asserções passariam por
      // vacuidade. Só a (0) impede o verde mentiroso.
      de: `    if (error || !data || data.length === 0) return { ...PAGINA_VAZIA, total };`,
      para: `    if (error || !data || data.length === 0) return { ...PAGINA_VAZIA, total };\n    if (data.length > 0) return { ...PAGINA_VAZIA, total };`,
      esperaVermelho: /VERMELHO· \(0\) vacuidade/,
    },
    {
      id: "M1",
      protege: "(1) data exibida == max(timestamp_origem) das mensagens",
      arquivo: p("lib/dados/conversas.ts"),
      // carimba a prévia com a hora de PROCESSAMENTO em vez da hora de origem — é a versão sutil
      // do defeito: parece certo, e erra em toda linha cujo webhook atrasou.
      de: `          em: m.timestamp_origem ?? m.criado_em ?? null,`,
      para: `          em: m.criado_em ?? null,`,
      esperaVermelho: /VERMELHO· \(1\) data exibida diverge/,
    },
    {
      id: "M2",
      protege: "(2) ordem por ultima_entrada_em desc nulls last",
      arquivo: p("lib/dados/conversas.ts"),
      // o defeito ORIGINAL, tal como estava antes do F21. Ancorado no `await comCursor` porque
      // a contarNaoLidas (F25) passou a ter a MESMA linha de ordenação — mutação ambígua não prova.
      de: `    const { data, error } = await comCursor
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })`,
      para: `    const { data, error } = await comCursor
      .order("atualizado_em", { ascending: false, nullsFirst: false })`,
      esperaVermelho: /VERMELHO· \(2\) ordem diverge/,
    },
    {
      id: "M3",
      protege: "(3) conversa sem entrada não exibe data de gravação",
      arquivo: p("lib/conversas/thread.ts"),
      // o fail-open clássico: "se não tenho data, mostro alguma" — e a alguma é a de gravação
      de: `  return carimbo(c.ultima_msg_em) ?? carimbo(c.ultima_entrada_em) ?? null;`,
      para:
        `  return (\n` +
        `    carimbo(c.ultima_msg_em) ??\n` +
        `    carimbo(c.ultima_entrada_em) ??\n` +
        `    carimbo((c as { atualizado_em?: string | null }).atualizado_em) ??\n` +
        `    null\n` +
        `  );`,
      esperaVermelho: /VERMELHO· \(3\) data de gravação vazou/,
    },
    {
      id: "M4",
      protege: "(5) tempoLista não recebe atualizado_em",
      arquivo: p("components/conversas/inbox.tsx"),
      de: `                      {dataDaLista(c) ? tempoLista(dataDaLista(c)) : "sem data"}`,
      para: `                      {tempoLista(c.atualizado_em)}`,
      esperaVermelho: /VERMELHO· \(5\) tempoLista ainda recebe atualizado_em/,
    },
    {
      id: "M5",
      protege: "(6) atualizado_em preservado no select (o tempo real depende dele)",
      arquivo: p("lib/dados/conversas.ts"),
      // regressão plausível de quem "limpa" o select depois de trocar a ordenação. Note que a
      // palavra `atualizado_em` CONTINUA no arquivo (tipo e mapeamento) — é por isso que a
      // asserção (6) tem de olhar o select da consulta, e não fazer grep do arquivo.
      de: `.select("id,telefone,lead_id,mode,dono_atual,status,atualizado_em,ultima_entrada_em")`,
      para: `.select("id,telefone,lead_id,mode,dono_atual,status,ultima_entrada_em")`,
      esperaVermelho: /VERMELHO· \(6\) atualizado_em sumiu do select/,
    },
    {
      id: "M6",
      protege: "(4) o controle negativo é capaz de acusar",
      arquivo: p("scripts/portao-f21-data-inbox.mjs"),
      // Um controle negativo que deixa de reencenar o defeito vira enfeite: fica verde sempre e
      // não controla nada. Aqui ele é enfraquecido para repetir o comportamento do PRODUTO — a
      // asserção (4) existe exatamente para pegar isso.
      de: `  datar: (c) => c.atualizado_em ?? null,`,
      para: `  datar: (c) => dataDaLista(c),`,
      esperaVermelho: /VERMELHO· \(4\) controle negativo passou verde/,
    },
  ],
});
