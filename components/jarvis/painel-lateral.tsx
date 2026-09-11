"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MaximizeIcon, XIcon } from "lucide-react";
import { interpretarContexto, type PapelUsuario } from "@/lib/jarvis/contrato";
import { ondeEstou, useJarvis, type ContextoJarvisTela } from "@/lib/jarvis/contexto";
import { MarcaJarvis } from "./marca";
import { SuperficieJarvis } from "./superficie";

/**
 * PAINEL LATERAL DO JARVIS (F9) — a superfície que o HEADER abre no lugar de navegar.
 *
 * Contrato inalterado para quem liga o gatilho (slot `data-slot="jarvis"`, F4): renderize
 * `<PainelLateralJarvis aberto onFechar usuarioId papel />`. O contexto da tela é lido aqui, do
 * `usePathname()` + `useSearchParams()` do momento em que abriu.
 *
 * O QUE MUDOU em 11/09 (W-JX): por dentro não é mais o chat de bolhas — é a MESMA
 * `SuperficieJarvis` do overlay ⌘K e da página `/jarvis`. Some o roundel "J" (o arco é a
 * assinatura), some a bolha, e entram a resposta em blocos, os passos e as ações. O chat
 * (`ConversaJarvis`) continua existindo para quem quiser o formato de conversa.
 *
 * Acessível como diálogo: foco entra ao abrir, Esc fecha, foco volta ao gatilho ao fechar. Sem
 * portal, para manter o CSS do app (z-50 acima do header; o painel fica à direita, longe da
 * sidebar).
 */
export function PainelLateralJarvis({
  aberto,
  onFechar,
  usuarioId,
  papel,
}: {
  aberto: boolean;
  onFechar: () => void;
  usuarioId: string;
  papel: PapelUsuario;
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const jarvis = useJarvis();
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<Element | null>(null);

  useEffect(() => {
    if (!aberto) return;
    gatilho.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (gatilho.current as HTMLElement | null)?.focus?.();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const q = busca.toString();
  const cru = `${pathname}${q ? `?${q}` : ""}`;
  const contrato = interpretarContexto(cru);
  const contexto: ContextoJarvisTela = jarvis.montado
    ? jarvis.contexto
    : { rota: contrato.rota, busca: contrato.busca, titulo: null, item: null, filtros: {}, sugestoes: null, aviso: null };

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* clique fora fecha; SEM escurecer a tela — o painel se sobrepõe e nada por baixo se move */}
      <button type="button" aria-label="Fechar o Jarvis" onClick={onFechar} className="absolute inset-0 cursor-default bg-transparent" />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label="Jarvis"
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-border bg-card shadow-[0_8px_28px_rgba(31,35,40,.16)]"
      >
        <div className="flex h-[var(--altura-topo)] flex-none items-center gap-2 border-b border-border px-4">
          <MarcaJarvis tamanho={20} rotulo="Jarvis" className="text-foreground" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{ondeEstou(contexto)}</span>
          <Link
            href={`/jarvis?contexto=${encodeURIComponent(cru)}`}
            onClick={onFechar}
            title="Abrir em tela cheia"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <MaximizeIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Abrir em tela cheia</span>
          </Link>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar (Esc)"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <XIcon className="size-4" aria-hidden />
            <span className="sr-only">Fechar</span>
          </button>
        </div>
        <SuperficieJarvis
          usuarioId={usuarioId}
          papel={papel}
          contexto={contexto}
          contratoTela={contrato}
          ensaio={jarvis.ensaio}
          medida="coluna"
          aoSair={onFechar}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
