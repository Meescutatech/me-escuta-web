"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function formatPlayerTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Velocidades do ciclo do botão, na ordem em que ele avança.
 *
 * Três passos e não um menu: o controle vive dentro de uma bolha de 240px, e a
 * escolha real é "normal · mais rápido · bem mais rápido". Sem 0.5× — abaixo de
 * 1× a fala fica arrastada e não é isso que se procura ao ouvir um recado.
 */
const PLAYBACK_RATES = [1, 1.5, 2] as const;

function formatRate(rate: number): string {
  // Decimal com vírgula (pt-BR) e o sinal de multiplicação, não a letra "x".
  return `${String(rate).replace(".", ",")}×`;
}

interface AudioPlayerProps {
  src: string;
  /** Fallback duration in seconds when the media metadata doesn't carry one. */
  durationHint?: number;
  /** Mostra o botão de velocidade de reprodução (1× · 1,5× · 2×). */
  showSpeed?: boolean;
  className?: string;
  /** Fired when the source fails to load (e.g. an expired presigned URL). */
  onError?: () => void;
}

export function AudioPlayer({
  src,
  durationHint,
  showSpeed = false,
  className,
  onError,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekingDurationRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState<number>(PLAYBACK_RATES[0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(
    durationHint && Number.isFinite(durationHint) ? durationHint : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  // A taxa é propriedade do ELEMENTO e o React não a controla por prop; trocar o
  // `src` a reseta para 1, então reaplicamos aqui (e não só no clique do botão).
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate, src]);

  const cycleRate = () => {
    const next =
      PLAYBACK_RATES[
        (PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]) + 1) %
          PLAYBACK_RATES.length
      ];
    setRate(next);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = next;
  };

  const resolveDuration = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      if (!seekingDurationRef.current) setDuration(audio.duration);
      return;
    }

    // Some containers (chunked WebM) report Infinity: force the browser to
    // scan to the end once, capture the real duration, then rewind.
    if (
      audio.duration === Infinity &&
      !seekingDurationRef.current &&
      durationHint === undefined
    ) {
      seekingDurationRef.current = true;
      const onDurationChange = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
          audio.removeEventListener("durationchange", onDurationChange);
          audio.currentTime = 0;
          seekingDurationRef.current = false;
        }
      };
      audio.addEventListener("durationchange", onDurationChange);
      audio.currentTime = 1e10;
    }
  }, [durationHint]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch(() => setFailed(true));
    }
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || duration === null) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handleRetry = () => {
    const audio = audioRef.current;
    setFailed(false);
    audio?.load();
    onError?.();
  };

  const total = duration ?? durationHint ?? null;

  return (
    <div
      data-slot="audio-player"
      className={cn("flex min-w-0 items-center gap-2", className)}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={resolveDuration}
        onDurationChange={resolveDuration}
        onTimeUpdate={(event) => {
          if (!seekingDurationRef.current) {
            setCurrentTime(event.currentTarget.currentTime);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => setFailed(true)}
      />

      {failed ? (
        <button
          type="button"
          onClick={handleRetry}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Não foi possível carregar o áudio — tentar novamente
          </span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
          >
            {isPlaying ? (
              <PauseIcon className="size-4 fill-current" aria-hidden="true" />
            ) : (
              <PlayIcon
                className="size-4 translate-x-px fill-current"
                aria-hidden="true"
              />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={total ?? 0}
            step={0.1}
            value={Math.min(currentTime, total ?? 0)}
            disabled={total === null}
            onChange={(event) => handleSeek(Number(event.target.value))}
            aria-label="Posição do áudio"
            className={cn(
              "h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary",
              "disabled:cursor-default",
            )}
          />

          {/* Um número só: o decorrido enquanto toca, a duração quando parado —
              é a mesma leitura que o WhatsApp faz. O par "00:04 / 00:12" custava
              ~70px de uma linha de 240px e comia a barra de progresso, que é o
              que de fato mostra onde o áudio está. */}
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {total === null
              ? "--:--"
              : isPlaying || currentTime > 0
                ? formatPlayerTime(currentTime)
                : formatPlayerTime(total)}
          </span>

          {showSpeed ? (
            <button
              type="button"
              onClick={cycleRate}
              aria-label={`Velocidade da reprodução: ${formatRate(rate)}. Toque para alterar`}
              className={cn(
                "shrink-0 cursor-pointer rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
                rate === 1
                  ? "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                  : "bg-primary/10 text-primary hover:bg-primary/20",
              )}
            >
              {formatRate(rate)}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
