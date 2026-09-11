import type { Mencionavel } from "@/lib/conversas/mencao";
import { PESSOAS } from "../modo";
import { gerarAgentesEnsaio } from "./agentes";

/** A lista canônica do `@` (core.v_membro + core.agente) — as 4 pessoas e os 4 agentes da fixture. */
export function mencionaveisEnsaio(agora: Date = new Date()): Mencionavel[] {
  return [
    ...PESSOAS.map((p) => ({ id: p.id, tipo: "humano" as const, nome: p.nome, papel: p.papel, ativo: true })),
    ...gerarAgentesEnsaio(agora).map((a) => ({ id: `agente:${a.chave}`, tipo: "agente" as const, nome: a.nome, papel: a.papel, ativo: a.ativo })),
  ];
}
