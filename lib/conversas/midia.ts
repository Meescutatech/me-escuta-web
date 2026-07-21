import type { Mensagem } from "@/lib/dados/conversas";

/**
 * Lógica pura da pipeline de mídia na thread (rodada 5) — sem React, testável.
 * Contrato: core.mensagem.midia_caminho/midia_mime preenchidos quando o runtime baixou a mídia
 * pro bucket privado 'midia-whatsapp'; enquanto null, a UI mantém o degrade honesto.
 */

/** Tipos que a Meta usa pra mensagem de voz/áudio no webhook. */
const TIPOS_AUDIO = new Set(["audio", "voice", "ptt"]);

export function ehAudio(tipo: string | null | undefined): boolean {
  return TIPOS_AUDIO.has((tipo ?? "").toLowerCase());
}

/** Tipos de foto: PT do contrato do ingestor (parser TIPO_PT) + EN de mock/histórico. */
const TIPOS_IMAGEM = new Set(["image", "imagem"]);

export function ehImagem(tipo: string | null | undefined): boolean {
  return TIPOS_IMAGEM.has((tipo ?? "").toLowerCase());
}

/**
 * <img> só quando é foto E a mídia já está no bucket — mesma regra do player de áudio.
 * Sem caminho, a bolha degrada pro rótulo "Foto recebida" de antes — nunca imagem quebrada.
 */
export function temImagemVisivel(
  m: Pick<Mensagem, "tipo_conteudo" | "midia_caminho">,
): m is Pick<Mensagem, "tipo_conteudo" | "midia_caminho"> & { midia_caminho: string } {
  return ehImagem(m.tipo_conteudo) && !!m.midia_caminho?.trim();
}

/**
 * Player só quando é áudio E a mídia já está no bucket (caminho presente e não-vazio).
 * Caso contrário a bolha degrada pro texto honesto atual — nunca player quebrado.
 */
export function temPlayerDeAudio(
  m: Pick<Mensagem, "tipo_conteudo" | "midia_caminho">,
): m is Pick<Mensagem, "tipo_conteudo" | "midia_caminho"> & { midia_caminho: string } {
  return ehAudio(m.tipo_conteudo) && !!m.midia_caminho?.trim();
}

/**
 * Guarda defensiva do caminho antes de pedir signed URL: chave simples do bucket, sem traversal,
 * sem URL absoluta. (A porta de verdade é o RLS do Storage; isto só corta pedido malformado.)
 */
export function caminhoValido(caminho: string): boolean {
  const c = caminho.trim();
  if (!c || c.length > 300) return false;
  if (c.includes("..") || c.startsWith("/") || c.includes("://")) return false;
  return true;
}
