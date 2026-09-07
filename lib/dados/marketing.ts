import { criarClienteServidor } from "@/lib/supabase/server";
import { montarVisao, type Periodo, type VisaoMarketing } from "./marketing-calculos";
import { entradaDeEnsaio } from "./marketing-ensaio";
import { lerFlagModuloMarketingCom, lerMarketingCom } from "./marketing-leitura";

export { PRESETS, hojeSP, periodoDaUrl, type Periodo, type VisaoMarketing } from "./marketing-calculos";
export { TETO_TOQUES, TETO_CUSTO } from "./marketing-leitura";

/**
 * Marketing — a COLA DO NEXT (servidor, mesma sessao/RLS do resto do app).
 *
 * Em 07/09/2026 (D68) toda a leitura saiu deste arquivo para `marketing-leitura.ts`, que recebe o
 * cliente por parametro e nao importa `next/headers`. O motivo esta la: o servidor MCP do
 * Fernando le pelas MESMAS consultas, e duas copias do mesmo numero divergem no primeiro dia.
 *
 * Aqui ficou o que so faz sentido dentro do Next: criar o cliente de sessao (cookie) e o modo de
 * ensaio, que depende de uma env `NEXT_PUBLIC_*`.
 */

/** Modo de ensaio: fixture no lugar do banco. So com a env explicita; nunca por padrao. */
export function ensaioLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_MARKETING_ENSAIO === "1";
}

/**
 * A flag de release. `null` = a linha nao existe em `core.config` (so nasce por migration).
 * Ausente NAO desliga: a tela funciona; so `false` recusa.
 */
export async function lerFlagModuloMarketing(): Promise<boolean | null> {
  return lerFlagModuloMarketingCom(criarClienteServidor());
}

export async function lerMarketing(periodo: Periodo, agora: Date = new Date()): Promise<VisaoMarketing> {
  if (ensaioLigado()) return montarVisao(entradaDeEnsaio(periodo, agora));
  return lerMarketingCom(criarClienteServidor(), periodo, agora);
}
