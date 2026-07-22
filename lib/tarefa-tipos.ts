/**
 * TIPOS DE TAREFA — config, nunca código (Constituição §4; spec §4.1.3).
 *
 * Por que o tipo importa: no Kommo 61,7% das tarefas não têm texto nenhum e o resultado só é
 * preenchido em 29% dos casos — mas os tipos que a operação criou têm 60–89% de resultado.
 * Tipo específico compra qualidade que campo livre não compra.
 *
 * A lista vem de `core.config` (nome `tipo_tarefa`) — a leitura mora em `lib/dados/tarefa-tipos.ts`.
 * Aqui fica só o que é puro, para que componente de cliente possa usar a semente sem arrastar o
 * cliente de servidor junto. Enquanto o Bloco A não semeia a config, vale a SEMENTE PROVISÓRIA
 * da spec §4.1.3, derivada dos textos reais do DW.
 */

export interface TipoTarefa {
  chave: string;
  rotulo: string;
}

/**
 * Semente da spec §4.1.3, com as MESMAS chaves que o Bloco A semeou na config `tipo_tarefa`
 * (migration 0037) — conferidas contra o RELATORIO-BLOCO-A §A4. É só rede de segurança para o
 * ambiente onde a 0037 ainda não subiu; a config manda sempre que existir.
 */
export const TIPOS_TAREFA_SEMENTE: TipoTarefa[] = [
  { chave: "acompanhar_follow_up", rotulo: "Acompanhar / Follow-up" },
  { chave: "confirmar_consulta", rotulo: "Confirmar consulta" },
  { chave: "confirmar_exame", rotulo: "Confirmar exame" },
  { chave: "confirmar_pagamento", rotulo: "Confirmar pagamento" },
  { chave: "validar_serasa", rotulo: "Validar Serasa" },
  { chave: "assistencia_tecnica", rotulo: "Assistência técnica" },
  { chave: "logistica_expedicao", rotulo: "Logística / expedição" },
  { chave: "emitir_contrato", rotulo: "Emitir contrato" },
  { chave: "pos_venda", rotulo: "Pós-venda" },
];

/**
 * Aceita os dois formatos plausíveis para a config do Bloco A, porque o shape ainda não está
 * cravado: `{tipos:[{chave,rotulo}]}` ou `{tipos:["Acompanhar", ...]}`. Shape desconhecido
 * devolve null e a semente assume — nunca uma lista vazia na cara do operador.
 */
export function parseTiposTarefa(payload: unknown): TipoTarefa[] | null {
  if (!payload || typeof payload !== "object") return null;
  const bruto = (payload as any).tipos;
  if (!Array.isArray(bruto) || bruto.length === 0) return null;
  const tipos: TipoTarefa[] = [];
  for (const item of bruto) {
    if (typeof item === "string" && item.trim()) {
      tipos.push({ chave: chaveDe(item), rotulo: item.trim() });
    } else if (item && typeof item === "object") {
      const rotulo = String((item as any).rotulo ?? (item as any).nome ?? "").trim();
      const chave = String((item as any).chave ?? (item as any).id ?? "").trim() || chaveDe(rotulo);
      if (rotulo) tipos.push({ chave, rotulo });
    }
  }
  return tipos.length > 0 ? tipos : null;
}

function chaveDe(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
