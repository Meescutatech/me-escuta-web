"use client";

import { useEffect } from "react";
import { ProvedorJarvis, useJarvis } from "@/lib/jarvis/contexto";
import type { PapelUsuario } from "@/lib/jarvis/contrato";
import { DockJarvis } from "./dock";
import { OverlayJarvis } from "./overlay";
import { SelecaoJarvis } from "./selecao";

/**
 * A PRESENÇA DO JARVIS (W-JX, 11/09/2026) — o pedido do Diogo, inteiro, num componente só:
 * *"seria legal algo que possa ser chamado a qualquer momento e não necessariamente redirecione:
 * pergunto no dashboard, ele me responde no dashboard."*
 *
 * Monte UMA vez, no shell autenticado, envolvendo o `<main>`:
 *
 *     <PresencaJarvis usuarioId={user.id} papel={papel} ensaio={false}>
 *       <main className="pt-[var(--altura-topo)]">{children}</main>
 *     </PresencaJarvis>
 *
 * O que ele traz: o CONTEXTO de tela (`useContextoJarvis` nas telas), o ATALHO global, o OVERLAY
 * ancorado, o DOCK permanente e o gesto de SELEÇÃO. Sem `papel` não há o que responder, e a
 * presença degrada para nada — os filhos continuam renderizando.
 *
 * ── O ATALHO, e por que não é o ⌘J do briefing ───────────────────────────────────────────────
 * A pesquisa de 11/09 refutou três premissas: `⌘J` NÃO é o atalho do Notion AI (é `⇧⌘J`), não
 * existe lista normativa de atalhos reservados, e `⌘K` é a convenção que converge (Linear, Slack,
 * GitHub, Vercel, Raycast) e não é interceptada por Chrome nem Safari no Mac.
 *
 *   ⌘K / Ctrl+K   SOBE UM DEGRAU: fechado → pequeno → popup → fechado. Duas batidas levam ao
 *                 popup, que é o que o Diogo pediu em 00:45 ("⌘K duas vezes abre o popup").
 *                 Com o foco num campo de texto ele passa direto, de propósito: no macOS `⌘K` é
 *                 do sistema ("adicionar link").
 *   ⇧⌘K / Ctrl+⇧K vai DIRETO ao popup, de qualquer lugar, inclusive de dentro de um campo — é o
 *                 escape que a própria Vercel documenta para quando a página já tem o seu ⌘K.
 *   /             abre o modo pequeno, quando o foco NÃO está em campo de texto.
 *   Esc           fecha e devolve o foco a quem chamou.
 *
 * `event.key` e nunca `event.code`: `code` é posição física e muda de letra no ABNT2.
 */

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || !("tagName" in el)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const tipo = (el as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(tipo);
}

function AtalhoJarvis() {
  const { abrir, expandir, fechar, alternar, aberto } = useJarvis();

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && aberto) {
        e.preventDefault();
        fechar();
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      const tecla = e.key.toLowerCase();
      const noCampo = emCampoDeTexto(e.target);

      if (meta && e.shiftKey && tecla === "k") {
        e.preventDefault();
        expandir(null);
        return;
      }
      if (meta && !e.shiftKey && !e.altKey && tecla === "k") {
        // com o foco num campo, ⌘K é do sistema (macOS: adicionar link) — deixa passar
        if (noCampo) return;
        /*
         * A TELA PODE FICAR COM O ⌘K. O /funil já tem "Buscar ou perguntar ao Jarvis… ⌘K" no
         * topo: se eu abrisse o overlay ali, roubaria o atalho que a própria tela anuncia. Quem
         * quiser ficar com ele põe `data-jarvis-atalho-local` no campo — o ⌘K foca aquele campo,
         * e o ⇧⌘K continua abrindo o popup de qualquer lugar.
         */
        const local = document.querySelector<HTMLElement>("[data-jarvis-atalho-local]");
        if (local) {
          e.preventDefault();
          local.focus();
          return;
        }
        e.preventDefault();
        alternar();
        return;
      }
      if (e.key === "/" && !meta && !e.altKey && !noCampo && !aberto) {
        e.preventDefault();
        abrir(null);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [abrir, expandir, fechar, alternar, aberto]);

  return null;
}

export function PresencaJarvis({
  usuarioId,
  papel,
  ensaio = false,
  children,
}: {
  usuarioId: string;
  papel: PapelUsuario | null;
  ensaio?: boolean;
  children: React.ReactNode;
}) {
  if (!papel) return <>{children}</>;
  return (
    <ProvedorJarvis usuarioId={usuarioId} papel={papel} ensaio={ensaio}>
      {children}
      <AtalhoJarvis />
      <OverlayJarvis />
      <SelecaoJarvis />
      <DockJarvis ensaio={ensaio} />
    </ProvedorJarvis>
  );
}
