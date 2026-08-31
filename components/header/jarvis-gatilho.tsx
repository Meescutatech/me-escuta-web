"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconeJarvis } from "@/components/header/icone-jarvis";
import { PainelLateralJarvis } from "@/components/jarvis/painel-lateral";
import { hrefJarvis } from "@/lib/header/navegacao";
import type { PapelUsuario } from "@/lib/jarvis/contrato";

/**
 * O JARVIS SOBRE ESTA TELA — o gatilho do slot `data-slot="jarvis"` do header.
 *
 * Pedido do Diogo (31/08): o botão ABRE O PAINEL LATERAL por cima da tela — nada por baixo se move
 * (overlay, sem backdrop escuro, sem layout shift) — em QUALQUER rota. O contexto de onde a pessoa
 * está vai junto no pedido (o painel lê `pathname+search` ao abrir); a página `/jarvis` continua
 * existindo para quem quer a conversa em tela cheia (item da sidebar, ou "Abrir em tela cheia").
 *
 * Sem `papel` (conta ainda sem papel ativo) o painel não teria o que responder — o botão degrada
 * para o link da página, que explica o que falta.
 */
export function JarvisGatilho({ usuarioId, papel }: { usuarioId: string; papel: PapelUsuario | null }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();

  if (!papel) {
    return (
      <Link
        href={hrefJarvis(pathname, search.toString())}
        aria-label="Abrir o Jarvis"
        title="Jarvis"
        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-suave hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
      >
        <IconeJarvis className="h-[19px] w-[19px]" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir o Jarvis sobre esta tela"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Jarvis sobre esta tela"
        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-suave hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
      >
        <IconeJarvis className="h-[19px] w-[19px]" />
      </button>
      <PainelLateralJarvis aberto={aberto} onFechar={() => setAberto(false)} usuarioId={usuarioId} papel={papel} />
    </>
  );
}
