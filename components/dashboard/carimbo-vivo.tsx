"use client";

import { useEffect, useState } from "react";
import { useProjecaoViva } from "@/components/projecao-viva";
import { fmtAtras } from "@/lib/tempo-real";
import { INTERVALOS } from "@/lib/intervalos-vivos";

/*
 * O carimbo de frescor da tela (r9) — e, desde o F5 (Rodada 16), um selo que não mente.
 *
 * Ele tinha um estado só: ponto verde pulsando + "ao vivo", sempre, inclusive quando não havia
 * uma única assinatura de Realtime de pé. Agora são dois, e o ponto é o que os distingue:
 *   · entrega CONFIRMADA → ponto cheio verde, pulsando: "ao vivo · atualizado há 12s"
 *   · assinou, ainda sem evidência de entrega → anel vazado: "conectando · atualizado há 12s"
 *   · sem assinatura → anel vazado, parado, no cinza dos carimbos: "atualizado há 12s · a cada 30s"
 *
 * O estado do meio existe por medição, não por zelo: o cliente diz SUBSCRIBED em ~40 ms, mas o
 * servidor pode levar até ~2 s para ter a assinatura, e escrita feita nessa janela SE PERDE
 * (2 de 4 rodadas medidas — ver lib/tempo-real.ts). Acender o verde no SUBSCRIBED faria a tela
 * mentir exatamente quando está mais cega.
 * Sem assinatura não é erro: o polling é o piso por desenho. Por isso cinza, não vermelho — e
 * âmbar (o token de "algo não está de pé") só quando o canal de fato falhou.
 *
 * O relógio conta da hora REAL da renderização server-side (geradoEm), não do cliente.
 */
export function CarimboVivo({
  geradoEm,
  intervaloMs = INTERVALOS.carimbo,
  revalidar = true,
  aoVivo,
  conectando,
  falhas,
}: {
  geradoEm: string;
  intervaloMs?: number;
  /** false = só exibe o carimbo (a tela já tem o próprio ciclo de refetch, ex.: board) */
  revalidar?: boolean;
  /** estado do tempo real de quem hospeda o carimbo; sem ele, vale o do próprio hook */
  aoVivo?: boolean;
  conectando?: boolean;
  falhas?: string[];
}) {
  const proprio = useProjecaoViva([], { intervaloMs, ativo: revalidar });
  const vivo = aoVivo ?? proprio.aoVivo;
  const ligando = conectando ?? proprio.conectando;
  const problemas = falhas ?? proprio.falhas;

  // começa "agora" (igual no SSR → sem mismatch de hidratação) e passa a contar no cliente
  const [texto, setTexto] = useState("agora");
  useEffect(() => {
    const atualizar = () =>
      setTexto(fmtAtras(Math.max(0, (Date.now() - new Date(geradoEm).getTime()) / 1000)));
    atualizar();
    const t = setInterval(atualizar, 5000);
    return () => clearInterval(t);
  }, [geradoEm]);

  const segundos = Math.round(intervaloMs / 1000);
  const titulo = vivo
    ? `Tempo real confirmado. A releitura a cada ${segundos}s é só o piso de segurança.`
    : ligando
      ? "Assinatura aceita, ainda sem confirmação de que as mudanças chegam. Até lá a tela relê no intervalo curto."
      : problemas.length > 0
        ? `Tempo real não está de pé — a tela relê a cada ${segundos}s. ${problemas.join(" · ")}`
        : `Sem tempo real nesta tela — ela relê a cada ${segundos}s.`;

  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-suave" title={titulo}>
      {vivo ? (
        <span className="pulso-ao-vivo h-[7px] w-[7px] rounded-full bg-verde" aria-hidden />
      ) : (
        <span
          className={`h-[7px] w-[7px] rounded-full border ${
            problemas.length > 0 ? "border-amarelo" : "border-mute"
          }`}
          aria-hidden
        />
      )}
      {vivo
        ? `ao vivo · atualizado ${texto}`
        : ligando
          ? `conectando · atualizado ${texto}`
          : `atualizado ${texto} · a cada ${segundos}s`}
    </span>
  );
}
