// bateria-enxerto-conferencia.mjs — a rede DURÁVEL do enxerto ARB-28-bis.
//
// O insumo do Estaleiro: a união com a minha versão do confirmar-projecao.ts rodava 473/473 VERDE
// mesmo PERDENDO os filtros da web-b. Ou seja: não havia rede de teste do lado enxertado, e um
// enxerto sem teste do lado enxertado é reversível EM SILÊNCIO na próxima união. Portão de presença
// é cinto; a rede durável é o teste — e um teste só é rede se ficar VERMELHO quando o que ele
// protege some. Esta bateria prova isso, uma mutação por metade do arquivo.
//
// Uso:  cd me-escuta-web && npm run bateria:enxerto

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);
const ARQUIVO = p("lib/eventos/confirmar-projecao.ts");

await rodarBateria({
  nome: "ENXERTO (ARB-28-bis)",
  comando: ["npm", "test", "--prefix", raiz],
  mutacoes: [
    {
      id: "E1",
      protege: "as 10 linhas de dado da web-b (perder uma é perder a conferência dela)",
      arquivo: ARQUIVO,
      de: `  canal_ativado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "ativo",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "ativo", op: "igual", valor: true },
    ],`,
      para: `  canal_ativado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "ativo",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
    ],`,
      esperaVermelho: /not ok .*(ativar confere o ESTADO|toda regra das telas B)/,
    },
    {
      id: "E2",
      protege: "o RAMO `filtros` na confirmarProjecao (o mecanismo, não só o dado)",
      arquivo: ARQUIVO,
      // sem o ramo, a ação com regra `filtros` cai no caminho de posição e a releitura vira outra
      de: `  if (regra.por === "filtros") {`,
      para: `  if (false && regra.por === "filtros") {`,
      esperaVermelho: /not ok .*modo filtros monta a releitura/,
    },
    {
      id: "E3",
      protege: "resolverFiltros falhar quando falta dado (senão 'esta linha' vira 'qualquer linha')",
      arquivo: ARQUIVO,
      de: `    const r = resolverFiltro(f, payload, eventoId);
    if (!r) return null;
    saida.push(r);`,
      para: `    const r = resolverFiltro(f, payload, eventoId);
    if (!r) continue;
    saida.push(r);`,
      esperaVermelho: /not ok .*(filtro sem valor derruba|comentário de ticket|ARB-26)/,
    },
    {
      id: "E4",
      protege: "config_publicada conferir a versão RESULTANTE (base+1), não o nome",
      arquivo: ARQUIVO,
      de: `      { campo: "versao", op: "igualPayloadMais1", dePayload: "versao_base" },`,
      para: `      { campo: "versao", op: "igualPayload", dePayload: "versao_base" },`,
      esperaVermelho: /not ok .*config_publicada confere a VERSÃO RESULTANTE/,
    },
    {
      id: "E5",
      protege: "ARB-26 — a abertura de ticket confere pelo evento, não por id vindo da tela",
      arquivo: ARQUIVO,
      de: `    filtros: [{ campo: "id", op: "igualEvento" }],
    // ARB-26: \`id = evento.id\` (0070). Foi aqui que o portão de escrita real reprovou.`,
      para: `    filtros: [{ campo: "id", op: "igualPayload", dePayload: "ticket_id" }],
    // ARB-26: \`id = evento.id\` (0070). Foi aqui que o portão de escrita real reprovou.`,
      esperaVermelho: /not ok .*abertura de ticket confere pelo evento_id/,
    },
    {
      id: "E6",
      protege: "a exceção ledger-only do aceite (a outra metade do dado enxertado)",
      arquivo: ARQUIVO,
      de: `  aceite_contato_registrado: {
    motivo:`,
      para: `  aceite_contato_registrado_REMOVIDO: {
    motivo:`,
      esperaVermelho: /not ok .*(aceite_contato_registrado é exceção DECLARADA|todo tipo escrito pela Web-B)/,
    },
    {
      id: "E7",
      protege: "o FAIL-CLOSED — a minha metade, que a união já protegia e tem de continuar protegendo",
      arquivo: ARQUIVO,
      de: `  if (!temConferencia(acao)) return { ok: false, motivo: motivoAcaoNaoDeclarada(acao) };`,
      para: `  if (!temConferencia(acao)) return { ok: true };`,
      esperaVermelho: /not ok .*(ação desconhecida reprova|tipo não declarado|não declarada)/,
    },
    {
      id: "E8",
      protege: "a ORDEM dos ramos: exceções ANTES do fail-closed",
      arquivo: ARQUIVO,
      // inverter faz o aceite_contato_registrado (ledger-only, sem linha em CONFERENCIA) passar a
      // reprovar por "ação não declarada" — o risco exato que o aviso cirúrgico apontou
      de: `  const excecao = excecaoDe(acao);
  if (excecao) {`,
      para: `  if (!temConferencia(acao) && !excecaoDe(acao)) return { ok: false, motivo: motivoAcaoNaoDeclarada(acao) };
  const excecao = excecaoDe(acao);
  if (false && excecao) {`,
      esperaVermelho: /not ok .*(exceção declarada sem evento_id|ledger)/,
    },
  ],
});
