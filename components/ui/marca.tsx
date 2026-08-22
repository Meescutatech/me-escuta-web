import { cn } from "@/lib/utils";

/**
 * Cabecalho de marca — a orelha + o wordmark de duas linhas (r9-tokens §5).
 *
 * Por que existe: em 22/08 o app tinha DUAS versoes do logo. `/convite/aceitar` ja usava a orelha
 * em SVG com o wordmark empilhado; `/login` — a tela primaria, a que todo mundo ve todo dia —
 * estava congelada em 16/07 com o logo em EMOJI (👂) dentro de um circulo laranja. A tela
 * secundaria era mais fiel a direcao aprovada que a primaria. O BENCHMARK-DESIGN-GERAL manda
 * extrair UM cabecalho compartilhado; este e ele.
 *
 * O emoji nao era so feio: emoji e fonte do sistema, entao o logo mudava de desenho entre
 * macOS/Windows/Android e nao herdava a cor da marca.
 *
 * DEBITO DECLARADO: `app/convite/aceitar/page.tsx` ainda carrega a copia inline dele (arquivo de
 * outra frente nesta rodada — nao foi tocado). Trocar por <Marca /> quando aquele arquivo abrir.
 */
export function Marca({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 96 100"
        fill="none"
        stroke="#EC662E"
        strokeWidth="9"
        strokeLinecap="round"
        aria-hidden
        className="h-[34px] w-8 shrink-0"
      >
        <path d="M12 62 C4 48 6 28 20 16 C34 5 56 5 67 17 C76 26 78 40 71 50 C66 58 58 61 54 68 C50 75 50 82 44 87 C37 93 27 90 24 83" />
        <path d="M34 48 C31 38 37 28 47 28 C56 28 61 36 58 43 C56 49 49 50 45 46" />
        <path d="M84 14 C92 23 92 37 85 46" />
      </svg>
      {/* O texto do wordmark e o nome acessivel da marca — fica legivel pro leitor de tela. */}
      <span className="flex flex-col items-end font-extrabold leading-[0.9] tracking-[-0.02em] text-navy">
        <span>me</span>
        <span>escuta</span>
      </span>
    </div>
  );
}
