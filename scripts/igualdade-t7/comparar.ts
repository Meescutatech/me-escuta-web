/**
 * T7 · A IGUALDADE TELA × ORÁCULO (RF-9 / RF-10) — o teste que só existe porque os dois
 * caminhos são independentes.
 *
 * O oráculo é `core.casamento_midia` (T6), que agrega no Postgres. A tela é `calcularBaldes`,
 * que agrega em TypeScript sobre as mesmas linhas cruas. Este script alimenta os dois com a
 * MESMA fixture e compara campo a campo. Se divergirem, um dos dois está errado — e é essa a
 * única coisa que a igualdade consegue dizer, e é para isso que ela existe.
 *
 * ⚠️ NÃO RODA NO CI, e é honesto que não rode: precisa de um Postgres com a cadeia até a `0240`.
 * O CI cobre a lógica pura (`tests/marketing.test.ts`); esta é a conferência de bancada.
 *
 * Uso: `bash scripts/igualdade-t7/rodar.sh` (ver o cabeçalho de lá).
 *
 * PROVADO QUE FICA VERMELHO, e não só verde (METODO §4 — vigia que nunca foi visto disparar não
 * prova nada): trocando a chave de casamento por `campanha_id` sozinho (o defeito B-4 da spec),
 * o toque `google/C1` passa a casar com o custo `meta/C1` e a comparação acusa
 * `leads_casados 3 → 4` e `leads_sem_custo 6 → 5`.
 */
import { readFileSync } from "node:fs";
import { calcularBaldes } from "../../lib/dados/marketing-calculos.ts";

const sp = process.argv[2];
const o = JSON.parse(readFileSync(`${sp}/oraculo.json`, "utf8"));
const cru = JSON.parse(readFileSync(`${sp}/cruas.json`, "utf8"));

// A TELA calcula pelo SEU caminho: as mesmas linhas, agregadas em TypeScript.
const t = calcularBaldes(cru.toques, cru.custos, cru.semData);

const pares: Array<[string, unknown, unknown]> = [
  ["gasto_casado", Number(o.gasto_casado), t.gastoCasado],
  ["gasto_sem_lead", Number(o.gasto_sem_lead), t.gastoSemLead],
  ["leads_casados", Number(o.leads_casados), t.leadsCasados],
  ["leads_sem_custo", Number(o.leads_sem_custo), t.leadsSemCusto],
  ["leads_sem_campanha_por_falha", Number(o.leads_sem_campanha_por_falha), t.leadsSemCampanhaPorFalha],
  ["leads_sem_campanha_ok", Number(o.leads_sem_campanha_ok), t.leadsSemCampanhaOk],
  ["leads_sem_data", Number(o.leads_sem_data), t.leadsSemData],
  ["leads_sem_plataforma", Number(o.leads_sem_plataforma), t.leadsSemPlataforma],
  ["gasto_total", Number(o.gasto_total), t.gastoTotal],
  ["leads_total", Number(o.leads_total), t.leadsTotal],
  ["reconcilia_dinheiro", o.reconcilia_dinheiro, t.reconciliaDinheiro],
  ["reconcilia_leads", o.reconcilia_leads, t.reconciliaLeads],
];

let divergencias = 0;
console.log("campo                          oraculo(SQL)      tela(TS)   ");
console.log("─".repeat(64));
for (const [nome, a, b] of pares) {
  const igual = String(a) === String(b);
  if (!igual) divergencias++;
  console.log(`${igual ? "  ok " : "  ✗✗ "} ${nome.padEnd(28)} ${String(a).padStart(10)} ${String(b).padStart(13)}`);
}
console.log("─".repeat(64));
console.log(divergencias === 0 ? "IGUALDADE FECHA: 12 de 12 campos" : `DIVERGIU em ${divergencias} campo(s)`);
process.exit(divergencias === 0 ? 0 : 1);
