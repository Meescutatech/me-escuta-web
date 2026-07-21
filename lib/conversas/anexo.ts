/**
 * Lógica pura do anexo de mídia no composer (rodada 6) — sem React, testável.
 * Limites da Meta validados NO CLIENTE (D3; o sender revalida): imagem 5MB jpeg/png/webp,
 * áudio 16MB. O webm do gravador (Chrome) passa aqui — quem transcodifica é o SENDER (D1),
 * o front nunca converte nada.
 */

export type CategoriaAnexo = "imagem" | "audio";

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
export const LIMITE_AUDIO_BYTES = 16 * 1024 * 1024;

/** mime aceito → extensão do objeto em `saida/<uuid>.<ext>` (D5). */
const MIME_IMAGEM: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_AUDIO: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/webm": "webm", // gravador do Chrome — remux é do sender (D1)
};

/** `audio/webm;codecs=opus` → `audio/webm` (o MediaRecorder devolve mime com parâmetros). */
export function mimeBase(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export interface AnexoValido {
  ok: true;
  categoria: CategoriaAnexo;
  mime: string; // mime base normalizado (sem ;codecs=…)
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
  const extImagem = MIME_IMAGEM[mime];
  const extAudio = MIME_AUDIO[mime];

  if (extImagem) {
    if (a.size <= 0) return { ok: false, motivo: "arquivo vazio" };
    if (a.size > LIMITE_IMAGEM_BYTES) {
      return { ok: false, motivo: `imagem passa de ${fmtMB(LIMITE_IMAGEM_BYTES)} — o WhatsApp não aceita` };
    }
    return { ok: true, categoria: "imagem", mime, ext: extImagem };
  }
  if (extAudio) {
    if (a.size <= 0) return { ok: false, motivo: "arquivo vazio" };
    if (a.size > LIMITE_AUDIO_BYTES) {
      return { ok: false, motivo: `áudio passa de ${fmtMB(LIMITE_AUDIO_BYTES)} — o WhatsApp não aceita` };
    }
    return { ok: true, categoria: "audio", mime, ext: extAudio };
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
 * Mime da GRAVAÇÃO (D1): preferir formatos que a Meta aceita direto (Safari grava audio/mp4;
 * Firefox suporta audio/ogg) e só cair no audio/webm;codecs=opus do Chrome quando não houver
 * opção — esse o sender remuxa. Recebe o predicado (MediaRecorder.isTypeSupported) pra ser puro.
 */
export const MIMES_GRAVACAO_PREFERIDOS = [
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
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
