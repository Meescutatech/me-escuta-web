import type { EstadoEntrega, Mensagem } from "@/lib/dados/conversas";

/**
 * Lógica pura do thread (SPEC-PIPELINE-MENSAGENS RF-27/29/30): agrupamento de rajada,
 * blocos de dia e fronteira de não-lidas. Sem React — testável e reusável.
 */

/** Janela de corte do grupo visual — 60s (SPEC RF-27, BENCHMARK-UX P1/D1). */
export const JANELA_GRUPO_MS = 60_000;

/** Vazio/branco é ausência de data, não data — `""` não pode virar "Invalid Date" na tela. */
function carimbo(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * F21 — a data que a LISTA do inbox exibe.
 *
 * NUNCA `atualizado_em`: esse campo é quando a LINHA foi tocada, não quando a mensagem existiu.
 * O import do Kommo carimba todas as linhas com "agora", e é por isso que hoje a caixa inteira
 * parece nova (medido: conversa cuja última mensagem é de 6 dias atrás exibia a hora de hoje).
 *
 * Precedência declarada, com o degrade que a spec exige (EARS · comportamento indesejado):
 *   1. `ultima_msg_em` — carimbo da última mensagem de QUALQUER direção, vindo da prévia.
 *      É o exato, e é o que a pessoa espera ver.
 *   2. `ultima_entrada_em` — degrade quando a prévia não pôde ser lida. Só entrada, mantido pelo
 *      projetor com `greatest()` (webhook atrasado não puxa a conversa pra trás).
 *   3. `null` — "sem data". Conversa sem mensagem nenhuma declara ausência; nunca a data de
 *      gravação disfarçada de hora da mensagem.
 *
 * `atualizado_em` de propósito NÃO é parâmetro desta função: o que não entra não pode vazar.
 */
export function dataDaLista(c: {
  ultima_msg_em?: string | null;
  ultima_entrada_em?: string | null;
}): string | null {
  return carimbo(c.ultima_msg_em) ?? carimbo(c.ultima_entrada_em) ?? null;
}

/** Quem "fala" na bolha: cliente (entrada) ou Clara/Sara (saída). Troca Clara↔Sara quebra grupo. */
export type Falante = "cliente" | "clara" | "sara";

export function falante(m: Mensagem): Falante {
  if (m.direcao === "entrada") return "cliente";
  return m.autor === "sara" ? "sara" : "clara"; // sem coluna autor no banco ainda → Clara (histórico)
}

export interface GrupoBolhas {
  falante: Falante;
  itens: Mensagem[];
}

export interface BlocoDia {
  dia: string; // rótulo ("hoje" / "ontem" / "12 de julho")
  grupos: GrupoBolhas[];
}

function chaveDia(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "?" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function rotuloDia(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const agora = new Date();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dif = Math.round((hoje0 - dia0) / 86400000);
  // W-D2: mensagem PROGRAMADA vive no futuro — o chip do dia precisa saber dizer "amanhã".
  if (dif === -1) return "amanhã";
  if (dif <= 0) return "hoje";
  if (dif === 1) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

/**
 * RF-27: mensagens consecutivas do MESMO falante dentro de 60s e no mesmo dia formam um grupo
 * visual; timestamp/estado só na última bolha do grupo (regra aplicada na renderização).
 * Mensagem com falha nunca se esconde no meio do grupo: quebra grupo (padrão Chatwoot).
 */
export function montarBlocos(msgs: Mensagem[]): BlocoDia[] {
  const blocos: BlocoDia[] = [];
  let diaAtual: string | null = null;
  let anterior: Mensagem | null = null;

  for (const m of msgs) {
    const dia = chaveDia(m.criado_em);
    if (dia !== diaAtual) {
      blocos.push({ dia: rotuloDia(m.criado_em), grupos: [] });
      diaAtual = dia;
      anterior = null;
    }
    const bloco = blocos[blocos.length - 1];
    const grupo = bloco.grupos[bloco.grupos.length - 1];
    const falhou = m.status_entrega === "falhou" || m.falha_local;
    const anteriorFalhou = anterior && (anterior.status_entrega === "falhou" || anterior.falha_local);
    const mesmaFala =
      grupo &&
      anterior &&
      !falhou &&
      !anteriorFalhou &&
      grupo.falante === falante(m) &&
      new Date(m.criado_em).getTime() - new Date(anterior.criado_em).getTime() <= JANELA_GRUPO_MS;

    if (mesmaFala) grupo.itens.push(m);
    else bloco.grupos.push({ falante: falante(m), itens: [m] });
    anterior = m;
  }
  return blocos;
}

/**
 * RF-30 (proxy honesto sem rastreio de leitura no banco): o bloco de não-lidas é a sequência
 * FINAL de mensagens de entrada (depois da última saída). Retorna o id da primeira não-lida
 * (âncora do divider) e a contagem — ou null se não há pendências.
 */
export function fronteiraNaoLidas(msgs: Mensagem[]): { primeiraId: string; qtd: number } | null {
  let qtd = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].direcao === "entrada") qtd++;
    else break;
  }
  if (qtd === 0) return null;
  return { primeiraId: msgs[msgs.length - qtd].id, qtd };
}

