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

/** Tipos de foto: PT do contrato do ingestor (parser TIPO_PT) + EN de linhas históricas. */
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

/** Tipos de documento: PT do contrato do ingestor (parser TIPO_PT) + EN de linhas históricas. */
const TIPOS_DOCUMENTO = new Set(["document", "documento"]);

export function ehDocumento(tipo: string | null | undefined): boolean {
  return TIPOS_DOCUMENTO.has((tipo ?? "").toLowerCase());
}

/**
 * Download só quando é documento E a mídia já está no bucket — mesma regra do player e da foto.
 *
 * Sem caminho a bolha degrada para o rótulo "Documento recebido", e isso é a guarda funcionando:
 * um botão de download apontando para lugar nenhum é pior que o rótulo honesto. Foi exatamente o
 * defeito do `BolhaDocumento` antigo — ícone de download com ZERO `onClick`.
 */
export function temDocumentoBaixavel(
  m: Pick<Mensagem, "tipo_conteudo" | "midia_caminho">,
): m is Pick<Mensagem, "tipo_conteudo" | "midia_caminho"> & { midia_caminho: string } {
  return ehDocumento(m.tipo_conteudo) && !!m.midia_caminho?.trim();
}

/** Tipos de vídeo: `video` é o mesmo em PT e EN no TIPO_PT do ingestor; `vídeo` cobre digitação. */
const TIPOS_VIDEO = new Set(["video", "vídeo"]);

export function ehVideo(tipo: string | null | undefined): boolean {
  return TIPOS_VIDEO.has((tipo ?? "").toLowerCase());
}

/**
 * `<video>` só quando é vídeo E a mídia já está no bucket — a mesma régua do player de áudio.
 *
 * Sem caminho a bolha degrada para "Vídeo recebido", e isso é a guarda funcionando. Foi o que
 * esteve NA TELA até 21/09 sobre um mp4 de 1,5 MB que já estava no bucket: o portão exigia
 * `midia_url`, e `caminhosParaAssinar` nunca assinava vídeo — condição que nunca era verdadeira.
 */
export function temVideoVisivel(
  m: Pick<Mensagem, "tipo_conteudo" | "midia_caminho">,
): m is Pick<Mensagem, "tipo_conteudo" | "midia_caminho"> & { midia_caminho: string } {
  return ehVideo(m.tipo_conteudo) && !!m.midia_caminho?.trim();
}

/** Figurinha: PT do contrato do ingestor (`sticker` → `figurinha`) + EN das linhas históricas. */
const TIPOS_FIGURINHA = new Set(["sticker", "figurinha"]);

export function ehFigurinhaTipo(tipo: string | null | undefined): boolean {
  return TIPOS_FIGURINHA.has((tipo ?? "").toLowerCase());
}

/**
 * Figurinha visível — mesmo buraco do vídeo, mesmo conserto. O portão antigo (`&& m.midia_url`)
 * vivia só no ensaio, onde a fixture injeta a URL na mão.
 */
export function temFigurinhaVisivel(
  m: Pick<Mensagem, "tipo_conteudo" | "midia_caminho">,
): m is Pick<Mensagem, "tipo_conteudo" | "midia_caminho"> & { midia_caminho: string } {
  return ehFigurinhaTipo(m.tipo_conteudo) && !!m.midia_caminho?.trim();
}

/**
 * NOME DO ARQUIVO no download, derivado do CAMINHO (D-B1-c, decisão do Diogo em 18/09/2026).
 *
 * O WhatsApp manda o nome original (`documentMessage.fileName`) e o parser do Lite passou a retê-lo
 * — mas guardá-lo exigiria coluna nova em `core.mensagem`, projetor novo e retenção nos DOIS canais.
 * Isso ficou medido no card para depois. Até lá o nome é `<id>.pdf`: feio e honesto.
 *
 * ⚠️ Vai no atributo `download` de uma âncora, então ele NUNCA pode carregar caminho: o basename é
 * a regra, e `..` e `/` saem fora. Não é paranoia de segurança — é que `download="../x"` faz o
 * navegador salvar com um nome que a pessoa não pediu.
 */
export function nomeDoDocumento(caminho: string | null | undefined): string {
  const c = (caminho ?? "").trim();
  const base = c.split("/").pop()?.replaceAll("..", "").trim() ?? "";
  return base || "documento";
}

/**
 * Caminhos de mídia que a thread VAI renderizar (player/imagem), únicos e na ordem de aparição —
 * entrada do batch de signed URLs no servidor (1 round-trip pra thread toda, em vez de 1 server
 * action por bolha ao montar, que o React roda em série no cliente).
 */
export function caminhosParaAssinar(
  mensagens: Pick<Mensagem, "tipo_conteudo" | "midia_caminho">[],
): string[] {
  const unicos = new Set<string>();
  for (const m of mensagens) {
    if (
      temPlayerDeAudio(m) ||
      temImagemVisivel(m) ||
      temDocumentoBaixavel(m) ||
      temVideoVisivel(m) ||
      temFigurinhaVisivel(m)
    ) {
      unicos.add(m.midia_caminho!.trim());
    }
  }
  return [...unicos];
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
