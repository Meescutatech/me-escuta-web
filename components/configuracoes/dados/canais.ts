/**
 * F9 · LEITURA dos canais. SERVIDOR.
 *
 * Fonte: `core.v_canal_whatsapp` (ARB-21), que ainda NÃO EXISTE nesta base — as migrations
 * 0069/0075 são desta mesma noite. Tudo aqui degrada honesto (padrão da casa para deploy fora de
 * ordem): sem a view, a tela mostra "indisponível" com o motivo, nunca uma tela morta e nunca uma
 * lista vazia que pareça "não há canais".
 *
 * Duas ausências medidas no contrato, tratadas aqui e registradas no adendo ao Agent 3:
 *   • `inbox_desde` não está na view → o SELECT tenta com a coluna e cai para o sem-ela. Ausente
 *     significa "não sei", e "não sei" exige o corte na ativação (regra em regras/canais.ts).
 *   • Não há view nem RPC sobre `pgmq fila_saida` (e `pgmq`/`ops` estão fora da Data API) → a
 *     contagem de pendentes é `null`, e a confirmação de desligar vira INCONDICIONAL.
 */

import { criarClienteServidor } from "@/lib/supabase/server";
import { finalidadeValida, provedorValido, type Canal, type Provedor } from "../regras/canais.ts";

/**
 * M7 · As colunas são pedidas em DEGRAUS, do mais completo para o mais antigo, e a razão é de
 * sequenciamento de deploy: a web pode subir ANTES da migration que acrescenta `finalidade` e
 * `consentimento_por` à view. PostgREST recusa a consulta INTEIRA quando uma coluna não existe —
 * sem os degraus, a tela de canais ficaria vazia num ambiente onde não há defeito nenhum, e lista
 * vazia é indistinguível de "não há canais".
 *
 * O degrau NÃO substitui a migration: sem a coluna, a funcionalidade não existe. O que ele compra
 * é que a falta apareça como "não sei", com o motivo, em vez de tela morta.
 */
const COLUNAS_BASE =
  "canal_id,nome,provedor,ativo,numero,waba_id,area_efetiva,pareado_em,consentimento_em,consentimento_titular,consentimento_texto_versao,risco_ban_aceito,desativado_em,criado_em";

/** Do mais completo para o mais pobre. O primeiro que responder vence. */
const DEGRAUS: { colunas: string; corte: boolean; m7: boolean }[] = [
  { colunas: `${COLUNAS_BASE},inbox_desde,finalidade,consentimento_por`, corte: true, m7: true },
  { colunas: `${COLUNAS_BASE},inbox_desde`, corte: true, m7: false },
  { colunas: COLUNAS_BASE, corte: false, m7: false },
];

export interface CanaisLidos {
  canais: Canal[];
  /** true = a view não existe ou a leitura falhou. A tela diz isso; não finge lista vazia. */
  indisponivel: boolean;
  /** false = a view não expõe `inbox_desde`; a ativação passa a exigir o corte sempre. */
  corteLegivel: boolean;
  /**
   * M7. `false` = a view ainda não tem `finalidade` nem `consentimento_por` (a `0094` não está
   * aplicada neste ambiente). A tela DIZ isso — senão mostra "Não declarada" em toda linha e a
   * gestora conclui que ninguém preencheu, quando o que falta é a coluna.
   */
  m7Legivel: boolean;
}

function mapear(linha: Record<string, unknown>, temCorte: boolean, temM7: boolean): Canal | null {
  const canalId = String(linha.canal_id ?? "").trim();
  if (!canalId) return null;
  const provedorBruto = String(linha.provedor ?? "waba");
  const provedor: Provedor = provedorValido(provedorBruto) ? provedorBruto : "waba";
  return {
    canal_id: canalId,
    nome: String(linha.nome ?? canalId),
    provedor,
    ativo: linha.ativo === true,
    numero: linha.numero ? String(linha.numero) : null,
    waba_id: linha.waba_id ? String(linha.waba_id) : null,
    area_efetiva: linha.area_efetiva ? String(linha.area_efetiva) : null,
    pareado_em: linha.pareado_em ? String(linha.pareado_em) : null,
    consentimento_em: linha.consentimento_em ? String(linha.consentimento_em) : null,
    consentimento_titular: linha.consentimento_titular ? String(linha.consentimento_titular) : null,
    consentimento_texto_versao: linha.consentimento_texto_versao ? String(linha.consentimento_texto_versao) : null,
    risco_ban_aceito: linha.risco_ban_aceito === true || provedor === "nao_oficial",
    desativado_em: linha.desativado_em ? String(linha.desativado_em) : null,
    criado_em: linha.criado_em ? String(linha.criado_em) : null,
    inbox_desde: temCorte && linha.inbox_desde ? String(linha.inbox_desde) : null,
    consentimento_por: temM7 && linha.consentimento_por ? String(linha.consentimento_por) : null,
    // `null` aqui significa "não declarada" OU "coluna ausente" — nunca "produção". Quem decide
    // qual dos dois é o `m7Legivel`, e a tela mostra textos diferentes para cada um.
    finalidade: temM7 && finalidadeValida(linha.finalidade) ? linha.finalidade : null,
  };
}

export async function lerCanais(): Promise<CanaisLidos> {
  try {
    const supabase = criarClienteServidor();
    const consulta = (colunas: string) =>
      supabase.schema("core").from("v_canal_whatsapp").select(colunas).limit(100);

    for (const degrau of DEGRAUS) {
      const { data, error } = await consulta(degrau.colunas);
      if (error || !data) continue;
      const canais = (data as unknown as Record<string, unknown>[])
        .map((l) => mapear(l, degrau.corte, degrau.m7))
        .filter((c): c is Canal => c !== null);
      return { canais, indisponivel: false, corteLegivel: degrau.corte, m7Legivel: degrau.m7 };
    }
    // Nenhum degrau respondeu: a view não existe, ou a leitura falhou por outro motivo.
    return { canais: [], indisponivel: true, corteLegivel: false, m7Legivel: false };
  } catch {
    return { canais: [], indisponivel: true, corteLegivel: false, m7Legivel: false };
  }
}

export async function lerCanal(canalId: string): Promise<Canal | null> {
  const { canais } = await lerCanais();
  return canais.find((c) => c.canal_id === canalId) ?? null;
}

/**
 * Quantas mensagens deste canal estão em voo na fila de saída.
 *
 * SEMPRE `null` hoje, e isto é fato medido, não preguiça: a fila é `pgmq`, `pgmq` e `ops` estão
 * FORA da Data API por decisão declarada no `config.toml`, e não existe view nem RPC em `core`
 * que exponha a contagem. A tela usa o `null` para exigir confirmação INCONDICIONAL ao desligar —
 * mais estrito do que o EARS pedia, porque desligar canal com fila cheia transforma cada item em
 * falha PERMANENTE e isso não tem desfazer.
 */
export async function contarPendentesFilaSaida(_canalId: string): Promise<number | null> {
  return null;
}
