"use client";

import { useEffect, useRef, useState } from "react";
import { obterUrlMidia } from "@/app/(app)/conversas/actions";
import type { Mensagem } from "@/lib/dados/conversas";
import { cn } from "@/lib/utils";

/*
 * Bolha de FOTO (rodada 6 — mídia bidirecional, in e out). Com midia_caminho presente, busca a
 * signed URL do bucket privado quando a bolha monta (mesmo padrão lazy da BolhaAudio) e renderiza
 * a <img> dentro do max-w da bolha; clique amplia num lightbox simples (overlay + clique fecha).
 * Estados carregando/erro em PT-BR — nunca imagem quebrada. Legenda (corpo) embaixo quando houver.
 * Quem decide se esta bolha aparece é temImagemVisivel (lib/conversas/midia.ts); sem caminho, o
 * inbox mantém o rótulo "Foto recebida" de antes.
 */

export function BolhaImagem({ m }: { m: Mensagem }) {
  const caminho = m.midia_caminho!;
  const [url, setUrl] = useState<string | null>(m.midia_url ?? null);
  const [erro, setErro] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // W-D3 · a foto pode ter carregado ANTES da hidratação (HTML do servidor + arquivo pequeno em
  // cache): o `load` já disparou e o React não estava ouvindo. Sem isto a bolha fica em
  // "carregando foto…" com a imagem pronta por baixo. Conferir o elemento é a única fonte.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !el.complete) return;
    let vivo = true;
    // `decode()` em vez de `naturalWidth > 0`: SVG sem width/height reporta 0 no Chrome, e
    // `complete` também é true em erro — o decode resolve num caso e rejeita no outro.
    el.decode().then(
      () => vivo && setCarregou(true),
      () => vivo && setErro(true),
    );
    return () => {
      vivo = false;
    };
  }, [url]);

  useEffect(() => {
    let vivo = true;
    setErro(false);
    setCarregou(false);
    // URL pré-assinada no servidor (perf/rotas): usa direto, sem server action por bolha
    if (m.midia_url) {
      setUrl(m.midia_url);
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
  }, [caminho, m.midia_url]);

  // lightbox fecha no Esc (além do clique)
  useEffect(() => {
    if (!ampliada) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAmpliada(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ampliada]);

  return (
    <span className="flex flex-col gap-1.5">
      {erro ? (
        <span className="text-[0.76rem] italic text-mute">
          não deu pra carregar a foto — reabra a conversa pra tentar de novo
        </span>
      ) : (
        <>
          {/* W-D3 (10/09): a <img> NÃO fica `hidden` enquanto carrega. `display:none` tira a caixa
              do layout, e sem caixa o `loading="lazy"` nunca dispara — a foto ficava em
              "carregando foto…" para sempre (medido no ensaio, onde a mídia é local). A caixa
              existe desde o início, invisível, e o rótulo de carregamento fica por cima dela. */}
          <span className={cn("relative block", !carregou && "h-36 w-52 max-w-full")}>
            {!carregou && (
              <span className="absolute inset-0 grid animate-pulse place-items-center rounded-[9px] bg-hover text-[0.76rem] italic text-mute">
                carregando foto…
              </span>
            )}
            {url && (
              // signed URL efêmera do bucket privado — next/image não otimiza, <img> é o certo aqui
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={url}
                alt={m.corpo ? `Foto: ${m.corpo}` : "Foto da conversa"}
                // F13: `lazy` — a thread traz até 500 mensagens, e sem isto TODAS as fotos baixam
                // de uma vez, inclusive as que estão muito acima da dobra e ninguém vai olhar.
                loading="lazy"
                decoding="async"
                // espaço reservado com a MESMA caixa do estado "carregando foto…": a imagem que
                // chega ocupa o lugar que já era dela, em vez de empurrar as mensagens vizinhas
                // enquanto a pessoa lê. `w-auto/h-auto` deixam o CSS mandar na exibição; os
                // atributos existem para o navegador reservar antes de ter o arquivo.
                width={208}
                height={144}
                onLoad={() => setCarregou(true)}
                onError={() => setErro(true)}
                onClick={() => setAmpliada(true)}
                className={cn(
                  "h-auto max-h-72 w-auto max-w-full cursor-zoom-in rounded-[9px] object-cover",
                  !carregou && "invisible h-36 w-52",
                )}
              />
            )}
          </span>
        </>
      )}
      {m.corpo ? <span className="text-[0.88rem]">{m.corpo}</span> : null}

      {ampliada && url && (
        <span
          role="dialog"
          aria-label="Foto ampliada — clique para fechar"
          onClick={() => setAmpliada(false)}
          className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-navy/80 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={m.corpo ? `Foto: ${m.corpo}` : "Foto da conversa"}
            onError={() => {
              setAmpliada(false);
              setErro(true);
            }}
            className="max-h-full max-w-full rounded-lg shadow-forte"
          />
        </span>
      )}
    </span>
  );
}
