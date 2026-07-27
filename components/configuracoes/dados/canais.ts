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
import { provedorValido, type Canal, type Provedor } from "../regras/canais.ts";

const COLUNAS_COM_CORTE =
  "canal_id,nome,provedor,ativo,numero,waba_id,area_efetiva,inbox_desde,pareado_em,consentimento_em,consentimento_titular,consentimento_texto_versao,risco_ban_aceito,desativado_em,criado_em";
const COLUNAS_SEM_CORTE =
  "canal_id,nome,provedor,ativo,numero,waba_id,area_efetiva,pareado_em,consentimento_em,consentimento_titular,risco_ban_aceito,desativado_em,criado_em";

export interface CanaisLidos {
  canais: Canal[];
  /** true = a view não existe ou a leitura falhou. A tela diz isso; não finge lista vazia. */
  indisponivel: boolean;
  /** false = a view não expõe `inbox_desde`; a ativação passa a exigir o corte sempre. */
  corteLegivel: boolean;
}

function mapear(linha: Record<string, unknown>, temCorte: boolean): Canal | null {
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
  };
}

export async function lerCanais(): Promise<CanaisLidos> {
  try {
    const supabase = criarClienteServidor();
    const consulta = (colunas: string) =>
      supabase.schema("core").from("v_canal_whatsapp").select(colunas).limit(100);

    let corteLegivel = true;
    let { data, error } = await consulta(COLUNAS_COM_CORTE);
    if (error) {
      corteLegivel = false;
      ({ data, error } = await consulta(COLUNAS_SEM_CORTE));
    }
    if (error || !data) return { canais: [], indisponivel: true, corteLegivel: false };

    const canais = (data as unknown as Record<string, unknown>[])
      .map((l) => mapear(l, corteLegivel))
      .filter((c): c is Canal => c !== null);
    return { canais, indisponivel: false, corteLegivel };
  } catch {
    return { canais: [], indisponivel: true, corteLegivel: false };
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
