/**
 * Lógica pura do anexo de mídia no composer (rodada 6) — sem React, testável.
 * Limites da Meta validados NO CLIENTE (D3; o sender revalida): imagem 5MB jpeg/png/webp,
 * áudio 16MB. O webm do gravador (Chrome) passa aqui — quem transcodifica é o SENDER (D1),
 * o front nunca converte nada.
 */

export type CategoriaAnexo = "imagem" | "audio";

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
export const LIMITE_AUDIO_BYTES = 16 * 1024 * 1024;

/**
 * mime aceito → {mime CANÔNICO, extensão do objeto em `saida/<uuid>.<ext>`} (D5).
 * O canônico é o que vai no contentType do upload e no midia_mime do evento: o sender (Trilha A)
 * só conhece o conjunto canônico da Meta ({aac, mp4, mpeg, amr, ogg} + webm do gravador) e trata
 * alias cru (audio/x-m4a, audio/mp3) como falha PERMANENTE — a normalização acontece AQUI.
 */
const MIME_IMAGEM: Record<string, { canonico: string; ext: string }> = {
  "image/jpeg": { canonico: "image/jpeg", ext: "jpg" },
  "image/png": { canonico: "image/png", ext: "png" },
  "image/webp": { canonico: "image/webp", ext: "webp" },
};

const MIME_AUDIO: Record<string, { canonico: string; ext: string }> = {
  "audio/mpeg": { canonico: "audio/mpeg", ext: "mp3" },
  "audio/mp3": { canonico: "audio/mpeg", ext: "mp3" }, // alias comum → canônico
  "audio/mp4": { canonico: "audio/mp4", ext: "m4a" },
  "audio/x-m4a": { canonico: "audio/mp4", ext: "m4a" }, // .m4a no Chrome/macOS → canônico
  "audio/ogg": { canonico: "audio/ogg", ext: "ogg" },
  "audio/aac": { canonico: "audio/aac", ext: "aac" },
  "audio/webm": { canonico: "audio/webm", ext: "webm" }, // gravador do Chrome — remux é do sender (D1)
};

/** `audio/webm;codecs=opus` → `audio/webm` (o MediaRecorder devolve mime com parâmetros). */
export function mimeBase(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export interface AnexoValido {
  ok: true;
  categoria: CategoriaAnexo;
  mime: string; // mime CANÔNICO (alias e ;codecs=… normalizados) — é o que sobe e vai no evento
  ext: string;
}

export interface AnexoInvalido {
  ok: false;
  motivo: string; // PT-BR, pronto pra UI
}

export type ResultadoAnexo = AnexoValido | AnexoInvalido;

function fmtMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/**
 * Valida tipo e tamanho do arquivo/blob antes do upload (D3). Recebe só os campos usados
 * (shape de File e de Blob+nome) pra ser testável sem DOM.
 */
export function validarAnexo(a: { type: string; size: number }): ResultadoAnexo {
  const mime = mimeBase(a.type);
  const imagem = MIME_IMAGEM[mime];
  const audio = MIME_AUDIO[mime];

  if (imagem) {
    if (a.size <= 0) return { ok: false, motivo: "arquivo vazio" };
    if (a.size > LIMITE_IMAGEM_BYTES) {
      return { ok: false, motivo: `imagem passa de ${fmtMB(LIMITE_IMAGEM_BYTES)} — o WhatsApp não aceita` };
    }
    return { ok: true, categoria: "imagem", mime: imagem.canonico, ext: imagem.ext };
  }
  if (audio) {
    if (a.size <= 0) return { ok: false, motivo: "arquivo vazio" };
    if (a.size > LIMITE_AUDIO_BYTES) {
      return { ok: false, motivo: `áudio passa de ${fmtMB(LIMITE_AUDIO_BYTES)} — o WhatsApp não aceita` };
    }
    return { ok: true, categoria: "audio", mime: audio.canonico, ext: audio.ext };
  }
  return {
    ok: false,
    motivo: "tipo não aceito — use foto (JPEG, PNG, WebP) ou áudio (MP3, M4A, OGG, AAC)",
  };
}

/** aceito pelo <input type=file> do clipe (o gravador entra por outro caminho). */
export const ACCEPT_ANEXO = [...Object.keys(MIME_IMAGEM), ...Object.keys(MIME_AUDIO)]
  .filter((m) => m !== "audio/webm")
  .join(",");

/**
 * Mime da GRAVAÇÃO (D1, ordem invertida na R11 — Bloco A): opus primeiro (ogg → webm), audio/mp4
 * por ÚLTIMO. Lição da R10 (DIAGNOSTICO-AUDIO-NAO-ENTREGUE): o Chrome moderno diz suportar
 * audio/mp4 mas grava OPUS em MP4 fragmentado — mime que a Meta aceita, conteúdo que ela rejeita
 * assíncrono ("Media upload error" 131053). Com opus na frente, o Chrome cai no webm/ogg (caminho
 * remuxado e testado do sender) e o mp4 sobra só pro Safari — que o sender da R11 normaliza pelo
 * sniff de bytes. Recebe o predicado (MediaRecorder.isTypeSupported) pra ser puro.
 */
export const MIMES_GRAVACAO_PREFERIDOS = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export function escolherMimeGravacao(suporta: (mime: string) => boolean): string | null {
  for (const m of MIMES_GRAVACAO_PREFERIDOS) {
    try {
      if (suporta(m)) return m;
    } catch {
      /* isTypeSupported não deve lançar, mas navegador antigo… segue a lista */
    }
  }
  return null;
}

/** Caminho do objeto no bucket (D5): prefixo `saida/` fixo — é o que a policy de INSERT permite. */
export function caminhoSaida(uuid: string, ext: string): string {
  return `saida/${uuid}.${ext}`;
}
