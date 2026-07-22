"use client";

import { useEffect, useRef, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import {
  ACCEPT_ANEXO,
  caminhoSaida,
  escolherMimeGravacao,
  mimeBase,
  validarAnexo,
  type CategoriaAnexo,
} from "@/lib/conversas/anexo";
import { cn } from "@/lib/utils";

/*
 * Composer do /conversas (rodada 6 — mídia bidirecional). Extraído do inbox pra caber o anexo:
 * clipe → foto (preview + legenda) ou arquivo de áudio; microfone → gravação via MediaRecorder
 * (preferindo audio/mp4|ogg; webm do Chrome passa — remux é do SENDER, D1). Validação de
 * tipo/tamanho no CLIENTE (D3, lib/conversas/anexo.ts). Upload DIRETO pro Storage com o cliente
 * de SESSÃO em `saida/<uuid>.<ext>` (D5) e só então o pai emite o evento estendido (D4) e faz a
 * bolha otimista — a mecânica de envio/retry continua toda no inbox.
 */

export interface MidiaPronta {
  caminho: string;
  mime: string;
  tipo: CategoriaAnexo;
  legenda: string | null;
}

interface Anexo {
  blob: Blob;
  mime: string;
  ext: string;
  categoria: CategoriaAnexo;
  nome: string;
  previewUrl: string;
}

function fmtSegundos(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Composer({
  modoClara,
  pending,
  onEnviarTexto,
  onEnviarMidia,
  onDigitar,
  avisar,
}: {
  modoClara: boolean;
  pending: boolean;
  onEnviarTexto: (texto: string) => void;
  onEnviarMidia: (m: MidiaPronta) => void;
  /** PRESENÇA (Rodada 11): chamado a cada tecla com texto — o pai decide (throttle) se sinaliza "digitando…". */
  onDigitar?: () => void;
  avisar: (msg: string) => void;
}) {
  const [rascunho, setRascunho] = useState("");
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const descartarGravacaoRef = useRef(false);
  const cronometroRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // troca/limpeza de anexo libera o object URL do preview
  useEffect(() => {
    const url = anexo?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [anexo?.previewUrl]);

  // desmontar no meio de uma gravação: para o gravador e solta o microfone
  useEffect(() => {
    return () => {
      const g = gravadorRef.current;
      if (g && g.state !== "inactive") {
        descartarGravacaoRef.current = true;
        g.stop();
      }
      if (cronometroRef.current) clearInterval(cronometroRef.current);
    };
  }, []);

  function definirAnexo(blob: Blob, nome: string) {
    const v = validarAnexo(blob);
    if (!v.ok) {
      avisar(v.motivo);
      return;
    }
    setAnexo({
      blob,
      mime: v.mime,
      ext: v.ext,
      categoria: v.categoria,
      nome,
      previewUrl: URL.createObjectURL(blob),
    });
  }

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // escolher o mesmo arquivo de novo dispara onChange de novo
    if (f) definirAnexo(f, f.name);
  }

  async function iniciarGravacao() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      avisar("este navegador não suporta gravação de áudio");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      avisar("sem acesso ao microfone — libere a permissão no navegador");
      return;
    }
    const mime = escolherMimeGravacao((m) => MediaRecorder.isTypeSupported(m));
    const gravador = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    pedacosRef.current = [];
    descartarGravacaoRef.current = false;
    gravador.ondataavailable = (ev) => {
      if (ev.data.size > 0) pedacosRef.current.push(ev.data);
    };
    gravador.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cronometroRef.current) clearInterval(cronometroRef.current);
      setGravando(false);
      setSegundos(0);
      if (descartarGravacaoRef.current) return;
      const tipo = mimeBase(gravador.mimeType || mime || "audio/webm");
      const blob = new Blob(pedacosRef.current, { type: tipo });
      definirAnexo(blob, "Gravação de voz");
    };
    gravadorRef.current = gravador;
    gravador.start();
    setGravando(true);
    setSegundos(0);
    cronometroRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  function pararGravacao(descartar: boolean) {
    descartarGravacaoRef.current = descartar;
    const g = gravadorRef.current;
    if (g && g.state !== "inactive") g.stop();
  }

  async function enviar() {
    if (pending || subindo) return;
    if (!anexo) {
      const texto = rascunho.trim();
      if (!texto) return;
      setRascunho("");
      onEnviarTexto(texto);
      return;
    }
    // anexo: sobe pro bucket com o cliente de sessão (RLS decide; a policy INSERT restrita a
    // saida/ é do backend — sem ela o upload falha aqui com aviso honesto, nada quebra)
    setSubindo(true);
    try {
      const caminho = caminhoSaida(crypto.randomUUID(), anexo.ext);
      const { error } = await criarClienteBrowser()
        .storage.from("midia-whatsapp")
        .upload(caminho, anexo.blob, { contentType: anexo.mime, upsert: false });
      if (error) {
        console.error("upload do anexo falhou:", error.message);
        avisar("não deu pra subir o anexo — tente de novo");
        return; // anexo e legenda ficam — dá pra tentar de novo
      }
      const legenda = anexo.categoria === "imagem" ? rascunho.trim() || null : null;
      onEnviarMidia({ caminho, mime: anexo.mime, tipo: anexo.categoria, legenda });
      setAnexo(null);
      setRascunho("");
    } finally {
      setSubindo(false);
    }
  }

  const ehImagemAnexo = anexo?.categoria === "imagem";
  const placeholder = anexo
    ? ehImagemAnexo
      ? "Legenda da foto (opcional)…"
      : "Áudio não leva legenda no WhatsApp"
    : modoClara
      ? "Escreva para assumir a conversa…"
      : "Escreva como Sara…";

  return (
    <div className="flex-shrink-0 bg-board px-4 pb-4 pt-3">
      {/* faixa de preview do anexo (foto ou áudio) — descartável antes do envio */}
      {anexo && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-linha bg-branco px-3 py-2">
          {ehImagemAnexo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={anexo.previewUrl}
              alt="Prévia da foto anexada"
              className="h-14 w-14 shrink-0 rounded-lg border border-linha object-cover"
            />
          ) : (
            <audio controls preload="metadata" src={anexo.previewUrl} className="h-9 w-64 max-w-full" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.8rem] font-medium text-navy">{anexo.nome}</div>
            <div className="text-[0.72rem] text-mute">
              {ehImagemAnexo ? "Foto" : "Áudio"} · {(anexo.blob.size / (1024 * 1024)).toFixed(1)}MB
            </div>
          </div>
          <button
            onClick={() => setAnexo(null)}
            disabled={subindo}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta disabled:opacity-50"
          >
            Descartar
          </button>
        </div>
      )}

      {/* barra de gravação em curso */}
      {gravando && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-vermelho-bd bg-vermelho-bg px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-vermelho" />
          <span className="text-[0.84rem] font-medium tabular-nums text-navy">
            Gravando… {fmtSegundos(segundos)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => pararGravacao(true)}
              className="rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
            >
              Descartar
            </button>
            <button
              onClick={() => pararGravacao(false)}
              className="rounded-lg bg-navy px-3.5 py-1.5 text-[0.78rem] font-semibold text-branco transition-colors hover:bg-navy-esc"
            >
              Parar
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-1.5 rounded-xl border border-linha-forte bg-branco py-2 pl-2 pr-2 focus-within:border-foco-comp">
        <input
          ref={inputArquivoRef}
          type="file"
          accept={ACCEPT_ANEXO}
          onChange={aoEscolherArquivo}
          className="hidden"
          aria-label="Anexar foto ou áudio"
        />
        <button
          onClick={() => inputArquivoRef.current?.click()}
          disabled={subindo || gravando}
          title="Anexar foto ou áudio"
          aria-label="Anexar foto ou áudio"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] stroke-current" fill="none">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          onClick={iniciarGravacao}
          disabled={subindo || gravando || !!anexo}
          title="Gravar áudio"
          aria-label="Gravar áudio"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] stroke-current" fill="none">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
        </button>
        <textarea
          rows={1}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value);
            // só com conteúdo real — apagar tudo não é "digitando"
            if (e.target.value.trim()) onDigitar?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          disabled={!!anexo && !ehImagemAnexo}
          placeholder={placeholder}
          className="max-h-28 flex-1 resize-none bg-transparent py-1 pl-1.5 text-[0.9rem] leading-relaxed text-tinta outline-none placeholder:text-mute disabled:opacity-60"
        />
        <button
          onClick={() => void enviar()}
          disabled={pending || subindo || gravando || (!anexo && !rascunho.trim())}
          title={subindo ? "Enviando anexo…" : "Enviar"}
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-navy text-branco transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-50",
            subindo && "animate-pulse",
          )}
        >
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-center text-[0.72rem] text-mute">
        {subindo ? (
          <>Enviando anexo…</>
        ) : modoClara ? (
          <>
            A Clara está conduzindo — <b className="font-medium text-suave">ao enviar, você assume a conversa</b>. Ou aprove a sugestão acima.
          </>
        ) : (
          <>
            Você assumiu — escrevendo como <b className="font-medium text-suave">Sara</b>. A Clara volta quando você devolver.
          </>
        )}
      </p>
    </div>
  );
}
