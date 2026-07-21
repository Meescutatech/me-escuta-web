import type { EstadoEntrega, Mensagem } from "@/lib/dados/conversas";

/**
 * Lógica pura do thread (SPEC-PIPELINE-MENSAGENS RF-27/29/30): agrupamento de rajada,
 * blocos de dia e fronteira de não-lidas. Sem React — testável e reusável.
 */

/** Janela de corte do grupo visual — 60s (SPEC RF-27, BENCHMARK-UX P1/D1). */
export const JANELA_GRUPO_MS = 60_000;

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
 * RF-28/32 — quando a mensagem falhada ganha o botão "Tentar de novo": tem corpo E a falha é
 * local (a action recusou o enfileiramento) OU a projeção confirmou 'falhou' com erro NÃO
 * permanente. Sem janela de tempo: falha retriável continua retriável — o conserto que
 * destrava o reenvio (ex.: sender corrigido pro 131030) pode chegar dias depois da falha.
 * O retry emite evento NOVO na porta (novo dedup_id); a falhada fica no ledger como está.
 */
export function podeTentarDeNovo(m: Mensagem): boolean {
  if (!m.corpo) return false;
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
  return pendentes.filter(
    (p) =>
      !servidor.some(
        (m) =>
          m.direcao === "saida" &&
          m.status_entrega !== "falhou" &&
          (m.corpo ?? "").trim() === (p.corpo ?? "").trim(),
      ),
  );
}
