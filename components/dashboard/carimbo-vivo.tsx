"use client";

import { useEffect, useState } from "react";
import { useProjecaoViva } from "@/components/projecao-viva";
import { fmtAtras } from "@/lib/tempo-real";

/*
 * Dashboard "vivo" (Rodada 9, fase 1): revalidação periódica leve (45s, só com a aba
 * visível — o hook cuida) + carimbo "atualizado há Xs" derivado da hora REAL da renderização
 * server-side (geradoEm), não do relógio do cliente. Sem dica realtime aqui: o dashboard é
 * agregação, 45s de defasagem é honesto e barato.
 */
export function CarimboVivo({ geradoEm }: { geradoEm: string }) {
  useProjecaoViva([], { intervaloMs: 45_000 });

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
    <span className="text-[0.72rem] tabular-nums text-mute" title="O painel se atualiza sozinho a cada 45s">
      atualizado {texto}
    </span>
  );
}