/** Rank RF-5 — usado só pra exibição defensiva (a monotonicidade de verdade é da projeção). */
const RANK: Record<EstadoEntrega, number> = {
  na_fila: 0,
  enviando: 1,
  enviado: 2,
  entregue: 3,
  lido: 4,
  falhou: -1,
};

export function estadoRank(e: EstadoEntrega): number {
  return RANK[e];
}

/** Erros permanentes da Meta (SPEC RF-22/28): sem botão de retry, só o motivo. */
const ERRO_PERMANENTE: Record<string, string> = {
  "131047": "janela de 24h expirada — precisa de template",
  "131026": "número não recebe WhatsApp",
  "130497": "país restrito",
};

export function motivoErroPermanente(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return ERRO_PERMANENTE[codigo] ?? null;
}

/**
 * Erros que se EXPLICAM mas continuam com retry. 131030: o destinatário não está na lista de
 * permissão de um número de TESTE da Meta — incluído na lista, o reenvio entrega (16/09).
 */
const ERRO_COM_RETRY: Record<string, string> = {
  "131030": "número fora da lista de permissão do número de teste (131030) — inclua na Meta e tente de novo",
};

/** O texto que a bolha mostra depois de "não entregue". `null` ⇒ a tela cai no "erro <código>". */
export function motivoErroEnvio(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return motivoErroPermanente(codigo) ?? ERRO_COM_RETRY[codigo] ?? null;
}

/**
 * RF-28/32 — quando a mensagem falhada ganha o botão "Tentar de novo": tem CONTEÚDO reenviável
 * (corpo OU mídia já no bucket — rodada 6) E a falha é local (a action recusou o enfileiramento)
 * OU a projeção confirmou 'falhou' com erro NÃO permanente. Sem janela de tempo: falha retriável
 * continua retriável — o conserto que destrava o reenvio (ex.: sender corrigido pro 131030) pode
 * chegar dias depois da falha. O retry emite evento NOVO na porta (novo dedup_id) com o MESMO
 * midia_caminho (o objeto já está no Storage — não se sobe de novo); a falhada fica no ledger.
 */
export function podeTentarDeNovo(m: Mensagem): boolean {
  if (!m.corpo && !m.midia_caminho?.trim()) return false;
  if (m.falha_local) return true;
  return m.status_entrega === "falhou" && !motivoErroPermanente(m.erro_codigo);
}

/**
 * RF-32 — reconciliação das bolhas otimistas: a pendente some quando a projeção confirma uma
 * mensagem de saída com o mesmo corpo. Linha 'falhou' do servidor NÃO confirma pendente
 * nenhuma — senão a falhada antiga engole o reenvio do mesmo texto e o clique fica invisível.
 * Contrato com o inbox: o chamador aplica o resultado de volta no ESTADO a cada refetch
 * (confirmação é irreversível) — se a linha confirmada virar 'falhou' depois, a pendente já
 * saiu do estado e não ressuscita como bolha fantasma.
 */
export function pendentesVivas(pendentes: Mensagem[], servidor: Mensagem[]): Mensagem[] {
  return pendentes.filter((p) => !servidor.some((m) => confirmaPendente(m, p)));
}

/**
 * Rodada 6: pendente COM mídia casa primeiro pelo midia_caminho (é único por upload — chave
 * perfeita); se a projeção do servidor ainda não trouxer as colunas de mídia (deploy do db em
 * paralelo, cascata de degrade do select), cai pro match por legenda NÃO-vazia. Pendente sem
 * mídia segue o match por corpo de sempre — mas nunca é confirmada por uma linha de mídia
 * (legenda igual a um texto são mensagens diferentes).
 */
function confirmaPendente(m: Mensagem, p: Mensagem): boolean {
  if (m.direcao !== "saida" || m.status_entrega === "falhou") return false;
  const caminhoP = p.midia_caminho?.trim();
  const caminhoM = m.midia_caminho?.trim();
  if (caminhoP) {
    if (caminhoM) return caminhoM === caminhoP;
    const legenda = (p.corpo ?? "").trim();
    return legenda !== "" && (m.corpo ?? "").trim() === legenda;
  }
  if (caminhoM) return false;
  return (m.corpo ?? "").trim() === (p.corpo ?? "").trim();
}
