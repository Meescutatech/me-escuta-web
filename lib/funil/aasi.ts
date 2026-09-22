/**
 * 3b · BLOCO AASI (aparelho auditivo) — motor PURO das opções condicionadas ao modelo.
 *
 * Requisito da Me Escuta (Diogo Vidigal, 22/09/2026):
 *  - Bloco "AASI" preenchido SÓ quando o lead vai testar um aparelho conosco, PELA fonoaudióloga.
 *  - Receptor OE, Receptor OD, Oliva OE, Oliva OD = LISTA DE SELEÇÃO condicionada ao MODELO de AASI.
 *  - Origem AASI / Já testou / Já usa saem do AASI e vão para o bloco "Principal" (tratado na config,
 *    não aqui — este motor cuida só dos 4 campos condicionados + o Modelo que os governa).
 *
 * Sem I/O, client-safe, testável com node --test. A UI (ficha do lead) e a action de gravação
 * consomem `opcoesDoCampoAasi()` para saber quais opções mostrar dado o modelo selecionado.
 *
 * ⚠️ MAPA-SEMENTE, NÃO CANÔNICO: o de-para modelo→receptores/olivas é conhecimento CLÍNICO da
 * Me Escuta e ainda não foi fornecido por inteiro. Abaixo há apenas uma semente pequena para o
 * mecanismo funcionar ponta a ponta; a lista real será preenchida quando a Me Escuta enviá-la
 * (idealmente migrando para a config `ficha_lead` no banco, sem trocar este contrato).
 */

export type Ouvido = "OE" | "OD";
export type CampoAasi = "receptor_oe" | "receptor_od" | "oliva_oe" | "oliva_od";

/** Os 4 campos condicionados do bloco, na ordem de exibição (OE/OD lado a lado por tipo). */
export const CAMPOS_AASI_CONDICIONADOS: readonly CampoAasi[] = [
  "receptor_oe",
  "receptor_od",
  "oliva_oe",
  "oliva_od",
] as const;

/** slug do campo que GOVERNA as opções (o Modelo selecionado). */
export const SLUG_MODELO = "modelo";

/** Opções válidas de um modelo: receptores e olivas aceitos. Vazio = ainda não mapeado. */
export interface OpcoesModelo {
  receptores: string[];
  olivas: string[];
}

/**
 * MAPA-SEMENTE modelo → { receptores, olivas }. Chaves = valores exatos do campo Modelo (Kommo).
 * Preencher com o de-para clínico real quando a Me Escuta enviar. Modelo ausente do mapa cai no
 * fallback honesto (ver `opcoesDoCampoAasi`): lista vazia + sinal de "não mapeado", nunca opção
 * inventada.
 */
export const MAPA_MODELO_AASI: Record<string, OpcoesModelo> = {
  // SEMENTE — exemplo plausível de linha RIC recarregável; NÃO é a lista clínica oficial.
  "REXTON - R-LI 40 BICORE RECARREGÁVEL": {
    receptores: ["S (Standard)", "M (Medium)", "P (Power)", "HP (High Power)"],
    olivas: ["Aberta", "Tulipa", "Fechada", "Power (dupla)", "Molde sob medida"],
  },
};

export interface ResolucaoOpcoes {
  /** opções a mostrar na seleção. Vazio quando o modelo não está mapeado (ou não foi escolhido). */
  opcoes: string[];
  /**
   * por que está vazio, para a UI dar a mensagem certa em vez de um select morto e silencioso:
   *  - "ok"           → há opções
   *  - "sem_modelo"   → nenhum modelo selecionado ainda (escolha o Modelo primeiro)
   *  - "nao_mapeado"  → modelo escolhido mas ainda sem de-para clínico (Me Escuta vai completar)
   */
  estado: "ok" | "sem_modelo" | "nao_mapeado";
}

/**
 * Resolve as opções de um campo condicionado do AASI dado o modelo selecionado. PURA.
 *
 * Nunca inventa opção: se o modelo não está no mapa, devolve `nao_mapeado` com lista vazia — a UI
 * mostra "cadastre o de-para deste modelo" em vez de um select fantasma. Mesma disciplina de
 * "nunca no escuro" dos portões do funil.
 */
export function opcoesDoCampoAasi(
  campo: CampoAasi,
  modeloSelecionado: string | null | undefined,
  mapa: Record<string, OpcoesModelo> = MAPA_MODELO_AASI,
): ResolucaoOpcoes {
  const modelo = modeloSelecionado?.trim();
  if (!modelo) return { opcoes: [], estado: "sem_modelo" };
  const entrada = mapa[modelo];
  if (!entrada) return { opcoes: [], estado: "nao_mapeado" };
  const ehReceptor = campo === "receptor_oe" || campo === "receptor_od";
  const lista = ehReceptor ? entrada.receptores : entrada.olivas;
  if (!lista || lista.length === 0) return { opcoes: [], estado: "nao_mapeado" };
  return { opcoes: [...lista], estado: "ok" };
}

/**
 * Um valor já gravado é válido para o modelo atual? Usado ao trocar o modelo: se o receptor/oliva
 * antes escolhido não pertence ao novo modelo, a UI deve sinalizar (ou limpar) — evita gravar um
 * receptor incompatível só porque o modelo mudou depois.
 */
export function valorAindaValido(
  campo: CampoAasi,
  valor: string | null | undefined,
  modeloSelecionado: string | null | undefined,
  mapa: Record<string, OpcoesModelo> = MAPA_MODELO_AASI,
): boolean {
  const v = valor?.trim();
  if (!v) return true; // vazio é sempre válido (campo não preenchido)
  return opcoesDoCampoAasi(campo, modeloSelecionado, mapa).opcoes.includes(v);
}

/** Rótulo legível de cada campo condicionado (para a UI). */
export const ROTULO_CAMPO_AASI: Record<CampoAasi, string> = {
  receptor_oe: "Receptor OE",
  receptor_od: "Receptor OD",
  oliva_oe: "Oliva OE",
  oliva_od: "Oliva OD",
};
