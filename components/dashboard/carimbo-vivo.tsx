"use client";

import { useEffect, useState } from "react";
import { useProjecaoViva } from "@/components/projecao-viva";
import { fmtAtras } from "@/lib/tempo-real";

/*
 * "ao vivo · atualizado há Xs" (r9): ponto verde pulsando + carimbo mono, revalidação leve
 * (45s por padrão, só com a aba visível — o hook cuida). O relógio conta da hora REAL da
 * renderização server-side (geradoEm), não do cliente.
 */
export function CarimboVivo({
  geradoEm,
  intervaloMs = 45_000,
  revalidar = true,
}: {
  geradoEm: string;
  intervaloMs?: number;
  /** false = só exibe o carimbo (a tela já tem o próprio ciclo de refetch, ex.: board) */
  revalidar?: boolean;
}) {
  useProjecaoViva([], { intervaloMs, ativo: revalidar });

  // começa "agora" (igual no SSR → sem mismatch de hidratação) e passa a contar no cliente
  const [texto, setTexto] = useState("agora");
  useEffect(() => {
    const atualizar = () =>
      setTexto(fmtAtras(Math.max(0, (Date.now() - new Date(geradoEm).getTime()) / 1000)));
    atualizar();
    const t = setInterval(atualizar, 5000);
    return () => clearInterval(t);
  }, [geradoEm]);

  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[11px] text-suave"
      title={`O painel se atualiza sozinho a cada ${Math.round(intervaloMs / 1000)}s`}
    >
      <span className="pulso-ao-vivo h-[7px] w-[7px] rounded-full bg-verde" aria-hidden />
      ao vivo · atualizado {texto}
    </span>
  );
}
