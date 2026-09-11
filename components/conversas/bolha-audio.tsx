"use client";

import { useEffect, useState } from "react";
import { MicIcon } from "lucide-react";
import { obterUrlMidia } from "@/app/(app)/conversas/actions";
import { AudioPlayer } from "@/components/ui/audio-player";
import { temPlayerDeAudio } from "@/lib/conversas/midia";
import type { Mensagem } from "@/lib/dados/conversas";

/*
 * Bolha de mensagem de voz (rodada 5 — pipeline de mídia). Com midia_caminho presente, busca a
 * signed URL do bucket privado quando a bolha monta (lazy, MVP) e renderiza o player; sem caminho
 * (mídia não baixada / falhou) mantém o degrade honesto de antes — nunca player quebrado.
 * Transcrição (corpo) continua aparecendo quando existir.
 *
 * W-D3 (10/09): o `<audio controls>` nativo deu lugar ao `AudioPlayer` do preset (LiderHub
 * `audio-player.tsx`, portado em components/ui): play/pause, barra de progresso, duração e
 * velocidade 1× · 1,5× · 2× — que é o que se quer para um recado de paciente. `duracao_s` vem da
 * mensagem quando a projeção tem, e o player mostra antes de baixar o arquivo.
 */

function PlayerAudio({
  caminho,
  urlPronta,
  duracao,
}: {
  caminho: string;
  urlPronta?: string | null;
  duracao?: number | null;
}) {
  const [url, setUrl] = useState<string | null>(urlPronta ?? null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setErro(false);
    // URL pré-assinada no servidor (perf/rotas): usa direto, sem server action por bolha
    if (urlPronta) {
      setUrl(urlPronta);
      return;
    }
    setUrl(null);
    obterUrlMidia(caminho)
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.url) setUrl(r.url);
        else setErro(true);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [caminho, urlPronta]);

  if (erro) {
    return (
      <span className="text-[0.76rem] italic text-mute">
        não deu pra carregar o áudio — reabra a conversa pra tentar de novo
      </span>
    );
  }
  if (!url) {
    return <span className="text-[0.76rem] italic text-mute">carregando áudio…</span>;
  }
  return (
    <AudioPlayer
      src={url}
      durationHint={duracao ?? undefined}
      showSpeed
      onError={() => setErro(true)}
      className="w-[240px] max-w-full"
    />
  );
}

export function BolhaAudio({ m }: { m: Mensagem }) {
  const comPlayer = temPlayerDeAudio(m);
  return (
    <span className="flex flex-col gap-1.5">
      {!comPlayer && (
        <span className="flex items-center gap-2 font-medium">
          <MicIcon className="size-4 shrink-0 text-suave" strokeWidth={2} />
          Mensagem de voz
        </span>
      )}
      {comPlayer ? <PlayerAudio caminho={m.midia_caminho!} urlPronta={m.midia_url} duracao={m.duracao_s} /> : null}
      {m.corpo ? (
        <span className="text-[0.84rem] text-suave">“{m.corpo}”</span>
      ) : comPlayer ? null : (
        <span className="text-[0.76rem] italic text-mute">
          transcrição e player chegam com a pipeline de mídia
        </span>
      )}
    </span>
  );
}
