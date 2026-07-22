"use client";

import { useEffect, useState } from "react";
import { obterUrlMidia } from "@/app/(app)/conversas/actions";
import { temPlayerDeAudio } from "@/lib/conversas/midia";
import type { Mensagem } from "@/lib/dados/conversas";

/*
 * Bolha de mensagem de voz (rodada 5 — pipeline de mídia). Com midia_caminho presente, busca a
 * signed URL do bucket privado quando a bolha monta (lazy, MVP) e renderiza <audio controls>;
 * sem caminho (mídia não baixada / falhou) mantém o degrade honesto de antes — nunca player
 * quebrado. Transcrição (corpo) continua aparecendo quando existir.
 */

function PlayerAudio({
  caminho,
  mime,
  urlPronta,
}: {
  caminho: string;
  mime?: string | null;
  urlPronta?: string | null;
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
    <audio controls preload="metadata" className="h-9 w-64 max-w-full">
      <source src={url} type={mime ?? undefined} />
      seu navegador não toca este áudio
    </audio>
  );
}

export function BolhaAudio({ m }: { m: Mensagem }) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 font-medium">
        <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 stroke-suave" fill="none">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
        </svg>
        Mensagem de voz
      </span>
      {temPlayerDeAudio(m) ? (
        <PlayerAudio caminho={m.midia_caminho!} mime={m.midia_mime} urlPronta={m.midia_url} />
      ) : null}
      {m.corpo ? (
        <span className="text-[0.84rem] text-suave">“{m.corpo}”</span>
      ) : temPlayerDeAudio(m) ? null : (
        <span className="text-[0.76rem] italic text-mute">
          transcrição e player chegam com a pipeline de mídia
        </span>
      )}
    </span>
  );
}
